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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return '';
}

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

export function diffAuditValues(
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const oldChanges: Record<string, unknown> = {};
  const newChanges: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of keys) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      if (oldValue[key] !== newValue[key]) {
        oldChanges[key] = REDACTED;
        newChanges[key] = REDACTED;
      }
      continue;
    }

    const before = oldValue[key] ?? '';
    const after = newValue[key] ?? '';
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      oldChanges[key] = before;
      newChanges[key] = after;
    }
  }

  return { oldValue: oldChanges, newValue: newChanges };
}

export class AuditLogError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AuditLogError';
    this.status = status;
  }
}

/** n8n replies with this when a Webhook node responds before the workflow finishes. */
const N8N_ACK_MESSAGES = new Set(['workflow was started']);

const RESPOND_IMMEDIATELY_HINT =
  'The get-audit-log workflow acknowledged the request without returning any rows. ' +
  'In n8n, open that Webhook node and change "Respond" from "Immediately" to ' +
  '"When Last Node Finishes" (or add a "Respond to Webhook" node) so the AuditLog rows are sent back.';

/** n8n sometimes wraps each row as { json: {...} }. */
function unwrapN8nItem(value: unknown): unknown {
  const record = asRecord(value);
  const inner = record.json;
  return inner && typeof inner === 'object' ? inner : value;
}

function hasAuditIdentity(record: AuditLogRecord): boolean {
  return Boolean(
    record.logId || record.timestamp || record.userEmail || record.action || record.recordId
  );
}

export function mapRawToAuditLog(rawInput: unknown): AuditLogRecord {
  const raw = asRecord(rawInput);
  return {
    logId: pick(raw, 'LogID', 'logId', 'LogId', 'logid'),
    timestamp: pick(raw, 'Timestamp', 'timestamp'),
    userEmail: pick(raw, 'UserEmail', 'userEmail', 'useremail'),
    action: pick(raw, 'Action', 'action'),
    recordType: pick(raw, 'RecordType', 'recordType', 'recordtype'),
    recordId: pick(raw, 'RecordID', 'recordId', 'RecordId', 'recordid'),
    oldValue: serializeAuditValue(raw.OldValue ?? raw.oldValue ?? raw.oldvalue),
    newValue: serializeAuditValue(raw.NewValue ?? raw.newValue ?? raw.newvalue),
  };
}

export function normalizeAuditPayload(payload: unknown): AuditLogRecord[] {
  const root = asRecord(payload);

  if (!Array.isArray(payload) && typeof root.message === 'string') {
    if (N8N_ACK_MESSAGES.has(root.message.trim().toLowerCase())) {
      throw new AuditLogError(RESPOND_IMMEDIATELY_HINT, 502);
    }
  }

  const data = Array.isArray(payload)
    ? payload
    : (root.data ?? root.records ?? root.rows ?? payload);
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];

  return rows.map((row) => mapRawToAuditLog(unwrapN8nItem(row))).filter(hasAuditIdentity);
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
