import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { fetchSalaryDetails, updateSalaryDetails } from '@/lib/payroll/salary-details';
import type { SalaryDetailInput } from '@/types/salary-slip';

export const dynamic = 'force-dynamic';

function normalizeDetail(row: unknown): SalaryDetailInput | null {
  if (!row || typeof row !== 'object') return null;
  const raw = row as Record<string, unknown>;
  const employeeId = String(raw.employeeId || raw.EmployeeID || raw.EmployeeId || '').trim();
  if (!employeeId) return null;

  return {
    employeeId,
    salary: String(raw.salary ?? raw.Salary ?? raw.BaseSalary ?? raw.baseSalary ?? '').trim(),
    allowance: String(raw.allowance ?? raw.Allowance ?? '').trim(),
    tax: String(raw.tax ?? raw.Tax ?? '').trim(),
    overtimePay: String(raw.overtimePay ?? raw.OvertimePay ?? raw['Overtime Pay'] ?? '').trim(),
    performanceBonus: String(
      raw.performanceBonus ?? raw.PerformanceBonus ?? raw['Performance Bonus'] ?? ''
    ).trim(),
    contributions: String(
      raw.contributions ?? raw.Contributions ?? raw.contribution ?? raw.Contribution ?? ''
    ).trim(),
    others: String(raw.others ?? raw.Others ?? '').trim(),
    netSalary: String(raw.netSalary ?? raw.NetSalary ?? '').trim() || undefined,
    accountNumber: String(
      raw.accountNumber ?? raw.AccountNumber ?? raw['Account Number'] ?? ''
    ).trim(),
    accountName: String(raw.accountName ?? raw.AccountName ?? raw['Account Name'] ?? '').trim(),
    bankName: String(raw.bankName ?? raw.BankName ?? raw['Bank Name'] ?? '').trim(),
    period: String(raw.period ?? raw.Period ?? '').trim() || undefined,
    uniqueKey: String(raw.uniqueKey ?? raw.UniqueKey ?? '').trim() || undefined,
    status: String(raw.status ?? raw.Status ?? '').trim() || undefined,
    totalEarning:
      String(raw.totalEarning ?? raw.TotalEarning ?? raw['Total Earning'] ?? '').trim() ||
      undefined,
    totalDeduction:
      String(raw.totalDeduction ?? raw.TotalDeduction ?? raw['Total Deduction'] ?? '').trim() ||
      undefined,
  };
}

/** GET — salary rows from Supabase. Prefer `?uniqueKeys=` or `?period=` + `employeeIds`. */
export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary_slip_runs', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period')?.trim() || undefined;
    const employeeIdsRaw = searchParams.get('employeeIds')?.trim();
    const uniqueKeysRaw = searchParams.get('uniqueKeys')?.trim();
    const employeeIds = employeeIdsRaw
      ? employeeIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    const uniqueKeys = uniqueKeysRaw
      ? uniqueKeysRaw
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      : undefined;

    const details = await fetchSalaryDetails(employeeIds, period, uniqueKeys);

    return NextResponse.json({
      success: true,
      data: details,
      period: period || null,
      uniqueKeys: uniqueKeys || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch salary details.';
    console.error('[GET /api/salary-details]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

/** POST — write missing/updated salary detail rows via n8n update-salary-detail. */
export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'salary_slip_runs', 'write');
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const rows = Array.isArray(body.details)
      ? body.details
      : Array.isArray(body.employees)
        ? body.employees
        : body.employeeId || body.EmployeeID
          ? [body]
          : [];

    const details = rows
      .map(normalizeDetail)
      .filter((row: SalaryDetailInput | null): row is SalaryDetailInput => Boolean(row));

    if (details.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Provide at least one salary detail row.' },
        { status: 400 }
      );
    }

    const result = await updateSalaryDetails(details);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: details,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update salary details.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
