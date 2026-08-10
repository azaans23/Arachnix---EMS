import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { formatMonthName, parseMonthValue } from '@/lib/payroll/period';
import type {
  OfferLetterRun,
  OfferLetterRunDetail,
  OfferLetterRunStatus,
} from '@/types/offer-letter';

type RunRow = {
  runid: number;
  triggeredby: string;
  rundate: string;
  month: string | number;
  year: number;
  status: string;
  successcount: number;
  failcount: number;
  offerlettercount: number;
};

type DetailRow = {
  rundetailid: string;
  runid: number;
  employeeid: string;
  status: string;
  pdflink: string | null;
  pdfstatus: string | null;
  emailstatus: string | null;
  errorreason: string | null;
};

const RUNS_TABLE = 'offerletterruns';
const DETAILS_TABLE = 'offerletterrundetail';

/** OfferLetterRunDetail.EmployeeID is varchar(50) — candidates without an ID use their email. */
const EMPLOYEE_KEY_MAX = 50;

const RUN_STATUSES = ['Processing', 'Completed', 'Failed'] as const;
const DETAIL_STATUSES = ['Pending', 'Completed', 'Failed'] as const;
const PDF_STATUSES = ['Pending', 'Generated', 'Failed'] as const;
const EMAIL_STATUSES = ['Pending', 'Sent', 'Failed'] as const;

export function offerLetterSubjectKey(employeeId: string | undefined, email: string): string {
  const key = String(employeeId || '').trim() || String(email || '').trim();
  return key.slice(0, EMPLOYEE_KEY_MAX);
}

/** Composite key stored in OfferLetterRunDetail.RunDetailID, e.g. `4-EMP-001`. */
export function buildOfferLetterRunDetailId(runId: string | number, employeeKey: string): string {
  return `${String(runId).trim()}-${String(employeeKey).trim()}`.slice(0, 100);
}

/**
 * OfferLetterRunDetail has CHECK constraints per column, so anything coming back
 * from n8n is squeezed into the allowed values before it reaches Supabase.
 */
function normalizeStatus(
  value: string | undefined,
  allowed: readonly string[],
  fallbackSuccess: string,
  fallbackFailure: string
): string {
  const raw = String(value || '').trim();
  const match = allowed.find((option) => option.toLowerCase() === raw.toLowerCase());
  if (match) return match;
  if (!raw) return 'Pending';
  return isFailedStatus(raw) ? fallbackFailure : isSuccessStatus(raw) ? fallbackSuccess : 'Pending';
}

function isSuccessStatus(status: string): boolean {
  const value = status.trim().toLowerCase();
  return value === 'success' || value === 'completed' || value === 'sent';
}

function isFailedStatus(status: string): boolean {
  const value = status.trim().toLowerCase();
  return value === 'failed' || value === 'fail' || value === 'error';
}

export function mapOfferLetterRunRow(row: RunRow): OfferLetterRun {
  return {
    runId: String(row.runid),
    triggeredBy: row.triggeredby,
    runDate: row.rundate,
    month: parseMonthValue(row.month),
    year: Number(row.year),
    status: row.status,
    successCount: Number(row.successcount ?? 0),
    failCount: Number(row.failcount ?? 0),
    offerLetterCount: Number(row.offerlettercount ?? 0),
  };
}

export function mapOfferLetterRunDetailRow(row: DetailRow): OfferLetterRunDetail {
  const runId = String(row.runid);
  return {
    runDetailId: row.rundetailid || buildOfferLetterRunDetailId(runId, row.employeeid),
    runId,
    employeeId: row.employeeid,
    status: row.status,
    pdfLink: row.pdflink || '',
    pdfStatus: row.pdfstatus || 'Pending',
    emailStatus: row.emailstatus || 'Pending',
    errorReason: row.errorreason || '',
  };
}

/** Prefer detail-row tallies when the run aggregate is stale (n8n often skips counts). */
async function applyDetailCounts(runs: OfferLetterRun[]): Promise<OfferLetterRun[]> {
  if (runs.length === 0) return runs;

  const runIds = runs.map((run) => Number(run.runId)).filter((id) => Number.isFinite(id));
  if (runIds.length === 0) return runs;

  const { data, error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .select('runid, status')
    .in('runid', runIds);

  if (error) {
    console.error('Failed to load detail counts for offer letter runs:', error.message);
    return runs;
  }

  const byRun = new Map<string, { successCount: number; failCount: number; total: number }>();
  for (const row of (data as Array<{ runid: number; status: string }>) || []) {
    const key = String(row.runid);
    const current = byRun.get(key) || { successCount: 0, failCount: 0, total: 0 };
    current.total += 1;
    if (isSuccessStatus(row.status)) current.successCount += 1;
    else if (isFailedStatus(row.status)) current.failCount += 1;
    byRun.set(key, current);
  }

  const healed: OfferLetterRun[] = [];

  for (const run of runs) {
    const tallies = byRun.get(run.runId);
    if (!tallies || tallies.total === 0) {
      healed.push(run);
      continue;
    }

    healed.push({
      ...run,
      successCount: tallies.successCount,
      failCount: tallies.failCount,
    });

    if (run.successCount !== tallies.successCount || run.failCount !== tallies.failCount) {
      void updateOfferLetterRun(run.runId, {
        successCount: tallies.successCount,
        failCount: tallies.failCount,
      }).catch((healError) => {
        console.error(`Failed to heal counts for offer letter run ${run.runId}:`, healError);
      });
    }
  }

  return healed;
}

export async function listOfferLetterRuns(): Promise<OfferLetterRun[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*')
    .order('runid', { ascending: false });

  if (error) throw new Error(`Failed to list offer letter runs: ${error.message}`);
  return applyDetailCounts(((data as RunRow[]) || []).map(mapOfferLetterRunRow));
}

export async function getOfferLetterRun(runId: string): Promise<OfferLetterRun | null> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*')
    .eq('runid', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load offer letter run: ${error.message}`);
  if (!data) return null;

  const [run] = await applyDetailCounts([mapOfferLetterRunRow(data as RunRow)]);
  return run;
}

export async function listOfferLetterRunDetails(runId: string): Promise<OfferLetterRunDetail[]> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return [];

  const { data, error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .select('*')
    .eq('runid', id)
    .order('employeeid', { ascending: true });

  if (error) throw new Error(`Failed to list offer letter run details: ${error.message}`);
  return ((data as DetailRow[]) || []).map(mapOfferLetterRunDetailRow);
}

export async function createOfferLetterRun(input: {
  triggeredBy: string;
  month: number;
  year: number;
  employeeKeys: string[];
}): Promise<OfferLetterRun> {
  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .insert({
      triggeredby: input.triggeredBy,
      month: formatMonthName(input.month),
      year: input.year,
      status: 'Processing',
      successcount: 0,
      failcount: 0,
      offerlettercount: input.employeeKeys.length,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create offer letter run: ${error.message}`);

  const run = mapOfferLetterRunRow(data as RunRow);

  if (input.employeeKeys.length > 0) {
    const details = input.employeeKeys.map((employeeKey) => ({
      rundetailid: buildOfferLetterRunDetailId(run.runId, employeeKey),
      runid: Number(run.runId),
      employeeid: employeeKey,
      status: 'Pending',
      pdfstatus: 'Pending',
      emailstatus: 'Pending',
    }));

    const { error: detailError } = await getSupabaseAdmin().from(DETAILS_TABLE).insert(details);
    if (detailError) {
      await getSupabaseAdmin().from(RUNS_TABLE).delete().eq('runid', Number(run.runId));
      throw new Error(`Failed to create offer letter run details: ${detailError.message}`);
    }
  }

  return run;
}

export async function updateOfferLetterRun(
  runId: string,
  patch: {
    status?: OfferLetterRunStatus;
    successCount?: number;
    failCount?: number;
    offerLetterCount?: number;
  }
): Promise<OfferLetterRun> {
  const id = Number(runId);
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    payload.status = normalizeStatus(patch.status, RUN_STATUSES, 'Completed', 'Failed');
  }
  if (patch.successCount !== undefined) payload.successcount = patch.successCount;
  if (patch.failCount !== undefined) payload.failcount = patch.failCount;
  if (patch.offerLetterCount !== undefined) payload.offerlettercount = patch.offerLetterCount;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .update(payload)
    .eq('runid', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update offer letter run: ${error.message}`);
  return mapOfferLetterRunRow(data as RunRow);
}

export async function upsertOfferLetterRunDetail(input: {
  runId: string;
  employeeKey: string;
  status: string;
  pdfLink?: string;
  pdfStatus?: string;
  emailStatus?: string;
  errorReason?: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .upsert(
      {
        rundetailid: buildOfferLetterRunDetailId(input.runId, input.employeeKey),
        runid: Number(input.runId),
        employeeid: input.employeeKey,
        status: normalizeStatus(input.status, DETAIL_STATUSES, 'Completed', 'Failed'),
        pdflink: input.pdfLink || null,
        pdfstatus: normalizeStatus(
          input.pdfStatus || (input.pdfLink ? 'Generated' : ''),
          PDF_STATUSES,
          'Generated',
          'Failed'
        ),
        emailstatus: normalizeStatus(input.emailStatus, EMAIL_STATUSES, 'Sent', 'Failed'),
        errorreason: input.errorReason || null,
      },
      { onConflict: 'rundetailid' }
    );

  if (error) throw new Error(`Failed to upsert offer letter detail: ${error.message}`);
}
