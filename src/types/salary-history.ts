export const SALARY_HISTORY_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
} as const;

export type SalaryHistoryAction =
  (typeof SALARY_HISTORY_ACTIONS)[keyof typeof SALARY_HISTORY_ACTIONS];

/** One compensation change for an employee. Current pay stays on `salaries`. */
export interface SalaryHistoryRecord {
  historyId: string;
  employeeId: string;
  salaryId: string;
  changedAt: string;
  changedBy: string;
  action: SalaryHistoryAction | string;
  oldBaseSalary: string;
  newBaseSalary: string;
  oldAllowance: string;
  newAllowance: string;
  oldTax: string;
  newTax: string;
  oldNetSalary: string;
  newNetSalary: string;
}
