import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { listSalarySlipRuns } from '@/lib/db/salary-slips';
import { startSalarySlipRun } from '@/lib/payroll/generate';
import type { SalaryDetailInput, SalarySlipExtrasInput } from '@/types/salary-slip';

export const dynamic = 'force-dynamic';

function normalizeSalaryDetail(row: Record<string, unknown>): SalaryDetailInput {
  return {
    employeeId: String(row.employeeId || row.EmployeeID || '').trim(),
    salary: String(row.salary ?? row.Salary ?? row.BaseSalary ?? row.baseSalary ?? '').trim(),
    allowance: String(row.allowance ?? row.Allowance ?? '').trim(),
    tax: String(row.tax ?? row.Tax ?? '').trim(),
    netSalary: String(row.netSalary ?? row.NetSalary ?? '').trim() || undefined,
    accountNumber: String(
      row.accountNumber ?? row.AccountNumber ?? row['Account Number'] ?? ''
    ).trim(),
    accountName: String(row.accountName ?? row.AccountName ?? row['Account Name'] ?? '').trim(),
    bankName: String(row.bankName ?? row.BankName ?? row['Bank Name'] ?? '').trim(),
    totalEarning:
      String(row.totalEarning ?? row.TotalEarning ?? row['Total Earning'] ?? '').trim() || undefined,
    totalDeduction:
      String(row.totalDeduction ?? row.TotalDeduction ?? row['Total Deduction'] ?? '').trim() ||
      undefined,
  };
}

function normalizeSlipExtras(row: Record<string, unknown>): SalarySlipExtrasInput {
  return {
    employeeId: String(row.employeeId || row.EmployeeID || '').trim(),
    overtimePay: String(row.overtimePay ?? row.OvertimePay ?? row['Overtime Pay'] ?? '').trim(),
    performanceBonus: String(
      row.performanceBonus ?? row.PerformanceBonus ?? row['Performance Bonus'] ?? ''
    ).trim(),
    contributions: String(
      row.contributions ?? row.Contributions ?? row.contribution ?? row.Contribution ?? ''
    ).trim(),
    others: String(row.others ?? row.Others ?? '').trim(),
  };
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary_slip_runs', 'read');
    if (errorResponse) return errorResponse;

    const runs = await listSalarySlipRuns();
    return NextResponse.json({ success: true, data: runs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load salary slip runs.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'salary_slip_runs',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const month = Number(body.month);
    const year = Number(body.year);
    const employeeIds = Array.isArray(body.employeeIds)
      ? body.employeeIds.map((id: unknown) => String(id))
      : undefined;
    const confirmIncomplete = Boolean(body.confirmIncomplete);
    const salaryDetails = Array.isArray(body.salaryDetails)
      ? body.salaryDetails.map((row: Record<string, unknown>) => normalizeSalaryDetail(row))
      : undefined;
    const slipExtras = Array.isArray(body.slipExtras)
      ? body.slipExtras.map((row: Record<string, unknown>) => normalizeSlipExtras(row))
      : Array.isArray(body.salaryDetails)
        ? // Back-compat: extras may arrive mixed into salaryDetails from older clients.
          body.salaryDetails.map((row: Record<string, unknown>) => normalizeSlipExtras(row))
        : undefined;

    const result = await startSalarySlipRun(user?.email || '', {
      month,
      year,
      employeeIds,
      confirmIncomplete,
      salaryDetails,
      slipExtras,
    });

    if ('needsConfirmation' in result) {
      return NextResponse.json(
        {
          success: false,
          needsConfirmation: true,
          message: result.message,
          data: {
            incomplete: result.incomplete,
            details: result.details,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.run,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start salary slip run.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
