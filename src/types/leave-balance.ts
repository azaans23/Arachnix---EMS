export interface LeaveBalanceInput {
  leaveId?: string;
  employeeId: string;
  year: number;
  annualQuota: number;
  annualUsed: number;
  sickQuota: number;
  sickUsed: number;
  casualQuota: number;
  casualUsed: number;
  carryForwardDays: number;
}

export interface LeaveBalanceRecord extends LeaveBalanceInput {
  leaveId: string;
  fullName: string;
  email: string;
  department: string;
  designation: string;
  emsStatus: string;
}

export type LeaveBalanceFieldKey = keyof Omit<
  LeaveBalanceInput,
  'leaveId' | 'employeeId' | 'year'
>;

export const LEAVE_BALANCE_FIELDS: Array<{
  key: LeaveBalanceFieldKey;
  label: string;
  sheetKey: string;
}> = [
  { key: 'annualQuota', label: 'Total Leaves', sheetKey: 'AnnualQuota' },
  { key: 'annualUsed', label: 'Total Used', sheetKey: 'AnnualUsed' },
  { key: 'sickQuota', label: 'Sick Quota', sheetKey: 'SickQuota' },
  { key: 'sickUsed', label: 'Sick Used', sheetKey: 'SickUsed' },
  { key: 'casualQuota', label: 'Casual Quota', sheetKey: 'CasualQuota' },
  { key: 'casualUsed', label: 'Casual Used', sheetKey: 'CasualUsed' },
  { key: 'carryForwardDays', label: 'Carry Forward Days', sheetKey: 'CarryForwardDays' },
];

/** Matches LeaveBalances.LeaveID: `EmployeeID-Year` (e.g. `EMP-001-2026`). */
export function buildLeaveId(employeeId: string, year: number | string): string {
  const id = employeeId.trim();
  const yearValue = String(year).trim();
  if (!id || !yearValue) return '';
  return `${id}-${yearValue}`.slice(0, 100);
}

/**
 * Annual = total leave pool. Sick + Casual quotas sit inside that total.
 * Approving sick/casual also increments AnnualUsed.
 */
export function validateLeaveBalanceRules(input: LeaveBalanceInput): string | null {
  if (input.sickQuota + input.casualQuota > input.annualQuota) {
    return 'Sick Quota + Casual Quota cannot exceed Total Leaves (Annual Quota).';
  }
  if (input.annualUsed > input.annualQuota) {
    return 'Total Used cannot exceed Total Leaves (Annual Quota).';
  }
  if (input.sickUsed > input.sickQuota) {
    return 'Sick Used cannot exceed Sick Quota.';
  }
  if (input.casualUsed > input.casualQuota) {
    return 'Casual Used cannot exceed Casual Quota.';
  }
  if (input.sickUsed + input.casualUsed > input.annualUsed) {
    return 'Sick Used + Casual Used cannot exceed Total Used (Annual Used).';
  }
  return null;
}

/** Remaining days for a leave type, capped by both its own quota and the annual total. */
export function remainingLeaveDays(
  leaveType: string,
  balance: LeaveBalanceInput
): { quota: number; used: number; remaining: number } | null {
  const totalRemaining = Math.max(0, balance.annualQuota - balance.annualUsed);
  switch (leaveType.trim().toLowerCase()) {
    case 'annual':
      return {
        quota: balance.annualQuota,
        used: balance.annualUsed,
        remaining: totalRemaining,
      };
    case 'sick':
      return {
        quota: balance.sickQuota,
        used: balance.sickUsed,
        remaining: Math.min(
          Math.max(0, balance.sickQuota - balance.sickUsed),
          totalRemaining
        ),
      };
    case 'casual':
      return {
        quota: balance.casualQuota,
        used: balance.casualUsed,
        remaining: Math.min(
          Math.max(0, balance.casualQuota - balance.casualUsed),
          totalRemaining
        ),
      };
    default:
      return null;
  }
}
