import {
  allocateAccountingInvoiceReference,
  createAccountingRecord,
  deleteAccountingRecord,
  getAccountingRecord,
  normalizeAccountingUploadInput,
  toWebhookAccountingRow,
  updateAccountingRecordDriveLink,
} from '@/lib/db/accounting';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { diffAuditValues, logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES, SYSTEM_AUDIT_EMAIL } from '@/types/audit';
import {
  ACCOUNTING_ARCHIVE_GRACE_MINUTES,
  buildAccountingDriveFileName,
  isAllowedAccountingFileName,
  parsePeriodMonth,
  type AccountingRecord,
  type AccountingUploadInput,
} from '@/types/accounting';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Deadline for the Drive link to arrive before the record is rolled back. */
const ARCHIVE_DEADLINE_MS = ACCOUNTING_ARCHIVE_GRACE_MINUTES * 60_000;
const ARCHIVE_POLL_MS = 5_000;

export type PreparedAccountingUpload = {
  record: AccountingRecord;
  period: string;
  targetFileName: string;
  originalFileName: string;
  mimeType: string;
  bytes: Uint8Array;
  hasFile: boolean;
};

async function postAccountingUploadWebhook(form: FormData) {
  const response = await fetch(SHEETS_WEBHOOKS.uploadAccountingRecord, {
    method: 'POST',
    body: form,
    cache: 'no-store',
  });
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'create-transaction webhook not found (404). Start the n8n test workflow and try again.'
      );
    }
    throw new Error(text || `Accounting upload webhook returned status ${response.status}.`);
  }

  return text;
}

const DRIVE_LINK_KEYS = [
  'drivelink',
  'webviewlink',
  'webcontentlink',
  'filelink',
  'fileurl',
  'link',
  'url',
];
const DRIVE_ID_KEYS = ['fileid', 'driveid', 'id'];

function driveLinkFromId(id: string) {
  return /^[a-zA-Z0-9_-]{20,}$/.test(id) ? `https://drive.google.com/file/d/${id}/view` : '';
}

/**
 * n8n replies with whatever its last node emits, so the Drive link can sit at any
 * depth under several different keys. Walk the response and take the first hit.
 */
function extractDriveLink(value: unknown, depth = 0): string {
  if (depth > 6 || value == null) return '';

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractDriveLink(item, depth + 1);
      if (found) return found;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const entries = Object.entries(value as Record<string, unknown>);

  for (const [key, raw] of entries) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const name = key.toLowerCase();
    if (DRIVE_LINK_KEYS.includes(name) && /^https?:\/\//i.test(raw.trim())) {
      return raw.trim();
    }
    if (DRIVE_ID_KEYS.includes(name)) {
      const link = driveLinkFromId(raw.trim());
      if (link) return link;
    }
  }

  for (const [, raw] of entries) {
    const found = extractDriveLink(raw, depth + 1);
    if (found) return found;
  }

  return '';
}

/**
 * Creates the Supabase row and buffers the file so `after()` can upload without
 * depending on the original request stream.
 */
export async function startAccountingUpload(params: {
  fields: Record<string, unknown> | AccountingUploadInput;
  file: File | null;
  uploadedBy: string;
}): Promise<PreparedAccountingUpload> {
  const meta =
    'period' in params.fields && typeof (params.fields as AccountingUploadInput).amount === 'number'
      ? { ...(params.fields as AccountingUploadInput) }
      : normalizeAccountingUploadInput(params.fields as Record<string, unknown>);

  if (!String(meta.reference || '').trim()) {
    meta.reference = await allocateAccountingInvoiceReference();
  }

  if (!parsePeriodMonth(meta.period)) {
    throw new Error('Period must be YYYY-MM.');
  }

  const file = params.file && params.file.size > 0 ? params.file : null;
  let originalFileName = '';
  let targetFileName = '';
  let bytes = new Uint8Array();
  let mimeType = '';

  if (file) {
    originalFileName = file.name || 'upload.bin';
    if (!isAllowedAccountingFileName(originalFileName)) {
      throw new Error('File must be PDF, PNG, JPEG, CSV, Excel, or ZIP.');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error('File is too large (max 20 MB).');
    }

    targetFileName = buildAccountingDriveFileName({
      date: `${meta.period}-01`,
      account: meta.account,
      transactionType: meta.transactionType,
      clientVendor: meta.clientVendor,
      amount: meta.amount,
      reference: meta.reference,
      originalFileName,
    });
    bytes = new Uint8Array(await file.arrayBuffer());
    mimeType = file.type || 'application/octet-stream';
  }

  const record = await createAccountingRecord({
    meta,
    fileName: targetFileName,
    uploadedBy: params.uploadedBy,
  });

  await logAuditBestEffort(
    params.uploadedBy,
    {
      action: AUDIT_ACTIONS.UPLOAD,
      recordType: AUDIT_RECORD_TYPES.ACCOUNTING_RECORD,
      recordId: record.recordId,
      newValue: {
        recordId: record.recordId,
        period: meta.period,
        account: record.account,
        category: record.category,
        transactionType: record.transactionType,
        statementCategory: record.statementCategory,
        amount: record.amount,
        currency: record.currency,
        clientVendor: record.clientVendor,
        reference: record.reference,
        fileName: record.fileName,
        uploadedBy: record.uploadedBy,
        status: record.status,
      },
    },
    'Accounting upload audit'
  );

  return {
    record,
    period: meta.period,
    targetFileName,
    originalFileName,
    mimeType,
    bytes,
    hasFile: Boolean(file),
  };
}

/**
 * Drive/Sheet pipeline for one upload. The Supabase row already exists, so every
 * failure path here has to remove it again:
 *
 * 1. Webhook unreachable or non-2xx → roll back immediately.
 * 2. Webhook answers 200 but the body carries an n8n error → roll back immediately.
 * 3. Webhook answers with a Drive link → store it; the upload is done.
 * 4. Webhook only acknowledges (`Workflow was started`) → wait up to
 *    ACCOUNTING_ARCHIVE_GRACE_MINUTES for the link to land, then roll back.
 */
export async function dispatchAccountingUploadWebhook(
  prepared: PreparedAccountingUpload
): Promise<void> {
  const form = new FormData();
  if (prepared.hasFile) {
    const blob = new Blob([Buffer.from(prepared.bytes)], { type: prepared.mimeType });
    form.append('file', blob, prepared.targetFileName);
    form.append('targetFileName', prepared.targetFileName);
    form.append('originalFileName', prepared.originalFileName);
  }
  form.append('record', JSON.stringify(toWebhookAccountingRow(prepared.record, prepared.period)));
  form.append('action', 'upload');

  let responseText: string;
  try {
    responseText = await postAccountingUploadWebhook(form);
  } catch (error) {
    if (prepared.hasFile) {
      await rollbackAccountingUpload(
        prepared,
        error instanceof Error ? error.message : 'webhook failed'
      );
    }
    throw error;
  }

  const workflowError = parseWorkflowError(responseText);
  if (workflowError) {
    if (prepared.hasFile) {
      await rollbackAccountingUpload(prepared, workflowError);
    }
    throw new Error(`Accounting workflow failed: ${workflowError}`);
  }

  if (!prepared.hasFile) return;

  const driveLink = parseDriveLink(responseText);
  if (driveLink) {
    try {
      const updated = await updateAccountingRecordDriveLink(prepared.record.recordId, { driveLink });
      await logAuditBestEffort(
        SYSTEM_AUDIT_EMAIL,
        {
          action: AUDIT_ACTIONS.UPDATE,
          recordType: AUDIT_RECORD_TYPES.ACCOUNTING_RECORD,
          recordId: prepared.record.recordId,
          ...diffAuditValues(
            {
              recordId: prepared.record.recordId,
              account: prepared.record.account,
              category: prepared.record.category,
              transactionType: prepared.record.transactionType,
              amount: prepared.record.amount,
              currency: prepared.record.currency,
              clientVendor: prepared.record.clientVendor,
              reference: prepared.record.reference,
              uploadedBy: prepared.record.uploadedBy,
              status: prepared.record.status,
              fileName: prepared.record.fileName,
              driveLink: prepared.record.driveLink || '',
            },
            {
              recordId: updated.recordId,
              account: updated.account,
              category: updated.category,
              transactionType: updated.transactionType,
              amount: updated.amount,
              currency: updated.currency,
              clientVendor: updated.clientVendor,
              reference: updated.reference,
              uploadedBy: updated.uploadedBy,
              status: updated.status,
              fileName: updated.fileName,
              driveLink: updated.driveLink || '',
            }
          ),
        },
        'Accounting Drive link audit'
      );
      return;
    } catch (error) {
      // File is archived; only our write-back failed. Keep the row and let n8n PATCH it.
      console.error('Failed to store Drive link for accounting record:', error);
      return;
    }
  }

  await awaitDriveLinkOrRollback(prepared);
}

/**
 * n8n acknowledged the request without returning a link, so the only proof the
 * workflow finished is a DriveLink appearing on the row (written by n8n's callback
 * to PATCH /api/accounting-records/<id>). Poll until the deadline, then treat the
 * workflow as broken and remove the record so Supabase never keeps an orphan.
 */
async function awaitDriveLinkOrRollback(prepared: PreparedAccountingUpload): Promise<void> {
  const deadline = Date.now() + ARCHIVE_DEADLINE_MS;

  while (Date.now() < deadline) {
    await sleep(Math.min(ARCHIVE_POLL_MS, Math.max(0, deadline - Date.now())));

    let current: AccountingRecord | null;
    try {
      current = await getAccountingRecord(prepared.record.recordId);
    } catch (error) {
      console.error('Failed to check Drive link for accounting record:', error);
      continue;
    }

    if (!current) return; // Already removed elsewhere.
    if (current.driveLink.trim()) return; // n8n wrote the link back: success.
  }

  await rollbackAccountingUpload(
    prepared,
    `no Drive link after ${ACCOUNTING_ARCHIVE_GRACE_MINUTES} minute(s)`
  );
}

async function rollbackAccountingUpload(
  prepared: PreparedAccountingUpload,
  reason: string
): Promise<void> {
  try {
    await deleteAccountingRecord(prepared.record.recordId);
    console.error(
      `Rolled back accounting record ${prepared.record.recordId} (${prepared.targetFileName}): ${reason}.`
    );
  } catch (error) {
    console.error(
      `Failed to roll back accounting record ${prepared.record.recordId} after ${reason}:`,
      error
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDriveLink(responseText: string): string {
  const text = responseText.trim();
  if (!text) return '';
  try {
    return extractDriveLink(JSON.parse(text));
  } catch {
    const match = /https:\/\/(?:drive|docs)\.google\.com\/[^\s"'<>]+/i.exec(text);
    return match?.[0] || '';
  }
}

const WORKFLOW_ERROR_KEYS = ['error', 'errormessage', 'errordescription', 'stack'];
/** n8n returns HTTP 200 for some failures, with the reason in the body. */
const WORKFLOW_ERROR_TEXT =
  /\b(error|failed|failure|could not|cannot|not registered|unauthorized|forbidden|timed out|timeout)\b/i;

function parseWorkflowError(responseText: string): string {
  const text = responseText.trim();
  if (!text) return '';
  try {
    return extractWorkflowError(JSON.parse(text));
  } catch {
    return WORKFLOW_ERROR_TEXT.test(text) ? text.slice(0, 300) : '';
  }
}

function extractWorkflowError(value: unknown, depth = 0): string {
  if (depth > 6 || value == null) return '';

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractWorkflowError(item, depth + 1);
      if (found) return found;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const entries = Object.entries(value as Record<string, unknown>);

  for (const [key, raw] of entries) {
    const name = key.toLowerCase();
    if (WORKFLOW_ERROR_KEYS.includes(name)) {
      const text = typeof raw === 'string' ? raw.trim() : raw ? JSON.stringify(raw) : '';
      if (text) return text.slice(0, 300);
    }
    if (name === 'message' && typeof raw === 'string' && WORKFLOW_ERROR_TEXT.test(raw)) {
      return raw.trim().slice(0, 300);
    }
  }

  for (const [, raw] of entries) {
    const found = extractWorkflowError(raw, depth + 1);
    if (found) return found;
  }

  return '';
}
