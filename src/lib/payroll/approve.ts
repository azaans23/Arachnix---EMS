import {
  approveSalarySlipRunDb,
  getSalarySlipRun,
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

function isGenerated(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'success' || normalized === 'completed';
}

export async function approveSalarySlipDistribution(options: {
  runId: string;
  approvedBy: string;
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
  const generated = details.filter((detail) => isGenerated(detail.status));
  if (generated.length === 0) {
    throw new Error('No generated salary slips are ready to send.');
  }

  const missing = generated.filter((detail) => {
    const employee = employeeById.get(detail.employeeId.trim().toLowerCase());
    return !detail.pdfLink || !employee?.email;
  });
  if (missing.length > 0) {
    throw new Error(
      `Cannot approve: ${missing.length} generated slip${missing.length === 1 ? '' : 's'} ${missing.length === 1 ? 'is' : 'are'} missing a PDF link or employee email.`
    );
  }

  const approved = await approveSalarySlipRunDb(options.runId, options.approvedBy);
  if (!approved) {
    throw new Error('This run was already approved or its status changed. Refresh and try again.');
  }

  // Repeated on every employee item so nodes after a Split Out still address the
  // run's payroll month rather than today's date.
  const monthName = formatMonthName(approved.month);
  const period = formatSalaryPeriod(approved.month, approved.year);

  try {
    await postSheetWebhook({
      url: SHEETS_WEBHOOKS.sendSalarySlip,
      label: 'send-salary-slip',
      payload: {
        action: 'send',
        run: {
          RunID: approved.runId,
          Month: approved.month,
          Year: approved.year,
          MonthName: monthName,
          Period: period,
          Status: approved.status,
          ApprovedBy: approved.approvedBy,
          ApprovedAt: approved.approvedAt,
        },
        employees: generated.map((detail) => {
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
          };
        }),
      },
    });
  } catch (error) {
    try {
      await rollbackSalarySlipRunApproval(options.runId);
    } catch (rollbackError) {
      console.error('Failed to roll back salary slip approval:', rollbackError);
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
        sendCount: generated.length,
      },
    },
    'Salary slip approval audit'
  );

  return approved;
}
