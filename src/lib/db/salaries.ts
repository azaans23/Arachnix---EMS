import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSalaryUniqueKey,
  computeSalaryTotals,
  computeStoredSalaryTotals,
  currentSalaryPeriod,
  formatSalaryPeriod,
  monthInputToPeriod,
  parseSalaryPeriod,
  periodToMonthInput,
} from '@/lib/payroll/period';
import type { SalaryDetailInput, SalaryDetailRecord } from '@/types/salary-slip';

export {
  buildSalaryUniqueKey,
  computeSalaryTotals,
  computeStoredSalaryTotals,
  currentSalaryPeriod,
  formatSalaryPeriod,
  monthInputToPeriod,
  parseSalaryPeriod,
  periodToMonthInput,
};

/**
 * Matches public.salaries columns after the one-row-per-employee model.
 * OT / bonus / contributions / others no longer exist in the table. Period and
 * status may still exist in older DBs but are never written or read.
 */
export type SalaryDbRow = {
  salaryid: number;
  employeeid: string;
  basesalary: number;
  netsalary: number;
  allowance: number | null;
  tax: number | null;
  accountnumber: string;
  accountname: string;
  bankname: string;
  totaldeduction: number;
  totalearning: number;
  uniquekey?: string | null;
  createdat?: string;
  updatedat?: string;
};

export type SalaryDbWriteRow = Omit<SalaryDbRow, 'salaryid' | 'createdat' | 'uniquekey'>;

/** Columns the app is allowed to write. Anything else is dropped. */
const WRITE_COLUMNS = [
  'employeeid',
  'basesalary',
  'netsalary',
  'allowance',
  'tax',
  'accountnumber',
  'accountname',
  'bankname',
  'totaldeduction',
  'totalearning',
  'updatedat',
] as const;

function pickWritableColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of WRITE_COLUMNS) {
    if (row[column] !== undefined) out[column] = row[column];
  }
  return out;
}

export type SalaryDbWriteInput = SalaryDetailInput & {
  totalEarning?: string;
  totalDeduction?: string;
  netSalary?: string;
};

const TABLE = 'salaries';

function toMoney(value: string | number | null | undefined, field: string): number {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 0;
  }
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return n;
}

function moneyToString(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return '';
  return String(value);
}

export function toSalaryDbRow(input: SalaryDbWriteInput): SalaryDbWriteRow {
  const employeeid = input.employeeId.trim();
  if (!employeeid) throw new Error('EmployeeID is required for salaries write.');

  const accountnumber = String(input.accountNumber ?? '').trim();
  const accountname = String(input.accountName ?? '').trim();
  const bankname = String(input.bankName ?? '').trim();

  if (!accountnumber) throw new Error(`Account Number is required for ${employeeid}.`);
  if (!accountname) throw new Error(`Account Name is required for ${employeeid}.`);
  if (!bankname) throw new Error(`Bank Name is required for ${employeeid}.`);

  const computed = computeStoredSalaryTotals(input);
  const basesalary = computed.basesalary;
  if (basesalary <= 0 && String(input.salary ?? '').trim() === '') {
    throw new Error(`Base Salary is required for ${employeeid}.`);
  }

  const totalearning =
    input.totalEarning !== undefined && String(input.totalEarning).trim() !== ''
      ? toMoney(input.totalEarning, 'TotalEarning')
      : computed.totalearning;
  const totaldeduction =
    input.totalDeduction !== undefined && String(input.totalDeduction).trim() !== ''
      ? toMoney(input.totalDeduction, 'TotalDeduction')
      : computed.totaldeduction;
  const netsalary =
    input.netSalary !== undefined && String(input.netSalary).trim() !== ''
      ? toMoney(input.netSalary, 'NetSalary')
      : computed.netsalary;

  return {
    employeeid,
    basesalary,
    netsalary,
    allowance: computed.allowance,
    tax: computed.tax,
    accountnumber,
    accountname,
    bankname,
    totaldeduction,
    totalearning,
    updatedat: new Date().toISOString(),
  };
}

export function salaryDbRowToDetail(
  row: SalaryDbRow,
  employee?: {
    fullName?: string;
    email?: string;
    phone?: string;
    department?: string;
    designation?: string;
    employeeType?: string;
    role?: string;
    emsStatus?: string;
  } | null
): SalaryDetailRecord {
  const uniqueKey = row.uniquekey || row.employeeid;
  const bankAccountDetails = [row.bankname, row.accountname, row.accountnumber]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ');
  return {
    employeeId: row.employeeid,
    fullName: employee?.fullName || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    department: employee?.department || '',
    designation: employee?.designation || '',
    employeeType: employee?.employeeType || '',
    role: employee?.role || '',
    emsStatus: employee?.emsStatus || '',
    baseSalary: moneyToString(row.basesalary),
    salary: moneyToString(row.basesalary),
    netSalary: moneyToString(row.netsalary),
    allowance: moneyToString(row.allowance),
    tax: moneyToString(row.tax),
    totalEarning: moneyToString(row.totalearning),
    totalDeduction: moneyToString(row.totaldeduction),
    accountNumber: row.accountnumber,
    accountName: row.accountname,
    bankName: row.bankname,
    bankAccountDetails,
    uniqueKey,
    salaryId: String(row.salaryid),
    raw: {
      SalaryID: row.salaryid,
      EmployeeID: row.employeeid,
      BaseSalary: row.basesalary,
      NetSalary: row.netsalary,
      Allowance: row.allowance,
      Tax: row.tax,
      AccountNumber: row.accountnumber,
      AccountName: row.accountname,
      BankName: row.bankname,
      TotalDeduction: row.totaldeduction,
      TotalEarning: row.totalearning,
      UniqueKey: uniqueKey,
    },
  };
}

export async function listSalaryDbRows(options?: {
  employeeIds?: string[];
}): Promise<SalaryDbRow[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');

  if (options?.employeeIds && options.employeeIds.length > 0) {
    query = query.in(
      'employeeid',
      options.employeeIds.map((id) => id.trim()).filter(Boolean)
    );
  }

  const { data, error } = await query.order('employeeid', { ascending: true });

  if (error) {
    throw new Error(`Supabase salaries list failed: ${error.message}`);
  }

  // Deduplicate legacy multi-period rows — keep the newest salaryid per employee.
  const rows = (data as SalaryDbRow[]) || [];
  const byEmployee = new Map<string, SalaryDbRow>();
  for (const row of rows) {
    const key = row.employeeid.trim().toLowerCase();
    const existing = byEmployee.get(key);
    if (!existing || Number(row.salaryid) > Number(existing.salaryid)) {
      byEmployee.set(key, row);
    }
  }
  return Array.from(byEmployee.values()).sort((a, b) =>
    a.employeeid.localeCompare(b.employeeid)
  );
}

export async function getSalaryDbRow(employeeId: string): Promise<SalaryDbRow | null> {
  const id = employeeId.trim();
  if (!id) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('employeeid', id)
    .order('salaryid', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase salaries read failed: ${error.message}`);
  }

  return (data as SalaryDbRow | null) ?? null;
}

export async function upsertSalaryDbRow(input: SalaryDbWriteInput): Promise<SalaryDbRow> {
  const row = pickWritableColumns(toSalaryDbRow(input));
  const existing = await getSalaryDbRow(String(row.employeeid));

  if (existing) {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .update(row)
      .eq('salaryid', existing.salaryid)
      .select('*')
      .single();
    if (error) throw new Error(`Supabase salaries update failed: ${error.message}`);
    return data as SalaryDbRow;
  }

  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select('*').single();
  if (error) throw new Error(`Supabase salaries insert failed: ${error.message}`);
  return data as SalaryDbRow;
}

export async function deleteSalaryDbRow(employeeId: string): Promise<void> {
  const id = employeeId.trim();
  if (!id) return;

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('employeeid', id);

  if (error) {
    throw new Error(`Supabase salaries delete failed: ${error.message}`);
  }
}

export async function restoreSalaryDbRow(row: SalaryDbRow): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        salaryid: row.salaryid,
        ...pickWritableColumns({ ...row, updatedat: new Date().toISOString() }),
      },
      { onConflict: 'salaryid' }
    );

  if (error) {
    throw new Error(`Supabase salaries restore failed: ${error.message}`);
  }
}

/**
 * Compensating rollback for a failed dual-write:
 * - If the row did not exist before → delete the new row
 * - If it did → restore the previous snapshot
 */
export async function rollbackSalaryDbWrite(options: {
  previous: SalaryDbRow | null;
  employeeId: string;
}): Promise<void> {
  const { previous, employeeId } = options;
  if (!previous) {
    await deleteSalaryDbRow(employeeId);
    return;
  }
  await restoreSalaryDbRow(previous);
}

export async function rollbackSalaryDbWrites(
  snapshots: Array<{ previous: SalaryDbRow | null; employeeId: string }>
): Promise<void> {
  const errors: string[] = [];
  for (const snapshot of snapshots) {
    try {
      await rollbackSalaryDbWrite(snapshot);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) {
    throw new Error(`Salary DB rollback partially failed: ${errors.join('; ')}`);
  }
}
