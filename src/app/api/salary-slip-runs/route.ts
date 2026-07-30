import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { listSalarySlipRuns } from '@/lib/db/salary-slips';
import { startSalarySlipRun } from '@/lib/payroll/generate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary_slip_runs', 'read');
    if (errorResponse) return errorResponse;

    const runs = await listSalarySlipRuns();
    return NextResponse.json({ success: true, data: runs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load salary slip runs.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'salary_slip_runs',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const month = Number(body.month);
    const year = Number(body.year);
    const employeeIds = Array.isArray(body.employeeIds)
      ? body.employeeIds.map((id: unknown) => String(id))
      : undefined;

    const { run, message } = await startSalarySlipRun(user?.email || '', {
      month,
      year,
      employeeIds,
    });

    return NextResponse.json({ success: true, data: run, message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start salary slip run.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
