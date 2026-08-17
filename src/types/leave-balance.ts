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

export type LeaveBalanceFieldKey = keyof Omit<LeaveBalanceInput, 'leaveId' | 'employeeId' | 'year'>;

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

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Fit `a + b` into `budget` by shrinking `b` first, then `a`. */
function fitPair(a: number, b: number, budget: number): { a: number; b: number } {
  const room = Math.max(0, budget);
  if (a + b <= room) return { a, b };
  if (a > room) return { a: room, b: 0 };
  return { a, b: room - a };
}

/**
 * After one field changes, adjust the rest so leave-balance rules stay valid.
 * The changed field is treated as the source of truth where possible.
 */
export function reconcileLeaveBalance(
  input: LeaveBalanceInput,
  changed?: LeaveBalanceFieldKey
): LeaveBalanceInput {
  const next: LeaveBalanceInput = {
    ...input,
    annualQuota: nonNegative(input.annualQuota),
    annualUsed: nonNegative(input.annualUsed),
    sickQuota: nonNegative(input.sickQuota),
    sickUsed: nonNegative(input.sickUsed),
    casualQuota: nonNegative(input.casualQuota),
    casualUsed: nonNegative(input.casualUsed),
    carryForwardDays: nonNegative(input.carryForwardDays),
  };

  switch (changed) {
    case 'annualQuota': {
      const quotas = fitPair(next.sickQuota, next.casualQuota, next.annualQuota);
      next.sickQuota = quotas.a;
      next.casualQuota = quotas.b;
      next.annualUsed = Math.min(next.annualUsed, next.annualQuota);
      next.sickUsed = Math.min(next.sickUsed, next.sickQuota);
      next.casualUsed = Math.min(next.casualUsed, next.casualQuota);
      const used = fitPair(next.sickUsed, next.casualUsed, next.annualUsed);
      next.sickUsed = used.a;
      next.casualUsed = used.b;
      break;
    }
    case 'sickQuota':
    case 'casualQuota': {
      const quotaSum = next.sickQuota + next.casualQuota;
      if (quotaSum > next.annualQuota) next.annualQuota = quotaSum;
      next.sickUsed = Math.min(next.sickUsed, next.sickQuota);
      next.casualUsed = Math.min(next.casualUsed, next.casualQuota);
      const usedSum = next.sickUsed + next.casualUsed;
      if (usedSum > next.annualUsed) next.annualUsed = usedSum;
      if (next.annualUsed > next.annualQuota) next.annualQuota = next.annualUsed;
      break;
    }
    case 'annualUsed': {
      next.annualUsed = Math.min(next.annualUsed, next.annualQuota);
      const used = fitPair(next.sickUsed, next.casualUsed, next.annualUsed);
      next.sickUsed = used.a;
      next.casualUsed = used.b;
      break;
    }
    case 'sickUsed':
    case 'casualUsed': {
      next.sickUsed = Math.min(next.sickUsed, next.sickQuota);
      next.casualUsed = Math.min(next.casualUsed, next.casualQuota);
      const usedSum = next.sickUsed + next.casualUsed;
      if (usedSum > next.annualUsed) next.annualUsed = usedSum;
      if (next.annualUsed > next.annualQuota) next.annualQuota = next.annualUsed;
      if (next.sickQuota + next.casualQuota > next.annualQuota) {
        next.annualQuota = next.sickQuota + next.casualQuota;
      }
      break;
    }
    default:
      break;
  }

  // Final safety pass so the form never leaves an invalid combination.
  if (next.sickQuota + next.casualQuota > next.annualQuota) {
    next.annualQuota = next.sickQuota + next.casualQuota;
  }
  next.annualUsed = Math.min(next.annualUsed, next.annualQuota);
  next.sickUsed = Math.min(next.sickUsed, next.sickQuota);
  next.casualUsed = Math.min(next.casualUsed, next.casualQuota);
  if (next.sickUsed + next.casualUsed > next.annualUsed) {
    next.annualUsed = Math.min(next.sickUsed + next.casualUsed, next.annualQuota);
    const used = fitPair(next.sickUsed, next.casualUsed, next.annualUsed);
    next.sickUsed = used.a;
    next.casualUsed = used.b;
  }

  return next;
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
        remaining: Math.min(Math.max(0, balance.sickQuota - balance.sickUsed), totalRemaining),
      };
    case 'casual':
      return {
        quota: balance.casualQuota,
        used: balance.casualUsed,
        remaining: Math.min(Math.max(0, balance.casualQuota - balance.casualUsed), totalRemaining),
      };
    default:
      return null;
  }
}
