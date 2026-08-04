export const SALARY_SLIP_RUN_STATUSES = {
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  PARTIAL: 'Partial',
} as const;

export type SalarySlipRunStatus =
  (typeof SALARY_SLIP_RUN_STATUSES)[keyof typeof SALARY_SLIP_RUN_STATUSES] | string;

export const SALARY_SLIP_DETAIL_STATUSES = {
  PENDING: 'Pending',
  SUCCESS: 'Success',
  FAILED: 'Failed',
} as const;

export type SalarySlipDetailStatus =
  (typeof SALARY_SLIP_DETAIL_STATUSES)[keyof typeof SALARY_SLIP_DETAIL_STATUSES] | string;

export interface SalarySlipRun {
  runId: string;
  triggeredBy: string;
  runDate: string;
  month: number;
  year: number;
  status: SalarySlipRunStatus;
  successCount: number;
  failCount: number;
}

export interface SalarySlipRunDetail {
  runDetailId: string;
  runId: string;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  status: SalarySlipDetailStatus;
  pdfLink: string;
  emailStatus: string;
  errorReason: string;
}

export interface GenerateSalarySlipsInput {
  month: number;
  year: number;
  /** Empty / omitted = all active employees with a base salary. */
  employeeIds?: string[];
  /**
   * When true, continue generating after salary details were reviewed/saved.
   * When false/omitted, the API returns needsConfirmation with all run employees.
   */
  confirmIncomplete?: boolean;
  /**
   * User-provided / just-updated salary rows. Merged over fetched salary details
   * so generate can use fresh values without waiting for sheet sync.
   */
  salaryDetails?: SalaryDetailInput[];
}

/** Fields the user can enter / send to update-salary-detail (+ Supabase salaries). */
export interface SalaryDetailInput {
  employeeId: string;
  /** Maps to BaseSalary. */
  salary: string;
  allowance: string;
  tax: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  overtimePay?: string;
  performanceBonus?: string;
  contributions?: string;
  others?: string;
  netSalary?: string;
  /** Period key, e.g. `August-2026`. Defaults to current month when omitted. */
  period?: string;
  /** `EmployeeID-Period`, e.g. `EMP-001-August-2026`. */
  uniqueKey?: string;
  status?: string;
  totalEarning?: string;
  totalDeduction?: string;
}

/** Salary row enriched with employee profile fields for UI / payroll. */
export interface SalaryDetailRecord {
  employeeId: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employeeType: string;
  role: string;
  emsStatus: string;
  baseSalary: string;
  salary: string;
  netSalary: string;
  overtimePay: string;
  performanceBonus: string;
  contributions: string;
  allowance: string;
  tax: string;
  others: string;
  totalEarning: string;
  totalDeduction: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankAccountDetails: string;
  period?: string;
  /** `EmployeeID-Period`, e.g. `EMP-001-August-2026`. */
  uniqueKey?: string;
  status?: string;
  salaryId?: string;
  raw: Record<string, unknown>;
}

export interface IncompleteSalaryDetail {
  employeeId: string;
  fullName?: string;
  email?: string;
  department?: string;
  designation?: string;
  missingFields: string[];
}

/** All editable money/bank fields shown in salary forms (empty ones are highlighted). */
export const SALARY_DETAIL_FIELDS = [
  { key: 'salary', label: 'Base Salary', missing: 'Base Salary' },
  { key: 'allowance', label: 'Allowance', missing: 'Allowance' },
  { key: 'overtimePay', label: 'Overtime Pay', missing: 'Overtime Pay' },
  { key: 'performanceBonus', label: 'Performance Bonus', missing: 'Performance Bonus' },
  { key: 'others', label: 'Others', missing: 'Others' },
  { key: 'tax', label: 'Tax', missing: 'Tax' },
  { key: 'contributions', label: 'Contributions', missing: 'Contributions' },
  { key: 'accountNumber', label: 'Account Number', missing: 'Account Number' },
  { key: 'accountName', label: 'Account Name', missing: 'Account Name' },
  { key: 'bankName', label: 'Bank Name', missing: 'Bank Name' },
] as const;

export type SalaryDetailFieldKey = (typeof SALARY_DETAIL_FIELDS)[number]['key'];
