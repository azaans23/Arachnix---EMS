import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listEmployeeDbRows } from '@/lib/db/employees';
import {
  countLeaveDays,
  type LeaveRequest,
  type LeaveRequestInput,
  type LeaveRequestStatus,
} from '@/types/leave-request';

type LeaveRequestDbRow = {
  requestid: number;
  employeeid: string;
  leavetype: string;
  startdate: string;
  enddate: string;
  daysrequested: number;
  reason: string | null;
  status: string;
  approvedby: string | null;
  approvaldate: string | null;
  rejectionreason: string | null;
};

const TABLE = 'leaverequests';
const ALLOWED_STATUSES = new Set(['Pending', 'Approved', 'Rejected']);

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function requireIsoDate(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }
  const days = countLeaveDays(text, text);
  if (!days) throw new Error(`${label} must be a valid date.`);
  return text;
}

function toDays(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return n;
}

export function normalizeLeaveRequestInput(raw: Record<string, unknown>): LeaveRequestInput {
  const employeeId = requiredText(raw.employeeId ?? raw.EmployeeID, 'EmployeeID');
  const leaveType = requiredText(raw.leaveType ?? raw.LeaveType, 'LeaveType');
  const startDate = requireIsoDate(raw.startDate ?? raw.StartDate, 'StartDate');
  const endDate = requireIsoDate(raw.endDate ?? raw.EndDate, 'EndDate');

  if (endDate < startDate) {
    throw new Error('EndDate cannot be before StartDate.');
  }

  const computed = countLeaveDays(startDate, endDate);
  const daysRequestedRaw = raw.daysRequested ?? raw.DaysRequested;
  const daysRequested =
    daysRequestedRaw === undefined || String(daysRequestedRaw).trim() === ''
      ? computed
      : toDays(daysRequestedRaw, 'DaysRequested');

  return {
    employeeId,
    leaveType,
    startDate,
    endDate,
    daysRequested,
    reason: String(raw.reason ?? raw.Reason ?? '').trim(),
  };
}

export function mapLeaveRequestRow(row: LeaveRequestDbRow): LeaveRequest {
  const status = row.status || 'Pending';
  const rejectionReason = row.rejectionreason || '';
  return {
    requestId: String(row.requestid),
    employeeId: row.employeeid,
    leaveType: row.leavetype,
    startDate: row.startdate,
    endDate: row.enddate,
    daysRequested: Number(row.daysrequested ?? 0),
    reason: row.reason || '',
    status,
    approvedBy: row.approvedby || '',
    approvalDate: row.approvaldate || '',
    rejectionReason,
    changesRequested: status === 'Pending' && Boolean(rejectionReason.trim()),
  };
}

/** Sheet / webhook column names for Leave Requests. */
export function toWebhookLeaveRequestRow(request: LeaveRequest) {
  return {
    RequestID: Number(request.requestId) || request.requestId,
    EmployeeID: request.employeeId,
    LeaveType: request.leaveType,
    StartDate: request.startDate,
    EndDate: request.endDate,
    DaysRequested: request.daysRequested,
    Reason: request.reason || '',
    Status: request.status,
    ApprovedBy: request.approvedBy || '',
    ApprovalDate: request.approvalDate || '',
    RejectionReason: request.rejectionReason || '',
  };
}

export async function listLeaveRequests(filters?: {
  status?: string;
  employeeId?: string;
}): Promise<LeaveRequest[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.employeeId) {
    query = query.eq('employeeid', filters.employeeId.trim());
  }

  const { data, error } = await query.order('requestid', { ascending: false });
  if (error) throw new Error(`Failed to list leave requests: ${error.message}`);

  const requests = ((data as LeaveRequestDbRow[]) || []).map(mapLeaveRequestRow);
  const employees = await listEmployeeDbRows().catch(() => []);
  const byId = new Map(
    employees.map((employee) => [employee.employeeid.trim().toLowerCase(), employee])
  );

  return requests.map((request) => {
    const employee = byId.get(request.employeeId.trim().toLowerCase());
    return {
      ...request,
      fullName: employee?.fullname || '',
      email: employee?.email || '',
      department: employee?.department || '',
      designation: employee?.designation || '',
    };
  });
}

export async function getLeaveRequest(requestId: string): Promise<LeaveRequest | null> {
  const id = Number(requestId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('requestid', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load leave request: ${error.message}`);
  if (!data) return null;
  return mapLeaveRequestRow(data as LeaveRequestDbRow);
}

export async function createLeaveRequest(input: LeaveRequestInput): Promise<LeaveRequest> {
  const payload = {
    employeeid: input.employeeId,
    leavetype: input.leaveType,
    startdate: input.startDate,
    enddate: input.endDate,
    daysrequested: input.daysRequested,
    reason: input.reason || null,
    status: 'Pending',
  };

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create leave request: ${error.message}`);
  return mapLeaveRequestRow(data as LeaveRequestDbRow);
}

export async function updateLeaveRequestRow(
  requestId: string,
  patch: {
    status?: LeaveRequestStatus;
    approvedBy?: string | null;
    approvalDate?: string | null;
    rejectionReason?: string | null;
    reason?: string | null;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    daysRequested?: number;
  }
): Promise<LeaveRequest> {
  const id = Number(requestId);
  if (!Number.isFinite(id)) throw new Error('Invalid request ID.');

  if (patch.status && !ALLOWED_STATUSES.has(patch.status)) {
    throw new Error(`Invalid leave request status: ${patch.status}`);
  }

  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.approvedBy !== undefined) {
    payload.approvedby = patch.approvedBy ? String(patch.approvedBy).slice(0, 50) : null;
  }
  if (patch.approvalDate !== undefined) payload.approvaldate = patch.approvalDate;
  if (patch.rejectionReason !== undefined) {
    payload.rejectionreason = patch.rejectionReason || null;
  }
  if (patch.reason !== undefined) payload.reason = patch.reason || null;
  if (patch.leaveType !== undefined) payload.leavetype = patch.leaveType;
  if (patch.startDate !== undefined) payload.startdate = patch.startDate;
  if (patch.endDate !== undefined) payload.enddate = patch.endDate;
  if (patch.daysRequested !== undefined) payload.daysrequested = patch.daysRequested;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('requestid', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update leave request: ${error.message}`);
  return mapLeaveRequestRow(data as LeaveRequestDbRow);
}

export async function deleteLeaveRequest(requestId: string): Promise<void> {
  const id = Number(requestId);
  if (!Number.isFinite(id)) throw new Error('Invalid request ID.');

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('requestid', id);
  if (error) throw new Error(`Failed to delete leave request: ${error.message}`);
}
