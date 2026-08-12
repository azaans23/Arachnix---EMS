import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { AuditLogError, createAuditLog, fetchAuditLogs } from '@/lib/sheets/audit';
import type { CreateAuditEventInput } from '@/types/audit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'audit_log', 'read');
    if (errorResponse) return errorResponse;

    const records = await fetchAuditLogs();
    return NextResponse.json({ success: true, data: records });
  } catch (error: unknown) {
    const status = error instanceof AuditLogError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Failed to load audit log.';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/**
 * Manual/system audit entry endpoint. Normal sheet mutations should call
 * runAuditedMutation server-side so the actor cannot be forged by the client.
 */
export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(request, 'audit_log', 'write');
    if (errorResponse) return errorResponse;

    const event = (await request.json()) as CreateAuditEventInput;
    const record = await createAuditLog({ email: user?.email || '' }, event);

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    const status = error instanceof AuditLogError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Failed to create audit entry.';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
