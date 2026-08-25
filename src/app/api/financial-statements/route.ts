import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { generateMonthlyStatements } from '@/lib/accounting/statements';
import { getMonthlyStatements } from '@/lib/db/financial-statements';
import { exportReport } from '@/lib/reports/export';
import { parsePeriodMonth } from '@/types/accounting';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import type { ReportExportFormat, ReportPayload } from '@/types/search-reports';
import { REPORT_EXPORT_FORMATS } from '@/types/search-reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function monthLabel(month: string) {
  const parsed = parsePeriodMonth(month);
  if (!parsed) return month;
  return `${parsed.label} ${parsed.year}`;
}

function money(value: number) {
  return Math.round(Number(value) || 0);
}

function statementReport(
  type: 'income' | 'balance' | 'cashflow',
  statements: Awaited<ReturnType<typeof getMonthlyStatements>>,
  generatedBy?: string
): ReportPayload | null {
  const label = `${monthLabel(statements.month)}`;
  if (type === 'income' && statements.income) {
    const row = statements.income;
    return {
      type: 'monthly_summary',
      title: 'Income statement',
      subtitle: label,
      generatedAt: row.generatedAt,
      generatedBy,
      columns: [
        { key: 'line', label: 'Line' },
        { key: 'amount', label: 'Amount (PKR)' },
      ],
      rows: [
        { line: 'Revenue', amount: money(row.revenue) },
        { line: 'Cost of services', amount: money(row.costOfServices) },
        { line: 'Gross profit', amount: money(row.grossProfit) },
        { line: 'Operating expense', amount: money(row.operatingExpense) },
        { line: 'Net income', amount: money(row.netIncome) },
      ],
    };
  }
  if (type === 'balance' && statements.balanceSheet) {
    const row = statements.balanceSheet;
    return {
      type: 'monthly_summary',
      title: 'Balance sheet',
      subtitle: label,
      generatedAt: row.generatedAt,
      generatedBy,
      columns: [
        { key: 'line', label: 'Line' },
        { key: 'amount', label: 'Amount (PKR)' },
      ],
      rows: [
        { line: 'Cash', amount: money(row.cash) },
        { line: 'Other assets', amount: money(row.otherAssets) },
        { line: 'Total assets', amount: money(row.totalAssets) },
        { line: 'Liabilities', amount: money(row.liabilities) },
        { line: 'Equity', amount: money(row.equity) },
        { line: 'Total liabilities and equity', amount: money(row.totalLiabilitiesAndEquity) },
        { line: 'Discrepancy', amount: money(row.discrepancy) },
      ],
      summary: [
        { label: 'Balanced', value: row.balanced ? 'Yes' : 'No' },
        { label: 'Discrepancy', value: String(money(row.discrepancy)) },
      ],
    };
  }
  if (type === 'cashflow' && statements.cashFlow) {
    const row = statements.cashFlow;
    return {
      type: 'monthly_summary',
      title: 'Cash flow statement',
      subtitle: label,
      generatedAt: row.generatedAt,
      generatedBy,
      columns: [
        { key: 'line', label: 'Line' },
        { key: 'amount', label: 'Amount (PKR)' },
      ],
      rows: [
        { line: 'Cash from operations', amount: money(row.cashFromOperations) },
        { line: 'Cash from investing', amount: money(row.cashFromInvesting) },
        { line: 'Cash from financing', amount: money(row.cashFromFinancing) },
        { line: 'Net change in cash', amount: money(row.netChangeInCash) },
      ],
    };
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'financial_statements',
      'read'
    );
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const month = (searchParams.get('month') || new Date().toISOString().slice(0, 7)).trim();
    if (!parsePeriodMonth(month)) {
      return NextResponse.json({ success: false, error: 'Month must be YYYY-MM.' }, { status: 400 });
    }

    const statements = await getMonthlyStatements(month);
    const format = (searchParams.get('format') || '') as ReportExportFormat;
    const statement = searchParams.get('statement') || '';

    if (format) {
      if (!(REPORT_EXPORT_FORMATS as readonly string[]).includes(format)) {
        return NextResponse.json(
          { success: false, error: 'Format must be csv, xlsx, or pdf.' },
          { status: 400 }
        );
      }
      if (statement !== 'income' && statement !== 'balance' && statement !== 'cashflow') {
        return NextResponse.json(
          { success: false, error: 'statement must be income, balance, or cashflow.' },
          { status: 400 }
        );
      }
      const report = statementReport(statement, statements, user?.email || undefined);
      if (!report) {
        return NextResponse.json(
          { success: false, error: 'No statement generated for this month yet.' },
          { status: 404 }
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

    return NextResponse.json({ success: true, data: statements });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load statements.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'financial_statements',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = await request.json().catch(() => ({}));
    const month = String(body.month || new Date().toISOString().slice(0, 7)).trim();
    const statements = await generateMonthlyStatements(month);

    await logAuditBestEffort(
      user?.email || 'finance',
      {
        action: AUDIT_ACTIONS.GENERATE,
        recordType: AUDIT_RECORD_TYPES.FINANCIAL_STATEMENT,
        recordId: month,
        newValue: {
          month,
          netIncome: statements.income?.netIncome,
          balanced: statements.balanceSheet?.balanced,
          discrepancy: statements.balanceSheet?.discrepancy,
          warnings: statements.income?.warnings,
        },
      },
      'Financial statements generate audit'
    );

    return NextResponse.json({
      success: true,
      data: statements,
      message: 'Statements generated.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate statements.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
