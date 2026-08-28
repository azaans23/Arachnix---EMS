import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getEmployeeDbRow, dbRowToEmployeeRecord } from '@/lib/db/employees';
import {
  getOffboardingForEmployee,
  listOffboardings,
  startOffboarding,
} from '@/lib/offboarding/process';
import { canEditEmployeeRecord, isSuperAdminRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'employees', 'read');
    if (errorResponse) return errorResponse;

    const employeeId = new URL(request.url).searchParams.get('employeeId')?.trim();
    if (employeeId) {
      const data = await getOffboardingForEmployee(employeeId);
      return NextResponse.json({ success: true, data });
    }

    const data = await listOffboardings();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load offboarding.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, role, errorResponse } = await verifyResourceAccess(
      request,
      'employees',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = (await request.json()) as Record<string, unknown>;
    const employeeId = String(body.employeeId || body.EmployeeID || '').trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'employeeId is required.' },
        { status: 400 }
      );
    }

    const dbEmployee = await getEmployeeDbRow(employeeId);
    if (!dbEmployee) {
      return NextResponse.json({ success: false, error: 'Employee not found.' }, { status: 404 });
    }
    const employee = dbRowToEmployeeRecord(dbEmployee);
    if (isSuperAdminRole(employee.role)) {
      return NextResponse.json(
        { success: false, error: 'Super Admin cannot be offboarded.' },
        { status: 403 }
      );
    }
    if (
      !canEditEmployeeRecord({
        actorRole: role || '',
        actorEmail: user?.email,
        actorUserId: user?.id,
        targetRole: employee.role,
        targetEmail: employee.email,
        targetSupabaseUserId: employee.supabaseUserId,
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'You cannot offboard this employee.' },
        { status: 403 }
      );
    }

    const result = await startOffboarding({
      employeeId,
      actorEmail: user?.email || '',
      reason: String(body.reason || '').trim(),
      lastWorkingDate: String(body.lastWorkingDate || '').trim(),
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Offboarding started for ${employee.fullName || employeeId}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start offboarding.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
