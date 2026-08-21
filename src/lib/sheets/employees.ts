import type { EmployeeRecord, EmployeeWriteInput } from '@/types/employee';
import { formatToggle, parseToggle } from '@/types/employee';
import { normalizeRole, ROLES } from '@/lib/rbac';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  dbRowToEmployeeRecord,
  findEmployeeDbRowByIdOrEmail,
  getEmployeeDbRow,
  listEmployeeDbRows,
  restoreEmployeeDbRow,
  rollbackEmployeeDbWrite,
  deleteEmployeeDbRow,
  upsertEmployeeDbRow,
} from '@/lib/db/employees';
import { deleteSalaryDbRow, getSalaryDbRow, restoreSalaryDbRow } from '@/lib/db/salaries';
import { deleteLeaveBalancesByEmployeeId, restoreLeaveBalanceRows } from '@/lib/db/leave-balances';
import { deleteLeaveRequestsByEmployeeId, restoreLeaveRequestRows } from '@/lib/db/leave-requests';
import { buildEmployeeUniquenessContext, employeeValidationSchema } from '@/utils/validation';

function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** Normalize sheet/Excel/ISO dates to YYYY-MM-DD for HTML date inputs + n8n. */
export function toDateInputValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return text;
}

function prefer(value: string | undefined, fallback: string): string {
  const next = String(value ?? '').trim();
  return next || fallback;
}

export function mapRawToEmployee(rawInput: unknown): EmployeeRecord {
  const raw =
    rawInput && typeof rawInput === 'object'
      ? (rawInput as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const rawRole = pick(raw, 'Role', 'role') || 'Employee';
  const isDirector =
    parseToggle(raw.IsDirector ?? raw.isDirector ?? raw.isdirector) ||
    normalizeRole(rawRole) === ROLES.DIRECTOR;
  const hasFinanceAccess = parseToggle(
    raw.HasFinanceAccess ?? raw.hasFinanceAccess ?? raw.hasfinanceaccess
  );
  const role = normalizeRole(rawRole) === ROLES.DIRECTOR ? 'Employee' : rawRole;

  return {
    employeeId: pick(raw, 'EmployeeID', 'employeeId', 'EmployeeId'),
    fullName: pick(raw, 'FullName', 'fullName', 'name', 'Name'),
    email: pick(raw, 'Email', 'email'),
    phone: pick(raw, 'Phone', 'phone'),
    dob: toDateInputValue(raw.DOB ?? raw.dob),
    address: pick(raw, 'Address', 'address'),
    department: pick(raw, 'Department', 'department'),
    designation: pick(raw, 'Designation', 'designation'),
    employeeType: pick(raw, 'EmployeeType', 'employeeType', 'EmploymentType'),
    joiningDate: toDateInputValue(raw.JoiningDate ?? raw.joiningDate),
    baseSalary: pick(raw, 'BaseSalary', 'baseSalary'),
    bankAccountDetails: pick(raw, 'BankAccountDetails', 'bankAccountDetails'),
    role,
    supabaseUserId: pick(raw, 'SupabaseUserID', 'supabaseUserId', 'SupabaseUserId'),
    emsStatus: pick(raw, 'EMSStatus', 'emsStatus') || 'Inactive',
    isDirector,
    hasFinanceAccess: hasFinanceAccess && normalizeRole(role) === ROLES.HR_MANAGER,
    raw,
  };
}

export function normalizeEmployeesPayload(data: unknown): EmployeeRecord[] {
  let rows: unknown[] = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object') {
    rows = [data];
  }
  return rows.map(mapRawToEmployee);
}

const EMPLOYEE_ID_PATTERN = /^EMP-(\d+)$/i;

/**
 * Returns the next ID after the highest valid EMP-nnn value.
 * Blank/malformed legacy IDs are ignored; an empty roster starts at EMP-001.
 */
export function getNextEmployeeId(employees: Pick<EmployeeRecord, 'employeeId'>[]): string {
  const highest = employees.reduce((max, employee) => {
    const match = employee.employeeId.trim().match(EMPLOYEE_ID_PATTERN);
    if (!match) return max;
    const sequence = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

/** Sheet/n8n write body — sheet column names only (no camelCase duplicates). */
export function toSheetWritePayload(input: EmployeeWriteInput): Record<string, string> {
  return {
    EmployeeID: input.employeeId.trim(),
    FullName: input.name.trim(),
    Email: input.email.trim(),
    Phone: String(input.phone ?? '').trim(),
    DOB: toDateInputValue(input.dob),
    Address: input.address.trim(),
    Department: input.department.trim(),
    Designation: input.designation.trim(),
    EmployeeType: input.employmentType.trim(),
    JoiningDate: toDateInputValue(input.joiningDate),
    BaseSalary: String(input.baseSalary ?? '').trim(),
    BankAccountDetails: input.bankAccountDetails.trim(),
    Role: input.role.trim(),
    IsDirector: formatToggle(Boolean(input.isDirector)),
    HasFinanceAccess: formatToggle(
      Boolean(input.hasFinanceAccess) && normalizeRole(input.role) === ROLES.HR_MANAGER
    ),
    SupabaseUserID: String(input.supabaseUserId ?? '').trim(),
    EMSStatus: input.emsStatus.trim() || 'Inactive',
  };
}

/**
 * Fill any blank write fields from the existing sheet row so an update
 * never clears columns the form didn't intentionally change.
 */
export function mergeEmployeeWriteInput(
  input: EmployeeWriteInput,
  previous: EmployeeRecord | null | undefined
): EmployeeWriteInput {
  if (!previous) {
    return {
      ...input,
      dob: toDateInputValue(input.dob),
      joiningDate: toDateInputValue(input.joiningDate),
      emsStatus: input.emsStatus.trim() || 'Active',
      supabaseUserId: input.supabaseUserId || '',
      isDirector: Boolean(input.isDirector),
      hasFinanceAccess: Boolean(input.hasFinanceAccess),
    };
  }

  return {
    employeeId: prefer(input.employeeId, previous.employeeId),
    name: prefer(input.name, previous.fullName),
    email: prefer(input.email, previous.email),
    phone: prefer(input.phone, previous.phone),
    dob: prefer(toDateInputValue(input.dob), previous.dob),
    address: prefer(input.address, previous.address),
    department: prefer(input.department, previous.department),
    designation: prefer(input.designation, previous.designation),
    employmentType: prefer(input.employmentType, previous.employeeType),
    joiningDate: prefer(toDateInputValue(input.joiningDate), previous.joiningDate),
    baseSalary: prefer(String(input.baseSalary ?? ''), previous.baseSalary),
    bankAccountDetails: prefer(input.bankAccountDetails, previous.bankAccountDetails),
    role: prefer(input.role, previous.role),
    isDirector: input.isDirector ?? previous.isDirector,
    hasFinanceAccess: input.hasFinanceAccess ?? previous.hasFinanceAccess,
    emsStatus: prefer(input.emsStatus, previous.emsStatus) || 'Inactive',
    // Empty string means "clear login link" (EMS access revoked); do not fall back.
    supabaseUserId:
      input.supabaseUserId !== undefined && !String(input.supabaseUserId).trim()
        ? ''
        : prefer(input.supabaseUserId, previous.supabaseUserId),
    originalEmployeeId: input.originalEmployeeId || previous.employeeId,
    originalEmail: input.originalEmail || previous.email,
  };
}

export function employeeRecordToAuditValue(employee: EmployeeRecord): Record<string, string> {
  return {
    EmployeeID: employee.employeeId,
    FullName: employee.fullName,
    Email: employee.email,
    Phone: employee.phone,
    DOB: employee.dob,
    Address: employee.address,
    Department: employee.department,
    Designation: employee.designation,
    EmployeeType: employee.employeeType,
    JoiningDate: employee.joiningDate,
    BaseSalary: employee.baseSalary,
    BankAccountDetails: employee.bankAccountDetails,
    Role: employee.role,
    IsDirector: formatToggle(employee.isDirector),
    HasFinanceAccess: formatToggle(employee.hasFinanceAccess),
    SupabaseUserID: employee.supabaseUserId,
    EMSStatus: employee.emsStatus,
  };
}

export function employeeInputToAuditValue(input: EmployeeWriteInput): Record<string, string> {
  const payload = toSheetWritePayload(input);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => /^[A-Z]/.test(key)));
}

export type UniquenessConflict =
  { field: 'employeeId'; message: string } | { field: 'email'; message: string };

export function findUniquenessConflict(
  employees: EmployeeRecord[],
  input: Pick<EmployeeWriteInput, 'employeeId' | 'email' | 'originalEmployeeId' | 'originalEmail'>
): UniquenessConflict | null {
  const id = input.employeeId.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const excludeId = (input.originalEmployeeId || '').trim().toLowerCase();
  const excludeEmail = (input.originalEmail || '').trim().toLowerCase();

  const isSameRecord = (employee: EmployeeRecord) => {
    const empId = employee.employeeId.trim().toLowerCase();
    const empEmail = employee.email.trim().toLowerCase();
    if (excludeId && empId === excludeId) return true;
    if (excludeEmail && empEmail === excludeEmail) return true;
    return false;
  };

  const idMatch = employees.find(
    (employee) => employee.employeeId.trim().toLowerCase() === id && !isSameRecord(employee)
  );
  if (idMatch) {
    return { field: 'employeeId', message: 'Employee ID already exists' };
  }

  const emailMatch = employees.find(
    (employee) => employee.email.trim().toLowerCase() === email && !isSameRecord(employee)
  );
  if (emailMatch) {
    return { field: 'email', message: 'Email already exists' };
  }

  return null;
}

export class SheetsError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'SheetsError';
    this.status = status;
  }
}

/**
 * n8n answers with these when the workflow did run but its final node emitted
 * no items (e.g. a Sheets delete node), so they must not be treated as failures.
 */
function isWebhookAckBody(text: string): boolean {
  const body = text.toLowerCase();
  return body.includes('no item to return was found') || body.includes('workflow was started');
}

function formatWebhookError(status: number, errText: string, fallback: string): string {
  try {
    const jsonErr = JSON.parse(errText);
    if (jsonErr.message) {
      const hint = jsonErr.hint ? ` ${jsonErr.hint}` : '';
      const message = String(jsonErr.message) + hint;
      if (status === 404) {
        return `${message} Ensure the n8n workflow is Active and using the production /webhook/ URL (not webhook-test).`;
      }
      return message;
    }
  } catch {
    /* keep text */
  }

  if (status === 404) {
    return (
      errText ||
      'n8n webhook not found (404). Activate the workflow and use /webhook/ (not /webhook-test/).'
    );
  }

  return errText || fallback;
}

/** Typed read of employees from Supabase (sheet remains write source-of-truth via dual-write). */
export async function fetchEmployees(): Promise<EmployeeRecord[]> {
  try {
    const rows = await listEmployeeDbRows();
    return rows.map((row) => dbRowToEmployeeRecord(row) as EmployeeRecord);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load employees from Supabase.';
    throw new SheetsError(message, 500);
  }
}

export async function getEmployeeById(id: string): Promise<EmployeeRecord | null> {
  const candidates = new Set<string>();
  let current = String(id || '').trim();

  // Next.js / fetch may pass an id that is already decoded, or still percent-encoded.
  for (let i = 0; i < 3 && current; i += 1) {
    candidates.add(current.toLowerCase());
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded.trim();
    } catch {
      break;
    }
  }

  if (candidates.size === 0) return null;

  try {
    const row = await findEmployeeDbRowByIdOrEmail(candidates);
    return row ? (dbRowToEmployeeRecord(row) as EmployeeRecord) : null;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load employee from Supabase.';
    throw new SheetsError(message, 500);
  }
}

export type ValidateEmployeeResult =
  | { ok: true; value: EmployeeWriteInput }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Required fields, email format, then duplicate Employee ID / email against the sheet. */
export async function validateEmployeeWrite(
  body: unknown,
  options?: { existing?: EmployeeRecord[] }
): Promise<ValidateEmployeeResult> {
  const existing = options?.existing ?? (await fetchEmployees());
  const bodyRecord = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  try {
    const value = (await employeeValidationSchema.validate(body, {
      abortEarly: false,
      stripUnknown: true,
      context: buildEmployeeUniquenessContext(existing, {
        employeeId: String(bodyRecord.originalEmployeeId || ''),
        email: String(bodyRecord.originalEmail || ''),
      }),
    })) as EmployeeWriteInput;

    const conflict = findUniquenessConflict(existing, value);
    if (conflict) {
      return {
        ok: false,
        error: conflict.message,
        fieldErrors: { [conflict.field]: conflict.message },
      };
    }

    return { ok: true, value };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'inner' in err) {
      const yupErr = err as { message: string; inner: { path?: string; message: string }[] };
      const fieldErrors: Record<string, string> = {};
      for (const issue of yupErr.inner || []) {
        if (issue.path && !fieldErrors[issue.path]) {
          fieldErrors[issue.path] = issue.message;
        }
      }
      return {
        ok: false,
        error: Object.values(fieldErrors)[0] || yupErr.message || 'Validation failed',
        fieldErrors,
      };
    }

    const message = err instanceof Error ? err.message : 'Validation failed';
    return { ok: false, error: message };
  }
}

/**
 * Dual-write employee to Supabase + Google Sheet (n8n).
 * Order: DB first, then sheet. If the sheet fails, the DB write is rolled back.
 */
export async function upsertEmployee(
  input: EmployeeWriteInput,
  previous?: EmployeeRecord | null
): Promise<EmployeeWriteInput> {
  const merged = mergeEmployeeWriteInput(input, previous);
  const payload = toSheetWritePayload(merged);

  const lookupId = (previous?.employeeId || merged.originalEmployeeId || merged.employeeId).trim();
  const previousDbRow = await getEmployeeDbRow(lookupId);

  await upsertEmployeeDbRow(merged);

  try {
    const response = await fetch(SHEETS_WEBHOOKS.updateUser, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text().catch(() => '');

    if (!response.ok && !isWebhookAckBody(bodyText)) {
      throw new SheetsError(
        formatWebhookError(
          response.status,
          bodyText,
          `n8n update-user webhook returned status ${response.status}.`
        ),
        response.status
      );
    }
  } catch (sheetError) {
    try {
      await rollbackEmployeeDbWrite({
        previous: previousDbRow,
        writtenEmployeeId: merged.employeeId,
      });
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase employee after sheet write failure:',
        rollbackError
      );
    }
    throw sheetError;
  }

  return merged;
}

/**
 * Permanently delete an employee from Supabase, then from the Sheet via n8n.
 * Related salary / leave rows are removed first so FKs do not block the delete.
 * On webhook failure the employee row (and related snapshots) are restored.
 */
export async function deleteEmployee(employeeId: string): Promise<EmployeeRecord> {
  const id = employeeId.trim();
  if (!id) throw new SheetsError('Employee ID is required.', 400);

  const previousDbRow = await getEmployeeDbRow(id);
  if (!previousDbRow) {
    throw new SheetsError(`Employee ${id} was not found.`, 404);
  }

  const employee = dbRowToEmployeeRecord(previousDbRow);
  const previousSalary = await getSalaryDbRow(id);
  let previousBalances: Awaited<ReturnType<typeof deleteLeaveBalancesByEmployeeId>> = [];
  let previousRequests: Awaited<ReturnType<typeof deleteLeaveRequestsByEmployeeId>> = [];

  // Clear dependents before the employee row so FKs cannot block the delete.
  if (previousSalary) {
    await deleteSalaryDbRow(id);
  }
  previousBalances = await deleteLeaveBalancesByEmployeeId(id);
  previousRequests = await deleteLeaveRequestsByEmployeeId(id);
  await deleteEmployeeDbRow(id);

  try {
    const response = await fetch(SHEETS_WEBHOOKS.deleteEmployee, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        EmployeeID: employee.employeeId,
        Email: employee.email,
        FullName: employee.fullName,
      }),
    });

    const bodyText = await response.text().catch(() => '');

    if (!response.ok && !isWebhookAckBody(bodyText)) {
      throw new SheetsError(
        formatWebhookError(
          response.status,
          bodyText,
          `n8n delete-employee webhook returned status ${response.status}.`
        ),
        response.status
      );
    }
  } catch (sheetError) {
    try {
      await restoreEmployeeDbRow(previousDbRow);
      if (previousSalary) await restoreSalaryDbRow(previousSalary);
      if (previousBalances.length > 0) await restoreLeaveBalanceRows(previousBalances);
      if (previousRequests.length > 0) await restoreLeaveRequestRows(previousRequests);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase employee after delete-employee webhook failure:',
        rollbackError
      );
    }
    throw sheetError;
  }

  return employee;
}

export function employeeToFormValues(employee: EmployeeRecord): EmployeeWriteInput {
  return {
    employeeId: employee.employeeId,
    name: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    dob: toDateInputValue(employee.dob),
    address: employee.address,
    department: employee.department,
    designation: employee.designation,
    employmentType: employee.employeeType,
    joiningDate: toDateInputValue(employee.joiningDate),
    baseSalary: employee.baseSalary,
    bankAccountDetails: employee.bankAccountDetails,
    role: employee.role || 'Employee',
    isDirector: employee.isDirector,
    hasFinanceAccess: employee.hasFinanceAccess,
    emsStatus: employee.emsStatus || 'Active',
    supabaseUserId: employee.supabaseUserId,
    originalEmployeeId: employee.employeeId,
    originalEmail: employee.email,
  };
}
