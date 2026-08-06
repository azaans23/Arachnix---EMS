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
  { key: 'annualQuota', label: 'Annual Quota', sheetKey: 'AnnualQuota' },
  { key: 'annualUsed', label: 'Annual Used', sheetKey: 'AnnualUsed' },
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
