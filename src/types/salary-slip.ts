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
}
