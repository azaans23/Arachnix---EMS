import {
  countDetailsByStatus,
  isSendableDetail,
  rejectSalarySlipDb,
  rollbackSalarySlipRejection,
  type SalarySlipRejectionDbResult,
} from '@/lib/db/salary-slips';
import { fetchEmployees } from '@/lib/sheets/employees';
import { formatMonthName, formatSalaryPeriod } from '@/lib/payroll/period';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { postSheetWebhook } from '@/lib/sheets/webhook';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type { SalarySlipRun, SalarySlipRunDetail } from '@/types/salary-slip';

export type RejectSalarySlipResult = {
  run: SalarySlipRun;
  details: SalarySlipRunDetail[];
  scope: 'employee' | 'run';
  rejectedCount: number;
};

export async function rejectSalarySlipDistribution(options: {
  runId: string;
  employeeId?: string;
  rejectedBy: string;
  reason: string;
}): Promise<RejectSalarySlipResult> {
  const reason = options.reason.trim();
  if (!reason) throw new Error('A rejection reason is required.');

  let dbResult: SalarySlipRejectionDbResult | null = null;
  const scope = options.employeeId?.trim() ? 'employee' : 'run';

  try {
    dbResult = await rejectSalarySlipDb({
      runId: options.runId,
      employeeId: options.employeeId,
      rejectedBy: options.rejectedBy,
      reason,
    });

    const rejected = dbResult.details.filter(
      (detail) =>
        detail.status.trim().toLowerCase() === 'rejected' &&
        (!options.employeeId ||
          detail.employeeId.trim().toLowerCase() === options.employeeId.trim().toLowerCase())
    );

    // Posting an empty list would look like a successful no-op in n8n.
    if (rejected.length === 0) {
      throw new Error('No salary slips were rejected. Refresh the run and try again.');
    }

    // Same employee fields as the send payload so one workflow can branch on
    // `action` without needing different node expressions per branch.
    const employees = await fetchEmployees().catch(() => []);
    const employeeById = new Map(
      employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
    );
    const run = dbResult.run;
    const rejectedAt = rejected[0]?.rejectedAt || run.rejectedAt;
    // Repeated on every employee item so nodes after a Split Out still address
    // the run's payroll month rather than today's date.
    const monthName = formatMonthName(run.month);
    const period = formatSalaryPeriod(run.month, run.year);
    const counts = countDetailsByStatus(dbResult.details);
    // Tells n8n whether this run is finished or still has slips awaiting a
    // decision, so it can set the status without recomputing anything.
    const remaining = dbResult.details.filter(isSendableDetail);
    const runCompletion = remaining.length === 0 ? 'All Completed' : 'Remaining';

    await postSheetWebhook({
      url: SHEETS_WEBHOOKS.sendSalarySlip,
      label: 'send-salary-slip rejection',
      payload: {
        action: 'reject',
        scope,
        TargetFolder: 'Rejected',
        RunCompletion: runCompletion,
        NextRunStatus: run.status,
        counts: {
          SuccessCount: counts.successCount,
          FailedCount: counts.failCount,
          EmployeeCount: counts.employeeCount,
          RejectedCount: counts.rejectedCount,
          RejectedThisAction: rejected.length,
          RemainingCount: remaining.length,
        },
        run: {
          RunID: run.runId,
          RunDate: run.runDate,
          Month: run.month,
          Year: run.year,
          MonthName: monthName,
          Period: period,
          Status: run.status,
          SuccessCount: counts.successCount,
          FailedCount: counts.failCount,
          EmployeeCount: counts.employeeCount,
          RejectedCount: counts.rejectedCount,
          RejectedThisAction: rejected.length,
          RemainingCount: remaining.length,
          RunCompletion: runCompletion,
          NextRunStatus: run.status,
          TargetFolder: 'Rejected',
          RejectedBy: options.rejectedBy,
          RejectedAt: rejectedAt,
          RejectionReason: reason,
        },
        employees: rejected.map((detail) => {
          const employee = employeeById.get(detail.employeeId.trim().toLowerCase());
          return {
            RunDetailID: detail.runDetailId,
            EmployeeID: detail.employeeId,
            FullName: employee?.fullName || '',
            Email: employee?.email || '',
            PdfLink: detail.pdfLink,
            Month: run.month,
            Year: run.year,
            MonthName: monthName,
            Period: period,
            TargetFolder: 'Rejected',
            RunCompletion: runCompletion,
            NextRunStatus: run.status,
            Status: detail.status,
            EmailStatus: detail.emailStatus,
            RejectedBy: detail.rejectedBy,
            RejectedAt: detail.rejectedAt,
            RejectionReason: detail.rejectionReason,
          };
        }),
      },
    });

    await logAuditBestEffort(
      options.rejectedBy,
      {
        action: AUDIT_ACTIONS.REJECT,
        recordType: AUDIT_RECORD_TYPES.SALARY_SLIP_RUN,
        recordId: dbResult.run.runId,
        oldValue: {
          status: dbResult.previousRun.status,
          employeeId: options.employeeId || null,
        },
        newValue: {
          status: dbResult.run.status,
          scope,
          employeeId: options.employeeId || null,
          reason,
          rejectedCount: rejected.length,
        },
      },
      'Salary slip rejection audit'
    );

    return {
      run: dbResult.run,
      details: dbResult.details,
      scope,
      rejectedCount: rejected.length,
    };
  } catch (error) {
    if (dbResult) {
      try {
        await rollbackSalarySlipRejection(dbResult);
      } catch (rollbackError) {
        console.error('Failed to roll back salary slip rejection:', rollbackError);
      }
    }
    throw error;
  }
}
