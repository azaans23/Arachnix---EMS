import { NextResponse } from 'next/server';
import { syncEmployeeAuthRole, verifyEmployeeAccess } from '@/lib/auth';
import {
  assertCanAssignRole,
  canManageEmployeeRole,
  isSuperAdminSelfEdit,
  normalizeRole,
  roleDisplayName,
} from '@/lib/rbac';
import {
  employeeInputToAuditValue,
  employeeRecordToAuditValue,
  fetchEmployees,
  getNextEmployeeId,
  mergeEmployeeWriteInput,
  SheetsError,
  upsertEmployee,
  validateEmployeeWrite,
} from '@/lib/sheets/employees';
import { diffAuditValues, runAuditedMutation } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS } from '@/types/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user, role: actorRole, errorResponse } = await verifyEmployeeAccess(request);
    if (errorResponse) return errorResponse;

    const existing = await fetchEmployees();
    const requestBody = await request.json();
    const body =
      requestBody && typeof requestBody === 'object'
        ? { ...(requestBody as Record<string, unknown>) }
        : {};
    const editingExisting = Boolean(body.originalEmployeeId || body.originalEmail);

    if (!editingExisting || !String(body.employeeId || '').trim()) {
      body.employeeId = getNextEmployeeId(existing);
    }

    const validation = await validateEmployeeWrite(body, { existing });

    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const originalId = (validation.value.originalEmployeeId || '').trim().toLowerCase();
    const originalEmail = (validation.value.originalEmail || '').trim().toLowerCase();
    const previous =
      existing.find(
        (employee) =>
          (originalId && employee.employeeId.trim().toLowerCase() === originalId) ||
          (originalEmail && employee.email.trim().toLowerCase() === originalEmail)
      ) || null;

    const previousRole = previous?.role || '';
    const nextRole = validation.value.role || '';
    const roleChanging = !previous || normalizeRole(previousRole) !== normalizeRole(nextRole);
    const targetEmail = previous?.email || validation.value.email || originalEmail;
    const targetSupabaseUserId =
      previous?.supabaseUserId || validation.value.supabaseUserId || '';

    if (
      isSuperAdminSelfEdit({
        actorRole: actorRole || '',
        actorEmail: user?.email,
        actorUserId: user?.id,
        targetEmail,
        targetSupabaseUserId,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Super Admin cannot change their own account.',
          fieldErrors: { role: 'Super Admin cannot change their own account.' },
        },
        { status: 403 }
      );
    }

    // Belt-and-suspenders: never allow Super Admin to mutate a record that is themselves
    // even if role/email fields were tampered in the payload.
    if (
      isSuperAdminSelfEdit({
        actorRole: actorRole || '',
        actorEmail: user?.email,
        actorUserId: user?.id,
        targetEmail: validation.value.email,
        targetSupabaseUserId: validation.value.supabaseUserId,
      })
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Super Admin cannot change their own account.',
        },
        { status: 403 }
      );
    }

    if (previous && !canManageEmployeeRole(actorRole || '', previousRole)) {
      return NextResponse.json(
        {
          success: false,
          error: `${roleDisplayName(actorRole || '')} cannot edit employees with role ${roleDisplayName(previousRole)}`,
        },
        { status: 403 }
      );
    }

    if (roleChanging || !previous) {
      const assignment = assertCanAssignRole(actorRole || '', nextRole);
      if (!assignment.ok) {
        return NextResponse.json(
          { success: false, error: assignment.error, fieldErrors: { role: assignment.error } },
          { status: 403 }
        );
      }
      validation.value.role = roleDisplayName(assignment.role);
    } else {
      validation.value.role = roleDisplayName(normalizeRole(previousRole));
    }

    // EMS status is login state, not a free-form label: it can only read Active
    // once the employee has a Supabase auth account (created by registration).
    if (!targetSupabaseUserId) {
      validation.value.emsStatus = 'Inactive';
    }

    const nextValue = employeeInputToAuditValue(
      mergeEmployeeWriteInput(validation.value, previous)
    );
    const previousValue = previous ? employeeRecordToAuditValue(previous) : {};
    const changes = previous
      ? diffAuditValues(previousValue, nextValue)
      : { oldValue: {}, newValue: nextValue };

    const { result: saved, auditLogged } = await runAuditedMutation(
      { email: user?.email || '' },
      {
        action: previous ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
        recordType: 'Employee',
        recordId: validation.value.employeeId,
        oldValue: changes.oldValue,
        newValue: changes.newValue,
      },
      () => upsertEmployee(validation.value, previous)
    );

    let authRoleSynced = false;
    if (roleChanging) {
      const { synced } = await syncEmployeeAuthRole({
        supabaseUserId: saved.supabaseUserId || previous?.supabaseUserId,
        email: saved.email || previous?.email || validation.value.email,
        roleLabel: saved.role || validation.value.role,
      });
      authRoleSynced = synced;
    }

    return NextResponse.json({
      success: true,
      employeeId: saved.employeeId,
      auditLogged,
      authRoleSynced,
      warning:
        [
          !auditLogged ? 'Employee saved, but the audit entry could not be delivered.' : '',
          roleChanging && !authRoleSynced
            ? 'Employee role saved, but Auth permissions could not be updated. Ask the user to sign out and back in, or retry after confirming they have a registered login.'
            : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    });
  } catch (error: unknown) {
    if (error instanceof SheetsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
