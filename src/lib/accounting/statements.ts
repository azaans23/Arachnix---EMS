import { listAccountingRecords } from '@/lib/db/accounting';
import {
  listAccountingBalances,
  listOpeningBalances,
  sumBalanceLines,
} from '@/lib/db/accounting-balances';
import {
  getBalanceSheet,
  upsertBalanceSheet,
  upsertCashFlowStatement,
  upsertIncomeStatement,
} from '@/lib/db/financial-statements';
import { parsePeriodMonth } from '@/types/accounting';
import {
  STATEMENT_PKR_TOLERANCE,
  type BalanceSheetRow,
  type CashFlowStatementRow,
  type IncomeStatementRow,
  type MonthlyStatements,
} from '@/types/financial-statements';
import { dispatchFinancialStatementsWebhook } from '@/lib/accounting/statements-webhook';

function roundPkr(value: number) {
  return Math.round(Number(value) || 0);
}

export function previousPeriodMonth(month: string): string | null {
  const parsed = parsePeriodMonth(month);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 2, 1));
  return date.toISOString().slice(0, 7);
}

export async function generateMonthlyStatements(month: string): Promise<MonthlyStatements> {
  if (!parsePeriodMonth(month)) throw new Error('Month must be YYYY-MM.');

  const [records, balances] = await Promise.all([
    listAccountingRecords({ month }),
    listAccountingBalances(month),
  ]);

  const totals: Record<string, number> = {};
  const warnings: string[] = [];

  for (const row of records) {
    const category = String(row.statementCategory || '').trim();
    if (category === 'Excluded' || row.category === 'Statements') {
      continue;
    }
    if (!category) {
      warnings.push(row.recordId);
      continue;
    }
    totals[category] = (totals[category] || 0) + row.amount;
  }

  const revenue = roundPkr(totals.Revenue || 0);
  const costOfServices = roundPkr(totals.CostOfServices || 0);
  const operatingExpense = roundPkr(totals.OperatingExpense || 0);
  const assetPurchase = roundPkr(totals.AssetPurchase || 0);
  const liabilityPayment = roundPkr(totals.LiabilityPayment || 0);
  const financing = roundPkr(totals.Financing || 0);
  const investing = roundPkr(totals.Investing || 0);

  if (financing !== 0) {
    warnings.push(
      'Financing cash is non-zero. Record matching liability or equity contribution lines on Monthly Balances — cash will not auto-adjust equity or liabilities.'
    );
  }

  const grossProfit = revenue - costOfServices;
  const netIncome = grossProfit - operatingExpense;

  const cashFromOperations = revenue - costOfServices - operatingExpense - liabilityPayment;
  const cashFromInvesting = -assetPurchase + investing;
  const cashFromFinancing = financing;
  const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;

  const priorMonth = previousPeriodMonth(month);
  const priorSheet = priorMonth ? await getBalanceSheet(priorMonth) : null;
  const openings = priorSheet ? [] : await listOpeningBalances();
  const hasOpeningCash = openings.some((row) => row.lineType === 'OpeningCash');
  const hasOpeningEquity = openings.some((row) => row.lineType === 'OpeningEquity');

  if (!priorSheet && (!hasOpeningCash || !hasOpeningEquity)) {
    throw new Error(
      'Set opening cash and opening equity on Monthly Balances before generating the first statement.'
    );
  }

  const priorCash = priorSheet ? priorSheet.cash : sumBalanceLines(openings, 'OpeningCash');
  const priorEquity = priorSheet ? priorSheet.equity : sumBalanceLines(openings, 'OpeningEquity');

  const otherAssets = roundPkr(sumBalanceLines(balances, 'OtherAsset', month));
  const liabilities = roundPkr(sumBalanceLines(balances, 'Liability', month));
  const cash = priorCash + netChangeInCash;
  const equity = priorEquity + netIncome;
  const totalAssets = cash + otherAssets;
  const totalLiabilitiesAndEquity = liabilities + equity;
  const discrepancy = totalAssets - totalLiabilitiesAndEquity;
  const balanced = Math.abs(discrepancy) <= STATEMENT_PKR_TOLERANCE;

  const generatedAt = new Date().toISOString();

  const income: IncomeStatementRow = {
    month,
    revenue,
    costOfServices,
    grossProfit,
    operatingExpense,
    netIncome,
    warnings,
    generatedAt,
  };
  const balanceSheet: BalanceSheetRow = {
    month,
    cash,
    otherAssets,
    totalAssets,
    liabilities,
    equity,
    totalLiabilitiesAndEquity,
    balanced,
    discrepancy,
    generatedAt,
  };
  const cashFlow: CashFlowStatementRow = {
    month,
    cashFromOperations,
    cashFromInvesting,
    cashFromFinancing,
    netChangeInCash,
    generatedAt,
  };

  const saved = {
    month,
    income: await upsertIncomeStatement(income),
    balanceSheet: await upsertBalanceSheet(balanceSheet),
    cashFlow: await upsertCashFlowStatement(cashFlow),
  };

  await dispatchFinancialStatementsWebhook(saved).catch((error) => {
    console.error('Financial statements sheet dual-write failed:', error);
  });

  return saved;
}
