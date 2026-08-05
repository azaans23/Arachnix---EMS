import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { countProcessingRuns, listSalarySlipRuns } from '@/lib/db/salary-slips';
import { fetchEmployees } from '@/lib/sheets/employees';

export const dynamic = 'force-dynamic';

/**
 * Compact HR dashboard metrics for payroll overview.
 * Gated on salary_slip_runs (Super Admin / HR Manager) because the response
 * exposes payroll run counts and headcount, not generic dashboard data.
 */
export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary_slip_runs', 'read');
    if (errorResponse) return errorResponse;

    const [employees, runs, processingCount] = await Promise.all([
      fetchEmployees(),
      listSalarySlipRuns().catch(() => []),
      countProcessingRuns().catch(() => 0),
    ]);

    const activeEmployees = employees.filter(
      (employee) => employee.emsStatus.trim().toLowerCase() === 'active'
    );
    const latestRun = runs[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        employeeCount: employees.length,
        activeEmployeeCount: activeEmployees.length,
        pendingSalarySlipRuns: processingCount,
        latestRun,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load HR dashboard metrics.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
