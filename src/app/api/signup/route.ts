import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyEmployeeAccess } from '@/lib/auth';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import {
  employeeRecordToAuditValue,
  fetchEmployees,
  getNextEmployeeId,
} from '@/lib/sheets/employees';
import {
  createAuditLog,
  diffAuditValues,
} from '@/lib/sheets/audit';
import { AUDIT_ACTIONS } from '@/types/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user: actor, errorResponse } = await verifyEmployeeAccess(request);
    if (errorResponse) return errorResponse;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase URL or Anon Key is missing from server configuration.',
        },
        { status: 500 }
      );
    }

    // Initialize clients with persistSession: false for server environments
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { email, password, name, role, employeeId } = await request.json();

    let supabaseUserId: string | undefined;
    const employees = await fetchEmployees();
    const previousEmployee =
      employees.find(
        (employee) =>
          (employeeId &&
            employee.employeeId.toLowerCase() === String(employeeId).toLowerCase()) ||
          employee.email.toLowerCase() === String(email || '').toLowerCase()
      ) || null;
    const resolvedEmployeeId =
      previousEmployee?.employeeId || employeeId || getNextEmployeeId(employees);

    try {
      // 1. Create the user. If service role key is available, use Admin API
      // to create the user without establishing a session immediately.
      if (supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Auto-confirm email so they can log in
          app_metadata: { role },
          user_metadata: { name },
        });

        if (adminError) throw adminError;
        supabaseUserId = adminData.user?.id;
      } else {
        // Fallback to standard signUp if service key is not configured
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, role },
          },
        });

        if (signUpError) throw signUpError;
        supabaseUserId = signUpData.user?.id;
      }

      if (!supabaseUserId) {
        throw new Error('Failed to retrieve user ID from Supabase.');
      }

      // Prefer Admin API so registration never creates a browser session for the new user.
      // The fallback signUp path above still must not sign the admin out on the client.
      if (!supabaseServiceKey) {
        console.warn(
          'SUPABASE_SERVICE_ROLE_KEY is missing; employee registration used anon signUp. Configure the service role key to avoid session side effects.'
        );
      }

      // 2. Update the record in the sheet via n8n update-user webhook
      const webhookRes = await fetch(SHEETS_WEBHOOKS.updateUser, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          EmployeeID: resolvedEmployeeId,
          FullName: name,
          Email: email,
          Role: role,
          SupabaseUserID: supabaseUserId,
          EMSStatus: 'Active',
          name,
          email,
          role,
          supabaseUserId,
          status: 'Active',
          employeeId: resolvedEmployeeId,
          created_at: new Date().toISOString(),
        }),
      });

      if (!webhookRes.ok) {
        let errText = '';
        try {
          errText = await webhookRes.text();
        } catch {}
        throw new Error(errText || `n8n update-user webhook returned status ${webhookRes.status}.`);
      }

      const webhookData = await webhookRes.json();
      if (!webhookData.success && webhookData.error) {
        throw new Error(webhookData.error);
      }

      const oldValue = previousEmployee
        ? employeeRecordToAuditValue(previousEmployee)
        : {};
      const newValue = {
        ...oldValue,
        EmployeeID: resolvedEmployeeId,
        FullName: name || previousEmployee?.fullName || '',
        Email: email || previousEmployee?.email || '',
        Role: role || previousEmployee?.role || '',
        SupabaseUserID: supabaseUserId,
        EMSStatus: 'Active',
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

      // Do not sign in as the newly created user — that would replace the admin session.
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
          role,
        },
      });
    } catch (transactionError: unknown) {
      const errMsg =
        transactionError instanceof Error ? transactionError.message : 'Signup transaction failed.';

      // ROLLBACK: Delete the created user in Supabase if we have a supabaseUserId and service key
      if (supabaseUserId && supabaseServiceKey) {
        try {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });
          await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
        } catch (rollbackError) {
          console.error(
            'Failed to rollback/delete user during transaction failure:',
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
