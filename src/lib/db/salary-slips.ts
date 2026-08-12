import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { SalarySlipRun, SalarySlipRunDetail, SalarySlipRunStatus } from '@/types/salary-slip';

type RunRow = {
  runid: number;
  triggeredby: string;
  rundate: string;
  month: number;
  year: number;
  status: string;
  successcount: number;
  failcount: number;
};

type DetailRow = {
  rundetailid?: string | null;
  runid: number;
  employeeid: string;
  status: string;
  pdflink: string | null;
  emailstatus: string | null;
  errorreason: string | null;
};

const RUNS_TABLE = 'salaryslipruns';
const DETAILS_TABLE = 'salarysliprundetails';

/** Composite key used in Sheets + Supabase, e.g. `9-EMP-001`. */
export function buildRunDetailId(runId: string | number, employeeId: string): string {
  return `${String(runId).trim()}-${String(employeeId).trim()}`;
}

function isSuccessStatus(status: string): boolean {
  const value = status.trim().toLowerCase();
  return value === 'success' || value === 'completed' || value === 'sent';
}

function isFailedStatus(status: string): boolean {
  const value = status.trim().toLowerCase();
  return value === 'failed' || value === 'fail' || value === 'error';
}

export function countDetailsByStatus(details: Array<{ status: string }>): {
  successCount: number;
  failCount: number;
} {
  let successCount = 0;
  let failCount = 0;
  for (const detail of details) {
    if (isSuccessStatus(detail.status)) successCount += 1;
    else if (isFailedStatus(detail.status)) failCount += 1;
  }
  return { successCount, failCount };
}

export function mapRunRow(row: RunRow): SalarySlipRun {
  return {
    runId: String(row.runid),
    triggeredBy: row.triggeredby,
    runDate: row.rundate,
    month: Number(row.month),
    year: Number(row.year),
    status: row.status,
    successCount: Number(row.successcount ?? 0),
    failCount: Number(row.failcount ?? 0),
  };
}

export function mapDetailRow(row: DetailRow): SalarySlipRunDetail {
  const runId = String(row.runid);
  const employeeId = row.employeeid;
  return {
    runDetailId: row.rundetailid || buildRunDetailId(runId, employeeId),
    runId,
    employeeId,
    status: row.status,
    pdfLink: row.pdflink || '',
    emailStatus: row.emailstatus || 'Pending',
    errorReason: row.errorreason || '',
  };
}

/** Prefer detail-row tallies when the run aggregate is stale (n8n often skips counts). */
async function applyDetailCounts(runs: SalarySlipRun[]): Promise<SalarySlipRun[]> {
  if (runs.length === 0) return runs;

  const runIds = runs.map((run) => Number(run.runId)).filter((id) => Number.isFinite(id));
  if (runIds.length === 0) return runs;

  const { data, error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .select('runid, status')
    .in('runid', runIds);

  if (error) {
    console.error('Failed to load detail counts for salary slip runs:', error.message);
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

  const healed: SalarySlipRun[] = [];

  for (const run of runs) {
    const tallies = byRun.get(run.runId);
    if (!tallies || tallies.total === 0) {
      healed.push(run);
      continue;
    }

    const next: SalarySlipRun = {
      ...run,
      successCount: tallies.successCount,
      failCount: tallies.failCount,
    };

    // Heal stale aggregates so future reads and Sheets stay aligned.
    if (run.successCount !== tallies.successCount || run.failCount !== tallies.failCount) {
      void updateSalarySlipRun(run.runId, {
        successCount: tallies.successCount,
        failCount: tallies.failCount,
      }).catch((healError) => {
        console.error(`Failed to heal counts for run ${run.runId}:`, healError);
      });
    }

    healed.push(next);
  }

  return healed;
}

export async function listSalarySlipRuns(): Promise<SalarySlipRun[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*')
    .order('rundate', { ascending: false });

  if (error) throw new Error(`Failed to list salary slip runs: ${error.message}`);
  return applyDetailCounts(((data as RunRow[]) || []).map(mapRunRow));
}

export async function getSalarySlipRun(runId: string): Promise<SalarySlipRun | null> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*')
    .eq('runid', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load salary slip run: ${error.message}`);
  if (!data) return null;

  const [run] = await applyDetailCounts([mapRunRow(data as RunRow)]);
  return run;
}

export async function listSalarySlipRunDetails(runId: string): Promise<SalarySlipRunDetail[]> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return [];

  const { data, error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .select('*')
    .eq('runid', id)
    .order('employeeid', { ascending: true });

  if (error) throw new Error(`Failed to list salary slip run details: ${error.message}`);
  return ((data as DetailRow[]) || []).map(mapDetailRow);
}

export async function createSalarySlipRun(input: {
  triggeredBy: string;
  month: number;
  year: number;
  employeeIds: string[];
}): Promise<SalarySlipRun> {
  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .insert({
      triggeredby: input.triggeredBy,
      month: input.month,
      year: input.year,
      status: 'Processing',
      successcount: 0,
      failcount: 0,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create salary slip run: ${error.message}`);

  const run = mapRunRow(data as RunRow);
  if (input.employeeIds.length > 0) {
    const details = input.employeeIds.map((employeeId) => ({
      rundetailid: buildRunDetailId(run.runId, employeeId),
      runid: Number(run.runId),
      employeeid: employeeId,
      status: 'Pending',
      emailstatus: 'Pending',
    }));

    const { error: detailError } = await getSupabaseAdmin().from(DETAILS_TABLE).insert(details);
    if (detailError) {
      await getSupabaseAdmin().from(RUNS_TABLE).delete().eq('runid', Number(run.runId));
      throw new Error(`Failed to create salary slip run details: ${detailError.message}`);
    }
  }

  return run;
}

export async function updateSalarySlipRun(
  runId: string,
  patch: {
    status?: SalarySlipRunStatus;
    successCount?: number;
    failCount?: number;
  }
): Promise<SalarySlipRun> {
  const id = Number(runId);
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.successCount !== undefined) payload.successcount = patch.successCount;
  if (patch.failCount !== undefined) payload.failcount = patch.failCount;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .update(payload)
    .eq('runid', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update salary slip run: ${error.message}`);
  return mapRunRow(data as RunRow);
}

export async function upsertSalarySlipRunDetail(input: {
  runId: string;
  employeeId: string;
  status: string;
  pdfLink?: string;
  emailStatus?: string;
  errorReason?: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .upsert(
      {
        rundetailid: buildRunDetailId(input.runId, input.employeeId),
        runid: Number(input.runId),
        employeeid: input.employeeId,
        status: input.status,
        pdflink: input.pdfLink || null,
        emailstatus: input.emailStatus || 'Pending',
        errorreason: input.errorReason || null,
      },
      { onConflict: 'runid,employeeid' }
    );

  if (error) throw new Error(`Failed to upsert salary slip detail: ${error.message}`);
}

export async function countProcessingRuns(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Processing');

  if (error) throw new Error(`Failed to count processing runs: ${error.message}`);
  return count || 0;
}
