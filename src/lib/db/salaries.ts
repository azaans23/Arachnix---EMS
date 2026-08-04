import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSalaryUniqueKey,
  computeSalaryTotals,
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
  currentSalaryPeriod,
  formatSalaryPeriod,
  monthInputToPeriod,
  parseSalaryPeriod,
  periodToMonthInput,
};

/** Matches public.salaries columns (Postgres lowercases unquoted identifiers). */
export type SalaryDbRow = {
  salaryid: number;
  employeeid: string;
  basesalary: number;
  netsalary: number;
  overtimepay: number | null;
  performancebonus: number | null;
  contributions: number | null;
  allowance: number | null;
  tax: number | null;
  others: number | null;
  accountnumber: string;
  accountname: string;
  bankname: string;
  totaldeduction: number;
  totalearning: number;
  period: string;
  status: string;
  /** Generated: EmployeeID || '-' || Period */
  uniquekey?: string;
  createdat?: string;
  updatedat?: string;
};

export type SalaryDbWriteInput = SalaryDetailInput & {
  period: string;
  status?: string;
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

export function toSalaryDbRow(
  input: SalaryDbWriteInput
): Omit<SalaryDbRow, 'salaryid' | 'createdat' | 'uniquekey'> {
  const employeeid = input.employeeId.trim();
  const period = monthInputToPeriod(input.period.trim());
  if (!employeeid) throw new Error('EmployeeID is required for salaries write.');
  if (!period) throw new Error('Period is required for salaries write.');

  const accountnumber = String(input.accountNumber ?? '').trim();
  const accountname = String(input.accountName ?? '').trim();
  const bankname = String(input.bankName ?? '').trim();

  if (!accountnumber) throw new Error(`Account Number is required for ${employeeid}.`);
  if (!accountname) throw new Error(`Account Name is required for ${employeeid}.`);
  if (!bankname) throw new Error(`Bank Name is required for ${employeeid}.`);

  const computed = computeSalaryTotals(input);
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

  const status = (input.status || 'Pending').trim() || 'Pending';
  if (!['Pending', 'Processed', 'Paid'].includes(status)) {
    throw new Error(`Invalid salary status: ${status}`);
  }

  return {
    employeeid,
    basesalary,
    netsalary,
    overtimepay: computed.overtimepay,
    performancebonus: computed.performancebonus,
    contributions: computed.contributions,
    allowance: computed.allowance,
    tax: computed.tax,
    others: computed.others,
    accountnumber,
    accountname,
    bankname,
    totaldeduction,
    totalearning,
    period,
    status,
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
    baseSalary?: string;
    bankAccountDetails?: string;
  } | null
): SalaryDetailRecord {
  const uniqueKey =
    row.uniquekey || buildSalaryUniqueKey(row.employeeid, row.period);
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
    baseSalary: employee?.baseSalary || moneyToString(row.basesalary),
    salary: moneyToString(row.basesalary),
    netSalary: moneyToString(row.netsalary),
    overtimePay: moneyToString(row.overtimepay),
    performanceBonus: moneyToString(row.performancebonus),
    contributions: moneyToString(row.contributions),
    allowance: moneyToString(row.allowance),
    tax: moneyToString(row.tax),
    others: moneyToString(row.others),
    totalEarning: moneyToString(row.totalearning),
    totalDeduction: moneyToString(row.totaldeduction),
    accountNumber: row.accountnumber,
    accountName: row.accountname,
    bankName: row.bankname,
    bankAccountDetails: employee?.bankAccountDetails || '',
    period: row.period,
    uniqueKey,
    status: row.status,
    salaryId: String(row.salaryid),
    raw: {
      SalaryID: row.salaryid,
      EmployeeID: row.employeeid,
      BaseSalary: row.basesalary,
      NetSalary: row.netsalary,
      OvertimePay: row.overtimepay,
      PerformanceBonus: row.performancebonus,
      Contributions: row.contributions,
      Allowance: row.allowance,
      Tax: row.tax,
      Others: row.others,
      AccountNumber: row.accountnumber,
      AccountName: row.accountname,
      BankName: row.bankname,
      TotalDeduction: row.totaldeduction,
      TotalEarning: row.totalearning,
      Period: row.period,
      UniqueKey: uniqueKey,
      Status: row.status,
    },
  };
}

export async function listSalaryDbRows(options?: {
  employeeIds?: string[];
  period?: string;
  uniqueKeys?: string[];
}): Promise<SalaryDbRow[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');

  const uniqueKeys = (options?.uniqueKeys || [])
    .map((key) => key.trim())
    .filter(Boolean);

  const derivedKeys =
    uniqueKeys.length === 0 &&
    options?.period?.trim() &&
    options?.employeeIds &&
    options.employeeIds.length > 0
      ? options.employeeIds
          .map((id) => buildSalaryUniqueKey(id, options.period!))
          .filter(Boolean)
      : [];

  const keys = uniqueKeys.length > 0 ? uniqueKeys : derivedKeys;

  if (keys.length > 0) {
    // Prefer UniqueKey lookup (EmployeeID-Period) when available.
    query = query.in('uniquekey', keys);
  } else {
    if (options?.period?.trim()) {
      query = query.eq('period', monthInputToPeriod(options.period.trim()));
    }
    if (options?.employeeIds && options.employeeIds.length > 0) {
      query = query.in(
        'employeeid',
        options.employeeIds.map((id) => id.trim()).filter(Boolean)
      );
    }
  }

  const { data, error } = await query
    .order('period', { ascending: false })
    .order('employeeid', { ascending: true });

  if (error) {
    throw new Error(`Supabase salaries list failed: ${error.message}`);
  }

  return (data as SalaryDbRow[]) || [];
}

export async function getSalaryDbRowByUniqueKey(
  uniqueKey: string
): Promise<SalaryDbRow | null> {
  const key = uniqueKey.trim();
  if (!key) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('uniquekey', key)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase salaries read by UniqueKey failed: ${error.message}`);
  }

  return (data as SalaryDbRow | null) ?? null;
}

export async function getSalaryDbRow(
  employeeId: string,
  period: string
): Promise<SalaryDbRow | null> {
  const id = employeeId.trim();
  const periodKey = monthInputToPeriod(period.trim());
  if (!id || !periodKey) return null;

  const byKey = await getSalaryDbRowByUniqueKey(buildSalaryUniqueKey(id, periodKey));
  if (byKey) return byKey;

  // Fallback if UniqueKey column is missing/unavailable.
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('employeeid', id)
    .eq('period', periodKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase salaries read failed: ${error.message}`);
  }

  return (data as SalaryDbRow | null) ?? null;
}

export async function upsertSalaryDbRow(input: SalaryDbWriteInput): Promise<SalaryDbRow> {
  const row = toSalaryDbRow(input);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(row, { onConflict: 'employeeid,period' })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Supabase salaries upsert failed: ${error.message}`);
  }

  return data as SalaryDbRow;
}

export async function deleteSalaryDbRow(employeeId: string, period: string): Promise<void> {
  const id = employeeId.trim();
  const periodKey = monthInputToPeriod(period.trim());
  if (!id || !periodKey) return;

  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq('employeeid', id)
    .eq('period', periodKey);

  if (error) {
    throw new Error(`Supabase salaries delete failed: ${error.message}`);
  }
}

export async function restoreSalaryDbRow(row: SalaryDbRow): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        ...row,
        updatedat: new Date().toISOString(),
      },
      { onConflict: 'employeeid,period' }
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
  period: string;
}): Promise<void> {
  const { previous, employeeId, period } = options;
  if (!previous) {
    await deleteSalaryDbRow(employeeId, period);
    return;
  }
  await restoreSalaryDbRow(previous);
}

export async function rollbackSalaryDbWrites(
  snapshots: Array<{ previous: SalaryDbRow | null; employeeId: string; period: string }>
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
