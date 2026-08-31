import { offboardingStateFor, type OffboardingSummary } from '@/lib/offboarding/status';
import type { EmployeeRecord } from '@/types/employee';

/** Parses salary strings like "99999", "99,999", "PKR 50000". */
export function parseBaseSalary(value: unknown): number {
  const cleaned = String(value ?? '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!cleaned) return NaN;
  const salary = Number(cleaned);
  return Number.isFinite(salary) ? salary : NaN;
}

export function hasPayrollSalary(employee: EmployeeRecord, salaryIds?: Set<string>): boolean {
  if (!salaryIds) return false;
  return salaryIds.has(employee.employeeId.trim().toLowerCase());
}

/**
 * Payroll only needs a salary row and an employee who has not exited.
 * EMS status is a portal-signup flag, not an employment flag, so it is
 * deliberately ignored here — unregistered staff still get paid.
 */
export function payrollEligibilityReason(
  employee: EmployeeRecord,
  salaryIds?: Set<string>,
  offboardings?: Map<string, OffboardingSummary>
): string | null {
  if (!hasPayrollSalary(employee, salaryIds)) {
    return 'No salary record — create one on the Salary page first';
  }
  if (offboardings && offboardingStateFor(offboardings, employee.employeeId).state === 'offboarded') {
    return 'Employee has been offboarded — the final settlement replaces the monthly slip';
  }
  return null;
}

export function isPayrollEligible(
  employee: EmployeeRecord,
  salaryIds?: Set<string>,
  offboardings?: Map<string, OffboardingSummary>
): boolean {
  return payrollEligibilityReason(employee, salaryIds, offboardings) === null;
}
