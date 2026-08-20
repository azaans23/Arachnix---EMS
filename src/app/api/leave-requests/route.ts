import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { listLeaveRequests, normalizeLeaveRequestInput } from '@/lib/db/leave-requests';
import { startLeaveRequest } from '@/lib/leave/process-request';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'leave_requests', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim() || undefined;
    const employeeId = searchParams.get('employeeId')?.trim() || undefined;

    const requests = await listLeaveRequests({ status, employeeId });
    return NextResponse.json({ success: true, data: requests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load leave requests.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(request, 'leave_requests', 'write');
    if (errorResponse) return errorResponse;

    const body = (await request.json()) as Record<string, unknown>;
    const input = normalizeLeaveRequestInput(body);
    const result = await startLeaveRequest(input, { actorEmail: user?.email || '' });

    return NextResponse.json({
      success: true,
      data: result.request,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create leave request.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
