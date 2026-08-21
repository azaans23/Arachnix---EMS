import { NextResponse } from 'next/server';
import { verifyEmployeeAccess } from '@/lib/auth';
import {
  assertCanAssignRole,
  canAssignRole,
  canEditEmployeeRecord,
  isSuperAdminSelfEdit,
  normalizeRole,
  roleDisplayName,
} from '@/lib/rbac';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  employeeRecordToAuditValue,
  employeeToFormValues,
  fetchEmployees,
  getNextEmployeeId,
  mergeEmployeeWriteInput,
  toSheetWritePayload,
  upsertEmployee,
} from '@/lib/sheets/employees';
import { createAuditLog, diffAuditValues } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS } from '@/types/audit';
import type { EmployeeWriteInput } from '@/types/employee';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user: actor, role: actorRole, errorResponse } = await verifyEmployeeAccess(request);
    if (errorResponse) return errorResponse;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase URL is missing from server configuration.',
        },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SUPABASE_SERVICE_ROLE_KEY is required to register users. Roles must be written to app_metadata via the Admin API.',
        },
        { status: 500 }
      );
    }

    const { email, password, name, role, employeeId } = await request.json();

    if (
      isSuperAdminSelfEdit({
        actorRole: actorRole || '',
        actorEmail: actor?.email,
        actorUserId: actor?.id,
        targetEmail: String(email || ''),
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'Super Admin cannot change their own account.' },
        { status: 403 }
      );
    }

    const assignment = assertCanAssignRole(actorRole || '', String(role || ''));
    if (!assignment.ok) {
      return NextResponse.json({ success: false, error: assignment.error }, { status: 403 });
    }
    const assignedRoleLabel = roleDisplayName(assignment.role);

    let supabaseUserId: string | undefined;
    const employees = await fetchEmployees();
    const previousEmployee =
      employees.find(
        (employee) =>
          (employeeId && employee.employeeId.toLowerCase() === String(employeeId).toLowerCase()) ||
          employee.email.toLowerCase() === String(email || '').toLowerCase()
      ) || null;
    const resolvedEmployeeId =
      previousEmployee?.employeeId || employeeId || getNextEmployeeId(employees);

    const canEditPrevious =
      previousEmployee?.role &&
      canEditEmployeeRecord({
        actorRole: actorRole || '',
        actorEmail: actor?.email,
        actorUserId: actor?.id,
        targetRole: previousEmployee.role,
        targetEmail: previousEmployee.email,
        targetSupabaseUserId: previousEmployee.supabaseUserId,
      });
    const canGrantSameRole =
      previousEmployee?.role &&
      normalizeRole(previousEmployee.role) === assignment.role &&
      canAssignRole(actorRole || '', previousEmployee.role);

    if (previousEmployee?.role && !canEditPrevious && !canGrantSameRole) {
      return NextResponse.json(
        {
          success: false,
          error: `${roleDisplayName(actorRole || '')} cannot register employees with role ${roleDisplayName(previousEmployee.role)}`,
        },
        { status: 403 }
      );
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // Admin API only — never put role in user_metadata (client-writable).
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          role: assignedRoleLabel,
          hasFinanceAccess: Boolean(previousEmployee?.hasFinanceAccess),
          isDirector: Boolean(previousEmployee?.isDirector),
        },
        user_metadata: { name },
      });

      if (adminError) throw adminError;
      supabaseUserId = adminData.user?.id;

      if (!supabaseUserId) {
        throw new Error('Failed to retrieve user ID from Supabase.');
      }

      const writeInput: EmployeeWriteInput = mergeEmployeeWriteInput(
        {
          ...(previousEmployee
            ? employeeToFormValues(previousEmployee)
            : {
                employeeId: resolvedEmployeeId,
                name: name || '',
                email: email || '',
                phone: '',
                dob: '',
                address: '',
                department: '',
                designation: '',
                employmentType: '',
                joiningDate: '',
                baseSalary: '',
                bankAccountDetails: '',
                role: assignedRoleLabel,
                emsStatus: 'Active',
              }),
          employeeId: resolvedEmployeeId,
          name: name || previousEmployee?.fullName || '',
          email: email || previousEmployee?.email || '',
          role: assignedRoleLabel,
          emsStatus: 'Active',
          supabaseUserId,
          originalEmployeeId: previousEmployee?.employeeId || resolvedEmployeeId,
          originalEmail: previousEmployee?.email || email,
        },
        previousEmployee
      );

      // Dual-write: Supabase employees table + Google Sheet (rolls back DB if sheet fails)
      await upsertEmployee(writeInput, previousEmployee);

      const oldValue = previousEmployee ? employeeRecordToAuditValue(previousEmployee) : {};
      const newValue = {
        ...oldValue,
        ...Object.fromEntries(
          Object.entries(toSheetWritePayload(writeInput)).filter(([key]) => /^[A-Z]/.test(key))
        ),
      };
      const changes = diffAuditValues(oldValue, newValue);
      let auditLogged = true;

      try {
        await createAuditLog(
          { email: actor?.email || '' },
          {
            action: AUDIT_ACTIONS.GRANT_ACCESS,
            recordType: 'Employee',
            recordId: resolvedEmployeeId,
            oldValue: changes.oldValue,
            newValue: changes.newValue,
          }
        );
      } catch (auditError) {
        auditLogged = false;
        console.error('EMS access granted but audit delivery failed:', auditError);
      }

      return NextResponse.json({
        success: true,
        auditLogged,
        warning: auditLogged
          ? undefined
          : 'Access granted, but the audit entry could not be delivered.',
        user: {
          id: supabaseUserId,
          employeeId: resolvedEmployeeId,
          name,
          email,
          role: assignedRoleLabel,
        },
      });
    } catch (transactionError: unknown) {
      const errMsg =
        transactionError instanceof Error ? transactionError.message : 'Signup transaction failed.';

      // Roll back Auth user. Employee DB row is already rolled back by upsertEmployee
      // when the sheet write fails; if DB failed first, no employee row was written.
      if (supabaseUserId) {
        try {
          await getSupabaseAdmin().auth.admin.deleteUser(supabaseUserId);
        } catch (rollbackError) {
          console.error(
            'Failed to rollback/delete auth user during transaction failure:',
            rollbackError
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: errMsg,
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: errMsg,
      },
      { status: 500 }
    );
  }
}
