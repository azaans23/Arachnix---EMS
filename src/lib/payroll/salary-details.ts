import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import type {
  IncompleteSalaryDetail,
  SalaryDetailInput,
  SalaryDetailRecord,
} from '@/types/salary-slip';

const REQUIRED_FIELDS = [
  'Salary',
  'Allowance',
  'Tax',
  'Account Number',
  'Account Name',
  'Bank Name',
] as const;

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
    baseSalary: pick(raw, 'BaseSalary', 'baseSalary'),
    // Prefer payroll Salary column; fall back to BaseSalary only if Salary is blank.
    salary: pick(raw, 'Salary', 'salary') || pick(raw, 'BaseSalary', 'baseSalary'),
    allowance: pick(raw, 'Allowance', 'allowance'),
    tax: pick(raw, 'Tax', 'tax'),
    totalEarning: pick(raw, 'Total Earning', 'TotalEarning', 'totalEarning'),
    totalDeduction: pick(raw, 'Total Deduction', 'TotalDeduction', 'totalDeduction'),
    accountNumber: pick(raw, 'Account Number', 'AccountNumber', 'accountNumber'),
    accountName: pick(raw, 'Account Name', 'AccountName', 'accountName'),
    bankName: pick(raw, 'Bank Name', 'BankName', 'bankName'),
    bankAccountDetails: pick(raw, 'BankAccountDetails', 'bankAccountDetails'),
    raw,
  };
}

function normalizeSalaryDetailsPayload(data: unknown): unknown[] {
  if (data == null) return [];

  if (typeof data === 'string') {
    try {
      return normalizeSalaryDetailsPayload(JSON.parse(data));
    } catch {
      return [];
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 1 && Array.isArray(data[0])) {
      return normalizeSalaryDetailsPayload(data[0]);
    }
    // Single n8n wrapper object that holds the rows
    if (
      data.length === 1 &&
      data[0] &&
      typeof data[0] === 'object' &&
      !Array.isArray(data[0])
    ) {
      const only = asRecord(data[0]);
      if (Array.isArray(only.data)) return normalizeSalaryDetailsPayload(only.data);
      if (Array.isArray(only.body)) return normalizeSalaryDetailsPayload(only.body);
      if (Array.isArray(only.results)) return normalizeSalaryDetailsPayload(only.results);
      if (Array.isArray(only.rows)) return normalizeSalaryDetailsPayload(only.rows);
      if (Array.isArray(only.json)) return normalizeSalaryDetailsPayload(only.json);
    }
    return data;
  }

  const root = asRecord(data);
  if (Array.isArray(root.data)) return normalizeSalaryDetailsPayload(root.data);
  if (Array.isArray(root.body)) return normalizeSalaryDetailsPayload(root.body);
  if (Array.isArray(root.results)) return normalizeSalaryDetailsPayload(root.results);
  if (Array.isArray(root.rows)) return normalizeSalaryDetailsPayload(root.rows);
  if (Array.isArray(root.json)) return normalizeSalaryDetailsPayload(root.json);
  if (pick(root, 'EmployeeID', 'employeeId')) return [root];
  return [];
}

function toWebhookSalaryRow(detail: SalaryDetailInput | SalaryDetailRecord) {
  return {
    EmployeeID: detail.employeeId,
    Salary: detail.salary,
    Allowance: detail.allowance,
    Tax: detail.tax,
    'Account Number': detail.accountNumber,
    'Account Name': detail.accountName,
    'Bank Name': detail.bankName,
  };
}

/** Fetch payroll detail rows from n8n for the given employee IDs (or all). */
export async function fetchSalaryDetails(
  employeeIds?: string[]
): Promise<SalaryDetailRecord[]> {
  const url = new URL(SHEETS_WEBHOOKS.getSalaryDetail);
  if (employeeIds && employeeIds.length > 0) {
    for (const id of employeeIds) {
      const trimmed = id.trim();
      if (trimmed) url.searchParams.append('employeeIds', trimmed);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  }).catch((error: unknown) => {
    const cause =
      error instanceof Error
        ? error.cause instanceof Error
          ? `${error.message} (${error.cause.message})`
          : error.message
        : String(error);
    throw new Error(`get-salary-detail webhook request failed: ${cause}`);
  });

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'get-salary-detail webhook not found (404). Activate the n8n workflow and use /webhook/ (not /webhook-test/).'
      );
    }
    throw new Error(text || `get-salary-detail webhook returned status ${response.status}.`);
  }

  let parsed: unknown = text;
  try {
    parsed = text.trim() ? JSON.parse(text) : [];
  } catch {
    throw new Error('get-salary-detail webhook returned non-JSON data.');
  }

  let rows = normalizeSalaryDetailsPayload(parsed)
    .map(mapRawToSalaryDetail)
    .filter((row) => Boolean(row.employeeId));

  if (employeeIds && employeeIds.length > 0) {
    const wanted = new Set(employeeIds.map((id) => id.trim().toLowerCase()));
    const filtered = rows.filter((row) => wanted.has(row.employeeId.trim().toLowerCase()));
    if (filtered.length > 0) {
      rows = filtered;
    }
  }

  return rows;
}

/**
 * Persist salary detail rows via n8n (used when get-salary-detail is missing fields).
 * Accepts one or many employees.
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

  const payload = {
    details: details.map(toWebhookSalaryRow),
  };

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
}

/** Overlay user-provided rows onto fetched get-salary-detail rows. */
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
      baseSalary: current?.baseSalary || '',
      salary: override.salary?.trim() || current?.salary || '',
      allowance: override.allowance?.trim() || current?.allowance || '',
      tax: override.tax?.trim() || current?.tax || '',
      totalEarning: current?.totalEarning || '',
      totalDeduction: current?.totalDeduction || '',
      accountNumber: override.accountNumber?.trim() || current?.accountNumber || '',
      accountName: override.accountName?.trim() || current?.accountName || '',
      bankName: override.bankName?.trim() || current?.bankName || '',
      bankAccountDetails: current?.bankAccountDetails || '',
      raw: current?.raw || {},
    });
  }

  return Array.from(byId.values());
}

function detailFieldValue(
  detail: SalaryDetailRecord,
  field: (typeof REQUIRED_FIELDS)[number]
): string {
  const mapped: Record<(typeof REQUIRED_FIELDS)[number], string> = {
    Salary: detail.salary,
    Allowance: detail.allowance,
    Tax: detail.tax,
    'Account Number': detail.accountNumber,
    'Account Name': detail.accountName,
    'Bank Name': detail.bankName,
  };
  if (hasValue(mapped[field])) return String(mapped[field]).trim();

  // Fallback to raw sheet keys if mapping missed a variant column name
  const rawKeys: Record<(typeof REQUIRED_FIELDS)[number], string[]> = {
    Salary: ['Salary', 'salary', 'BaseSalary', 'baseSalary'],
    Allowance: ['Allowance', 'allowance'],
    Tax: ['Tax', 'tax'],
    'Account Number': [
      'Account Number',
      'AccountNumber',
      'accountNumber',
      'BankAccountDetails',
    ],
    'Account Name': ['Account Name', 'AccountName', 'accountName'],
    'Bank Name': ['Bank Name', 'BankName', 'bankName'],
  };
  return pick(detail.raw, ...rawKeys[field]);
}

export function findIncompleteSalaryDetails(
  employeeIds: string[],
  details: SalaryDetailRecord[]
): IncompleteSalaryDetail[] {
  const byId = new Map(
    details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail])
  );

  const incomplete: IncompleteSalaryDetail[] = [];

  for (const employeeId of employeeIds) {
    const detail = byId.get(employeeId.trim().toLowerCase());
    const missingFields: string[] = [];

    if (!detail) {
      incomplete.push({
        employeeId,
        missingFields: [...REQUIRED_FIELDS],
      });
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!hasValue(detailFieldValue(detail, field))) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      incomplete.push({
        employeeId,
        fullName: detail.fullName,
        email: detail.email,
        department: detail.department,
        designation: detail.designation,
        missingFields,
      });
    }
  }

  return incomplete;
}

/** True when every required payroll field is present on the row. */
export function isSalaryDetailComplete(detail: SalaryDetailRecord): boolean {
  return REQUIRED_FIELDS.every((field) => hasValue(detailFieldValue(detail, field)));
}

/** Shape sent into the generate-salary-slip webhook employees[]. */
export function toSalaryDetailWebhookFields(detail: SalaryDetailRecord | undefined) {
  return {
    Salary: detail?.salary || '',
    Allowance: detail?.allowance || '',
    Tax: detail?.tax || '',
    AccountNumber: detail?.accountNumber || '',
    AccountName: detail?.accountName || '',
    BankName: detail?.bankName || '',
    'Account Number': detail?.accountNumber || '',
    'Account Name': detail?.accountName || '',
    'Bank Name': detail?.bankName || '',
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
  };
}
