import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { buildDashboardOverview } from '@/lib/reports/build-overview';

export const dynamic = 'force-dynamic';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const { role, errorResponse } = await verifyResourceAccess(request, 'dashboard', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('month') || '';
    const month = MONTH_PATTERN.test(requested)
      ? requested
      : new Date().toISOString().slice(0, 7);

    const data = await buildDashboardOverview(role!, month);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard overview.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
