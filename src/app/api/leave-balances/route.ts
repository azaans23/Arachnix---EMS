import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import {
  getLeaveBalance,
  listLeaveBalances,
  normalizeLeaveBalanceInput,
  updateLeaveBalances,
} from '@/lib/db/leave-balances';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'leave_balances', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const yearRaw = searchParams.get('year')?.trim();
    const employeeId = searchParams.get('employeeId')?.trim() || undefined;
    const year = yearRaw ? Number(yearRaw) : undefined;

    if (yearRaw && (!Number.isInteger(year) || !year)) {
      return NextResponse.json(
        { success: false, error: 'Year must be a valid calendar year.' },
        { status: 400 }
      );
    }

    if (employeeId && year) {
      const balance = await getLeaveBalance(employeeId, year);
      return NextResponse.json({
        success: true,
        data: balance ? [balance] : [],
      });
    }

    const balances = await listLeaveBalances({ year, employeeId });
    return NextResponse.json({ success: true, data: balances });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load leave balances.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'leave_balances', 'write');
    if (errorResponse) return errorResponse;

    const body = (await request.json()) as Record<string, unknown>;
    const rows = Array.isArray(body.balances)
      ? body.balances
      : body.employeeId || body.EmployeeID
        ? [body]
        : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No leave balance payload provided.' },
        { status: 400 }
      );
    }

    const balances = rows.map((row) =>
      normalizeLeaveBalanceInput((row || {}) as Record<string, unknown>)
    );
    const result = await updateLeaveBalances(balances);

    return NextResponse.json({
      success: true,
      data: result.data,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save leave balance.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
