import type { OffboardingSettlement, OffboardingSettlementInput } from '@/types/offboarding';

function money(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

function daysInMonthUtc(isoDate: string): number {
  const [year, month] = isoDate.split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfMonth(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

/**
 * Pakistan-style exit settlement snapshot.
 * Daily rate = monthly salary / 30.
 * Unused annual leave is encashed at that daily rate.
 * Salary in the exit month is pro-rated by calendar days through last working date.
 */
export function calculateOffboardingSettlement(input: {
  monthlySalary: number;
  unusedLeaveDays: number;
  lastWorkingDate: string;
  unpaidDays?: number;
  otherAdditions?: number;
  otherDeductions?: number;
}): OffboardingSettlement {
  const lastWorkingDate = input.lastWorkingDate.trim().slice(0, 10);
  const monthlySalary = money(input.monthlySalary);
  const unusedLeaveDays = Math.max(0, Number(input.unusedLeaveDays) || 0);
  const unpaidDays = Math.max(0, Number(input.unpaidDays) || 0);
  const otherAdditions = money(input.otherAdditions || 0);
  const otherDeductions = money(input.otherDeductions || 0);
  const daysInMonth = lastWorkingDate ? daysInMonthUtc(lastWorkingDate) : 30;
  const daysWorked = lastWorkingDate ? Math.min(dayOfMonth(lastWorkingDate), daysInMonth) : 0;
  const dailyRate = money(monthlySalary / 30);
  const leaveEncashment = money(unusedLeaveDays * dailyRate);
  const proratedSalary = daysInMonth > 0 ? money((monthlySalary * daysWorked) / daysInMonth) : 0;
  const unpaidDeduction = money(unpaidDays * dailyRate);
  const netSettlement = Math.round(
    proratedSalary + leaveEncashment + otherAdditions - otherDeductions - unpaidDeduction
  );

  return {
    monthlySalary,
    unusedLeaveDays,
    dailyRate,
    leaveEncashment,
    daysInMonth,
    daysWorked,
    proratedSalary,
    unpaidDays,
    unpaidDeduction,
    otherAdditions,
    otherDeductions,
    netSettlement,
  };
}

export function parseSettlementPatch(raw: Record<string, unknown>): OffboardingSettlementInput {
  const lastWorkingDate = String(raw.lastWorkingDate || raw.LastWorkingDate || '')
    .trim()
    .slice(0, 10);
  return {
    lastWorkingDate,
    unpaidDays: Number(raw.unpaidDays ?? raw.UnpaidDays ?? 0) || 0,
    otherAdditions: Number(raw.otherAdditions ?? raw.OtherAdditions ?? 0) || 0,
    otherDeductions: Number(raw.otherDeductions ?? raw.OtherDeductions ?? 0) || 0,
  };
}
