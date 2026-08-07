import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getLeaveRequest } from '@/lib/db/leave-requests';
import { processLeaveRequestAction } from '@/lib/leave/process-request';
import type { LeaveRequestAction } from '@/types/leave-request';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const ACTIONS = new Set<LeaveRequestAction>(['approve', 'reject', 'request_changes']);

export async function GET(request: Request, context: RouteContext) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'leave_requests', 'read');
    if (errorResponse) return errorResponse;

    const { requestId } = await context.params;
    const leaveRequest = await getLeaveRequest(requestId);
    if (!leaveRequest) {
      return NextResponse.json({ success: false, error: 'Leave request not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: leaveRequest });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load leave request.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'leave_requests',
      'write'
    );
    if (errorResponse) return errorResponse;

    const { requestId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '').trim() as LeaveRequestAction;

    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        {
          success: false,
          error: 'action must be one of: approve, reject, request_changes.',
        },
        { status: 400 }
      );
    }

    const result = await processLeaveRequestAction(
      requestId,
      action,
      { email: user?.email || '' },
      { reason: String(body.reason ?? body.rejectionReason ?? body.feedback ?? '').trim() }
    );

    return NextResponse.json({
      success: true,
      data: result.request,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update leave request.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
