import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  buildSalaryUniqueKey,
  computeSalaryTotals,
  currentSalaryPeriod,
  getSalaryDbRow,
  listSalaryDbRows,
  monthInputToPeriod,
  rollbackSalaryDbWrites,
  salaryDbRowToDetail,
  upsertSalaryDbRow,
  type SalaryDbRow,
} from '@/lib/db/salaries';
import { listEmployeeDbRows, dbRowToEmployeeRecord } from '@/lib/db/employees';
import type {
  IncompleteSalaryDetail,
  SalaryDetailInput,
  SalaryDetailRecord,
} from '@/types/salary-slip';
import { SALARY_DETAIL_FIELDS } from '@/types/salary-slip';

/** Fields required before a salary slip can be generated (NOT NULL / critical). */
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
  return {
    employeeId: pick(raw, 'EmployeeID', 'employeeId', 'EmployeeId'),
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
    overtimePay: pick(raw, 'OvertimePay', 'overtimePay', 'Overtime Pay'),
    performanceBonus: pick(raw, 'PerformanceBonus', 'performanceBonus', 'Performance Bonus'),
    contributions: pick(raw, 'Contributions', 'contributions', 'Contribution', 'contribution'),
    allowance: pick(raw, 'Allowance', 'allowance'),
    tax: pick(raw, 'Tax', 'tax'),
    others: pick(raw, 'Others', 'others'),
    totalEarning: pick(raw, 'Total Earning', 'TotalEarning', 'totalEarning'),
    totalDeduction: pick(raw, 'Total Deduction', 'TotalDeduction', 'totalDeduction'),
    accountNumber: pick(raw, 'Account Number', 'AccountNumber', 'accountNumber'),
    accountName: pick(raw, 'Account Name', 'AccountName', 'accountName'),
    bankName: pick(raw, 'Bank Name', 'BankName', 'bankName'),
    bankAccountDetails: pick(raw, 'BankAccountDetails', 'bankAccountDetails'),
    period: pick(raw, 'Period', 'period'),
    uniqueKey: pick(raw, 'UniqueKey', 'uniqueKey'),
    status: pick(raw, 'Status', 'status'),
    raw,
  };
}

function toWebhookSalaryRow(detail: SalaryDetailInput | SalaryDetailRecord) {
  const period = monthInputToPeriod(
    (('period' in detail ? detail.period : '') || currentSalaryPeriod()).trim()
  );
  const totals = computeSalaryTotals({
    salary: detail.salary,
    allowance: detail.allowance,
    overtimePay: 'overtimePay' in detail ? detail.overtimePay : '',
    performanceBonus: 'performanceBonus' in detail ? detail.performanceBonus : '',
    others: 'others' in detail ? detail.others : '',
    tax: detail.tax,
    contributions: 'contributions' in detail ? detail.contributions : '',
  });
  const overtimePay =
    'overtimePay' in detail && String(detail.overtimePay ?? '').trim() !== ''
      ? String(detail.overtimePay).trim()
      : '';
  const performanceBonus =
    'performanceBonus' in detail && String(detail.performanceBonus ?? '').trim() !== ''
      ? String(detail.performanceBonus).trim()
      : '';
  const contributions =
    'contributions' in detail && String(detail.contributions ?? '').trim() !== ''
      ? String(detail.contributions).trim()
      : '';
  const others =
    'others' in detail && String(detail.others ?? '').trim() !== ''
      ? String(detail.others).trim()
      : '';
  const netSalary = ('netSalary' in detail && detail.netSalary) || String(totals.netsalary);
  const totalEarning =
    ('totalEarning' in detail && detail.totalEarning) || String(totals.totalearning);
  const totalDeduction =
    ('totalDeduction' in detail && detail.totalDeduction) || String(totals.totaldeduction);

  return {
    EmployeeID: detail.employeeId,
    UniqueKey:
      ('uniqueKey' in detail && detail.uniqueKey?.trim()) ||
      buildSalaryUniqueKey(detail.employeeId, period),
    BaseSalary: detail.salary,
    NetSalary: netSalary,
    OvertimePay: overtimePay,
    PerformanceBonus: performanceBonus,
    Contributions: contributions,
    Allowance: detail.allowance,
    Tax: detail.tax,
    Others: others,
    AccountNumber: detail.accountNumber,
    AccountName: detail.accountName,
    BankName: detail.bankName,
    TotalEarning: totalEarning,
    TotalDeduction: totalDeduction,
    Period: period,
    Status: ('status' in detail && detail.status) || 'Pending',
  };
}

/**
 * Read salary rows from Supabase `salaries`, enriched with employee profile fields.
 * Prefer UniqueKey (`EmployeeID-Period`) when employeeIds + period (or uniqueKeys) are provided.
 */
export async function fetchSalaryDetails(
  employeeIds?: string[],
  period?: string,
  uniqueKeys?: string[]
): Promise<SalaryDetailRecord[]> {
  const periodKey = period?.trim() ? monthInputToPeriod(period.trim()) : undefined;
  const keys =
    uniqueKeys && uniqueKeys.length > 0
      ? uniqueKeys.map((key) => key.trim()).filter(Boolean)
      : periodKey && employeeIds && employeeIds.length > 0
        ? employeeIds.map((id) => buildSalaryUniqueKey(id, periodKey)).filter(Boolean)
        : undefined;

  const [salaryRows, employeeRows] = await Promise.all([
    listSalaryDbRows({
      employeeIds,
      period: periodKey,
      uniqueKeys: keys,
    }),
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

  if (keys && keys.length > 0) {
    const wantedKeys = new Set(keys.map((key) => key.trim().toLowerCase()));
    rows = rows.filter((row) => {
      const key = (row.uniqueKey || buildSalaryUniqueKey(row.employeeId, row.period || ''))
        .trim()
        .toLowerCase();
      return wantedKeys.has(key);
    });
  } else {
    if (periodKey) {
      rows = rows.filter((row) => monthInputToPeriod((row.period || '').trim()) === periodKey);
    }
    if (employeeIds && employeeIds.length > 0) {
      const wanted = new Set(employeeIds.map((id) => id.trim().toLowerCase()));
      rows = rows.filter((row) => wanted.has(row.employeeId.trim().toLowerCase()));
    }
  }

  return rows;
}

/**
 * Dual-write salary rows: Supabase first, then n8n update-salary-detail.
 * If the sheet/webhook write fails, Supabase changes are rolled back.
 */
export async function updateSalaryDetails(
  details: SalaryDetailInput[]
): Promise<{ message: string }> {
  if (!details.length) {
    throw new Error('No salary details provided to update.');
  }

  for (const detail of details) {
    if (!detail.employeeId?.trim()) {
      throw new Error('Each salary detail row needs an EmployeeID.');
    }
  }

  const writes = details.map((detail) => {
    const period = monthInputToPeriod((detail.period || currentSalaryPeriod()).trim());
    const totals = computeSalaryTotals(detail);
    const uniqueKey = detail.uniqueKey?.trim() || buildSalaryUniqueKey(detail.employeeId, period);
    return {
      ...detail,
      period,
      uniqueKey,
      status: detail.status || 'Pending',
      totalEarning: detail.totalEarning || String(totals.totalearning),
      totalDeduction: detail.totalDeduction || String(totals.totaldeduction),
      netSalary: detail.netSalary || String(totals.netsalary),
      // Keep optional components blank when the caller did not supply them.
      overtimePay: detail.overtimePay ?? '',
      performanceBonus: detail.performanceBonus ?? '',
      contributions: detail.contributions ?? '',
      others: detail.others ?? '',
    };
  });

  const snapshots: Array<{
    previous: SalaryDbRow | null;
    employeeId: string;
    period: string;
  }> = [];

  try {
    for (const detail of writes) {
      const previous = await getSalaryDbRow(detail.employeeId, detail.period);
      snapshots.push({
        previous,
        employeeId: detail.employeeId.trim(),
        period: detail.period,
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

    return { message };
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

/** Overlay user-provided rows onto fetched salary detail rows. */
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
    const overtimePay = override.overtimePay?.trim() || current?.overtimePay || '';
    const performanceBonus = override.performanceBonus?.trim() || current?.performanceBonus || '';
    const contributions = override.contributions?.trim() || current?.contributions || '';
    const others = override.others?.trim() || current?.others || '';
    const totals = computeSalaryTotals({
      salary,
      allowance,
      overtimePay,
      performanceBonus,
      others,
      tax,
      contributions,
    });
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
      overtimePay,
      performanceBonus,
      contributions,
      allowance,
      tax,
      others,
      totalEarning:
        override.totalEarning?.trim() || current?.totalEarning || String(totals.totalearning),
      totalDeduction:
        override.totalDeduction?.trim() || current?.totalDeduction || String(totals.totaldeduction),
      accountNumber: override.accountNumber?.trim() || current?.accountNumber || '',
      accountName: override.accountName?.trim() || current?.accountName || '',
      bankName: override.bankName?.trim() || current?.bankName || '',
      bankAccountDetails: current?.bankAccountDetails || '',
      period: monthInputToPeriod(
        (override.period?.trim() || current?.period || currentSalaryPeriod()).trim()
      ),
      uniqueKey:
        override.uniqueKey?.trim() ||
        current?.uniqueKey ||
        buildSalaryUniqueKey(
          override.employeeId.trim(),
          override.period?.trim() || current?.period || currentSalaryPeriod()
        ),
      status: override.status?.trim() || current?.status || '',
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
    'Overtime Pay': detail.overtimePay,
    'Performance Bonus': detail.performanceBonus,
    Others: detail.others,
    Tax: detail.tax,
    Contributions: detail.contributions,
    'Account Number': detail.accountNumber,
    'Account Name': detail.accountName,
    'Bank Name': detail.bankName,
  };
  if (hasValue(mapped[field])) return String(mapped[field]).trim();

  const rawKeys: Record<string, string[]> = {
    'Base Salary': ['BaseSalary', 'baseSalary', 'Salary', 'salary'],
    Salary: ['BaseSalary', 'baseSalary', 'Salary', 'salary'],
    Allowance: ['Allowance', 'allowance'],
    'Overtime Pay': ['OvertimePay', 'overtimePay', 'Overtime Pay'],
    'Performance Bonus': ['PerformanceBonus', 'performanceBonus', 'Performance Bonus'],
    Others: ['Others', 'others'],
    Tax: ['Tax', 'tax'],
    Contributions: ['Contributions', 'contributions', 'Contribution', 'contribution'],
    'Account Number': ['Account Number', 'AccountNumber', 'accountNumber', 'BankAccountDetails'],
    'Account Name': ['Account Name', 'AccountName', 'accountName'],
    'Bank Name': ['Bank Name', 'BankName', 'bankName'],
  };
  return pick(detail.raw, ...(rawKeys[field] || []));
}

/** Empty form-field labels for highlight UI (includes optional money fields). */
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

    // Always include the employee when collecting the single review modal;
    // required-field gaps drive whether generate can proceed after save.
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

/** Shape sent into the generate-salary-slip webhook (matches Salaries columns). */
export function toSalaryDetailWebhookFields(detail: SalaryDetailRecord | undefined) {
  const period = detail?.period || '';
  return {
    UniqueKey:
      detail?.uniqueKey ||
      (detail?.employeeId && period ? buildSalaryUniqueKey(detail.employeeId, period) : ''),
    BaseSalary: detail?.salary || '',
    NetSalary: detail?.netSalary || '',
    OvertimePay: detail?.overtimePay || '',
    PerformanceBonus: detail?.performanceBonus || '',
    Contributions: detail?.contributions || '',
    Allowance: detail?.allowance || '',
    Tax: detail?.tax || '',
    Others: detail?.others || '',
    AccountNumber: detail?.accountNumber || '',
    AccountName: detail?.accountName || '',
    BankName: detail?.bankName || '',
    TotalEarning: detail?.totalEarning || '',
    TotalDeduction: detail?.totalDeduction || '',
    Period: period,
    Status: detail?.status || '',
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
    overtimePay: detail.overtimePay,
    performanceBonus: detail.performanceBonus,
    contributions: detail.contributions,
    others: detail.others,
    netSalary: detail.netSalary,
    period: detail.period,
    uniqueKey: detail.uniqueKey,
    status: detail.status,
    totalEarning: detail.totalEarning,
    totalDeduction: detail.totalDeduction,
  };
}
