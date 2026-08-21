import { NextResponse } from 'next/server';
import {
  deleteAuthUser,
  findAuthUserIdByEmail,
  verifyAuth,
} from '@/lib/auth';
import {
  canDeleteEmployee,
  canDeleteEmployeeRecord,
  emailsMatch,
  isSuperAdminRole,
  isSuperAdminSelfEdit,
} from '@/lib/rbac';
import {
  deleteEmployee,
  employeeRecordToAuditValue,
  fetchEmployees,
  SheetsError,
} from '@/lib/sheets/employees';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user, role: actorRole, errorResponse } = await verifyAuth(request);
    if (errorResponse) return errorResponse;

    if (!actorRole || !canDeleteEmployee(actorRole)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: you cannot delete employees.' },
        { status: 403 }
      );
    }

    const { employeeId: rawId } = await context.params;
    const employeeId = decodeURIComponent(String(rawId || '')).trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'Employee ID is required.' },
        { status: 400 }
      );
    }

    const roster = await fetchEmployees();
    const target = roster.find(
      (employee) => employee.employeeId.trim().toLowerCase() === employeeId.toLowerCase()
    );
    if (!target) {
      return NextResponse.json(
        { success: false, error: `Employee ${employeeId} was not found.` },
        { status: 404 }
      );
    }

    const actorEmail = user?.email || '';
    const actorUserId = user?.id || '';

    if (
      isSuperAdminSelfEdit({
        actorRole,
        actorEmail,
        actorUserId,
        targetEmail: target.email,
        targetSupabaseUserId: target.supabaseUserId,
      }) ||
      emailsMatch(actorEmail, target.email) ||
      (actorUserId &&
        target.supabaseUserId &&
        actorUserId === target.supabaseUserId.trim())
    ) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own employee record.' },
        { status: 403 }
      );
    }

    if (isSuperAdminRole(target.role)) {
      return NextResponse.json(
        { success: false, error: 'Super Admin cannot be deleted.' },
        { status: 403 }
      );
    }

    if (
      !canDeleteEmployeeRecord({
        actorRole,
        actorEmail,
        actorUserId,
        targetRole: target.role,
        targetEmail: target.email,
        targetSupabaseUserId: target.supabaseUserId,
        isDirector: target.isDirector,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: target.isDirector
            ? 'HR cannot delete a director.'
            : `You cannot delete employees with role ${target.role}.`,
        },
        { status: 403 }
      );
    }

    let deleted;
    try {
      deleted = await deleteEmployee(target.employeeId);
    } catch (error) {
      if (error instanceof SheetsError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status || 500 }
        );
      }
      throw error;
    }

    await logAuditBestEffort(actorEmail, {
      action: AUDIT_ACTIONS.DELETE,
      recordType: AUDIT_RECORD_TYPES.EMPLOYEE,
      recordId: deleted.employeeId,
      oldValue: employeeRecordToAuditValue(deleted),
      newValue: null,
    });

    let authUserId = String(deleted.supabaseUserId || '').trim();
    if (!authUserId && deleted.email) {
      authUserId = (await findAuthUserIdByEmail(deleted.email)) || '';
    }
    if (authUserId) {
      try {
        await deleteAuthUser(authUserId);
      } catch (authError) {
        console.error('Employee deleted but Auth user removal failed:', authError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Employee ${deleted.employeeId} deleted.`,
      data: { employeeId: deleted.employeeId, email: deleted.email },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete employee.';
    console.error('DELETE /api/employees/[employeeId]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
