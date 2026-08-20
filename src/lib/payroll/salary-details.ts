import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  computeSalaryTotals,
  computeStoredSalaryTotals,
  getSalaryDbRow,
  listSalaryDbRows,
  rollbackSalaryDbWrites,
  salaryDbRowToDetail,
  upsertSalaryDbRow,
  type SalaryDbRow,
} from '@/lib/db/salaries';
import { formatAmountWithCommas } from '@/lib/payroll/period';
import { listEmployeeDbRows, dbRowToEmployeeRecord } from '@/lib/db/employees';
import { diffAuditValues, logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type {
  IncompleteSalaryDetail,
  SalaryDetailInput,
  SalaryDetailRecord,
  SalarySlipExtrasInput,
} from '@/types/salary-slip';
import { SALARY_DETAIL_FIELDS } from '@/types/salary-slip';

/** Fields required before a salary slip can be generated. */
const REQUIRED_FIELDS = ['Base Salary', 'Account Number', 'Account Name', 'Bank Name'] as const;

const ALL_FORM_MISSING_LABELS = SALARY_DETAIL_FIELDS.map((field) => field.missing);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** True for non-empty strings and any finite number (including 0). */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return String(value).trim() !== '';
}

/** Case/space-insensitive field lookup (Sheets/n8n column names vary). */
function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  const entries = Object.entries(raw);
  for (const key of keys) {
    const needle = key.trim().toLowerCase();
    const match = entries.find(([k]) => k.trim().toLowerCase() === needle);
    if (match && hasValue(match[1])) {
      return String(match[1]).trim();
    }
  }
  return '';
}

/** Unwrap n8n item shapes: `{ json: row }`, `{ body: row }`, nested arrays. */
function unwrapRow(item: unknown): Record<string, unknown> {
  if (Array.isArray(item)) {
    return item.length === 1 ? unwrapRow(item[0]) : {};
  }

  let raw = asRecord(item);
  for (let depth = 0; depth < 3; depth += 1) {
    const employeeId = pick(raw, 'EmployeeID', 'employeeId', 'EmployeeId');
    if (employeeId) return raw;

    if (hasValue(raw.json) && typeof raw.json === 'object') {
      raw = { ...asRecord(raw.json), ...raw };
      continue;
    }
    if (hasValue(raw.body) && typeof raw.body === 'object' && !Array.isArray(raw.body)) {
      raw = { ...asRecord(raw.body), ...raw };
      continue;
    }
    if (hasValue(raw.data) && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      raw = { ...asRecord(raw.data), ...raw };
      continue;
    }
    break;
  }
  return raw;
}

export function mapRawToSalaryDetail(rawInput: unknown): SalaryDetailRecord {
  const raw = unwrapRow(rawInput);
  const salary =
    pick(raw, 'BaseSalary', 'baseSalary', 'Salary', 'salary') || pick(raw, 'Base Salary');
  const employeeId = pick(raw, 'EmployeeID', 'employeeId', 'EmployeeId');
  return {
    employeeId,
    fullName:
      pick(raw, 'FullName', 'fullName', 'Name', 'name') ||
      pick(raw, 'Account Name', 'AccountName', 'accountName'),
    email: pick(raw, 'Email', 'email'),
    phone: pick(raw, 'Phone', 'phone'),
    department: pick(raw, 'Department', 'department'),
    designation: pick(raw, 'Designation', 'designation'),
    employeeType: pick(raw, 'EmployeeType', 'employeeType', 'EmploymentType'),
    role: pick(raw, 'Role', 'role'),
    emsStatus: pick(raw, 'EMSStatus', 'emsStatus'),
    baseSalary: pick(raw, 'BaseSalary', 'baseSalary') || salary,
    salary,
    netSalary: pick(raw, 'NetSalary', 'netSalary', 'Net Salary'),
    allowance: pick(raw, 'Allowance', 'allowance'),
    tax: pick(raw, 'Tax', 'tax'),
    totalEarning: pick(raw, 'Total Earning', 'TotalEarning', 'totalEarning'),
    totalDeduction: pick(raw, 'Total Deduction', 'TotalDeduction', 'totalDeduction'),
    accountNumber: pick(raw, 'Account Number', 'AccountNumber', 'accountNumber'),
    accountName: pick(raw, 'Account Name', 'AccountName', 'accountName'),
    bankName: pick(raw, 'Bank Name', 'BankName', 'bankName'),
    bankAccountDetails: pick(raw, 'BankAccountDetails', 'bankAccountDetails'),
    uniqueKey: pick(raw, 'UniqueKey', 'uniqueKey') || employeeId,
    raw,
  };
}

function toWebhookSalaryRow(detail: SalaryDetailInput | SalaryDetailRecord) {
  const totals = computeStoredSalaryTotals({
    salary: detail.salary,
    allowance: detail.allowance,
    tax: detail.tax,
  });
  const netSalary = ('netSalary' in detail && detail.netSalary) || String(totals.netsalary);
  const totalEarning =
    ('totalEarning' in detail && detail.totalEarning) || String(totals.totalearning);
  const totalDeduction =
    ('totalDeduction' in detail && detail.totalDeduction) || String(totals.totaldeduction);

  return {
    EmployeeID: detail.employeeId,
    UniqueKey: detail.employeeId,
    BaseSalary: detail.salary,
    NetSalary: netSalary,
    Allowance: detail.allowance,
    Tax: detail.tax,
    AccountNumber: detail.accountNumber,
    AccountName: detail.accountName,
    BankName: detail.bankName,
    TotalEarning: totalEarning,
    TotalDeduction: totalDeduction,
  };
}

function salaryDetailToAuditValue(
  detail: SalaryDetailInput | SalaryDetailRecord | SalaryDbRow,
  employee?: {
    fullName?: string;
    email?: string;
    department?: string;
    designation?: string;
  } | null
): Record<string, unknown> {
  const profile = {
    fullName: employee?.fullName || ('fullName' in detail ? detail.fullName || '' : ''),
    email: employee?.email || ('email' in detail ? detail.email || '' : ''),
    department: employee?.department || ('department' in detail ? detail.department || '' : ''),
    designation:
      employee?.designation || ('designation' in detail ? detail.designation || '' : ''),
  };

  if ('employeeid' in detail) {
    return {
      employeeId: detail.employeeid,
      ...profile,
      salary: detail.basesalary,
      allowance: detail.allowance,
      tax: detail.tax,
      accountNumber: detail.accountnumber,
      accountName: detail.accountname,
      bankName: detail.bankname,
      totalEarning: detail.totalearning,
      totalDeduction: detail.totaldeduction,
      netSalary: detail.netsalary,
    };
  }

  return {
    employeeId: detail.employeeId,
    ...profile,
    salary: detail.salary,
    allowance: detail.allowance,
    tax: detail.tax,
    accountNumber: detail.accountNumber,
    accountName: detail.accountName,
    bankName: detail.bankName,
    totalEarning: 'totalEarning' in detail ? detail.totalEarning || '' : '',
    totalDeduction: 'totalDeduction' in detail ? detail.totalDeduction || '' : '',
    netSalary: 'netSalary' in detail ? detail.netSalary || '' : '',
  };
}

/**
 * Read salary rows from Supabase `salaries` (one per employee), enriched with
 * employee profile fields.
 */
export async function fetchSalaryDetails(employeeIds?: string[]): Promise<SalaryDetailRecord[]> {
  const [salaryRows, employeeRows] = await Promise.all([
    listSalaryDbRows({ employeeIds }),
    listEmployeeDbRows(),
  ]);

  const employeesById = new Map(
    employeeRows.map((row) => {
      const employee = dbRowToEmployeeRecord(row);
      return [employee.employeeId.trim().toLowerCase(), employee] as const;
    })
  );

  let rows = salaryRows.map((row) => {
    const employee = employeesById.get(row.employeeid.trim().toLowerCase());
    return salaryDbRowToDetail(row, employee);
  });

  if (employeeIds && employeeIds.length > 0) {
    const wanted = new Set(employeeIds.map((id) => id.trim().toLowerCase()));
    rows = rows.filter((row) => wanted.has(row.employeeId.trim().toLowerCase()));
  }

  return rows;
}

/**
 * Dual-write salary rows: Supabase first, then n8n update-salary-detail.
 * If the sheet/webhook write fails, Supabase changes are rolled back.
 * Audit is best-effort after a successful dual-write.
 */
export async function updateSalaryDetails(
  details: SalaryDetailInput[],
  options?: { actorEmail?: string }
): Promise<{ message: string; auditLogged: boolean }> {
  if (!details.length) {
    throw new Error('No salary details provided to update.');
  }

  for (const detail of details) {
    if (!detail.employeeId?.trim()) {
      throw new Error('Each salary detail row needs an EmployeeID.');
    }
  }

  const writes = details.map((detail) => {
    const totals = computeStoredSalaryTotals(detail);
    return {
      ...detail,
      totalEarning: detail.totalEarning || String(totals.totalearning),
      totalDeduction: detail.totalDeduction || String(totals.totaldeduction),
      netSalary: detail.netSalary || String(totals.netsalary),
    };
  });

  const snapshots: Array<{
    previous: SalaryDbRow | null;
    employeeId: string;
  }> = [];

  try {
    for (const detail of writes) {
      const previous = await getSalaryDbRow(detail.employeeId);
      snapshots.push({
        previous,
        employeeId: detail.employeeId.trim(),
      });
      await upsertSalaryDbRow(detail);
    }
  } catch (dbError) {
    try {
      await rollbackSalaryDbWrites(snapshots);
    } catch (rollbackError) {
      console.error('Failed to roll back salaries after DB write failure:', rollbackError);
    }
    throw dbError;
  }

  const payload = {
    details: writes.map(toWebhookSalaryRow),
  };

  try {
    const response = await fetch(SHEETS_WEBHOOKS.updateSalaryDetail, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await response.text();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'update-salary-detail webhook not found (404). Activate the n8n workflow and use /webhook/ (not /webhook-test/).'
        );
      }
      throw new Error(text || `update-salary-detail webhook returned status ${response.status}.`);
    }

    let message = 'Salary details updated.';
    try {
      const parsed = text.trim() ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        message = String(
          (parsed as Record<string, unknown>).message ||
            (parsed as Record<string, unknown>).status ||
            message
        );
      }
    } catch {
      if (text.trim()) message = text.trim();
    }

    let auditLogged = true;
    const employeeRows = await listEmployeeDbRows().catch(() => []);
    const employeesById = new Map(
      employeeRows.map((row) => {
        const employee = dbRowToEmployeeRecord(row);
        return [employee.employeeId.trim().toLowerCase(), employee] as const;
      })
    );

    for (let i = 0; i < writes.length; i += 1) {
      const detail = writes[i];
      const previous = snapshots[i]?.previous ?? null;
      const employee = employeesById.get(detail.employeeId.trim().toLowerCase()) || null;
      const nextValue = salaryDetailToAuditValue(detail, employee);
      const event = previous
        ? {
            action: AUDIT_ACTIONS.UPDATE,
            recordType: AUDIT_RECORD_TYPES.SALARY_DETAIL,
            recordId: detail.employeeId,
            ...diffAuditValues(salaryDetailToAuditValue(previous, employee), nextValue),
          }
        : {
            action: AUDIT_ACTIONS.CREATE,
            recordType: AUDIT_RECORD_TYPES.SALARY_DETAIL,
            recordId: detail.employeeId,
            newValue: nextValue,
          };
      const ok = await logAuditBestEffort(options?.actorEmail, event, 'Salary detail audit');
      if (!ok) auditLogged = false;
    }

    return { message, auditLogged };
  } catch (sheetError) {
    try {
      await rollbackSalaryDbWrites(snapshots);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase salaries after sheet write failure:',
        rollbackError
      );
    }
    throw sheetError;
  }
}

/** Overlay user-provided rows onto fetched salary detail rows (stored fields only). */
export function mergeSalaryDetails(
  existing: SalaryDetailRecord[],
  overrides: SalaryDetailInput[]
): SalaryDetailRecord[] {
  const byId = new Map(
    existing.map((detail) => [detail.employeeId.trim().toLowerCase(), { ...detail }])
  );

  for (const override of overrides) {
    const key = override.employeeId.trim().toLowerCase();
    if (!key) continue;
    const current = byId.get(key);
    const salary = override.salary?.trim() || current?.salary || '';
    const allowance = override.allowance?.trim() || current?.allowance || '';
    const tax = override.tax?.trim() || current?.tax || '';
    const totals = computeStoredSalaryTotals({ salary, allowance, tax });
    byId.set(key, {
      employeeId: override.employeeId.trim(),
      fullName: current?.fullName || '',
      email: current?.email || '',
      phone: current?.phone || '',
      department: current?.department || '',
      designation: current?.designation || '',
      employeeType: current?.employeeType || '',
      role: current?.role || '',
      emsStatus: current?.emsStatus || '',
      baseSalary: current?.baseSalary || salary,
      salary,
      netSalary: override.netSalary?.trim() || current?.netSalary || String(totals.netsalary),
      allowance,
      tax,
      totalEarning:
        override.totalEarning?.trim() || current?.totalEarning || String(totals.totalearning),
      totalDeduction:
        override.totalDeduction?.trim() || current?.totalDeduction || String(totals.totaldeduction),
      accountNumber: override.accountNumber?.trim() || current?.accountNumber || '',
      accountName: override.accountName?.trim() || current?.accountName || '',
      bankName: override.bankName?.trim() || current?.bankName || '',
      bankAccountDetails: current?.bankAccountDetails || '',
      uniqueKey: override.employeeId.trim(),
      salaryId: current?.salaryId || '',
      raw: current?.raw || {},
    });
  }

  return Array.from(byId.values());
}

function detailFieldValue(
  detail: SalaryDetailRecord,
  field: (typeof ALL_FORM_MISSING_LABELS)[number] | (typeof REQUIRED_FIELDS)[number]
): string {
  const mapped: Record<string, string> = {
    'Base Salary': detail.salary,
    Salary: detail.salary,
    Allowance: detail.allowance,
    Tax: detail.tax,
    'Account Number': detail.accountNumber,
    'Account Name': detail.accountName,
    'Bank Name': detail.bankName,
  };
  if (hasValue(mapped[field])) return String(mapped[field]).trim();

  const rawKeys: Record<string, string[]> = {
    'Base Salary': ['BaseSalary', 'baseSalary', 'Salary', 'salary'],
    Salary: ['BaseSalary', 'baseSalary', 'Salary', 'salary'],
    Allowance: ['Allowance', 'allowance'],
    Tax: ['Tax', 'tax'],
    'Account Number': ['Account Number', 'AccountNumber', 'accountNumber', 'BankAccountDetails'],
    'Account Name': ['Account Name', 'AccountName', 'accountName'],
    'Bank Name': ['Bank Name', 'BankName', 'bankName'],
  };
  return pick(detail.raw, ...(rawKeys[field] || []));
}

/** Empty stored-field labels for highlight UI. */
export function listEmptySalaryFields(detail: SalaryDetailRecord | null | undefined): string[] {
  if (!detail) return [...ALL_FORM_MISSING_LABELS];
  return ALL_FORM_MISSING_LABELS.filter((field) => !hasValue(detailFieldValue(detail, field)));
}

export function findIncompleteSalaryDetails(
  employeeIds: string[],
  details: SalaryDetailRecord[]
): IncompleteSalaryDetail[] {
  const byId = new Map(details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail]));

  const incomplete: IncompleteSalaryDetail[] = [];

  for (const employeeId of employeeIds) {
    const detail = byId.get(employeeId.trim().toLowerCase());
    const missingFields = listEmptySalaryFields(detail || null);

    if (!detail) {
      incomplete.push({
        employeeId,
        missingFields: [...ALL_FORM_MISSING_LABELS],
      });
      continue;
    }

    incomplete.push({
      employeeId,
      fullName: detail.fullName,
      email: detail.email,
      department: detail.department,
      designation: detail.designation,
      missingFields,
    });
  }

  return incomplete;
}

/** True when every required payroll field is present on the row. */
export function isSalaryDetailComplete(detail: SalaryDetailRecord): boolean {
  return REQUIRED_FIELDS.every((field) => hasValue(detailFieldValue(detail, field)));
}

/**
 * Shape sent into the generate-salary-slip webhook.
 * Stored salary fields + optional slip-only extras (OT / bonus / others / contributions).
 */
export function toSalaryDetailWebhookFields(
  detail: SalaryDetailRecord | undefined,
  extras?: SalarySlipExtrasInput | null,
  slipPeriod?: string
) {
  const overtimePay = extras?.overtimePay?.trim() || '';
  const performanceBonus = extras?.performanceBonus?.trim() || '';
  const contributions = extras?.contributions?.trim() || '';
  const others = extras?.others?.trim() || '';

  const totals = computeSalaryTotals({
    salary: detail?.salary,
    allowance: detail?.allowance,
    tax: detail?.tax,
    overtimePay,
    performanceBonus,
    contributions,
    others,
  });

  return {
    UniqueKey: detail?.uniqueKey || detail?.employeeId || '',
    BaseSalary: formatAmountWithCommas(detail?.salary),
    NetSalary: formatAmountWithCommas(totals.netsalary),
    OvertimePay: formatAmountWithCommas(overtimePay),
    PerformanceBonus: formatAmountWithCommas(performanceBonus),
    Contributions: formatAmountWithCommas(contributions),
    Allowance: formatAmountWithCommas(detail?.allowance),
    Tax: formatAmountWithCommas(detail?.tax),
    Others: formatAmountWithCommas(others),
    AccountNumber: detail?.accountNumber || '',
    AccountName: detail?.accountName || '',
    BankName: detail?.bankName || '',
    TotalEarning: formatAmountWithCommas(totals.totalearning),
    TotalDeduction: formatAmountWithCommas(totals.totaldeduction),
    Period: slipPeriod || '',
  };
}

export function toSalaryDetailInput(detail: SalaryDetailRecord): SalaryDetailInput {
  return {
    employeeId: detail.employeeId,
    salary: detail.salary,
    allowance: detail.allowance,
    tax: detail.tax,
    accountNumber: detail.accountNumber,
    accountName: detail.accountName,
    bankName: detail.bankName,
    netSalary: detail.netSalary,
    totalEarning: detail.totalEarning,
    totalDeduction: detail.totalDeduction,
  };
}
