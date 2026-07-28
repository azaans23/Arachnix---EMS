import type { EmployeeRecord, EmployeeWriteInput, SheetUser } from '@/types/employee';
import { toSheetUser } from '@/types/employee';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  buildEmployeeUniquenessContext,
  employeeValidationSchema,
} from '@/utils/validation';

function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export function mapRawToEmployee(rawInput: unknown): EmployeeRecord {
  const raw =
    rawInput && typeof rawInput === 'object'
      ? (rawInput as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    employeeId: pick(raw, 'EmployeeID', 'employeeId', 'EmployeeId'),
    fullName: pick(raw, 'FullName', 'fullName', 'name', 'Name'),
    email: pick(raw, 'Email', 'email'),
    phone: pick(raw, 'Phone', 'phone'),
    dob: pick(raw, 'DOB', 'dob'),
    address: pick(raw, 'Address', 'address'),
    department: pick(raw, 'Department', 'department'),
    designation: pick(raw, 'Designation', 'designation'),
    employeeType: pick(raw, 'EmployeeType', 'employeeType', 'EmploymentType'),
    joiningDate: pick(raw, 'JoiningDate', 'joiningDate'),
    baseSalary: pick(raw, 'BaseSalary', 'baseSalary'),
    bankAccountDetails: pick(raw, 'BankAccountDetails', 'bankAccountDetails'),
    role: pick(raw, 'Role', 'role') || 'Employee',
    supabaseUserId: pick(raw, 'SupabaseUserID', 'supabaseUserId', 'SupabaseUserId'),
    emsStatus: pick(raw, 'EMSStatus', 'emsStatus') || 'Inactive',
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
export function getNextEmployeeId(
  employees: Pick<EmployeeRecord, 'employeeId'>[]
): string {
  const highest = employees.reduce((max, employee) => {
    const match = employee.employeeId.trim().match(EMPLOYEE_ID_PATTERN);
    if (!match) return max;
    const sequence = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `EMP-${String(highest + 1).padStart(3, '0')}`;
}

/** Sheet/n8n write body using PascalCase column names from the Employees schema. */
export function toSheetWritePayload(input: EmployeeWriteInput): Record<string, string> {
  return {
    EmployeeID: input.employeeId.trim(),
    FullName: input.name.trim(),
    Email: input.email.trim(),
    Phone: input.phone.trim(),
    DOB: input.dob.trim(),
    Address: input.address.trim(),
    Department: input.department.trim(),
    Designation: input.designation.trim(),
    EmployeeType: input.employmentType.trim(),
    JoiningDate: input.joiningDate.trim(),
    BaseSalary: String(input.baseSalary).trim(),
    BankAccountDetails: input.bankAccountDetails.trim(),
    Role: input.role.trim(),
    EMSStatus: input.emsStatus.trim(),
    // camelCase aliases for workflows that still expect the form shape
    employeeId: input.employeeId.trim(),
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    dob: input.dob.trim(),
    address: input.address.trim(),
    department: input.department.trim(),
    designation: input.designation.trim(),
    employmentType: input.employmentType.trim(),
    joiningDate: input.joiningDate.trim(),
    baseSalary: String(input.baseSalary).trim(),
    bankAccountDetails: input.bankAccountDetails.trim(),
    role: input.role.trim(),
    emsStatus: input.emsStatus.trim(),
  };
}

export function employeeRecordToAuditValue(
  employee: EmployeeRecord
): Record<string, string> {
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
    EMSStatus: employee.emsStatus,
  };
}

export function employeeInputToAuditValue(
  input: EmployeeWriteInput
): Record<string, string> {
  const payload = toSheetWritePayload(input);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => /^[A-Z]/.test(key))
  );
}

export type UniquenessConflict =
  | { field: 'employeeId'; message: string }
  | { field: 'email'; message: string };

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

async function parseWebhookError(response: Response, fallback: string): Promise<string> {
  let errText = '';
  try {
    errText = await response.text();
  } catch {
    /* ignore */
  }

  try {
    const jsonErr = JSON.parse(errText);
    if (jsonErr.message) {
      return jsonErr.message + (jsonErr.hint ? ` ${jsonErr.hint}` : '');
    }
  } catch {
    /* keep text */
  }

  return errText || fallback;
}

/** Typed read of the Employees sheet via n8n. */
export async function fetchEmployees(): Promise<EmployeeRecord[]> {
  const response = await fetch(SHEETS_WEBHOOKS.getUsers, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new SheetsError(
      await parseWebhookError(
        response,
        `n8n webhook returned status ${response.status}. Make sure the webhook is active.`
      ),
      response.status
    );
  }

  const data = await response.json();
  return normalizeEmployeesPayload(data);
}

export async function fetchSheetUsers(): Promise<SheetUser[]> {
  const employees = await fetchEmployees();
  return employees.map(toSheetUser);
}

export async function getEmployeeById(id: string): Promise<EmployeeRecord | null> {
  const needle = decodeURIComponent(id).trim().toLowerCase();
  if (!needle) return null;

  const employees = await fetchEmployees();
  return (
    employees.find(
      (employee) =>
        employee.employeeId.trim().toLowerCase() === needle ||
        employee.email.trim().toLowerCase() === needle
    ) || null
  );
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
  const bodyRecord =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

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

/** Typed write to the Employees sheet via n8n (create or update). */
export async function upsertEmployee(input: EmployeeWriteInput): Promise<void> {
  const payload = toSheetWritePayload(input);

  const response = await fetch(SHEETS_WEBHOOKS.updateUser, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new SheetsError(
      await parseWebhookError(
        response,
        `n8n update-user webhook returned status ${response.status}.`
      ),
      response.status
    );
  }
}

export function employeeToFormValues(employee: EmployeeRecord): EmployeeWriteInput {
  return {
    employeeId: employee.employeeId,
    name: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    dob: employee.dob,
    address: employee.address,
    department: employee.department,
    designation: employee.designation,
    employmentType: employee.employeeType,
    joiningDate: employee.joiningDate,
    baseSalary: employee.baseSalary,
    bankAccountDetails: employee.bankAccountDetails,
    role: employee.role || 'Employee',
    emsStatus: employee.emsStatus || 'Active',
    originalEmployeeId: employee.employeeId,
    originalEmail: employee.email,
  };
}
