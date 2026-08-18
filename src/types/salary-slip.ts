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

/**
 * Ephemeral slip-only amounts. Asked when generating a salary slip, sent to
 * n8n for that run, and never written to the salaries table.
 */
export interface SalarySlipExtrasInput {
  employeeId: string;
  overtimePay?: string;
  performanceBonus?: string;
  contributions?: string;
  others?: string;
}

export interface GenerateSalarySlipsInput {
  month: number;
  year: number;
  /** Empty / omitted = all employees who have a salary record. */
  employeeIds?: string[];
  /**
   * When true, continue generating after salary details were reviewed.
   * When false/omitted, the API returns needsConfirmation with run employees.
   */
  confirmIncomplete?: boolean;
  /** Slip-only OT/bonus/others/contributions — workflow only, not stored. */
  slipExtras?: SalarySlipExtrasInput[];
}

/** Persisted salary profile — one row per employee (no period / status). */
export interface SalaryDetailInput {
  employeeId: string;
  /** Maps to BaseSalary. */
  salary: string;
  allowance: string;
  tax: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  netSalary?: string;
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
  allowance: string;
  tax: string;
  totalEarning: string;
  totalDeduction: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankAccountDetails: string;
  /** Same as employeeId — one salary row per employee. */
  uniqueKey?: string;
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

/** Fields stored on the salaries table / salary create+edit forms. */
export const SALARY_DETAIL_FIELDS = [
  { key: 'salary', label: 'Base Salary', missing: 'Base Salary' },
  { key: 'allowance', label: 'Allowance', missing: 'Allowance' },
  { key: 'tax', label: 'Tax', missing: 'Tax' },
  { key: 'accountNumber', label: 'Account Number', missing: 'Account Number' },
  { key: 'accountName', label: 'Account Name', missing: 'Account Name' },
  { key: 'bankName', label: 'Bank Name', missing: 'Bank Name' },
] as const;

export type SalaryDetailFieldKey = (typeof SALARY_DETAIL_FIELDS)[number]['key'];

/** Asked only while generating a salary slip (not persisted). */
export const SALARY_SLIP_EXTRA_FIELDS = [
  { key: 'overtimePay', label: 'Overtime Pay' },
  { key: 'performanceBonus', label: 'Performance Bonus' },
  { key: 'others', label: 'Others' },
  { key: 'contributions', label: 'Contributions' },
] as const;

export type SalarySlipExtraFieldKey = (typeof SALARY_SLIP_EXTRA_FIELDS)[number]['key'];
