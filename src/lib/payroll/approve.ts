import {
  approveSalarySlipRunDb,
  countDetailsByStatus,
  getSalarySlipRun,
  isSendableDetail,
  listSalarySlipRunDetails,
  rollbackSalarySlipRunApproval,
} from '@/lib/db/salary-slips';
import { fetchEmployees } from '@/lib/sheets/employees';
import { formatMonthName, formatSalaryPeriod } from '@/lib/payroll/period';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { postSheetWebhook } from '@/lib/sheets/webhook';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type { SalarySlipRun } from '@/types/salary-slip';

export async function approveSalarySlipDistribution(options: {
  runId: string;
  approvedBy: string;
  /** Approve a single employee's slip; omit to approve every pending slip. */
  employeeId?: string;
}): Promise<SalarySlipRun> {
  const current = await getSalarySlipRun(options.runId);
  if (!current) throw new Error('Salary slip run not found.');
  if (current.status.trim().toLowerCase() !== 'awaiting approval') {
    throw new Error(`Only runs awaiting approval can be approved. Current status: ${current.status}.`);
  }

  const [details, employees] = await Promise.all([
    listSalarySlipRunDetails(options.runId),
    fetchEmployees(),
  ]);
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
  );
  const sendable = details.filter(isSendableDetail);

  const employeeId = options.employeeId?.trim();
  const scope: 'employee' | 'run' = employeeId ? 'employee' : 'run';
  let selected = sendable;

  if (employeeId) {
    const key = employeeId.toLowerCase();
    selected = sendable.filter((detail) => detail.employeeId.trim().toLowerCase() === key);
    if (selected.length === 0) {
      const detail = details.find((row) => row.employeeId.trim().toLowerCase() === key);
      if (!detail) throw new Error('Employee salary slip not found in this run.');
      if (detail.emailStatus.trim().toLowerCase() === 'sent') {
        throw new Error('This salary slip was already emailed.');
      }
      throw new Error(`Only generated slips can be approved. Current status: ${detail.status}.`);
    }
  }

  if (selected.length === 0) {
    throw new Error('No generated salary slips are ready to send.');
  }

  const missing = selected.filter((detail) => {
    const employee = employeeById.get(detail.employeeId.trim().toLowerCase());
    return !detail.pdfLink || !employee?.email;
  });
  if (missing.length > 0) {
    throw new Error(
      `Cannot approve: ${missing.length} generated slip${missing.length === 1 ? '' : 's'} ${missing.length === 1 ? 'is' : 'are'} missing a PDF link or employee email.`
    );
  }

  const selectedIds = new Set(selected.map((detail) => detail.employeeId));
  const remaining = sendable.filter((detail) => !selectedIds.has(detail.employeeId));

  // A partial approval leaves the run open so the remaining slips can still be
  // approved or rejected; only the last one closes the approval gate.
  const approved =
    remaining.length === 0
      ? await approveSalarySlipRunDb(options.runId, options.approvedBy)
      : current;
  if (!approved) {
    throw new Error('This run was already approved or its status changed. Refresh and try again.');
  }

  // Repeated on every employee item so nodes after a Split Out still address the
  // run's payroll month rather than today's date.
  const monthName = formatMonthName(approved.month);
  const period = formatSalaryPeriod(approved.month, approved.year);
  const counts = countDetailsByStatus(details);
  const runCompletion = remaining.length === 0 ? 'All Completed' : 'Remaining';
  const nextRunStatus = remaining.length === 0 ? 'Completed' : 'Awaiting Approval';

  try {
    await postSheetWebhook({
      url: SHEETS_WEBHOOKS.sendSalarySlip,
      label: 'send-salary-slip',
      payload: {
        action: 'send',
        scope,
        // Tells n8n whether this send finishes the run or more slips are still
        // awaiting a decision, so it can set the status without recomputing.
        RunCompletion: runCompletion,
        NextRunStatus: nextRunStatus,
        counts: {
          SuccessCount: counts.successCount,
          FailedCount: counts.failCount,
          EmployeeCount: counts.employeeCount,
          RejectedCount: counts.rejectedCount,
          SendCount: selected.length,
          RemainingCount: remaining.length,
        },
        run: {
          RunID: approved.runId,
          RunDate: approved.runDate,
          Month: approved.month,
          Year: approved.year,
          MonthName: monthName,
          Period: period,
          Status: approved.status,
          SuccessCount: counts.successCount,
          FailedCount: counts.failCount,
          EmployeeCount: counts.employeeCount,
          RejectedCount: counts.rejectedCount,
          SendCount: selected.length,
          RemainingCount: remaining.length,
          RunCompletion: runCompletion,
          NextRunStatus: nextRunStatus,
          ApprovedBy: approved.approvedBy,
          ApprovedAt: approved.approvedAt,
        },
        employees: selected.map((detail) => {
          const employee = employeeById.get(detail.employeeId.trim().toLowerCase())!;
          return {
            RunDetailID: detail.runDetailId,
            EmployeeID: detail.employeeId,
            FullName: employee.fullName,
            Email: employee.email,
            PdfLink: detail.pdfLink,
            Month: approved.month,
            Year: approved.year,
            MonthName: monthName,
            Period: period,
            RunCompletion: runCompletion,
            NextRunStatus: nextRunStatus,
          };
        }),
      },
    });
  } catch (error) {
    if (remaining.length === 0) {
      try {
        await rollbackSalarySlipRunApproval(options.runId);
      } catch (rollbackError) {
        console.error('Failed to roll back salary slip approval:', rollbackError);
      }
    }
    throw error;
  }

  await logAuditBestEffort(
    options.approvedBy,
    {
      action: AUDIT_ACTIONS.APPROVE,
      recordType: AUDIT_RECORD_TYPES.SALARY_SLIP_RUN,
      recordId: approved.runId,
      oldValue: { status: current.status },
      newValue: {
        status: approved.status,
        approvedBy: approved.approvedBy,
        approvedAt: approved.approvedAt,
        scope,
        employeeId: employeeId || null,
        sendCount: selected.length,
        remainingCount: remaining.length,
      },
    },
    'Salary slip approval audit'
  );

  return approved;
}
