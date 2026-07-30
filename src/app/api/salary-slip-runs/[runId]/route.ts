import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getSalarySlipRun, listSalarySlipRunDetails } from '@/lib/db/salary-slips';
import { fetchEmployees } from '@/lib/sheets/employees';

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

    return NextResponse.json({ success: true, data: { run, details: enriched } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load run details.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
