import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { fetchEmployees } from '@/lib/sheets/employees';
import {
  createSalarySlipRun,
  updateSalarySlipRun,
  upsertSalarySlipRunDetail,
  buildRunDetailId,
} from '@/lib/db/salary-slips';
import { formatSalaryPeriod } from '@/lib/payroll/period';
import { createAuditLog } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS } from '@/types/audit';
import type { EmployeeRecord } from '@/types/employee';
import type {
  GenerateSalarySlipsInput,
  IncompleteSalaryDetail,
  SalaryDetailRecord,
  SalarySlipExtrasInput,
  SalarySlipRun,
} from '@/types/salary-slip';
import {
  fetchSalaryDetails,
  findIncompleteSalaryDetails,
  isSalaryDetailComplete,
  toSalaryDetailWebhookFields,
} from '@/lib/payroll/salary-details';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] || String(month);
}

/** Parses salary strings like "99999", "99,999", "PKR 50000". */
export function parseBaseSalary(value: unknown): number {
  const cleaned = String(value ?? '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!cleaned) return NaN;
  const salary = Number(cleaned);
  return Number.isFinite(salary) ? salary : NaN;
}

export function hasPayrollSalary(employee: EmployeeRecord, salaryIds?: Set<string>): boolean {
  if (salaryIds) {
    return salaryIds.has(employee.employeeId.trim().toLowerCase());
  }
  return parseBaseSalary(employee.baseSalary) > 0;
}

export function payrollEligibilityReason(
  employee: EmployeeRecord,
  salaryIds?: Set<string>
): string | null {
  if (!hasPayrollSalary(employee, salaryIds)) {
    return 'No salary record — create one on the Salary page first';
  }
  return null;
}

export async function resolvePayrollEmployees(employeeIds?: string[]): Promise<EmployeeRecord[]> {
  const [all, salaryRows] = await Promise.all([fetchEmployees(), fetchSalaryDetails()]);
  const salaryIds = new Set(salaryRows.map((row) => row.employeeId.trim().toLowerCase()));
  const eligible = all.filter((employee) => hasPayrollSalary(employee, salaryIds));

  if (!employeeIds || employeeIds.length === 0) return eligible;

  const wanted = new Set(employeeIds.map((id) => id.trim().toLowerCase()));
  const selected = eligible.filter((employee) =>
    wanted.has(employee.employeeId.trim().toLowerCase())
  );

  if (selected.length === 0) {
    throw new Error('No eligible employees matched the selection (need a salary record).');
  }

  return selected;
}

type WebhookResultItem = {
  employeeId?: string;
  EmployeeID?: string;
  status?: string;
  success?: boolean;
  pdfLink?: string;
  PdfLink?: string;
  emailStatus?: string;
  EmailStatus?: string;
  error?: string;
  errorReason?: string;
  ErrorReason?: string;
};

function parseWebhookBody(text: string): {
  ackOnly: boolean;
  results: WebhookResultItem[];
  message?: string;
} {
  if (!text.trim()) return { ackOnly: true, results: [] };

  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const message = String(json.message || '');
      if (message.toLowerCase().includes('workflow was started')) {
        return { ackOnly: true, results: [], message };
      }
      const results = Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.data)
          ? json.data
          : [];
      return { ackOnly: false, results, message: json.error || json.message };
    }
    if (Array.isArray(json)) return { ackOnly: false, results: json };
  } catch {
    /* non-JSON body */
  }

  return { ackOnly: true, results: [] };
}

/** Dual-writes to Supabase + Sheets; never fails the payroll run. */
async function logSalarySlipRunAudit(
  actorEmail: string,
  input: {
    action: string;
    runId: string;
    oldValue?: unknown;
    newValue: unknown;
  }
): Promise<void> {
  const email = actorEmail.trim() || 'system@arachnix.io';
  try {
    await createAuditLog(
      { email },
      {
        action: input.action,
        recordType: 'SalarySlipRun',
        recordId: input.runId,
        oldValue: input.oldValue,
        newValue: input.newValue,
      }
    );
  } catch (auditError) {
    console.error('Salary slip run audit failed:', auditError);
  }
}

function extrasByEmployeeId(extras?: SalarySlipExtrasInput[]) {
  const map = new Map<string, SalarySlipExtrasInput>();
  for (const row of extras || []) {
    const key = row.employeeId.trim().toLowerCase();
    if (key) map.set(key, row);
  }
  return map;
}

/**
 * Creates a Supabase run, fires the n8n generate-salary-slip webhook, and
 * updates run/detail rows when the workflow returns per-employee results.
 *
 * Prefetches the one salary record per employee. Slip-only extras (OT / bonus /
 * others / contributions) are taken from the request and sent to n8n only —
 * they are never written to the salaries table.
 */
export async function startSalarySlipRun(
  actorEmail: string,
  input: GenerateSalarySlipsInput
): Promise<
  | { run: SalarySlipRun; message: string }
  | {
      needsConfirmation: true;
      incomplete: IncompleteSalaryDetail[];
      details: SalaryDetailRecord[];
      message: string;
    }
> {
  const month = Number(input.month);
  const year = Number(input.year);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12.');
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error('Year looks invalid.');
  }

  const period = formatSalaryPeriod(month, year);
  const employees = await resolvePayrollEmployees(input.employeeIds);
  const employeeIds = employees.map((employee) => employee.employeeId);

  // Always load stored salary from DB. Base / allowance / tax / bank are edited
  // only on the Salary page — slip runs never accept overrides.
  const salaryDetails = await fetchSalaryDetails(employeeIds);

  if (!input.confirmIncomplete) {
    const incomplete = findIncompleteSalaryDetails(employeeIds, salaryDetails);
    return {
      needsConfirmation: true,
      incomplete,
      details: salaryDetails,
      message:
        'Review stored salary (read-only) and enter overtime, bonus, others, and contributions for this slip. Extras are sent to the workflow only and are not stored. Edit base salary, tax, allowance, or bank details on the Salary page.',
    };
  }

  const stillIncomplete = findIncompleteSalaryDetails(employeeIds, salaryDetails).filter((row) => {
    const detail = salaryDetails.find(
      (item) => item.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase()
    );
    return !detail || !isSalaryDetailComplete(detail);
  });

  if (stillIncomplete.length > 0) {
    return {
      needsConfirmation: true,
      incomplete: stillIncomplete,
      details: salaryDetails,
      message: `${stillIncomplete.length} employee${stillIncomplete.length === 1 ? '' : 's'} are missing Base Salary or bank details. Fix them on the Salary page, then try again.`,
    };
  }

  const detailsById = new Map(
    salaryDetails.map((detail) => [detail.employeeId.trim().toLowerCase(), detail])
  );
  const extrasMap = extrasByEmployeeId(input.slipExtras);

  const run = await createSalarySlipRun({
    triggeredBy: actorEmail,
    month,
    year,
    employeeIds,
  });

  await logSalarySlipRunAudit(actorEmail, {
    action: AUDIT_ACTIONS.GENERATE,
    runId: run.runId,
    newValue: {
      month,
      year,
      monthName: monthName(month),
      period,
      status: 'Processing',
      employeeCount: employeeIds.length,
      employeeIds,
      triggeredBy: actorEmail,
    },
  });

  const payload = {
    runId: run.runId,
    month,
    year,
    monthName: monthName(month),
    period,
    triggeredBy: actorEmail,
    employeeIds,
    employees: employees.map((employee) => {
      const key = employee.employeeId.trim().toLowerCase();
      const detail = detailsById.get(key);
      const extras = extrasMap.get(key);
      return {
        RunDetailID: buildRunDetailId(run.runId, employee.employeeId),
        EmployeeID: employee.employeeId,
        FullName: detail?.fullName || employee.fullName,
        Email: detail?.email || employee.email,
        Department: detail?.department || employee.department,
        Designation: detail?.designation || employee.designation,
        BankAccountDetails: employee.bankAccountDetails,
        ...toSalaryDetailWebhookFields(detail, extras, period),
        BaseSalary: detail?.salary || employee.baseSalary,
        Status: 'Pending',
      };
    }),
  };

  let webhookOk = false;
  let webhookText = '';

  try {
    const response = await fetch(SHEETS_WEBHOOKS.generateSalarySlip, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    webhookText = await response.text();
    webhookOk = response.ok;
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'generate-salary-slip webhook not found (404). Activate the n8n workflow and use /webhook/ (not /webhook-test/).'
        );
      }
      throw new Error(
        webhookText || `generate-salary-slip webhook returned status ${response.status}.`
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to call salary slip workflow.';
    await updateSalarySlipRun(run.runId, {
      status: 'Failed',
      successCount: 0,
      failCount: employeeIds.length,
    });
    for (const employeeId of employeeIds) {
      await upsertSalarySlipRunDetail({
        runId: run.runId,
        employeeId,
        status: 'Failed',
        emailStatus: 'Failed',
        errorReason: message,
      });
    }
    await logSalarySlipRunAudit(actorEmail, {
      action: AUDIT_ACTIONS.UPDATE,
      runId: run.runId,
      oldValue: { status: 'Processing' },
      newValue: {
        month,
        year,
        status: 'Failed',
        successCount: 0,
        failCount: employeeIds.length,
        error: message,
      },
    });
    throw new Error(message);
  }

  const parsed = parseWebhookBody(webhookText);

  if (!parsed.ackOnly && parsed.results.length > 0) {
    let successCount = 0;
    let failCount = 0;

    for (const item of parsed.results) {
      const employeeId = String(item.employeeId || item.EmployeeID || '').trim();
      if (!employeeId) continue;
      const ok =
        item.success === true ||
        String(item.status || '').toLowerCase() === 'success' ||
        String(item.status || '').toLowerCase() === 'completed';
      if (ok) successCount += 1;
      else failCount += 1;

      await upsertSalarySlipRunDetail({
        runId: run.runId,
        employeeId,
        status: ok ? 'Success' : 'Failed',
        pdfLink: item.pdfLink || item.PdfLink || '',
        emailStatus: item.emailStatus || item.EmailStatus || (ok ? 'Sent' : 'Failed'),
        errorReason: item.errorReason || item.ErrorReason || item.error || '',
      });
    }

    const status = failCount === 0 ? 'Completed' : successCount === 0 ? 'Failed' : 'Partial';
    const updated = await updateSalarySlipRun(run.runId, {
      status,
      successCount,
      failCount,
    });

    await logSalarySlipRunAudit(actorEmail, {
      action: AUDIT_ACTIONS.UPDATE,
      runId: run.runId,
      oldValue: { status: 'Processing' },
      newValue: {
        month,
        year,
        status,
        successCount,
        failCount,
        employeeCount: employeeIds.length,
      },
    });

    return {
      run: updated,
      message: `Salary slip run ${status.toLowerCase()}: ${successCount} succeeded, ${failCount} failed.`,
    };
  }

  return {
    run,
    message: webhookOk
      ? 'Salary slip workflow started. Refresh this page to see progress as results come in.'
      : 'Run created.',
  };
}
