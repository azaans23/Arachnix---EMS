import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  OffboardingChecklistItem,
  OffboardingRecord,
  OffboardingStatus,
} from '@/types/offboarding';
import { OFFBOARDING_CHECKLIST_ITEMS, OFFBOARDING_STATUSES } from '@/types/offboarding';

export type OffboardingDbRow = {
  offboardingid: number;
  employeeid: string;
  status: string;
  lastworkingdate: string | null;
  reason: string | null;
  notes: string | null;
  initiatedby: string;
  initiatedat: string;
  completedby: string | null;
  completedat: string | null;
  checklist: OffboardingChecklistItem[] | null;
  monthlysalary: number;
  unusedleavedays: number;
  dailyrate: number;
  leaveencashment: number;
  daysworked: number;
  proratedsalary: number;
  unpaiddays: number;
  unpaiddeduction: number;
  otheradditions: number;
  otherdeductions: number;
  netsettlement: number;
};

const TABLE = 'offboardings';

export function defaultOffboardingChecklist(): OffboardingChecklistItem[] {
  return OFFBOARDING_CHECKLIST_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    automatic: item.automatic,
    done: false,
    doneAt: '',
  }));
}

export function dbRowToOffboardingRecord(
  row: OffboardingDbRow,
  employee?: { fullName?: string; email?: string; department?: string }
): OffboardingRecord {
  return {
    offboardingId: String(row.offboardingid),
    employeeId: row.employeeid,
    fullName: employee?.fullName || '',
    email: employee?.email || '',
    department: employee?.department || '',
    status: row.status,
    lastWorkingDate: row.lastworkingdate ? String(row.lastworkingdate).slice(0, 10) : '',
    reason: row.reason || '',
    notes: row.notes || '',
    initiatedBy: row.initiatedby,
    initiatedAt: row.initiatedat,
    completedBy: row.completedby || '',
    completedAt: row.completedat || '',
    checklist: Array.isArray(row.checklist) ? row.checklist : defaultOffboardingChecklist(),
    monthlySalary: Number(row.monthlysalary || 0),
    unusedLeaveDays: Number(row.unusedleavedays || 0),
    dailyRate: Number(row.dailyrate || 0),
    leaveEncashment: Number(row.leaveencashment || 0),
    daysInMonth: 0,
    daysWorked: Number(row.daysworked || 0),
    proratedSalary: Number(row.proratedsalary || 0),
    unpaidDays: Number(row.unpaiddays || 0),
    unpaidDeduction: Number(row.unpaiddeduction || 0),
    otherAdditions: Number(row.otheradditions || 0),
    otherDeductions: Number(row.otherdeductions || 0),
    netSettlement: Number(row.netsettlement || 0),
  };
}

export async function insertOffboardingDbRow(input: {
  employeeId: string;
  initiatedBy: string;
  reason?: string;
  lastWorkingDate?: string;
  checklist: OffboardingChecklistItem[];
}): Promise<OffboardingDbRow> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      employeeid: input.employeeId.trim(),
      status: OFFBOARDING_STATUSES.INITIATED,
      initiatedby: input.initiatedBy.trim().toLowerCase(),
      reason: input.reason?.trim() || null,
      lastworkingdate: input.lastWorkingDate?.trim() || null,
      checklist: input.checklist,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to start offboarding: ${error.message}`);
  return data as OffboardingDbRow;
}

export async function getOffboardingDbRow(offboardingId: string): Promise<OffboardingDbRow | null> {
  const id = Number(offboardingId);
  if (!Number.isFinite(id)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('offboardingid', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load offboarding: ${error.message}`);
  return (data as OffboardingDbRow | null) ?? null;
}

export async function getOpenOffboardingForEmployee(
  employeeId: string
): Promise<OffboardingDbRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('employeeid', employeeId.trim())
    .eq('status', OFFBOARDING_STATUSES.INITIATED)
    .maybeSingle();
  if (error) throw new Error(`Failed to load offboarding: ${error.message}`);
  return (data as OffboardingDbRow | null) ?? null;
}

export async function listOffboardingDbRows(employeeId?: string): Promise<OffboardingDbRow[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');
  if (employeeId?.trim()) query = query.eq('employeeid', employeeId.trim());
  const { data, error } = await query.order('initiatedat', { ascending: false });
  if (error) throw new Error(`Failed to list offboardings: ${error.message}`);
  return (data as OffboardingDbRow[]) || [];
}

export async function updateOffboardingDbRow(
  offboardingId: string,
  patch: Record<string, unknown>
): Promise<OffboardingDbRow> {
  const id = Number(offboardingId);
  if (!Number.isFinite(id)) throw new Error('Invalid offboarding ID.');
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(patch)
    .eq('offboardingid', id)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update offboarding: ${error.message}`);
  return data as OffboardingDbRow;
}

/** Compensating delete when the initial n8n/Sheet write fails. */
export async function deleteOffboardingDbRow(offboardingId: string | number): Promise<void> {
  const id = Number(offboardingId);
  if (!Number.isFinite(id)) return;
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('offboardingid', id);
  if (error) throw new Error(`Failed to roll back offboarding create: ${error.message}`);
}

/** Restore the exact row captured before a failed n8n/Sheet update. */
export async function restoreOffboardingDbRow(row: OffboardingDbRow): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(row, { onConflict: 'offboardingid' });
  if (error) throw new Error(`Failed to roll back offboarding update: ${error.message}`);
}

export function assertOpenStatus(status: string): void {
  if (status !== OFFBOARDING_STATUSES.INITIATED) {
    throw new Error(`Offboarding is already ${status}.`);
  }
}

export type { OffboardingStatus };
