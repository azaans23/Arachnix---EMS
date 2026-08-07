export const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number] | string;

export const LEAVE_REQUEST_STATUSES = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
} as const;

export type LeaveRequestStatus =
  (typeof LEAVE_REQUEST_STATUSES)[keyof typeof LEAVE_REQUEST_STATUSES] | string;

export type LeaveRequestAction = 'approve' | 'reject' | 'request_changes';

export interface LeaveRequestInput {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason?: string;
}

export interface LeaveRequest {
  requestId: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason: string;
  status: LeaveRequestStatus;
  approvedBy: string;
  approvalDate: string;
  rejectionReason: string;
  /** True when status is Pending and a change-request note is present. */
  changesRequested?: boolean;
  fullName?: string;
  email?: string;
  department?: string;
  designation?: string;
}

/** Inclusive calendar-day count between two YYYY-MM-DD dates. */
export function countLeaveDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}
