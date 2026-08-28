import { OFFBOARDING_STATUSES, type OffboardingRecord } from '@/types/offboarding';

export type OffboardingState = 'none' | 'in_progress' | 'offboarded';

export type OffboardingSummary = {
  state: OffboardingState;
  /** The case behind the state, so callers can show dates and settlement. */
  record: OffboardingRecord | null;
};

export const NO_OFFBOARDING: OffboardingSummary = { state: 'none', record: null };

function statusOf(record: OffboardingRecord): string {
  return String(record.status || '').trim().toLowerCase();
}

/**
 * An open case outranks a completed one, so a rehired employee who is being
 * offboarded again reads as "in progress" rather than "offboarded".
 */
export function summarizeOffboarding(records: OffboardingRecord[]): OffboardingSummary {
  const open = records.find(
    (row) => statusOf(row) === OFFBOARDING_STATUSES.INITIATED.toLowerCase()
  );
  if (open) return { state: 'in_progress', record: open };

  const completed = records
    .filter((row) => statusOf(row) === OFFBOARDING_STATUSES.COMPLETED.toLowerCase())
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))[0];
  if (completed) return { state: 'offboarded', record: completed };

  return NO_OFFBOARDING;
}

/** Group every case by employee so a roster can be annotated from one request. */
export function buildOffboardingIndex(
  records: OffboardingRecord[]
): Map<string, OffboardingSummary> {
  const byEmployee = new Map<string, OffboardingRecord[]>();
  for (const record of records) {
    const key = String(record.employeeId || '').trim().toLowerCase();
    if (!key) continue;
    const bucket = byEmployee.get(key);
    if (bucket) bucket.push(record);
    else byEmployee.set(key, [record]);
  }

  const index = new Map<string, OffboardingSummary>();
  for (const [key, rows] of byEmployee) {
    const summary = summarizeOffboarding(rows);
    if (summary.state !== 'none') index.set(key, summary);
  }
  return index;
}

export function offboardingStateFor(
  index: Map<string, OffboardingSummary>,
  employeeId: string | undefined
): OffboardingSummary {
  if (!employeeId) return NO_OFFBOARDING;
  return index.get(employeeId.trim().toLowerCase()) || NO_OFFBOARDING;
}

export function offboardingLabel(state: OffboardingState): string {
  if (state === 'in_progress') return 'Offboarding';
  if (state === 'offboarded') return 'Offboarded';
  return '';
}

export function offboardingBadgeClasses(state: OffboardingState): string {
  if (state === 'in_progress') return 'border-warning/30 bg-warning/10 text-warning';
  if (state === 'offboarded') return 'border-danger-border bg-danger-bg text-danger';
  return 'border-border bg-surface text-muted';
}
