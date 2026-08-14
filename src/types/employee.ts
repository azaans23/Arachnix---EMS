/** Canonical Employees sheet row (PRD schema). */
export interface EmployeeRecord {
  employeeId: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  department: string;
  designation: string;
  employeeType: string;
  joiningDate: string;
  baseSalary: string;
  bankAccountDetails: string;
  role: string;
  supabaseUserId: string;
  emsStatus: string;
  /** Original sheet/webhook payload for passthrough fields */
  raw: Record<string, unknown>;
}

/** Form / API write payload (camelCase). */
export interface EmployeeWriteInput {
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  department: string;
  designation: string;
  employmentType: string;
  joiningDate: string;
  baseSalary: string;
  bankAccountDetails: string;
  role: string;
  emsStatus: string;
  /** Preserved from the sheet on update; set on EMS registration. */
  supabaseUserId?: string;
  /** When editing, the ID currently stored on the sheet (for uniqueness exclusion). */
  originalEmployeeId?: string;
  /** When editing, the email currently stored on the sheet. */
  originalEmail?: string;
}

/** Compact shape used by list UI / modals. */
export interface SheetUser {
  name: string;
  email: string;
  role: string;
  employeeId: string;
  raw: Record<string, unknown>;
}

export function toSheetUser(employee: EmployeeRecord): SheetUser {
  return {
    name: employee.fullName,
    email: employee.email,
    role: employee.role,
    employeeId: employee.employeeId,
    raw: employee.raw,
  };
}

function pickRaw(raw: Record<string, unknown> | undefined, keys: string[]): string {
  if (!raw) return '';
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

export function supabaseUserIdOf(user: Pick<SheetUser, 'raw'>): string {
  return pickRaw(user.raw, [
    'SupabaseUserID',
    'SupabaseUserId',
    'supabaseUserId',
    'supabaseuserid',
  ]);
}

export function emsStatusOf(user: Pick<SheetUser, 'raw'>): string {
  return pickRaw(user.raw, ['EMSStatus', 'emsStatus', 'emsstatus']) || 'Inactive';
}

/**
 * EMS login access exists only when the employee has a Supabase auth account.
 * EMSStatus alone is a label and can be edited on the sheet, so it is never
 * treated as proof that credentials were created.
 */
export function hasEmsLogin(user: Pick<SheetUser, 'raw'>): boolean {
  return Boolean(supabaseUserIdOf(user));
}

export function isEmsActive(user: Pick<SheetUser, 'raw'>): boolean {
  return hasEmsLogin(user) && emsStatusOf(user).toLowerCase() === 'active';
}
