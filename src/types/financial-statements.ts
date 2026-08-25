export const BALANCE_LINE_TYPES = [
  'Liability',
  'OtherAsset',
  'OpeningEquity',
  'OpeningCash',
] as const;

export type BalanceLineType = (typeof BALANCE_LINE_TYPES)[number];

export type AccountingBalanceRow = {
  balanceId: string;
  month: string;
  lineType: BalanceLineType;
  label: string;
  amount: number;
  enteredBy: string;
  enteredAt: string;
};

export type IncomeStatementRow = {
  month: string;
  revenue: number;
  costOfServices: number;
  grossProfit: number;
  operatingExpense: number;
  netIncome: number;
  warnings: string[];
  generatedAt: string;
};

export type BalanceSheetRow = {
  month: string;
  cash: number;
  otherAssets: number;
  totalAssets: number;
  liabilities: number;
  equity: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  discrepancy: number;
  generatedAt: string;
};

export type CashFlowStatementRow = {
  month: string;
  cashFromOperations: number;
  cashFromInvesting: number;
  cashFromFinancing: number;
  netChangeInCash: number;
  generatedAt: string;
};

export type MonthlyStatements = {
  month: string;
  income: IncomeStatementRow | null;
  balanceSheet: BalanceSheetRow | null;
  cashFlow: CashFlowStatementRow | null;
};

export const STATEMENT_PKR_TOLERANCE = 1;
