import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { dbRowToSalaryHistoryRecord, listSalaryHistoryDbRows } from '@/lib/db/salary-history';

export const dynamic = 'force-dynamic';

/** GET — append-only compensation history. Optional `employeeId` filter. */
export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim() || undefined;
    const rows = await listSalaryHistoryDbRows({ employeeId });

    return NextResponse.json({
      success: true,
      data: rows.map(dbRowToSalaryHistoryRecord),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load salary history.';
    console.error('[GET /api/salary-history]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
