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
  approvedby: string | null;
  approvedat: string | null;
  rejectedby: string | null;
  rejectedat: string | null;
  rejectionreason: string | null;
};

type DetailRow = {
  rundetailid?: string | null;
  runid: number;
  employeeid: string;
  status: string;
  pdflink: string | null;
  emailstatus: string | null;
  errorreason: string | null;
  rejectedby: string | null;
  rejectedat: string | null;
  rejectionreason: string | null;
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

/** Generated but not emailed yet — still waiting on an approve / reject decision. */
export function isSendableDetail(detail: { status: string; emailStatus: string }): boolean {
  const status = detail.status.trim().toLowerCase();
  return (
    (status === 'success' || status === 'completed') &&
    detail.emailStatus.trim().toLowerCase() !== 'sent'
  );
}

export function countDetailsByStatus(details: Array<{ status: string }>): {
  successCount: number;
  failCount: number;
  rejectedCount: number;
  employeeCount: number;
} {
  let successCount = 0;
  let failCount = 0;
  let rejectedCount = 0;
  for (const detail of details) {
    const status = detail.status.trim().toLowerCase();
    if (isSuccessStatus(status)) successCount += 1;
    else if (isFailedStatus(status)) failCount += 1;
    else if (status === 'rejected') rejectedCount += 1;
  }
  return {
    successCount,
    failCount,
    rejectedCount,
    employeeCount: details.length,
  };
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
    rejectedCount: 0,
    approvedBy: row.approvedby || '',
    approvedAt: row.approvedat || '',
    rejectedBy: row.rejectedby || '',
    rejectedAt: row.rejectedat || '',
    rejectionReason: row.rejectionreason || '',
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
    rejectedBy: row.rejectedby || '',
    rejectedAt: row.rejectedat || '',
    rejectionReason: row.rejectionreason || '',
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

  const byRun = new Map<string, ReturnType<typeof countDetailsByStatus>>();
  const rowsByRun = new Map<string, Array<{ status: string }>>();
  for (const row of (data as Array<{ runid: number; status: string }>) || []) {
    const key = String(row.runid);
    const rows = rowsByRun.get(key) || [];
    rows.push({ status: row.status });
    rowsByRun.set(key, rows);
  }
  for (const [key, rows] of rowsByRun) {
    byRun.set(key, countDetailsByStatus(rows));
  }

  const healed: SalarySlipRun[] = [];

  for (const run of runs) {
    const tallies = byRun.get(run.runId);
    if (!tallies || tallies.employeeCount === 0) {
      healed.push(run);
      continue;
    }

    const next: SalarySlipRun = {
      ...run,
      successCount: tallies.successCount,
      failCount: tallies.failCount,
      rejectedCount: tallies.rejectedCount,
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
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectedBy?: string | null;
    rejectedAt?: string | null;
    rejectionReason?: string | null;
  }
): Promise<SalarySlipRun> {
  const id = Number(runId);
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.successCount !== undefined) payload.successcount = patch.successCount;
  if (patch.failCount !== undefined) payload.failcount = patch.failCount;
  if (patch.approvedBy !== undefined) payload.approvedby = patch.approvedBy;
  if (patch.approvedAt !== undefined) payload.approvedat = patch.approvedAt;
  if (patch.rejectedBy !== undefined) payload.rejectedby = patch.rejectedBy;
  if (patch.rejectedAt !== undefined) payload.rejectedat = patch.rejectedAt;
  if (patch.rejectionReason !== undefined) payload.rejectionreason = patch.rejectionReason;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .update(payload)
    .eq('runid', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update salary slip run: ${error.message}`);
  return mapRunRow(data as RunRow);
}

/**
 * Claim approval with a status guard. Two simultaneous clicks cannot both
 * dispatch employee emails because only Awaiting Approval may transition.
 */
export async function approveSalarySlipRunDb(
  runId: string,
  approvedBy: string
): Promise<SalarySlipRun | null> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .update({
      status: 'Approved',
      approvedby: approvedBy.trim().toLowerCase(),
      approvedat: new Date().toISOString(),
    })
    .eq('runid', id)
    .eq('status', 'Awaiting Approval')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to approve salary slip run: ${error.message}`);
  return data ? mapRunRow(data as RunRow) : null;
}

export async function rollbackSalarySlipRunApproval(runId: string): Promise<void> {
  const id = Number(runId);
  if (!Number.isFinite(id)) return;

  const { error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .update({
      status: 'Awaiting Approval',
      approvedby: null,
      approvedat: null,
    })
    .eq('runid', id)
    .eq('status', 'Approved');

  if (error) {
    throw new Error(`Failed to roll back salary slip approval: ${error.message}`);
  }
}

export type SalarySlipRejectionDbResult = {
  run: SalarySlipRun;
  details: SalarySlipRunDetail[];
  previousRun: SalarySlipRun;
  previousDetails: SalarySlipRunDetail[];
};

function detailToDbPatch(detail: SalarySlipRunDetail) {
  return {
    status: detail.status,
    pdflink: detail.pdfLink || null,
    emailstatus: detail.emailStatus || 'Pending',
    errorreason: detail.errorReason || null,
    rejectedby: detail.rejectedBy || null,
    rejectedat: detail.rejectedAt || null,
    rejectionreason: detail.rejectionReason || null,
  };
}

/**
 * Reject one generated employee slip or the whole awaiting run.
 * The run status guard prevents rejection after approval has started.
 */
export async function rejectSalarySlipDb(options: {
  runId: string;
  employeeId?: string;
  rejectedBy: string;
  reason: string;
}): Promise<SalarySlipRejectionDbResult> {
  const id = Number(options.runId);
  if (!Number.isFinite(id)) throw new Error('Invalid salary slip run ID.');

  const previousRun = await getSalarySlipRun(options.runId);
  if (!previousRun) throw new Error('Salary slip run not found.');
  if (previousRun.status.trim().toLowerCase() !== 'awaiting approval') {
    throw new Error(
      `Only runs awaiting approval can be rejected. Current status: ${previousRun.status}.`
    );
  }

  const previousDetails = await listSalarySlipRunDetails(options.runId);
  const employeeId = options.employeeId?.trim();
  const targets = employeeId
    ? previousDetails.filter(
        (detail) => detail.employeeId.trim().toLowerCase() === employeeId.toLowerCase()
      )
    : previousDetails.filter(isSendableDetail);

  if (targets.length === 0) {
    throw new Error(employeeId ? 'Employee salary slip not found in this run.' : 'No slips to reject.');
  }
  if (
    targets.some(
      (detail) =>
        !['success', 'completed'].includes(detail.status.trim().toLowerCase()) ||
        detail.emailStatus.trim().toLowerCase() === 'sent'
    )
  ) {
    throw new Error('Only generated, unsent salary slips can be rejected.');
  }

  const rejectedAt = new Date().toISOString();
  const rejectedBy = options.rejectedBy.trim().toLowerCase();
  const targetIds = targets.map((detail) => detail.employeeId);
  const { error: detailError } = await getSupabaseAdmin()
    .from(DETAILS_TABLE)
    .update({
      status: 'Rejected',
      emailstatus: 'Rejected',
      rejectedby: rejectedBy,
      rejectedat: rejectedAt,
      rejectionreason: options.reason,
    })
    .eq('runid', id)
    .in('employeeid', targetIds)
    .in('status', ['Success', 'Completed']);

  if (detailError) throw new Error(`Failed to reject salary slip details: ${detailError.message}`);

  const details = await listSalarySlipRunDetails(options.runId);
  const rejectRun = !employeeId || !details.some(isSendableDetail);
  let run = previousRun;

  if (rejectRun) {
    const { data, error } = await getSupabaseAdmin()
      .from(RUNS_TABLE)
      .update({
        status: 'Rejected',
        rejectedby: rejectedBy,
        rejectedat: rejectedAt,
        rejectionreason: options.reason,
      })
      .eq('runid', id)
      .eq('status', 'Awaiting Approval')
      .select('*')
      .maybeSingle();

    if (error || !data) {
      await Promise.all(
        targets.map((detail) =>
          getSupabaseAdmin()
            .from(DETAILS_TABLE)
            .update(detailToDbPatch(detail))
            .eq('runid', id)
            .eq('employeeid', detail.employeeId)
        )
      );
      throw new Error(
        error
          ? `Failed to reject salary slip run: ${error.message}`
          : 'The run status changed before rejection completed.'
      );
    }
    run = mapRunRow(data as RunRow);
  }

  return { run, details, previousRun, previousDetails: targets };
}

/** Compensating rollback when n8n/Sheet rejection synchronization fails. */
export async function rollbackSalarySlipRejection(
  result: SalarySlipRejectionDbResult
): Promise<void> {
  const id = Number(result.run.runId);
  await Promise.all(
    result.previousDetails.map(async (detail) => {
      const { error } = await getSupabaseAdmin()
        .from(DETAILS_TABLE)
        .update(detailToDbPatch(detail))
        .eq('runid', id)
        .eq('employeeid', detail.employeeId)
        .eq('status', 'Rejected');
      if (error) throw new Error(`Failed to restore rejected salary slip: ${error.message}`);
    })
  );

  if (result.run.status.trim().toLowerCase() === 'rejected') {
    const { error } = await getSupabaseAdmin()
      .from(RUNS_TABLE)
      .update({
        status: result.previousRun.status,
        rejectedby: result.previousRun.rejectedBy || null,
        rejectedat: result.previousRun.rejectedAt || null,
        rejectionreason: result.previousRun.rejectionReason || null,
      })
      .eq('runid', id)
      .eq('status', 'Rejected');
    if (error) throw new Error(`Failed to restore rejected salary slip run: ${error.message}`);
  }
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
