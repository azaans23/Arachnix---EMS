import { deleteAuthUser, findAuthUserIdByEmail } from '@/lib/auth';
import {
  dbRowToEmployeeRecord,
  getEmployeeDbRow,
  listEmployeeDbRows,
} from '@/lib/db/employees';
import { archiveGeneratedDocumentsForEmployee } from '@/lib/db/generated-documents';
import { getLeaveBalance } from '@/lib/db/leave-balances';
import { listLeaveRequests } from '@/lib/db/leave-requests';
import {
  assertOpenStatus,
  dbRowToOffboardingRecord,
  defaultOffboardingChecklist,
  deleteOffboardingDbRow,
  getOffboardingDbRow,
  getOpenOffboardingForEmployee,
  insertOffboardingDbRow,
  listOffboardingDbRows,
  restoreOffboardingDbRow,
  updateOffboardingDbRow,
  type OffboardingDbRow,
} from '@/lib/db/offboardings';
import { getSalaryDbRow } from '@/lib/db/salaries';
import { processLeaveRequestAction } from '@/lib/leave/process-request';
import { calculateOffboardingSettlement } from '@/lib/offboarding/settlement';
import { isSuperAdminRole } from '@/lib/rbac';
import { employeeToFormValues, upsertEmployee } from '@/lib/sheets/employees';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { syncOffboardingToSheet } from '@/lib/sheets/offboarding';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type { OffboardingChecklistItem, OffboardingRecord } from '@/types/offboarding';
import { OFFBOARDING_STATUSES } from '@/types/offboarding';

function money(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function enrich(row: OffboardingDbRow): Promise<OffboardingRecord> {
  const employee = await getEmployeeDbRow(row.employeeid);
  const record = employee ? dbRowToEmployeeRecord(employee) : null;
  const mapped = dbRowToOffboardingRecord(row, {
    fullName: record?.fullName,
    email: record?.email,
    department: record?.department,
  });
  if (mapped.lastWorkingDate) {
    const [year, month] = mapped.lastWorkingDate.split('-').map(Number);
    mapped.daysInMonth = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
  }
  return mapped;
}

async function unusedAnnualLeaveDays(employeeId: string, asOfDate: string): Promise<number> {
  const year = Number((asOfDate || new Date().toISOString()).slice(0, 4));
  const balance = await getLeaveBalance(employeeId, year).catch(() => null);
  if (!balance) return 0;
  return Math.max(0, Number(balance.annualQuota || 0) - Number(balance.annualUsed || 0));
}

export async function previewOffboardingSettlement(options: {
  employeeId: string;
  lastWorkingDate: string;
  unpaidDays?: number;
  otherAdditions?: number;
  otherDeductions?: number;
}) {
  const [salary, employee] = await Promise.all([
    getSalaryDbRow(options.employeeId),
    getEmployeeDbRow(options.employeeId),
  ]);
  const unusedLeaveDays = await unusedAnnualLeaveDays(
    options.employeeId,
    options.lastWorkingDate || new Date().toISOString().slice(0, 10)
  );
  return calculateOffboardingSettlement({
    monthlySalary: money(salary?.basesalary),
    unusedLeaveDays,
    lastWorkingDate: options.lastWorkingDate,
    joiningDate: employee?.joiningdate ? String(employee.joiningdate) : undefined,
    unpaidDays: options.unpaidDays,
    otherAdditions: options.otherAdditions,
    otherDeductions: options.otherDeductions,
  });
}

export async function listOffboardings(employeeId?: string): Promise<OffboardingRecord[]> {
  const [rows, employees] = await Promise.all([
    listOffboardingDbRows(employeeId),
    listEmployeeDbRows().catch(() => []),
  ]);
  const byId = new Map(
    employees.map((row) => [row.employeeid.trim().toLowerCase(), dbRowToEmployeeRecord(row)])
  );
  return rows.map((row) => {
    const employee = byId.get(row.employeeid.trim().toLowerCase());
    const mapped = dbRowToOffboardingRecord(row, employee);
    if (mapped.lastWorkingDate) {
      const [year, month] = mapped.lastWorkingDate.split('-').map(Number);
      mapped.daysInMonth = year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
    }
    return mapped;
  });
}

export async function getOffboardingForEmployee(employeeId: string): Promise<{
  employee: ReturnType<typeof dbRowToEmployeeRecord>;
  open: OffboardingRecord | null;
  history: OffboardingRecord[];
}> {
  const dbEmployee = await getEmployeeDbRow(employeeId);
  if (!dbEmployee) throw new Error('Employee not found.');
  const employee = dbRowToEmployeeRecord(dbEmployee);
  const history = await listOffboardings(employeeId);
  const open = history.find((row) => row.status === OFFBOARDING_STATUSES.INITIATED) || null;
  return { employee, open, history };
}

export async function startOffboarding(options: {
  employeeId: string;
  actorEmail: string;
  reason?: string;
  lastWorkingDate?: string;
}): Promise<OffboardingRecord> {
  const dbEmployee = await getEmployeeDbRow(options.employeeId);
  if (!dbEmployee) throw new Error('Employee not found.');
  const employee = dbRowToEmployeeRecord(dbEmployee);
  if (isSuperAdminRole(employee.role)) {
    throw new Error('Super Admin cannot be offboarded.');
  }
  if (employee.emsStatus.toLowerCase() === 'inactive' && !employee.supabaseUserId) {
    const completed = (await listOffboardings(options.employeeId)).find(
      (row) => row.status === OFFBOARDING_STATUSES.COMPLETED
    );
    if (completed) throw new Error('This employee has already completed offboarding.');
  }

  const existing = await getOpenOffboardingForEmployee(options.employeeId);
  if (existing) return enrich(existing);

  const lastWorkingDate = (options.lastWorkingDate || '').trim();
  const settlement = await previewOffboardingSettlement({
    employeeId: options.employeeId,
    lastWorkingDate,
  });

  const row = await insertOffboardingDbRow({
    employeeId: options.employeeId,
    initiatedBy: options.actorEmail,
    reason: options.reason,
    lastWorkingDate,
    checklist: defaultOffboardingChecklist(),
    settlement,
  });
  const record = await enrich(row);

  try {
    await syncOffboardingToSheet('create', record);
  } catch (sheetError) {
    try {
      await deleteOffboardingDbRow(row.offboardingid);
    } catch (rollbackError) {
      console.error('Failed to roll back offboarding after sheet create failure:', rollbackError);
    }
    throw sheetError;
  }

  await logAuditBestEffort(
    options.actorEmail,
    {
      action: AUDIT_ACTIONS.CREATE,
      recordType: AUDIT_RECORD_TYPES.EMPLOYEE,
      recordId: options.employeeId,
      newValue: { offboardingId: String(row.offboardingid), status: row.status },
    },
    'Offboarding audit'
  );

  return record;
}

export async function saveOffboardingDraft(options: {
  offboardingId: string;
  actorEmail: string;
  lastWorkingDate?: string;
  reason?: string;
  notes?: string;
  unpaidDays?: number;
  otherAdditions?: number;
  otherDeductions?: number;
  checklist?: OffboardingChecklistItem[];
  /** Skipped when completing, so the case reaches the sheet once as 'complete'. */
  syncSheet?: boolean;
}): Promise<OffboardingRecord> {
  const current = await getOffboardingDbRow(options.offboardingId);
  if (!current) throw new Error('Offboarding not found.');
  assertOpenStatus(current.status);

  const lastWorkingDate = (
    options.lastWorkingDate ??
    (current.lastworkingdate ? String(current.lastworkingdate).slice(0, 10) : '')
  ).trim();

  const settlement = await previewOffboardingSettlement({
    employeeId: current.employeeid,
    lastWorkingDate,
    unpaidDays: options.unpaidDays ?? Number(current.unpaiddays || 0),
    otherAdditions: options.otherAdditions ?? Number(current.otheradditions || 0),
    otherDeductions: options.otherDeductions ?? Number(current.otherdeductions || 0),
  });

  let checklist = Array.isArray(options.checklist) ? options.checklist : current.checklist;
  if (Array.isArray(checklist)) {
    checklist = checklist.map((item) => {
      if (item.automatic) return item;
      if (!item.done) return { ...item, doneAt: '' };
      return { ...item, doneAt: item.doneAt || new Date().toISOString() };
    });
  }

  const row = await updateOffboardingDbRow(options.offboardingId, {
    lastworkingdate: lastWorkingDate || null,
    reason: options.reason !== undefined ? options.reason.trim() || null : current.reason,
    notes: options.notes !== undefined ? options.notes.trim() || null : current.notes,
    checklist,
    monthlysalary: settlement.monthlySalary,
    unusedleavedays: settlement.unusedLeaveDays,
    dailyrate: settlement.dailyRate,
    leaveencashment: settlement.leaveEncashment,
    daysworked: settlement.daysWorked,
    proratedsalary: settlement.proratedSalary,
    unpaiddays: settlement.unpaidDays,
    unpaiddeduction: settlement.unpaidDeduction,
    otheradditions: settlement.otherAdditions,
    otherdeductions: settlement.otherDeductions,
    netsettlement: settlement.netSettlement,
  });
  const record = await enrich(row);

  if (options.syncSheet !== false) {
    try {
      await syncOffboardingToSheet('update', record);
    } catch (sheetError) {
      try {
        await restoreOffboardingDbRow(current);
      } catch (rollbackError) {
        console.error('Failed to roll back offboarding after sheet update failure:', rollbackError);
      }
      throw sheetError;
    }
  }

  return record;
}

async function markAutomaticDone(
  checklist: OffboardingChecklistItem[],
  id: string
): Promise<OffboardingChecklistItem[]> {
  const now = new Date().toISOString();
  return checklist.map((item) =>
    item.id === id ? { ...item, done: true, doneAt: now } : item
  );
}

export async function completeOffboarding(options: {
  offboardingId: string;
  actorEmail: string;
}): Promise<OffboardingRecord> {
  const current = await getOffboardingDbRow(options.offboardingId);
  if (!current) throw new Error('Offboarding not found.');
  assertOpenStatus(current.status);
  const saved = await enrich(current);

  if (!saved.lastWorkingDate) {
    throw new Error('Last working date is required to complete offboarding.');
  }

  const incomplete = saved.checklist.filter((item) => !item.automatic && !item.done);
  if (incomplete.length > 0) {
    throw new Error(
      `Complete the manual checklist first: ${incomplete.map((item) => item.label).join(', ')}.`
    );
  }

  const dbEmployee = await getEmployeeDbRow(saved.employeeId);
  if (!dbEmployee) throw new Error('Employee not found.');
  const employee = dbRowToEmployeeRecord(dbEmployee);

  const pendingLeaves = (await listLeaveRequests({ employeeId: saved.employeeId })).filter(
    (row) => String(row.status).toLowerCase() === 'pending'
  );
  for (const request of pendingLeaves) {
    await processLeaveRequestAction(
      request.requestId,
      'reject',
      { email: options.actorEmail },
      { reason: 'Closed during employee offboarding.' }
    );
  }
  let checklist = await markAutomaticDone(saved.checklist, 'close_leave');

  await archiveGeneratedDocumentsForEmployee(saved.employeeId);
  checklist = await markAutomaticDone(checklist, 'archive_documents');

  let authUserId = String(employee.supabaseUserId || '').trim();
  if (!authUserId && employee.email) {
    authUserId = (await findAuthUserIdByEmail(employee.email)) || '';
  }
  if (authUserId) {
    await deleteAuthUser(authUserId);
  }

  const write = employeeToFormValues(employee);
  write.emsStatus = 'Inactive';
  write.supabaseUserId = '';
  write.originalEmployeeId = employee.employeeId;
  write.originalEmail = employee.email;
  await upsertEmployee(write, employee);
  checklist = await markAutomaticDone(checklist, 'revoke_access');

  const now = new Date().toISOString();
  const completionPrevious = await getOffboardingDbRow(options.offboardingId);
  if (!completionPrevious) throw new Error('Offboarding not found.');
  const row = await updateOffboardingDbRow(options.offboardingId, {
    status: OFFBOARDING_STATUSES.COMPLETED,
    completedby: options.actorEmail.trim().toLowerCase(),
    completedat: now,
    checklist,
  });
  const record = await enrich(row);

  try {
    await syncOffboardingToSheet('complete', record);
  } catch (sheetError) {
    try {
      await restoreOffboardingDbRow(completionPrevious);
    } catch (rollbackError) {
      console.error(
        'Failed to roll back offboarding status after sheet completion failure:',
        rollbackError
      );
    }
    throw sheetError;
  }

  await logAuditBestEffort(
    options.actorEmail,
    {
      action: AUDIT_ACTIONS.REVOKE_ACCESS,
      recordType: AUDIT_RECORD_TYPES.EMPLOYEE,
      recordId: saved.employeeId,
      oldValue: { emsStatus: employee.emsStatus, supabaseUserId: employee.supabaseUserId },
      newValue: {
        emsStatus: 'Inactive',
        offboardingId: saved.offboardingId,
        netSettlement: saved.netSettlement,
      },
    },
    'Offboarding complete audit'
  );

  return record;
}

export async function cancelOffboarding(options: {
  offboardingId: string;
  actorEmail: string;
}): Promise<OffboardingRecord> {
  const current = await getOffboardingDbRow(options.offboardingId);
  if (!current) throw new Error('Offboarding not found.');
  assertOpenStatus(current.status);

  const row = await updateOffboardingDbRow(options.offboardingId, {
    status: OFFBOARDING_STATUSES.CANCELLED,
    completedby: options.actorEmail.trim().toLowerCase(),
    completedat: new Date().toISOString(),
  });
  const record = await enrich(row);

  try {
    await syncOffboardingToSheet('cancel', record);
  } catch (sheetError) {
    try {
      await restoreOffboardingDbRow(current);
    } catch (rollbackError) {
      console.error('Failed to roll back offboarding after sheet cancel failure:', rollbackError);
    }
    throw sheetError;
  }

  return record;
}
