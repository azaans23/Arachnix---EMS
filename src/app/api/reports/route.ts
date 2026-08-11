import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { buildReport } from '@/lib/reports/build-report';
import { exportReport } from '@/lib/reports/export';
import { listAccountingDirectorAccounts } from '@/lib/db/accounting';
import { ACCOUNTING_BANK_ACCOUNT } from '@/types/accounting';
import {
  REPORT_EXPORT_FORMATS,
  REPORT_TYPES,
  reportsForRole,
  type ReportExportFormat,
  type ReportType,
} from '@/types/search-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { role, errorResponse } = await verifyResourceAccess(request, 'reports', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || '') as ReportType;
    const format = (searchParams.get('format') || '') as ReportExportFormat;
    const month = searchParams.get('month') || undefined;
    const year = searchParams.get('year') || undefined;
    const account = searchParams.get('account') || undefined;
    const period = searchParams.get('period') || undefined;

    // Catalogue mode — list available reports + account options.
    if (!type) {
      const directors = await listAccountingDirectorAccounts().catch(() => []);
      return NextResponse.json({
        success: true,
        reports: reportsForRole(role!),
        accounts: [
          ACCOUNTING_BANK_ACCOUNT,
          ...directors.map((director) => director.name),
        ],
      });
    }

    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ success: false, error: 'Unknown report type.' }, { status: 400 });
    }

    const report = await buildReport({
      type,
      role: role!,
      month,
      year,
      account,
      period,
    });

    if (format) {
      if (!(REPORT_EXPORT_FORMATS as readonly string[]).includes(format)) {
        return NextResponse.json(
          { success: false, error: 'Format must be csv, xlsx, or pdf.' },
          { status: 400 }
        );
      }
      const file = exportReport(report, format);
      return new NextResponse(new Uint8Array(file.bytes), {
        status: 200,
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.fileName}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build report.';
    const status = /access/i.test(message) ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
