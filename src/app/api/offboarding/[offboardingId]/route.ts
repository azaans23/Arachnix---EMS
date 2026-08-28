import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getEmployeeDbRow, dbRowToEmployeeRecord } from '@/lib/db/employees';
import { getOffboardingDbRow } from '@/lib/db/offboardings';
import {
  cancelOffboarding,
  completeOffboarding,
  saveOffboardingDraft,
} from '@/lib/offboarding/process';
import { canEditEmployeeRecord } from '@/lib/rbac';
import type { OffboardingChecklistItem } from '@/types/offboarding';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ offboardingId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, role, errorResponse } = await verifyResourceAccess(
      request,
      'employees',
      'write'
    );
    if (errorResponse) return errorResponse;

    const { offboardingId } = await context.params;
    const current = await getOffboardingDbRow(offboardingId);
    if (!current) {
      return NextResponse.json({ success: false, error: 'Offboarding not found.' }, { status: 404 });
    }

    const dbEmployee = await getEmployeeDbRow(current.employeeid);
    const employee = dbEmployee ? dbRowToEmployeeRecord(dbEmployee) : null;
    if (
      employee &&
      !canEditEmployeeRecord({
        actorRole: role || '',
        actorEmail: user?.email,
        actorUserId: user?.id,
        targetRole: employee.role,
        targetEmail: employee.email,
        targetSupabaseUserId: employee.supabaseUserId,
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'You cannot update this offboarding.' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || 'save').trim().toLowerCase();
    const actorEmail = user?.email || '';
    const checklist = Array.isArray(body.checklist)
      ? (body.checklist as OffboardingChecklistItem[])
      : undefined;

    if (action === 'complete') {
      await saveOffboardingDraft({
        offboardingId,
        actorEmail,
        lastWorkingDate: body.lastWorkingDate ? String(body.lastWorkingDate) : undefined,
        reason: body.reason !== undefined ? String(body.reason) : undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
        unpaidDays: body.unpaidDays !== undefined ? Number(body.unpaidDays) : undefined,
        otherAdditions: body.otherAdditions !== undefined ? Number(body.otherAdditions) : undefined,
        otherDeductions:
          body.otherDeductions !== undefined ? Number(body.otherDeductions) : undefined,
        checklist,
        syncSheet: false,
      });
      const data = await completeOffboarding({ offboardingId, actorEmail });
      return NextResponse.json({
        success: true,
        data,
        message: `Offboarding completed for ${data.fullName || data.employeeId}.`,
      });
    }

    if (action === 'cancel') {
      const data = await cancelOffboarding({ offboardingId, actorEmail });
      return NextResponse.json({
        success: true,
        data,
        message: 'Offboarding cancelled.',
      });
    }

    const data = await saveOffboardingDraft({
      offboardingId,
      actorEmail,
      lastWorkingDate: body.lastWorkingDate ? String(body.lastWorkingDate) : undefined,
      reason: body.reason !== undefined ? String(body.reason) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
      unpaidDays: body.unpaidDays !== undefined ? Number(body.unpaidDays) : undefined,
      otherAdditions: body.otherAdditions !== undefined ? Number(body.otherAdditions) : undefined,
      otherDeductions:
        body.otherDeductions !== undefined ? Number(body.otherDeductions) : undefined,
      checklist,
    });

    return NextResponse.json({ success: true, data, message: 'Offboarding draft saved.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update offboarding.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
