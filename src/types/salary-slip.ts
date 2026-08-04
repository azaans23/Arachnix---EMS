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
   * When true, continue generating even if allowance/tax/bank fields are incomplete.
   * When false/omitted and fields are missing, the API returns needsConfirmation.
   */
  confirmIncomplete?: boolean;
  /**
   * User-provided / just-updated salary rows. Merged over get-salary-detail results
   * so generate can use fresh values without waiting for sheet sync.
   */
  salaryDetails?: SalaryDetailInput[];
}

/** Fields the user can enter / send to update-salary-detail. */
export interface SalaryDetailInput {
  employeeId: string;
  salary: string;
  allowance: string;
  tax: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
}

/** Row from n8n get-salary-detail webhook. */
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
  allowance: string;
  tax: string;
  totalEarning: string;
  totalDeduction: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankAccountDetails: string;
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
