import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  BalanceSheetRow,
  CashFlowStatementRow,
  IncomeStatementRow,
  MonthlyStatements,
} from '@/types/financial-statements';

type IncomeDbRow = {
  month: string;
  revenue: number | string | null;
  costofservices: number | string | null;
  grossprofit: number | string | null;
  operatingexpense: number | string | null;
  netincome: number | string | null;
  warnings: unknown;
  generatedat: string | null;
};

type BalanceSheetDbRow = {
  month: string;
  cash: number | string | null;
  otherassets: number | string | null;
  totalassets: number | string | null;
  liabilities: number | string | null;
  equity: number | string | null;
  totalliabilitiesandequity: number | string | null;
  balanced: boolean | null;
  discrepancy: number | string | null;
  generatedat: string | null;
};

type CashFlowDbRow = {
  month: string;
  cashfromoperations: number | string | null;
  cashfrominvesting: number | string | null;
  cashfromfinancing: number | string | null;
  netchangeincash: number | string | null;
  generatedat: string | null;
};

function money(value: number | string | null | undefined): number {
  return Math.round(Number(value ?? 0) || 0);
}

function warningsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function mapIncome(row: IncomeDbRow): IncomeStatementRow {
  return {
    month: row.month,
    revenue: money(row.revenue),
    costOfServices: money(row.costofservices),
    grossProfit: money(row.grossprofit),
    operatingExpense: money(row.operatingexpense),
    netIncome: money(row.netincome),
    warnings: warningsFromJson(row.warnings),
    generatedAt: row.generatedat || '',
  };
}

function mapBalanceSheet(row: BalanceSheetDbRow): BalanceSheetRow {
  return {
    month: row.month,
    cash: money(row.cash),
    otherAssets: money(row.otherassets),
    totalAssets: money(row.totalassets),
    liabilities: money(row.liabilities),
    equity: money(row.equity),
    totalLiabilitiesAndEquity: money(row.totalliabilitiesandequity),
    balanced: Boolean(row.balanced),
    discrepancy: money(row.discrepancy),
    generatedAt: row.generatedat || '',
  };
}

function mapCashFlow(row: CashFlowDbRow): CashFlowStatementRow {
  return {
    month: row.month,
    cashFromOperations: money(row.cashfromoperations),
    cashFromInvesting: money(row.cashfrominvesting),
    cashFromFinancing: money(row.cashfromfinancing),
    netChangeInCash: money(row.netchangeincash),
    generatedAt: row.generatedat || '',
  };
}

export async function getIncomeStatement(month: string): Promise<IncomeStatementRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('incomestatements')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(`Failed to load income statement: ${error.message}`);
  return data ? mapIncome(data as IncomeDbRow) : null;
}

export async function getBalanceSheet(month: string): Promise<BalanceSheetRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('balancesheets')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(`Failed to load balance sheet: ${error.message}`);
  return data ? mapBalanceSheet(data as BalanceSheetDbRow) : null;
}

export async function getCashFlowStatement(month: string): Promise<CashFlowStatementRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('cashflowstatements')
    .select('*')
    .eq('month', month)
    .maybeSingle();
  if (error) throw new Error(`Failed to load cash flow statement: ${error.message}`);
  return data ? mapCashFlow(data as CashFlowDbRow) : null;
}

export async function getMonthlyStatements(month: string): Promise<MonthlyStatements> {
  const [income, balanceSheet, cashFlow] = await Promise.all([
    getIncomeStatement(month),
    getBalanceSheet(month),
    getCashFlowStatement(month),
  ]);
  return { month, income, balanceSheet, cashFlow };
}

export async function upsertIncomeStatement(row: IncomeStatementRow): Promise<IncomeStatementRow> {
  const payload = {
    month: row.month,
    revenue: row.revenue,
    costofservices: row.costOfServices,
    grossprofit: row.grossProfit,
    operatingexpense: row.operatingExpense,
    netincome: row.netIncome,
    warnings: row.warnings,
    generatedat: row.generatedAt,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('incomestatements')
    .upsert(payload, { onConflict: 'month' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to save income statement: ${error.message}`);
  return mapIncome(data as IncomeDbRow);
}

export async function upsertBalanceSheet(row: BalanceSheetRow): Promise<BalanceSheetRow> {
  const payload = {
    month: row.month,
    cash: row.cash,
    otherassets: row.otherAssets,
    totalassets: row.totalAssets,
    liabilities: row.liabilities,
    equity: row.equity,
    totalliabilitiesandequity: row.totalLiabilitiesAndEquity,
    balanced: row.balanced,
    discrepancy: row.discrepancy,
    generatedat: row.generatedAt,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('balancesheets')
    .upsert(payload, { onConflict: 'month' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to save balance sheet: ${error.message}`);
  return mapBalanceSheet(data as BalanceSheetDbRow);
}

export async function upsertCashFlowStatement(
  row: CashFlowStatementRow
): Promise<CashFlowStatementRow> {
  const payload = {
    month: row.month,
    cashfromoperations: row.cashFromOperations,
    cashfrominvesting: row.cashFromInvesting,
    cashfromfinancing: row.cashFromFinancing,
    netchangeincash: row.netChangeInCash,
    generatedat: row.generatedAt,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('cashflowstatements')
    .upsert(payload, { onConflict: 'month' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to save cash flow statement: ${error.message}`);
  return mapCashFlow(data as CashFlowDbRow);
}
