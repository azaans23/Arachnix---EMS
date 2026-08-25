import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import type { AccountingBalanceRow } from '@/types/financial-statements';

export function toWebhookBalanceRow(row: AccountingBalanceRow) {
  return {
    BalanceID: Number(row.balanceId) || row.balanceId,
    Month: row.month || '',
    LineType: row.lineType,
    Label: row.label,
    Amount: row.amount,
    EnteredBy: row.enteredBy || '',
    EnteredAt: row.enteredAt || '',
  };
}

export async function dispatchAccountingBalancesWebhook(input: {
  kind: 'month' | 'opening';
  month: string;
  lines: AccountingBalanceRow[];
  openings: AccountingBalanceRow[];
}): Promise<void> {
  const url = SHEETS_WEBHOOKS.upsertAccountingBalances;
  if (!url) return;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: 'upsert-accounting-balances',
      kind: input.kind,
      month: input.month,
      replaceMonth: input.kind === 'month',
      lines: input.lines.map(toWebhookBalanceRow),
      openings: input.openings.map(toWebhookBalanceRow),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) {
      console.error(
        'upsert-accounting-balances webhook not found (404). Activate the n8n workflow when ready.'
      );
      return;
    }
    throw new Error(text || `Balances webhook returned status ${response.status}.`);
  }
}
