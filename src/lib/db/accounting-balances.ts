import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AccountingBalanceRow, BalanceLineType } from '@/types/financial-statements';

type BalanceDbRow = {
  balanceid: number;
  month: string | null;
  linetype: string;
  label: string;
  amount: number | string | null;
  enteredby: string | null;
  enteredat: string | null;
};

const TABLE = 'accountingbalances';
const MONTHLY_TYPES = new Set<BalanceLineType>(['Liability', 'OtherAsset']);
const OPENING_TYPES = new Set<BalanceLineType>(['OpeningEquity', 'OpeningCash']);

function mapRow(row: BalanceDbRow): AccountingBalanceRow {
  return {
    balanceId: String(row.balanceid),
    month: row.month || '',
    lineType: row.linetype as BalanceLineType,
    label: row.label || '',
    amount: Number(row.amount ?? 0),
    enteredBy: row.enteredby || '',
    enteredAt: row.enteredat || '',
  };
}

export async function listAccountingBalances(month?: string): Promise<AccountingBalanceRow[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*').order('balanceid', { ascending: true });
  if (month) {
    query = query.in('month', [month.trim(), '']);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list balances: ${error.message}`);
  return ((data as BalanceDbRow[]) || []).map(mapRow);
}

export async function listOpeningBalances(): Promise<AccountingBalanceRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .in('linetype', ['OpeningEquity', 'OpeningCash']);
  if (error) throw new Error(`Failed to load opening balances: ${error.message}`);
  return ((data as BalanceDbRow[]) || []).map(mapRow);
}

export async function replaceMonthBalanceLines(input: {
  month: string;
  lines: Array<{ lineType: 'Liability' | 'OtherAsset'; label: string; amount: number }>;
  enteredBy: string;
}): Promise<AccountingBalanceRow[]> {
  const month = input.month.trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM.');

  for (const line of input.lines) {
    if (!MONTHLY_TYPES.has(line.lineType)) {
      throw new Error('Only liability and other-asset lines can be saved for a month.');
    }
    if (!line.label.trim()) throw new Error('Each balance line needs a label.');
    if (!Number.isFinite(line.amount) || line.amount < 0) {
      throw new Error('Amounts must be zero or greater.');
    }
  }

  const admin = getSupabaseAdmin();
  const { error: deleteError } = await admin
    .from(TABLE)
    .delete()
    .eq('month', month)
    .in('linetype', ['Liability', 'OtherAsset']);
  if (deleteError) throw new Error(`Failed to replace month balances: ${deleteError.message}`);

  if (input.lines.length === 0) return listAccountingBalances(month);

  const payload = input.lines.map((line) => ({
    month,
    linetype: line.lineType,
    label: line.label.trim().slice(0, 255),
    amount: line.amount,
    enteredby: input.enteredBy.slice(0, 255),
    enteredat: new Date().toISOString(),
  }));

  const { data, error } = await admin.from(TABLE).insert(payload).select('*');
  if (error) throw new Error(`Failed to save month balances: ${error.message}`);
  return ((data as BalanceDbRow[]) || []).map(mapRow);
}

export async function upsertOpeningBalance(input: {
  lineType: 'OpeningEquity' | 'OpeningCash';
  amount: number;
  enteredBy: string;
}): Promise<AccountingBalanceRow> {
  if (!OPENING_TYPES.has(input.lineType)) {
    throw new Error('Invalid opening balance type.');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('Amount must be zero or greater.');
  }

  const admin = getSupabaseAdmin();
  const { data: existing, error: readError } = await admin
    .from(TABLE)
    .select('*')
    .eq('linetype', input.lineType)
    .maybeSingle();
  if (readError) throw new Error(`Failed to load opening balance: ${readError.message}`);

  const payload = {
    month: '',
    linetype: input.lineType,
    label: input.lineType === 'OpeningCash' ? 'Opening cash' : 'Opening equity',
    amount: input.amount,
    enteredby: input.enteredBy.slice(0, 255),
    enteredat: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await admin
      .from(TABLE)
      .update(payload)
      .eq('balanceid', (existing as BalanceDbRow).balanceid)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to update opening balance: ${error.message}`);
    return mapRow(data as BalanceDbRow);
  }

  const { data, error } = await admin.from(TABLE).insert(payload).select('*').single();
  if (error) throw new Error(`Failed to create opening balance: ${error.message}`);
  return mapRow(data as BalanceDbRow);
}

export function sumBalanceLines(
  rows: AccountingBalanceRow[],
  lineType: BalanceLineType,
  month?: string
): number {
  return rows
    .filter((row) => row.lineType === lineType && (month === undefined || row.month === month))
    .reduce((sum, row) => sum + row.amount, 0);
}
