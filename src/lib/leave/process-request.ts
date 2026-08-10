import {
  createLeaveRequest,
  deleteLeaveRequest,
  getLeaveRequest,
  normalizeLeaveRequestInput,
  toWebhookLeaveRequestRow,
  updateLeaveRequestRow,
} from '@/lib/db/leave-requests';
import {
  getLeaveBalance,
  upsertLeaveBalance,
} from '@/lib/db/leave-balances';
import { buildLeaveId, remainingLeaveDays, type LeaveBalanceInput } from '@/types/leave-balance';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import type {
  LeaveRequest,
  LeaveRequestAction,
  LeaveRequestInput,
} from '@/types/leave-request';

async function postLeaveRequestWebhook(
  url: string,
  payload: Record<string, unknown>,
  label: string
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `${label} webhook not found (404). Start the n8n test workflow and try again.`
      );
    }
    throw new Error(text || `${label} webhook returned status ${response.status}.`);
  }

  let message = '';
  try {
    const parsed = text.trim() ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      message = String(
        (parsed as Record<string, unknown>).message ||
          (parsed as Record<string, unknown>).status ||
          ''
      );
    }
  } catch {
    if (text.trim()) message = text.trim();
  }
  return message;
}

function balanceFieldForLeaveType(leaveType: string): 'annualUsed' | 'sickUsed' | 'casualUsed' | null {
  switch (leaveType.trim().toLowerCase()) {
    case 'annual':
      return 'annualUsed';
    case 'sick':
      return 'sickUsed';
    case 'casual':
      return 'casualUsed';
    default:
      return null;
  }
}

function remainingForType(
  leaveType: string,
  balance: LeaveBalanceInput | null
) {
  if (!balance) return null;
  return remainingLeaveDays(leaveType, balance);
}

/**
 * Consumes quota in Supabase only. Annual = total pool.
 * Sick / Casual also increment AnnualUsed. Sheet sync goes via create-leave-request.
 */
async function applyApprovedLeaveToBalance(request: LeaveRequest): Promise<{
  balance: LeaveBalanceInput | null;
  previous: LeaveBalanceInput | null;
}> {
  const field = balanceFieldForLeaveType(request.leaveType);
  if (!field) {
    // Unpaid / other types do not touch quotas.
    return { balance: null, previous: null };
  }

  const year = Number(request.startDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error('Leave request start date is invalid.');
  }

  const existing = await getLeaveBalance(request.employeeId, year);
  if (!existing) {
    throw new Error(
      `No leave balance found for ${request.employeeId} in ${year}. Create a leave balance first.`
    );
  }

  const previous = {
    ...existing,
    leaveId: existing.leaveId || buildLeaveId(request.employeeId, year),
  };
  const next = { ...previous };
  const days = Number(request.daysRequested);

  next[field] = Number(next[field] || 0) + days;
  // Sick and Casual sit under the annual total, so they consume total used too.
  if (field === 'sickUsed' || field === 'casualUsed') {
    next.annualUsed = Number(next.annualUsed || 0) + days;
  }

  const typeRemaining = remainingLeaveDays(request.leaveType, previous);
  if (!typeRemaining || typeRemaining.remaining < days) {
    const label =
      field === 'annualUsed'
        ? 'total (annual)'
        : field === 'sickUsed'
          ? 'sick'
          : 'casual';
    throw new Error(
      `Insufficient ${label} leave balance. Remaining: ${typeRemaining?.remaining ?? 0} day(s).`
    );
  }

  return { balance: await upsertLeaveBalance(next), previous };
}

/**
 * HR creates a leave request on behalf of an employee.
 * Writes Supabase first, then notifies n8n / Sheets. Rolls back on webhook failure.
 */
export async function startLeaveRequest(
  input: LeaveRequestInput | Record<string, unknown>
): Promise<{ request: LeaveRequest; message: string }> {
  const normalized =
    'employeeId' in input && typeof (input as LeaveRequestInput).daysRequested === 'number'
      ? (input as LeaveRequestInput)
      : normalizeLeaveRequestInput(input as Record<string, unknown>);

  const request = await createLeaveRequest(normalized);

  try {
    const message = await postLeaveRequestWebhook(
      SHEETS_WEBHOOKS.createLeaveRequest,
      {
        action: 'create',
        request: toWebhookLeaveRequestRow(request),
      },
      'create-leave-request'
    );

    return {
      request,
      message: message || `Leave request #${request.requestId} created.`,
    };
  } catch (error) {
    try {
      await deleteLeaveRequest(request.requestId);
    } catch (rollbackError) {
      console.error('Failed to roll back leave request after webhook failure:', rollbackError);
    }
    throw error;
  }
}

/** Puts the request row back the way it was before the action. */
async function restoreLeaveRequest(previous: LeaveRequest) {
  try {
    await updateLeaveRequestRow(previous.requestId, {
      status: previous.status,
      approvedBy: previous.approvedBy || null,
      approvalDate: previous.approvalDate || null,
      rejectionReason: previous.rejectionReason || null,
    });
  } catch (rollbackError) {
    console.error('Failed to roll back leave request:', rollbackError);
  }
}

/**
 * Approve / reject / request changes on a leave request.
 * - Approve: set Approved, consume leave balance, notify n8n
 * - Reject: set Rejected with reason; balance untouched
 * - Request changes: keep Pending and store feedback in RejectionReason (schema has no Changes Requested status)
 *
 * Every action goes through the single create-leave-request webhook and rolls the
 * Supabase writes back if that webhook fails, so the DB never drifts from the Sheet.
 */
export async function processLeaveRequestAction(
  requestId: string,
  action: LeaveRequestAction,
  actor: { email?: string; employeeId?: string },
  options?: { reason?: string }
): Promise<{ request: LeaveRequest; message: string }> {
  const existing = await getLeaveRequest(requestId);
  if (!existing) throw new Error('Leave request not found.');

  if (existing.status === 'Approved' || existing.status === 'Rejected') {
    throw new Error(`Leave request is already ${existing.status}.`);
  }

  const actorLabel = String(actor.employeeId || actor.email || 'HR').trim().slice(0, 50);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (action === 'approve') {
    const approved = await updateLeaveRequestRow(requestId, {
      status: 'Approved',
      approvedBy: actorLabel,
      approvalDate: now,
      rejectionReason: null,
    });

    let balance: LeaveBalanceInput | null = null;
    let previousBalance: LeaveBalanceInput | null = null;
    try {
      ({ balance, previous: previousBalance } = await applyApprovedLeaveToBalance(approved));
    } catch (balanceError) {
      await restoreLeaveRequest(existing);
      throw balanceError;
    }

    const remaining = remainingForType(approved.leaveType, balance);

    try {
      const message = await postLeaveRequestWebhook(
        SHEETS_WEBHOOKS.createLeaveRequest,
        {
          action: 'approve',
          request: toWebhookLeaveRequestRow(approved),
          remainingLeaves: remaining,
          balance: balance
            ? {
                LeaveID: balance.leaveId || buildLeaveId(balance.employeeId, balance.year),
                EmployeeID: balance.employeeId,
                Year: balance.year,
                AnnualQuota: balance.annualQuota,
                AnnualUsed: balance.annualUsed,
                SickQuota: balance.sickQuota,
                SickUsed: balance.sickUsed,
                CasualQuota: balance.casualQuota,
                CasualUsed: balance.casualUsed,
                CarryForwardDays: balance.carryForwardDays,
              }
            : null,
          approvedBy: actorLabel,
        },
        'create-leave-request'
      );

      return {
        request: approved,
        message: message || `Leave request #${approved.requestId} approved.`,
      };
    } catch (webhookError) {
      if (previousBalance) {
        try {
          await upsertLeaveBalance(previousBalance);
        } catch (rollbackError) {
          console.error('Failed to roll back consumed leave balance:', rollbackError);
        }
      }
      await restoreLeaveRequest(existing);
      throw webhookError;
    }
  }

  if (action === 'reject') {
    const reason = String(options?.reason || '').trim();
    if (!reason) throw new Error('Rejection reason is required.');

    const rejected = await updateLeaveRequestRow(requestId, {
      status: 'Rejected',
      approvedBy: actorLabel,
      approvalDate: now,
      rejectionReason: reason,
    });

    try {
      const message = await postLeaveRequestWebhook(
        SHEETS_WEBHOOKS.createLeaveRequest,
        {
          action: 'reject',
          request: toWebhookLeaveRequestRow(rejected),
          rejectionReason: reason,
          approvedBy: actorLabel,
        },
        'create-leave-request'
      );

      return {
        request: rejected,
        message: message || `Leave request #${rejected.requestId} rejected.`,
      };
    } catch (webhookError) {
      await restoreLeaveRequest(existing);
      throw webhookError;
    }
  }

  // request_changes
  const feedback = String(options?.reason || '').trim();
  if (!feedback) throw new Error('Change request feedback is required.');

  const updated = await updateLeaveRequestRow(requestId, {
    status: 'Pending',
    approvedBy: actorLabel,
    approvalDate: now,
    rejectionReason: feedback,
  });

  try {
    const message = await postLeaveRequestWebhook(
      SHEETS_WEBHOOKS.createLeaveRequest,
      {
        action: 'request_changes',
        request: toWebhookLeaveRequestRow(updated),
        changeRequest: feedback,
        approvedBy: actorLabel,
      },
      'create-leave-request'
    );

    return {
      request: { ...updated, changesRequested: true },
      message: message || `Changes requested for leave request #${updated.requestId}.`,
    };
  } catch (webhookError) {
    await restoreLeaveRequest(existing);
    throw webhookError;
  }
}
