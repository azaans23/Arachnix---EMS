import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { updateSalaryDetails } from '@/lib/payroll/salary-details';
import type { SalaryDetailInput } from '@/types/salary-slip';

export const dynamic = 'force-dynamic';

function normalizeDetail(row: unknown): SalaryDetailInput | null {
  if (!row || typeof row !== 'object') return null;
  const raw = row as Record<string, unknown>;
  const employeeId = String(
    raw.employeeId || raw.EmployeeID || raw.EmployeeId || ''
  ).trim();
  if (!employeeId) return null;

  return {
    employeeId,
    salary: String(raw.salary ?? raw.Salary ?? '').trim(),
    allowance: String(raw.allowance ?? raw.Allowance ?? '').trim(),
    tax: String(raw.tax ?? raw.Tax ?? '').trim(),
    accountNumber: String(
      raw.accountNumber ?? raw.AccountNumber ?? raw['Account Number'] ?? ''
    ).trim(),
    accountName: String(
      raw.accountName ?? raw.AccountName ?? raw['Account Name'] ?? ''
    ).trim(),
    bankName: String(raw.bankName ?? raw.BankName ?? raw['Bank Name'] ?? '').trim(),
  };
}

/** POST — write missing/updated salary detail rows via n8n update-salary-detail. */
export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(
      request,
      'salary_slip_runs',
      'write'
    );
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
