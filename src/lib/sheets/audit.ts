import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  dbRowToAuditLogRecord,
  deleteAuditLogDbRow,
  insertAuditLogDbRow,
  listAuditLogDbRows,
} from '@/lib/db/audit';
import type {
  AuditActor,
  AuditedMutationResult,
  AuditLogRecord,
  CreateAuditEventInput,
} from '@/types/audit';
import { SYSTEM_AUDIT_EMAIL } from '@/types/audit';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'bankaccountdetails',
  'supabaseuserid',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
]);

/**
 * Identity / summary fields always kept on UPDATE audits so reviewers can see
 * who/what was touched even when only a subset of fields changed.
 */
const AUDIT_CONTEXT_KEY_HINTS = new Set([
  'employeeid',
  'fullname',
  'name',
  'email',
  'phone',
  'department',
  'designation',
  'employeetype',
  'role',
  'emsstatus',
  'requestid',
  'leaveid',
  'recordid',
  'runid',
  'salaryid',
  'holidaydate',
  'holidayname',
  'account',
  'category',
  'transactiontype',
  'year',
  'period',
  'leavetype',
  'status',
  'startdate',
  'enddate',
  'uploadedby',
  'filename',
  'triggeredby',
  'month',
  'monthname',
]);

function sanitizeForAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (!value || typeof value !== 'object') return value ?? '';

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeForAudit(entry),
    ])
  );
}

function serializeAuditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(sanitizeForAudit(value));
}

function isContextKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (AUDIT_CONTEXT_KEY_HINTS.has(lower)) return true;
  // Catch PascalCase sheet keys like EmployeeID / FullName / Department.
  if (lower.endsWith('id') || lower.endsWith('name')) return true;
  return false;
}

function findKey(
  record: Record<string, unknown>,
  needle: string
): { key: string; value: unknown } | null {
  const lower = needle.toLowerCase();
  const match = Object.keys(record).find((key) => key.toLowerCase() === lower);
  if (!match) return null;
  return { key: match, value: record[match] };
}

/**
 * Builds old/new audit payloads for UPDATE:
 * - Always includes identity/context fields (id, name, department, …)
 * - Plus only the fields that actually changed
 * - Adds `changedFields` so the UI can highlight what moved
 */
export function diffAuditValues(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const oldChanges: Record<string, unknown> = {};
  const newChanges: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of keys) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      if (oldValue[key] !== newValue[key]) {
        oldChanges[key] = REDACTED;
        newChanges[key] = REDACTED;
        changedFields.push(key);
      }
      continue;
    }

    const before = oldValue[key] ?? '';
    const after = newValue[key] ?? '';
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      oldChanges[key] = before;
      newChanges[key] = after;
      changedFields.push(key);
    }
  }

  const oldOut: Record<string, unknown> = {};
  const newOut: Record<string, unknown> = {};

  // Prefer key casing from the new snapshot, then the old one.
  const contextKeyNames = new Map<string, string>();
  for (const key of Object.keys(newValue)) {
    if (isContextKey(key)) contextKeyNames.set(key.toLowerCase(), key);
  }
  for (const key of Object.keys(oldValue)) {
    if (isContextKey(key) && !contextKeyNames.has(key.toLowerCase())) {
      contextKeyNames.set(key.toLowerCase(), key);
    }
  }

  for (const [, preferredKey] of contextKeyNames) {
    const fromNew = findKey(newValue, preferredKey);
    const fromOld = findKey(oldValue, preferredKey);
    const key = fromNew?.key || fromOld?.key || preferredKey;
    oldOut[key] = fromOld?.value ?? fromNew?.value ?? '';
    newOut[key] = fromNew?.value ?? fromOld?.value ?? '';
  }

  for (const key of changedFields) {
    oldOut[key] = oldChanges[key];
    newOut[key] = newChanges[key];
  }

  if (changedFields.length > 0) {
    oldOut.changedFields = changedFields;
    newOut.changedFields = changedFields;
  }

  return { oldValue: oldOut, newValue: newOut };
}

export class AuditLogError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AuditLogError';
    this.status = status;
  }
}

async function webhookError(response: Response, fallback: string): Promise<AuditLogError> {
  let message = '';
  try {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      message = parsed.message || parsed.error || body;
    } catch {
      message = body;
    }
  } catch {
    // Use fallback.
  }
  return new AuditLogError(message || fallback, response.status);
}

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  try {
    const rows = await listAuditLogDbRows();
    return rows.map(dbRowToAuditLogRecord);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load audit logs from Supabase.';
    throw new AuditLogError(message, 500);
  }
}

export async function createAuditLog(
  actor: AuditActor,
  event: CreateAuditEventInput
): Promise<AuditLogRecord> {
  if (!actor.email.trim()) throw new AuditLogError('Audit actor email is required', 400);
  if (!event.action.trim()) throw new AuditLogError('Audit action is required', 400);
  if (!event.recordType.trim()) throw new AuditLogError('Audit record type is required', 400);
  if (!event.recordId.trim()) throw new AuditLogError('Audit record ID is required', 400);

  const draft: Omit<AuditLogRecord, 'logId'> = {
    timestamp: new Date().toISOString(),
    userEmail: actor.email.trim().toLowerCase(),
    action: event.action.trim().toUpperCase(),
    recordType: event.recordType.trim(),
    recordId: event.recordId.trim(),
    oldValue: serializeAuditValue(event.oldValue),
    newValue: serializeAuditValue(event.newValue),
  };

  // Dual-write: Supabase first (generates bigint logid), then Google Sheet.
  const dbRow = await insertAuditLogDbRow(draft);
  const record = dbRowToAuditLogRecord(dbRow);

  try {
    const response = await fetch(SHEETS_WEBHOOKS.createAudit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        LogID: record.logId,
        Timestamp: record.timestamp,
        UserEmail: record.userEmail,
        Action: record.action,
        RecordType: record.recordType,
        RecordID: record.recordId,
        OldValue: record.oldValue,
        NewValue: record.newValue,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw await webhookError(
        response,
        `create-audit webhook returned status ${response.status}.`
      );
    }
  } catch (sheetError) {
    try {
      await deleteAuditLogDbRow(dbRow.logid);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back Supabase auditlog after sheet write failure:',
        rollbackError
      );
    }
    throw sheetError;
  }

  return record;
}

/**
 * Best-effort audit for domain mutations. Never throws — business writes must
 * not fail because the audit dual-write failed.
 */
export async function logAuditBestEffort(
  actorEmail: string | null | undefined,
  event: CreateAuditEventInput,
  label = 'Audit'
): Promise<boolean> {
  const email = String(actorEmail || '').trim() || SYSTEM_AUDIT_EMAIL;
  try {
    await createAuditLog({ email }, event);
    return true;
  } catch (error) {
    console.error(`${label} delivery failed:`, error);
    return false;
  }
}

/**
 * Runs a sheet mutation, then records its audit event.
 * Audit failure never replays or rolls back a successful mutation; callers receive
 * auditLogged=false so they can surface/monitor the delivery failure safely.
 */
export async function runAuditedMutation<T>(
  actor: AuditActor,
  event: CreateAuditEventInput,
  mutation: () => Promise<T>
): Promise<AuditedMutationResult<T>> {
  const result = await mutation();

  try {
    await createAuditLog(actor, event);
    return { result, auditLogged: true };
  } catch (error) {
    console.error('Sheet mutation succeeded but audit delivery failed:', error);
    return { result, auditLogged: false };
  }
}
