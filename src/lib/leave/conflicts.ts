import type { LeaveDepartmentConflict, LeaveRequest } from '@/types/leave-request';

const CONFLICT_STATUSES = new Set(['pending', 'approved']);

function normalizeDepartment(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function employeeKey(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/** Inclusive YYYY-MM-DD ranges overlap when neither starts after the other ends. */
export function leaveDatesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = startA.trim().slice(0, 10);
  const aEnd = endA.trim().slice(0, 10);
  const bStart = startB.trim().slice(0, 10);
  const bEnd = endB.trim().slice(0, 10);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

function isConflictStatus(status: string | undefined): boolean {
  return CONFLICT_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function toLeaveDepartmentConflict(row: LeaveRequest): LeaveDepartmentConflict {
  return {
    requestId: row.requestId,
    employeeId: row.employeeId,
    fullName: row.fullName || row.employeeId,
    department: row.department || '',
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
  };
}

/**
 * Other people in the same department whose Pending or Approved leave overlaps
 * this request's dates. Same employee and Rejected rows are ignored.
 */
export function findDepartmentLeaveConflicts(
  target: Pick<LeaveRequest, 'requestId' | 'employeeId' | 'department' | 'startDate' | 'endDate'>,
  all: LeaveRequest[]
): LeaveDepartmentConflict[] {
  const department = normalizeDepartment(target.department);
  if (!department) return [];

  const selfEmployee = employeeKey(target.employeeId);
  const selfRequest = String(target.requestId || '').trim();

  return all
    .filter((row) => {
      if (!isConflictStatus(row.status)) return false;
      if (selfRequest && String(row.requestId).trim() === selfRequest) return false;
      if (employeeKey(row.employeeId) === selfEmployee) return false;
      if (normalizeDepartment(row.department) !== department) return false;
      return leaveDatesOverlap(target.startDate, target.endDate, row.startDate, row.endDate);
    })
    .map(toLeaveDepartmentConflict);
}

export function attachDepartmentLeaveConflicts(requests: LeaveRequest[]): LeaveRequest[] {
  return requests.map((request) => ({
    ...request,
    departmentConflicts: findDepartmentLeaveConflicts(request, requests),
  }));
}
