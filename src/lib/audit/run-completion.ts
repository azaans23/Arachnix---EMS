import { listAuditedRecordIds } from '@/lib/db/audit';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type { OfferLetterRun } from '@/types/offer-letter';
import type { SalarySlipRun } from '@/types/salary-slip';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'partial']);

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * Salary slip and offer letter runs are finished by the n8n workflow writing
 * directly to Supabase, so the app never sees the completion. These helpers
 * backfill the completion audit entry for runs that reached a terminal status
 * but only have the initial GENERATE (Processing) entry.
 *
 * Idempotent: a run is skipped once any non-GENERATE entry exists for it.
 */
async function pendingCompletionRunIds<T extends { runId: string; status: string }>(
  recordType: string,
  runs: T[]
): Promise<T[]> {
  const terminal = runs.filter((run) => isTerminal(run.status));
  if (terminal.length === 0) return [];

  const audited = await listAuditedRecordIds({
    recordType,
    recordIds: terminal.map((run) => run.runId),
    ignoreActions: [AUDIT_ACTIONS.GENERATE],
  });

  return terminal.filter((run) => !audited.has(String(run.runId)));
}

export async function reconcileSalarySlipRunAudits(runs: SalarySlipRun[]): Promise<void> {
  const pending = await pendingCompletionRunIds(AUDIT_RECORD_TYPES.SALARY_SLIP_RUN, runs);

  for (const run of pending) {
    const status = String(run.status);
    await logAuditBestEffort(
      run.triggeredBy,
      {
        action: status.toLowerCase() === 'completed' ? AUDIT_ACTIONS.CREATE : AUDIT_ACTIONS.UPDATE,
        recordType: AUDIT_RECORD_TYPES.SALARY_SLIP_RUN,
        recordId: run.runId,
        oldValue: { status: 'Processing' },
        newValue: {
          month: run.month,
          year: run.year,
          status,
          successCount: run.successCount,
          failCount: run.failCount,
          employeeCount: run.successCount + run.failCount,
        },
      },
      'Salary slip run completion audit'
    );
  }
}

export async function reconcileOfferLetterRunAudits(runs: OfferLetterRun[]): Promise<void> {
  const pending = await pendingCompletionRunIds(AUDIT_RECORD_TYPES.OFFER_LETTER_RUN, runs);

  for (const run of pending) {
    const status = String(run.status);
    await logAuditBestEffort(
      run.triggeredBy,
      {
        action: status.toLowerCase() === 'completed' ? AUDIT_ACTIONS.CREATE : AUDIT_ACTIONS.UPDATE,
        recordType: AUDIT_RECORD_TYPES.OFFER_LETTER_RUN,
        recordId: run.runId,
        oldValue: { status: 'Processing' },
        newValue: {
          month: run.month,
          year: run.year,
          status,
          successCount: run.successCount,
          failCount: run.failCount,
          offerLetterCount: run.offerLetterCount || run.successCount + run.failCount,
        },
      },
      'Offer letter run completion audit'
    );
  }
}
