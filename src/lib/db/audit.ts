import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { AuditLogRecord } from '@/types/audit';

/** Matches public.auditlog columns (sheet schema, lowercased by Postgres). */
export type AuditLogDbRow = {
  logid: number;
  timestamp: string;
  useremail: string;
  action: string;
  recordtype: string;
  recordid: string;
  oldvalue: unknown | null;
  newvalue: unknown | null;
};

const TABLE = 'auditlog';

function toJsonbValue(value: string): unknown | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function toAuditLogInsert(record: Omit<AuditLogRecord, 'logId'> & { logId?: string }): {
  timestamp: string;
  useremail: string;
  action: string;
  recordtype: string;
  recordid: string;
  oldvalue: unknown | null;
  newvalue: unknown | null;
} {
  return {
    timestamp: record.timestamp,
    useremail: record.userEmail.trim().toLowerCase(),
    action: String(record.action).trim().toUpperCase(),
    recordtype: record.recordType.trim(),
    recordid: record.recordId.trim(),
    oldvalue: toJsonbValue(record.oldValue),
    newvalue: toJsonbValue(record.newValue),
  };
}

export async function insertAuditLogDbRow(
  record: Omit<AuditLogRecord, 'logId'> & { logId?: string }
): Promise<AuditLogDbRow> {
  const row = toAuditLogInsert(record);

  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select('*').single();

  if (error) {
    throw new Error(`Supabase auditlog insert failed: ${error.message}`);
  }

  return data as AuditLogDbRow;
}

export async function deleteAuditLogDbRow(logId: number | string): Promise<void> {
  const id = typeof logId === 'number' ? logId : Number(logId);
  if (!Number.isFinite(id)) return;

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('logid', id);
  if (error) {
    throw new Error(`Supabase auditlog delete failed: ${error.message}`);
  }
}

export async function listAuditLogDbRows(): Promise<AuditLogDbRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    throw new Error(`Supabase auditlog list failed: ${error.message}`);
  }

  return (data as AuditLogDbRow[]) || [];
}

/**
 * Record IDs of the given type that already have an audit entry whose action is
 * not in `ignoreActions`. Used to keep background reconciliation idempotent.
 */
export async function listAuditedRecordIds(params: {
  recordType: string;
  recordIds: string[];
  ignoreActions?: string[];
}): Promise<Set<string>> {
  const ids = params.recordIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) return new Set();

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('recordid, action')
    .eq('recordtype', params.recordType)
    .in('recordid', ids);

  if (error) {
    throw new Error(`Supabase auditlog lookup failed: ${error.message}`);
  }

  const ignored = new Set((params.ignoreActions || []).map((action) => action.toUpperCase()));
  const audited = new Set<string>();
  for (const row of (data as Array<{ recordid: string; action: string }>) || []) {
    if (ignored.has(String(row.action || '').toUpperCase())) continue;
    audited.add(String(row.recordid));
  }

  return audited;
}

export function dbRowToAuditLogRecord(row: AuditLogDbRow): AuditLogRecord {
  return {
    logId: String(row.logid),
    timestamp: row.timestamp,
    userEmail: row.useremail,
    action: row.action,
    recordType: row.recordtype,
    recordId: row.recordid,
    oldValue:
      row.oldvalue == null
        ? ''
        : typeof row.oldvalue === 'string'
          ? row.oldvalue
          : JSON.stringify(row.oldvalue),
    newValue:
      row.newvalue == null
        ? ''
        : typeof row.newvalue === 'string'
          ? row.newvalue
          : JSON.stringify(row.newvalue),
  };
}
