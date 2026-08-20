import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { canAccess } from '@/lib/rbac';
import { fetchEmployees, SheetsError } from '@/lib/sheets/employees';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { role, errorResponse } = await verifyAuth(request);
    if (errorResponse) return errorResponse;

    const canListEmployees =
      role !== undefined && (canAccess(role, 'employees') || canAccess(role, 'salary'));
    if (!canListEmployees) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: employees directory is not available for this role.' },
        { status: 403 }
      );
    }

    const employees = await fetchEmployees();
    return NextResponse.json({
      success: true,
      data: employees.map((employee) => employee.raw),
    });
  } catch (error: unknown) {
    if (error instanceof SheetsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const errMsg = error instanceof Error ? error.message : 'Failed to connect to the n8n server.';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
