import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SYSTEM_AUDIT_EMAIL } from '@/types/audit';
import {
  SALARY_HISTORY_ACTIONS,
  type SalaryHistoryAction,
  type SalaryHistoryRecord,
} from '@/types/salary-history';
import type { SalaryDbRow } from '@/lib/db/salaries';

export type SalaryHistoryDbRow = {
  historyid: number;
  employeeid: string;
  salaryid: number | null;
  changedat: string;
  changedby: string;
  action: string;
  oldbasesalary: number | null;
  newbasesalary: number | null;
  oldallowance: number | null;
  newallowance: number | null;
  oldtax: number | null;
  newtax: number | null;
  oldnetsalary: number | null;
  newnetsalary: number | null;
};

const TABLE = 'salaryhistory';

const COMP_FIELDS = [
  'basesalary',
  'allowance',
  'tax',
  'netsalary',
] as const satisfies ReadonlyArray<keyof SalaryDbRow>;

function moneyToString(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return '';
  return String(value);
}

function moneyEqual(
  left: number | null | undefined,
  right: number | null | undefined
): boolean {
  return Number(left ?? 0) === Number(right ?? 0);
}

export function compensationChanged(
  previous: SalaryDbRow | null,
  next: SalaryDbRow
): boolean {
  if (!previous) return true;
  return COMP_FIELDS.some((field) => !moneyEqual(previous[field], next[field]));
}

export function dbRowToSalaryHistoryRecord(row: SalaryHistoryDbRow): SalaryHistoryRecord {
  return {
    historyId: String(row.historyid),
    employeeId: row.employeeid,
    salaryId: row.salaryid == null ? '' : String(row.salaryid),
    changedAt: row.changedat,
    changedBy: row.changedby,
    action: row.action,
    oldBaseSalary: moneyToString(row.oldbasesalary),
    newBaseSalary: moneyToString(row.newbasesalary),
    oldAllowance: moneyToString(row.oldallowance),
    newAllowance: moneyToString(row.newallowance),
    oldTax: moneyToString(row.oldtax),
    newTax: moneyToString(row.newtax),
    oldNetSalary: moneyToString(row.oldnetsalary),
    newNetSalary: moneyToString(row.newnetsalary),
  };
}

export async function insertSalaryHistoryFromSnapshot(options: {
  previous: SalaryDbRow | null;
  next: SalaryDbRow;
  changedBy?: string;
}): Promise<SalaryHistoryDbRow | null> {
  const { previous, next } = options;
  if (!compensationChanged(previous, next)) return null;

  const action: SalaryHistoryAction = previous
    ? SALARY_HISTORY_ACTIONS.UPDATE
    : SALARY_HISTORY_ACTIONS.CREATE;
  const changedby = String(options.changedBy || '').trim().toLowerCase() || SYSTEM_AUDIT_EMAIL;

  const row = {
    employeeid: next.employeeid,
    salaryid: next.salaryid,
    changedat: new Date().toISOString(),
    changedby,
    action,
    oldbasesalary: previous?.basesalary ?? null,
    newbasesalary: next.basesalary,
    oldallowance: previous?.allowance ?? null,
    newallowance: next.allowance,
    oldtax: previous?.tax ?? null,
    newtax: next.tax,
    oldnetsalary: previous?.netsalary ?? null,
    newnetsalary: next.netsalary,
  };

  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select('*').single();
  if (error) {
    throw new Error(`Supabase salaryhistory insert failed: ${error.message}`);
  }
  return data as SalaryHistoryDbRow;
}

/** Compensating delete after a failed n8n/sheet dual-write. Not a public mutation. */
export async function deleteSalaryHistoryDbRow(historyId: number | string): Promise<void> {
  const id = typeof historyId === 'number' ? historyId : Number(historyId);
  if (!Number.isFinite(id)) return;

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('historyid', id);
  if (error) {
    throw new Error(`Supabase salaryhistory rollback failed: ${error.message}`);
  }
}

export async function listSalaryHistoryDbRows(options?: {
  employeeId?: string;
}): Promise<SalaryHistoryDbRow[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');
  const employeeId = options?.employeeId?.trim();
  if (employeeId) {
    query = query.eq('employeeid', employeeId);
  }

  const { data, error } = await query.order('changedat', { ascending: false });
  if (error) {
    throw new Error(`Supabase salaryhistory list failed: ${error.message}`);
  }
  return (data as SalaryHistoryDbRow[]) || [];
}
