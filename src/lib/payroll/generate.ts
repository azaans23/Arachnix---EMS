import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { fetchEmployees } from '@/lib/sheets/employees';
import {
  createSalarySlipRun,
  updateSalarySlipRun,
  upsertSalarySlipRunDetail,
  buildRunDetailId,
} from '@/lib/db/salary-slips';
import { formatAmountWithCommas, formatSalaryPeriod } from '@/lib/payroll/period';
import { isPayrollEligible, payrollEligibilityReason } from '@/lib/payroll/eligibility';
import { listOffboardings } from '@/lib/offboarding/process';
import { buildOffboardingIndex } from '@/lib/offboarding/status';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
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

export async function resolvePayrollEmployees(employeeIds?: string[]): Promise<EmployeeRecord[]> {
  const [all, salaryRows, offboardingRows] = await Promise.all([
    fetchEmployees(),
    fetchSalaryDetails(),
    listOffboardings(),
  ]);
  const salaryIds = new Set(salaryRows.map((row) => row.employeeId.trim().toLowerCase()));
  const offboardings = buildOffboardingIndex(offboardingRows);
  const eligible = all.filter((employee) => isPayrollEligible(employee, salaryIds, offboardings));

  if (!employeeIds || employeeIds.length === 0) return eligible;

  const wanted = new Set(employeeIds.map((id) => id.trim().toLowerCase()));
  const selected = eligible.filter((employee) =>
    wanted.has(employee.employeeId.trim().toLowerCase())
  );

  if (selected.length === 0) {
    const reasons = employeeIds.slice(0, 5).map((id) => {
      const employee = all.find(
        (row) => row.employeeId.trim().toLowerCase() === id.trim().toLowerCase()
      );
      if (!employee) return `${id} — employee not found`;
      return `${employee.employeeId} — ${
        payrollEligibilityReason(employee, salaryIds, offboardings) || 'not eligible'
      }`;
    });
    throw new Error(`No eligible employees in this selection. ${reasons.join('; ')}`);
  }

  return selected;
}

export type PreparedSalarySlipRun = {
  run: SalarySlipRun;
  actorEmail: string;
  month: number;
  year: number;
  employeeIds: string[];
  payload: Record<string, unknown>;
};

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
  await logAuditBestEffort(
    actorEmail,
    {
      action: input.action,
      recordType: AUDIT_RECORD_TYPES.SALARY_SLIP_RUN,
      recordId: input.runId,
      oldValue: input.oldValue,
      newValue: input.newValue,
    },
    'Salary slip run audit'
  );
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
 * Creates a Supabase run (Processing) with Pending detail rows and builds the
 * n8n payload. Does not wait for the workflow — call `dispatchSalarySlipWebhook`
 * from `after()` so the API can return immediately. n8n updates run/detail
 * status in Supabase when generation finishes.
 *
 * Slip-only extras (OT / bonus / others / contributions) are sent to n8n only
 * and are never written to the salaries table.
 */
export async function startSalarySlipRun(
  actorEmail: string,
  input: GenerateSalarySlipsInput
): Promise<
  | { prepared: PreparedSalarySlipRun; message: string }
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
        BankAccountDetails: [detail?.bankName, detail?.accountName, detail?.accountNumber]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(' · '),
        ...toSalaryDetailWebhookFields(detail, extras, period),
        BaseSalary: formatAmountWithCommas(detail?.salary || ''),
        Status: 'Pending',
      };
    }),
  };

  return {
    prepared: {
      run,
      actorEmail,
      month,
      year,
      employeeIds,
      payload,
    },
    message: 'Salary slip generation started. Status will update when the workflow finishes.',
  };
}

/**
 * Fires the n8n webhook. On trigger failure, marks the run Failed.
 * Success/Partial/Failed completion is owned by the workflow (Supabase updates).
 */
export async function dispatchSalarySlipWebhook(prepared: PreparedSalarySlipRun): Promise<void> {
  const { run, actorEmail, month, year, employeeIds, payload } = prepared;

  try {
    const response = await fetch(SHEETS_WEBHOOKS.generateSalarySlip, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const webhookText = await response.text();
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
}
