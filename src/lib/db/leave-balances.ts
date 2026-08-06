import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listEmployeeDbRows } from '@/lib/db/employees';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  buildLeaveId,
  type LeaveBalanceInput,
  type LeaveBalanceRecord,
} from '@/types/leave-balance';

type LeaveBalanceDbRow = {
  leaveid: string;
  employeeid: string;
  year: number;
  annualquota: number | null;
  annualused: number | null;
  sickquota: number | null;
  sickused: number | null;
  casualquota: number | null;
  casualused: number | null;
  carryforwarddays: number | null;
};

const TABLE = 'leavebalances';

function toDays(value: unknown, label: string): number {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a number of zero or more.`);
  }
  return n;
}

function toYear(value: unknown): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Year must be a valid calendar year.');
  }
  return year;
}

export function normalizeLeaveBalanceInput(raw: Record<string, unknown>): LeaveBalanceInput {
  const employeeId = String(raw.employeeId ?? raw.EmployeeID ?? '').trim();
  if (!employeeId) throw new Error('EmployeeID is required.');

  const year = toYear(raw.year ?? raw.Year);
  const leaveId =
    String(raw.leaveId ?? raw.LeaveID ?? '').trim() || buildLeaveId(employeeId, year);

  return {
    leaveId,
    employeeId,
    year,
    annualQuota: toDays(raw.annualQuota ?? raw.AnnualQuota, 'Annual Quota'),
    annualUsed: toDays(raw.annualUsed ?? raw.AnnualUsed, 'Annual Used'),
    sickQuota: toDays(raw.sickQuota ?? raw.SickQuota, 'Sick Quota'),
    sickUsed: toDays(raw.sickUsed ?? raw.SickUsed, 'Sick Used'),
    casualQuota: toDays(raw.casualQuota ?? raw.CasualQuota, 'Casual Quota'),
    casualUsed: toDays(raw.casualUsed ?? raw.CasualUsed, 'Casual Used'),
    carryForwardDays: toDays(
      raw.carryForwardDays ?? raw.CarryForwardDays,
      'Carry Forward Days'
    ),
  };
}

function mapDbRow(row: LeaveBalanceDbRow): LeaveBalanceInput {
  const employeeId = row.employeeid;
  const year = Number(row.year);
  return {
    leaveId: row.leaveid || buildLeaveId(employeeId, year),
    employeeId,
    year,
    annualQuota: Number(row.annualquota ?? 0),
    annualUsed: Number(row.annualused ?? 0),
    sickQuota: Number(row.sickquota ?? 0),
    sickUsed: Number(row.sickused ?? 0),
    casualQuota: Number(row.casualquota ?? 0),
    casualUsed: Number(row.casualused ?? 0),
    carryForwardDays: Number(row.carryforwarddays ?? 0),
  };
}

function toDbWrite(input: LeaveBalanceInput) {
  const leaveid = (input.leaveId || buildLeaveId(input.employeeId, input.year)).trim();
  if (!leaveid) throw new Error('LeaveID is required.');

  return {
    leaveid,
    employeeid: input.employeeId,
    year: input.year,
    annualquota: input.annualQuota,
    annualused: input.annualUsed,
    sickquota: input.sickQuota,
    sickused: input.sickUsed,
    casualquota: input.casualQuota,
    casualused: input.casualUsed,
    carryforwarddays: input.carryForwardDays,
  };
}

function toDbSnapshot(input: LeaveBalanceInput): LeaveBalanceDbRow {
  return toDbWrite(input);
}

export async function listLeaveBalances(filters?: {
  year?: number;
  employeeId?: string;
}): Promise<LeaveBalanceRecord[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');

  if (filters?.year !== undefined) {
    query = query.eq('year', filters.year);
  }
  if (filters?.employeeId) {
    query = query.eq('employeeid', filters.employeeId.trim());
  }

  const { data, error } = await query
    .order('year', { ascending: false })
    .order('employeeid', { ascending: true });

  if (error) throw new Error(`Failed to list leave balances: ${error.message}`);

  const balances = ((data as LeaveBalanceDbRow[]) || []).map(mapDbRow);
  const employees = await listEmployeeDbRows().catch(() => []);
  const byId = new Map(
    employees.map((employee) => [employee.employeeid.trim().toLowerCase(), employee])
  );

  return balances.map((balance) => {
    const employee = byId.get(balance.employeeId.trim().toLowerCase());
    return {
      ...balance,
      leaveId: balance.leaveId || buildLeaveId(balance.employeeId, balance.year),
      fullName: employee?.fullname || '',
      email: employee?.email || '',
      department: employee?.department || '',
      designation: employee?.designation || '',
      emsStatus: employee?.emsstatus || '',
    };
  });
}

export async function getLeaveBalanceById(leaveId: string): Promise<LeaveBalanceInput | null> {
  const id = leaveId.trim();
  if (!id) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('leaveid', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load leave balance: ${error.message}`);
  if (!data) return null;
  return mapDbRow(data as LeaveBalanceDbRow);
}

export async function getLeaveBalance(
  employeeId: string,
  year: number
): Promise<LeaveBalanceInput | null> {
  const leaveId = buildLeaveId(employeeId, year);

  if (leaveId) {
    const byId = await getLeaveBalanceById(leaveId);
    if (byId) return byId;
  }

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('employeeid', employeeId.trim())
    .eq('year', year)
    .maybeSingle();

  if (error) throw new Error(`Failed to load leave balance: ${error.message}`);
  if (!data) return null;
  return mapDbRow(data as LeaveBalanceDbRow);
}

function assertQuotaRules(input: LeaveBalanceInput) {
  if (input.annualUsed > input.annualQuota) {
    throw new Error('Annual Used cannot exceed Annual Quota.');
  }
  if (input.sickUsed > input.sickQuota) {
    throw new Error('Sick Used cannot exceed Sick Quota.');
  }
  if (input.casualUsed > input.casualQuota) {
    throw new Error('Casual Used cannot exceed Casual Quota.');
  }
}

/** Sheet / webhook column names for Leave Balance. */
export function toWebhookLeaveRow(input: LeaveBalanceInput) {
  const leaveId = input.leaveId || buildLeaveId(input.employeeId, input.year);
  return {
    LeaveID: leaveId,
    EmployeeID: input.employeeId,
    Year: input.year,
    AnnualQuota: input.annualQuota,
    AnnualUsed: input.annualUsed,
    SickQuota: input.sickQuota,
    SickUsed: input.sickUsed,
    CasualQuota: input.casualQuota,
    CasualUsed: input.casualUsed,
    CarryForwardDays: input.carryForwardDays,
  };
}

export async function upsertLeaveBalance(
  input: LeaveBalanceInput
): Promise<LeaveBalanceInput> {
  assertQuotaRules(input);
  const payload = toDbWrite({
    ...input,
    leaveId: input.leaveId || buildLeaveId(input.employeeId, input.year),
  });

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(payload, { onConflict: 'leaveid' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save leave balance: ${error.message}`);
  return mapDbRow(data as LeaveBalanceDbRow);
}

async function deleteLeaveBalanceById(leaveId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('leaveid', leaveId.trim());
  if (error) {
    throw new Error(`Failed to delete leave balance for rollback: ${error.message}`);
  }
}

async function restoreLeaveBalanceRow(row: LeaveBalanceDbRow): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).upsert(row, {
    onConflict: 'leaveid',
  });
  if (error) {
    throw new Error(`Failed to restore leave balance for rollback: ${error.message}`);
  }
}

export async function rollbackLeaveBalanceWrites(
  snapshots: Array<{ previous: LeaveBalanceDbRow | null; leaveId: string }>
): Promise<void> {
  for (const snapshot of snapshots) {
    if (snapshot.previous) {
      await restoreLeaveBalanceRow(snapshot.previous);
    } else {
      await deleteLeaveBalanceById(snapshot.leaveId);
    }
  }
}

/**
 * Dual-write leave balances: Supabase first, then n8n update-leave.
 * If the webhook write fails, Supabase changes are rolled back.
 */
export async function updateLeaveBalances(
  balances: LeaveBalanceInput[]
): Promise<{ message: string; data: LeaveBalanceInput[] }> {
  if (!balances.length) {
    throw new Error('No leave balances provided to update.');
  }

  const writes = balances.map((balance) => {
    assertQuotaRules(balance);
    const leaveId = balance.leaveId || buildLeaveId(balance.employeeId, balance.year);
    if (!leaveId) throw new Error('LeaveID is required.');
    return { ...balance, leaveId };
  });

  const snapshots: Array<{ previous: LeaveBalanceDbRow | null; leaveId: string }> = [];
  const saved: LeaveBalanceInput[] = [];

  try {
    for (const balance of writes) {
      const previousRaw =
        (await getLeaveBalanceById(balance.leaveId!)) ||
        (await getLeaveBalance(balance.employeeId, balance.year));
      const previous = previousRaw ? toDbSnapshot(previousRaw) : null;

      snapshots.push({
        previous,
        leaveId: balance.leaveId!,
      });
      saved.push(await upsertLeaveBalance(balance));
    }
  } catch (dbError) {
    try {
      await rollbackLeaveBalanceWrites(snapshots);
    } catch (rollbackError) {
      console.error('Failed to roll back leave balances after DB write failure:', rollbackError);
    }
    throw dbError;
  }

  const payload = {
    balances: writes.map(toWebhookLeaveRow),
  };

  try {
    const response = await fetch(SHEETS_WEBHOOKS.updateLeave, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await response.text();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'update-leave webhook not found (404). Start the n8n test workflow and try again.'
        );
      }
      throw new Error(text || `update-leave webhook returned status ${response.status}.`);
    }

    let message =
      writes.length === 1
        ? 'Leave balance saved.'
        : `Saved ${writes.length} leave balances.`;
    try {
      const parsed = text.trim() ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        message = String(
          (parsed as Record<string, unknown>).message ||
            (parsed as Record<string, unknown>).status ||
            message
        );
      }
    } catch {
      if (text.trim()) message = text.trim();
    }

    return { message, data: saved };
  } catch (sheetError) {
    try {
      await rollbackLeaveBalanceWrites(snapshots);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase leave balances after webhook failure:',
        rollbackError
      );
    }
    throw sheetError;
  }
}
