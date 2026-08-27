import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  compensationChanged,
  dbRowToSalaryHistoryRecord,
  deleteSalaryHistoryDbRow,
  insertSalaryHistoryFromSnapshot,
  type SalaryHistoryDbRow,
} from '@/lib/db/salary-history';
import type { SalaryDbRow } from '@/lib/db/salaries';
import type { SalaryHistoryRecord } from '@/types/salary-history';

export function toWebhookSalaryHistoryRow(record: SalaryHistoryRecord) {
  return {
    HistoryID: record.historyId,
    EmployeeID: record.employeeId,
    SalaryID: record.salaryId,
    ChangedAt: record.changedAt,
    ChangedBy: record.changedBy,
    Action: record.action,
    OldBaseSalary: record.oldBaseSalary,
    NewBaseSalary: record.newBaseSalary,
    OldAllowance: record.oldAllowance,
    NewAllowance: record.newAllowance,
    OldTax: record.oldTax,
    NewTax: record.newTax,
    OldNetSalary: record.oldNetSalary,
    NewNetSalary: record.newNetSalary,
  };
}

async function postSalaryHistoryWebhook(record: SalaryHistoryRecord): Promise<void> {
  const url = SHEETS_WEBHOOKS.createSalaryHistory;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(toWebhookSalaryHistoryRow(record)),
    cache: 'no-store',
  });

  const text = await response.text();
  if (response.ok) return;

  if (response.status === 404) {
    throw new Error(
      'create-salary-history webhook not found (404). Activate the n8n workflow and use /webhook/ (not /webhook-test/).'
    );
  }
  throw new Error(text || `create-salary-history webhook returned status ${response.status}.`);
}

/**
 * Dual-write one compensation change: Supabase first, then n8n → sheet.
 * If the sheet write fails, the Supabase history row is deleted.
 * Returns null when bank-only edits did not change compensation.
 */
export async function writeSalaryHistoryDual(options: {
  previous: SalaryDbRow | null;
  next: SalaryDbRow;
  changedBy?: string;
}): Promise<SalaryHistoryDbRow | null> {
  if (!compensationChanged(options.previous, options.next)) return null;

  const dbRow = await insertSalaryHistoryFromSnapshot(options);
  if (!dbRow) return null;

  const record = dbRowToSalaryHistoryRecord(dbRow);
  try {
    await postSalaryHistoryWebhook(record);
  } catch (sheetError) {
    try {
      await deleteSalaryHistoryDbRow(dbRow.historyid);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase salaryhistory after sheet write failure:',
        rollbackError
      );
    }
    throw sheetError;
  }

  return dbRow;
}
