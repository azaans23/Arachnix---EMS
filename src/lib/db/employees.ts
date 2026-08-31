import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { EmployeeRecord, EmployeeWriteInput } from '@/types/employee';

/** Matches public.employees columns (sheet schema, lowercased by Postgres). */
export type EmployeeDbRow = {
  employeeid: string;
  fullname: string;
  email: string;
  phone: string | null;
  dob: string | null;
  address: string | null;
  department: string;
  designation: string;
  employeetype: string;
  joiningdate: string;
  probationenddate: string | null;
  contractenddate: string | null;
  role: string;
  supabaseuserid: string | null;
  emsstatus: string;
  isdirector: boolean;
  hasfinanceaccess: boolean;
  createdat?: string;
  updatedat?: string;
};

const TABLE = 'employees';

function emptyToNull(value: string): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function toDateValue(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function toDateOrNull(value: string): string | null {
  return emptyToNull(toDateValue(value));
}

function toUuidOrNull(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed;
}

export function toEmployeeDbRow(input: EmployeeWriteInput): EmployeeDbRow {
  const joiningdate = toDateValue(input.joiningDate);
  if (!joiningdate) {
    throw new Error('Joining date is required for Supabase employees write.');
  }

  return {
    employeeid: input.employeeId.trim(),
    fullname: input.name.trim(),
    email: input.email.trim(),
    phone: emptyToNull(input.phone),
    dob: toDateOrNull(input.dob),
    address: emptyToNull(input.address),
    department: input.department.trim(),
    designation: input.designation.trim(),
    employeetype: input.employmentType.trim(),
    joiningdate,
    probationenddate: toDateOrNull(input.probationEndDate),
    contractenddate: toDateOrNull(input.contractEndDate),
    role: input.role.trim(),
    supabaseuserid: toUuidOrNull(input.supabaseUserId),
    emsstatus: (input.emsStatus || 'Active').trim() || 'Active',
    isdirector: Boolean(input.isDirector),
    hasfinanceaccess:
      Boolean(input.hasFinanceAccess) &&
      String(input.role || '')
        .toLowerCase()
        .includes('hr'),
    updatedat: new Date().toISOString(),
  };
}

export async function getEmployeeDbRow(employeeId: string): Promise<EmployeeDbRow | null> {
  const id = employeeId.trim();
  if (!id) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('employeeid', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase employees read failed: ${error.message}`);
  }

  return (data as EmployeeDbRow | null) ?? null;
}

export async function listEmployeeDbRows(): Promise<EmployeeDbRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .order('employeeid', { ascending: true });

  if (error) {
    throw new Error(`Supabase employees list failed: ${error.message}`);
  }

  return (data as EmployeeDbRow[]) || [];
}

/**
 * Case-insensitive exact match on a single column. Lookup values are
 * user-supplied, so pattern metacharacters are escaped (and `*`, which
 * PostgREST rewrites to `%`, is rejected) to stop a wildcard from matching an
 * arbitrary row instead of returning "not found".
 */
async function findEmployeeDbRowByColumn(
  column: 'employeeid' | 'email',
  value: string
): Promise<EmployeeDbRow | null> {
  if (value.includes('*')) return null;
  const pattern = value.replace(/[\\%_]/g, (char) => `\\${char}`);

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .ilike(column, pattern)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase employees read failed: ${error.message}`);
  }

  return (data as EmployeeDbRow | null) ?? null;
}

export async function findEmployeeDbRowByIdOrEmail(
  candidates: Set<string>
): Promise<EmployeeDbRow | null> {
  if (candidates.size === 0) return null;

  const values = [...candidates];

  // Prefer exact employee ID matches first.
  for (const value of values) {
    if (!value) continue;
    const row = await findEmployeeDbRowByColumn('employeeid', value);
    if (row) return row;
  }

  // Then email matches.
  for (const value of values) {
    if (!value.includes('@')) continue;
    const row = await findEmployeeDbRowByColumn('email', value);
    if (row) return row;
  }

  return null;
}

/** Map a DB row into the app's EmployeeRecord + sheet-shaped raw for UI passthrough. */
export function dbRowToEmployeeRecord(row: EmployeeDbRow): EmployeeRecord {
  const dob = row.dob ? String(row.dob).slice(0, 10) : '';
  const joiningDate = row.joiningdate ? String(row.joiningdate).slice(0, 10) : '';
  const probationEndDate = row.probationenddate
    ? String(row.probationenddate).slice(0, 10)
    : '';
  const contractEndDate = row.contractenddate ? String(row.contractenddate).slice(0, 10) : '';
  const supabaseUserId = row.supabaseuserid ? String(row.supabaseuserid) : '';

  const raw: Record<string, unknown> = {
    EmployeeID: row.employeeid,
    FullName: row.fullname,
    Email: row.email,
    Phone: row.phone || '',
    DOB: dob,
    Address: row.address || '',
    Department: row.department,
    Designation: row.designation,
    EmployeeType: row.employeetype,
    JoiningDate: joiningDate,
    ProbationEndDate: probationEndDate,
    ContractEndDate: contractEndDate,
    Role: row.role,
    SupabaseUserID: supabaseUserId,
    EMSStatus: row.emsstatus || 'Inactive',
    IsDirector: row.isdirector ? 'TRUE' : 'FALSE',
    HasFinanceAccess: row.hasfinanceaccess ? 'TRUE' : 'FALSE',
  };

  const roleLabel = String(row.role || 'Employee');

  return {
    employeeId: String(row.employeeid || ''),
    fullName: String(row.fullname || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    dob,
    address: String(row.address || ''),
    department: String(row.department || ''),
    designation: String(row.designation || ''),
    employeeType: String(row.employeetype || ''),
    joiningDate,
    probationEndDate,
    contractEndDate,
    role: roleLabel,
    supabaseUserId,
    emsStatus: String(row.emsstatus || 'Inactive'),
    isDirector: Boolean(row.isdirector),
    hasFinanceAccess: Boolean(row.hasfinanceaccess),
    raw,
  };
}

export async function upsertEmployeeDbRow(input: EmployeeWriteInput): Promise<EmployeeDbRow> {
  const row = toEmployeeDbRow(input);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(row, { onConflict: 'employeeid' })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Supabase employees upsert failed: ${error.message}`);
  }

  return data as EmployeeDbRow;
}

export async function deleteEmployeeDbRow(employeeId: string): Promise<void> {
  const id = employeeId.trim();
  if (!id) return;

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('employeeid', id);
  if (error) {
    throw new Error(`Supabase employees delete failed: ${error.message}`);
  }
}

/** Restore a prior row snapshot (used when the sheet write fails after a DB upsert). */
export async function restoreEmployeeDbRow(row: EmployeeDbRow): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        ...row,
        updatedat: new Date().toISOString(),
      },
      { onConflict: 'employeeid' }
    );

  if (error) {
    throw new Error(`Supabase employees restore failed: ${error.message}`);
  }
}

/**
 * Compensating rollback for a failed dual-write:
 * - If the row did not exist before → delete the new row
 * - If it did → restore the previous snapshot
 * - If the employee ID changed → also remove the new ID row when restoring
 */
export async function rollbackEmployeeDbWrite(options: {
  previous: EmployeeDbRow | null;
  writtenEmployeeId: string;
}): Promise<void> {
  const { previous, writtenEmployeeId } = options;
  const writtenId = writtenEmployeeId.trim();

  if (!previous) {
    await deleteEmployeeDbRow(writtenId);
    return;
  }

  if (previous.employeeid !== writtenId) {
    await deleteEmployeeDbRow(writtenId);
  }

  await restoreEmployeeDbRow(previous);
}
