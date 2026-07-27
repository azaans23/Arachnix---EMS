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
