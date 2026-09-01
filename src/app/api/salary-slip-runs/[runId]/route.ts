import { after, NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { reconcileSalarySlipRunAudits } from '@/lib/audit/run-completion';
import { getSalarySlipRun, listSalarySlipRunDetails } from '@/lib/db/salary-slips';
import { fetchEmployees } from '@/lib/sheets/employees';
import { approveSalarySlipDistribution } from '@/lib/payroll/approve';
import { rejectSalarySlipDistribution } from '@/lib/payroll/reject';
import { normalizeRole, ROLES } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { errorResponse } = await verifyResourceAccess(
      request,
      'salary_slip_run_details',
      'read'
    );
    if (errorResponse) return errorResponse;

    const { runId } = await context.params;
    const run = await getSalarySlipRun(runId);
    if (!run) {
      return NextResponse.json({ success: false, error: 'Run not found.' }, { status: 404 });
    }

    const [details, employees] = await Promise.all([
      listSalarySlipRunDetails(runId),
      fetchEmployees().catch(() => []),
    ]);

    const byId = new Map(
      employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
    );

    const enriched = details.map((detail) => {
      const employee = byId.get(detail.employeeId.trim().toLowerCase());
      return {
        ...detail,
        employeeName: employee?.fullName || '',
        employeeEmail: employee?.email || '',
      };
    });

    after(async () => {
      try {
        await reconcileSalarySlipRunAudits([run]);
      } catch (error) {
        console.error('Salary slip run audit reconciliation failed:', error);
      }
    });

    return NextResponse.json({ success: true, data: { run, details: enriched } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load run details.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await verifyResourceAccess(request, 'salary_slip_run_details', 'read');
    if (auth.errorResponse) return auth.errorResponse;

    const role = normalizeRole(auth.role || '');
    if (role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only Admin or Super Admin can approve or reject payroll distribution.',
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '').trim().toLowerCase();
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: 'Unsupported action.' }, { status: 400 });
    }

    const { runId } = await context.params;
    if (action === 'reject') {
      const scope = String(body.scope || 'employee').trim().toLowerCase();
      if (scope !== 'employee' && scope !== 'run') {
        return NextResponse.json(
          { success: false, error: 'Rejection scope must be employee or run.' },
          { status: 400 }
        );
      }
      const employeeId =
        scope === 'employee' ? String(body.employeeId || '').trim() : undefined;
      if (scope === 'employee' && !employeeId) {
        return NextResponse.json(
          { success: false, error: 'employeeId is required for employee rejection.' },
          { status: 400 }
        );
      }

      const data = await rejectSalarySlipDistribution({
        runId,
        employeeId,
        rejectedBy: auth.user?.email || '',
        reason: String(body.reason || '').trim(),
      });
      return NextResponse.json({
        success: true,
        data,
        message:
          scope === 'run'
            ? 'The salary slip run was rejected.'
            : 'The employee salary slip was rejected.',
      });
    }

    const data = await approveSalarySlipDistribution({
      runId,
      approvedBy: auth.user?.email || '',
    });

    return NextResponse.json({
      success: true,
      data,
      message: 'Payroll approved. Salary slip email distribution has started.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve payroll.';
    console.error('[PATCH /api/salary-slip-runs/[runId]]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
