import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import type { MonthlyStatements } from '@/types/financial-statements';

export async function dispatchFinancialStatementsWebhook(
  statements: MonthlyStatements
): Promise<void> {
  const url = SHEETS_WEBHOOKS.upsertFinancialStatements;
  if (!url) return;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: 'upsert-financial-statements',
      month: statements.month,
      incomeStatement: statements.income,
      balanceSheet: statements.balanceSheet,
      cashFlowStatement: statements.cashFlow,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) {
      console.error(
        'upsert-financial-statements webhook not found (404). Activate the n8n workflow when ready.'
      );
      return;
    }
    throw new Error(text || `Statements webhook returned status ${response.status}.`);
  }
}
