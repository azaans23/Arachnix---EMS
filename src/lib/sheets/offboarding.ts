import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { postSheetWebhook } from '@/lib/sheets/webhook';
import type { OffboardingRecord } from '@/types/offboarding';

export type OffboardingSheetAction = 'create' | 'update' | 'complete' | 'cancel';

/** Flat Google Sheet column mapping. Checklist is retained as JSON text. */
export function toWebhookOffboardingRow(record: OffboardingRecord) {
  return {
    OffboardingID: record.offboardingId,
    EmployeeID: record.employeeId,
    FullName: record.fullName,
    Email: record.email,
    Department: record.department,
    Status: record.status,
    LastWorkingDate: record.lastWorkingDate,
    Reason: record.reason,
    Notes: record.notes,
    InitiatedBy: record.initiatedBy,
    InitiatedAt: record.initiatedAt,
    CompletedBy: record.completedBy,
    CompletedAt: record.completedAt,
    MonthlySalary: record.monthlySalary,
    UnusedLeaveDays: record.unusedLeaveDays,
    DailyRate: record.dailyRate,
    LeaveEncashment: record.leaveEncashment,
    DaysWorked: record.daysWorked,
    ProratedSalary: record.proratedSalary,
    UnpaidDays: record.unpaidDays,
    UnpaidDeduction: record.unpaidDeduction,
    OtherAdditions: record.otherAdditions,
    OtherDeductions: record.otherDeductions,
    NetSettlement: record.netSettlement,
    Checklist: JSON.stringify(record.checklist),
  };
}

export async function syncOffboardingToSheet(
  action: OffboardingSheetAction,
  record: OffboardingRecord
): Promise<void> {
  await postSheetWebhook({
    url: SHEETS_WEBHOOKS.upsertOffboarding,
    label: 'upsert-offboarding',
    payload: {
      action,
      offboarding: toWebhookOffboardingRow(record),
    },
  });
}
