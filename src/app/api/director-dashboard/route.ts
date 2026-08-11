import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { buildDirectorDashboard } from '@/lib/reports/build-report';
import { normalizeRole, ROLES } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/**
 * Read-only financial + headcount snapshot for Directors (also usable by
 * Super Admin / Finance for the same overview).
 */
export async function GET(request: Request) {
  try {
    const { role, errorResponse } = await verifyResourceAccess(request, 'dashboard', 'read');
    if (errorResponse) return errorResponse;

    const normalized = normalizeRole(role!);
    const allowed =
      normalized === ROLES.DIRECTOR ||
      normalized === ROLES.SUPER_ADMIN ||
      normalized === ROLES.FINANCE_MANAGER;
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: director dashboard is not available for this role.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const data = await buildDirectorDashboard(month);

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load director dashboard.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
