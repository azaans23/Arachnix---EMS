import { after, NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import {
  buildAccountingDashboardMetrics,
  listAccountingDirectorAccounts,
  listAccountingRecords,
} from '@/lib/db/accounting';
import { dispatchAccountingUploadWebhook, startAccountingUpload } from '@/lib/accounting/upload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// after() waits up to ACCOUNTING_ARCHIVE_GRACE_MINUTES for the Drive link, so the
// invocation budget has to outlast that window plus the upload itself.
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'accounting_records', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const account = searchParams.get('account') || undefined;
    const category = searchParams.get('category') || undefined;
    const month =
      searchParams.get('month') ||
      searchParams.get('period') ||
      new Date().toISOString().slice(0, 7);

    const records = await listAccountingRecords({ account, category });
    const metrics = buildAccountingDashboardMetrics(records, month);
    const directors = await listAccountingDirectorAccounts().catch((error) => {
      console.error('Failed to load director accounts:', error);
      return [];
    });

    const filtered =
      searchParams.get('month') || searchParams.get('period')
        ? records.filter((row) => row.uploadDate.startsWith(month))
        : records;

    return NextResponse.json({
      success: true,
      data: filtered,
      metrics,
      directors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load accounting records.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'accounting_records',
      'write'
    );
    if (errorResponse) return errorResponse;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A file is required.' }, { status: 400 });
    }

    const fields: Record<string, unknown> = {};
    for (const key of [
      'period',
      'account',
      'category',
      'transactionType',
      'amount',
      'currency',
      'clientVendor',
      'source',
      'destination',
      'reference',
      'notes',
    ]) {
      const value = form.get(key);
      if (typeof value === 'string') fields[key] = value;
    }

    const prepared = await startAccountingUpload({
      fields,
      file,
      uploadedBy: user?.email || 'finance',
    });

    // Non-blocking: respond to the UI immediately; Drive/Sheet continue in after(),
    // which also owns the rollback if the workflow never returns a Drive link.
    after(async () => {
      try {
        await dispatchAccountingUploadWebhook(prepared);
      } catch (error) {
        console.error('Accounting Drive upload failed:', error);
      }
    });

    return NextResponse.json({
      success: true,
      data: { ...prepared.record, period: prepared.period, pendingDrive: true },
      message: 'Upload accepted. Drive archival is running in the background.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload accounting file.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
