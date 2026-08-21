import { NextResponse } from 'next/server';
import {
  deleteAuthUser,
  findAuthUserIdByEmail,
  syncEmployeeAuthRole,
  verifyEmployeeAccess,
} from '@/lib/auth';
import {
  assertCanEditEmployee,
  canAssignHrFinanceAccess,
  canEditEmployeeRecord,
  normalizeRole,
  roleDisplayName,
  ROLES,
} from '@/lib/rbac';
import type { EmployeeWriteInput } from '@/types/employee';
import { parseToggle } from '@/types/employee';
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
    const targetSupabaseUserId = previous?.supabaseUserId || validation.value.supabaseUserId || '';

    if (previous) {
      if (
        !canEditEmployeeRecord({
          actorRole: actorRole || '',
          actorEmail: user?.email,
          actorUserId: user?.id,
          targetRole: previousRole,
          targetEmail,
          targetSupabaseUserId,
        })
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `${roleDisplayName(actorRole || '')} cannot edit employees with role ${roleDisplayName(previousRole)}`,
          },
          { status: 403 }
        );
      }
    }

    if (roleChanging || !previous) {
      const assignment = assertCanEditEmployee({
        actorRole: actorRole || '',
        actorEmail: user?.email,
        actorUserId: user?.id,
        targetEmail,
        targetSupabaseUserId,
        previousRole: previousRole || null,
        nextRole,
      });
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

    validation.value.isDirector = parseToggle(
      body.isDirector ?? validation.value.isDirector ?? previous?.isDirector
    );
    if (normalizeRole(validation.value.role) !== ROLES.HR_MANAGER) {
      validation.value.hasFinanceAccess = false;
    } else if (!canAssignHrFinanceAccess(actorRole || '')) {
      validation.value.hasFinanceAccess = Boolean(previous?.hasFinanceAccess);
    } else {
      validation.value.hasFinanceAccess = parseToggle(
        body.hasFinanceAccess ?? validation.value.hasFinanceAccess
      );
    }

    // EMS login is created by registration. Without an Auth user the status is
    // always Inactive (UI shows "Register"). Choosing Inactive while a login
    // exists revokes access: delete Auth and clear the Supabase user link.
    const requestedStatus = String(validation.value.emsStatus || '')
      .trim()
      .toLowerCase();
    const wantsInactive = requestedStatus === 'inactive';
    let authUserIdToDelete = '';

    if (wantsInactive && targetSupabaseUserId) {
      authUserIdToDelete = targetSupabaseUserId;
      validation.value.supabaseUserId = '';
      validation.value.emsStatus = 'Inactive';
    } else if (!targetSupabaseUserId) {
      validation.value.emsStatus = 'Inactive';
      validation.value.supabaseUserId = '';
    } else {
      validation.value.emsStatus = 'Active';
      validation.value.supabaseUserId = targetSupabaseUserId;
    }

    if (authUserIdToDelete) {
      try {
        await deleteAuthUser(authUserIdToDelete);
      } catch (authDeleteError: unknown) {
        // Fallback: resolve by email if the stored id is stale, then retry once.
        const byEmail = await findAuthUserIdByEmail(
          previous?.email || validation.value.email || targetEmail
        );
        if (byEmail && byEmail !== authUserIdToDelete) {
          await deleteAuthUser(byEmail);
        } else {
          const message =
            authDeleteError instanceof Error
              ? authDeleteError.message
              : 'Failed to revoke EMS login.';
          return NextResponse.json({ success: false, error: message }, { status: 500 });
        }
      }
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
        action: authUserIdToDelete
          ? AUDIT_ACTIONS.REVOKE_ACCESS
          : previous
            ? AUDIT_ACTIONS.UPDATE
            : AUDIT_ACTIONS.CREATE,
        recordType: 'Employee',
        recordId: validation.value.employeeId,
        oldValue: changes.oldValue,
        newValue: changes.newValue,
      },
      () => upsertEmployee(validation.value, previous)
    );

    // Auth accounts are created by registration, so there is no role to sync
    // until the employee has a login (use saved link — revoke clears it).
    const hasLogin = Boolean(saved.supabaseUserId);

    const flagsChanging =
      Boolean(previous) &&
      (Boolean(previous?.isDirector) !== Boolean(validation.value.isDirector) ||
        Boolean(previous?.hasFinanceAccess) !== Boolean(validation.value.hasFinanceAccess));

    let authRoleSynced = false;
    if ((roleChanging || flagsChanging) && hasLogin) {
      const { synced } = await syncEmployeeAuthRole({
        supabaseUserId: saved.supabaseUserId,
        email: saved.email || previous?.email || validation.value.email,
        roleLabel: saved.role || validation.value.role,
        hasFinanceAccess: saved.hasFinanceAccess,
        isDirector: saved.isDirector,
      });
      authRoleSynced = synced;
    }

    return NextResponse.json({
      success: true,
      employeeId: saved.employeeId,
      auditLogged,
      authRoleSynced,
      emsAccessRevoked: Boolean(authUserIdToDelete),
      warning:
        [
          !auditLogged ? 'Employee saved, but the audit entry could not be delivered.' : '',
          roleChanging && hasLogin && !authRoleSynced
            ? 'Employee role saved, but Auth permissions could not be updated. Ask the user to sign out and back in.'
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
