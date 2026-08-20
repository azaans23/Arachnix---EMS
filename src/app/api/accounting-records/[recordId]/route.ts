import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getAccountingRecord, updateAccountingRecordDriveLink } from '@/lib/db/accounting';
import { diffAuditValues, logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES, SYSTEM_AUDIT_EMAIL } from '@/types/audit';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ recordId: string }>;
};

/**
 * n8n can call this after Drive upload to write DriveLink back.
 * Prefer updating Supabase directly from n8n with the service role key;
 * this route is a fallback for authenticated app users / testing.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'accounting_records', 'read');
    if (errorResponse) return errorResponse;

    const { recordId } = await context.params;
    const record = await getAccountingRecord(recordId);
    if (!record) {
      return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: record });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load record.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** n8n authenticates with a shared secret instead of a user session. */
function isTrustedCallback(request: Request): boolean {
  const secret = (process.env.ACCOUNTING_CALLBACK_SECRET || '').trim();
  if (!secret) return false;
  const provided = (request.headers.get('x-webhook-secret') || '').trim();
  return provided.length > 0 && provided === secret;
}

function driveLinkFrom(body: Record<string, unknown>): string | undefined {
  const direct = body.driveLink ?? body.DriveLink ?? body.webViewLink;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  const fileId = body.fileId ?? body.FileID ?? body.id;
  const id = String(fileId ?? '').trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(id)) {
    return `https://drive.google.com/file/d/${id}/view`;
  }
  return undefined;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    let actorEmail = SYSTEM_AUDIT_EMAIL;
    if (!isTrustedCallback(request)) {
      const { user, errorResponse } = await verifyResourceAccess(
        request,
        'accounting_records',
        'write'
      );
      if (errorResponse) return errorResponse;
      actorEmail = user?.email || SYSTEM_AUDIT_EMAIL;
    }

    const { recordId } = await context.params;
    const previous = await getAccountingRecord(recordId);
    const body = (await request.json()) as Record<string, unknown>;
    const record = await updateAccountingRecordDriveLink(recordId, {
      driveLink: driveLinkFrom(body),
      fileName: body.fileName != null ? String(body.fileName) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
    });

    await logAuditBestEffort(
      actorEmail,
      {
        action: AUDIT_ACTIONS.UPDATE,
        recordType: AUDIT_RECORD_TYPES.ACCOUNTING_RECORD,
        recordId,
        ...diffAuditValues(
          {
            recordId: previous?.recordId || recordId,
            account: previous?.account || '',
            category: previous?.category || '',
            transactionType: previous?.transactionType || '',
            amount: previous?.amount ?? '',
            currency: previous?.currency || '',
            clientVendor: previous?.clientVendor || '',
            reference: previous?.reference || '',
            uploadedBy: previous?.uploadedBy || '',
            status: previous?.status || '',
            driveLink: previous?.driveLink || '',
            fileName: previous?.fileName || '',
            notes: previous?.notes || '',
          },
          {
            recordId: record.recordId,
            account: record.account,
            category: record.category,
            transactionType: record.transactionType,
            amount: record.amount,
            currency: record.currency,
            clientVendor: record.clientVendor,
            reference: record.reference,
            uploadedBy: record.uploadedBy,
            status: record.status,
            driveLink: record.driveLink || '',
            fileName: record.fileName || '',
            notes: record.notes || '',
          }
        ),
      },
      'Accounting Drive link audit'
    );

    return NextResponse.json({ success: true, data: record });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update record.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
