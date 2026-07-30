import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  SalarySlipRun,
  SalarySlipRunDetail,
  SalarySlipRunStatus,
} from '@/types/salary-slip';

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
  runid: number;
  employeeid: string;
  status: string;
  pdflink: string | null;
  emailstatus: string | null;
  errorreason: string | null;
};

const RUNS_TABLE = 'salaryslipruns';
const DETAILS_TABLE = 'salarysliprundetails';

export function mapRunRow(row: RunRow): SalarySlipRun {
  return {
    runId: String(row.runid),
    triggeredBy: row.triggeredby,
    runDate: row.rundate,
    month: Number(row.month),
    year: Number(row.year),
    status: row.status,
    successCount: Number(row.successcount || 0),
    failCount: Number(row.failcount || 0),
  };
}

export function mapDetailRow(row: DetailRow): SalarySlipRunDetail {
  return {
    runId: String(row.runid),
    employeeId: row.employeeid,
    status: row.status,
    pdfLink: row.pdflink || '',
    emailStatus: row.emailstatus || 'Pending',
    errorReason: row.errorreason || '',
  };
}

export async function listSalarySlipRuns(): Promise<SalarySlipRun[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(RUNS_TABLE)
    .select('*')
    .order('rundate', { ascending: false });

  if (error) throw new Error(`Failed to list salary slip runs: ${error.message}`);
  return ((data as RunRow[]) || []).map(mapRunRow);
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
  return data ? mapRunRow(data as RunRow) : null;
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
  const { error } = await getSupabaseAdmin().from(DETAILS_TABLE).upsert(
    {
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
