import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { postSheetWebhook } from '@/lib/sheets/webhook';
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
  await postSheetWebhook({
    url: SHEETS_WEBHOOKS.createSalaryHistory,
    label: 'create-salary-history',
    payload: toWebhookSalaryHistoryRow(record),
  });
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
