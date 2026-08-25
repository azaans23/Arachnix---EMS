import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/rbac';
import {
  listAccountingBalances,
  listOpeningBalances,
  replaceMonthBalanceLines,
  upsertOpeningBalance,
} from '@/lib/db/accounting-balances';
import { dispatchAccountingBalancesWebhook } from '@/lib/accounting/balances-webhook';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import { parsePeriodMonth } from '@/types/accounting';
import type { AccountingBalanceRow } from '@/types/financial-statements';

function monthBalanceLines(rows: AccountingBalanceRow[], month: string) {
  return rows.filter(
    (row) =>
      row.month === month && (row.lineType === 'Liability' || row.lineType === 'OtherAsset')
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'accounting_records', 'read');
    if (errorResponse) return errorResponse;

    const month = new URL(request.url).searchParams.get('month') || '';
    if (month && !parsePeriodMonth(month)) {
      return NextResponse.json({ success: false, error: 'Month must be YYYY-MM.' }, { status: 400 });
    }

    const [rows, openings] = await Promise.all([
      listAccountingBalances(month || undefined),
      listOpeningBalances(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        month: month || null,
        lines: rows.filter((row) => row.month === month),
        openings,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load balances.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'accounting_records',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const month = String(body.month || '').trim();
    const lines = Array.isArray(body.lines) ? body.lines : [];

    const saved = await replaceMonthBalanceLines({
      month,
      lines: lines.map((line: { lineType?: string; label?: string; amount?: unknown }) => ({
        lineType: line.lineType === 'OtherAsset' ? 'OtherAsset' : 'Liability',
        label: String(line.label || ''),
        amount: Number(line.amount),
      })),
      enteredBy: user?.email || 'finance',
    });

    await logAuditBestEffort(
      user?.email || 'finance',
      {
        action: AUDIT_ACTIONS.UPDATE,
        recordType: AUDIT_RECORD_TYPES.ACCOUNTING_BALANCE,
        recordId: month,
        newValue: { month, lines: saved },
      },
      'Accounting balances audit'
    );

    const openings = await listOpeningBalances();
    await dispatchAccountingBalancesWebhook({
      kind: 'month',
      month,
      lines: monthBalanceLines(saved, month),
      openings,
    }).catch((error) => {
      console.error('Accounting balances sheet dual-write failed:', error);
    });

    return NextResponse.json({ success: true, data: saved, message: 'Balances saved.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save balances.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role, errorResponse } = await verifyResourceAccess(
      request,
      'accounting_records',
      'write'
    );
    if (errorResponse) return errorResponse;
    if (!isSuperAdminRole(role)) {
      return NextResponse.json(
        { success: false, error: 'Only Super Admin can edit opening cash and equity.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const lineType = body.lineType === 'OpeningCash' ? 'OpeningCash' : 'OpeningEquity';
    const previous = (await listOpeningBalances()).find((row) => row.lineType === lineType) || null;
    const saved = await upsertOpeningBalance({
      lineType,
      amount: Number(body.amount),
      enteredBy: user?.email || 'finance',
    });

    await logAuditBestEffort(
      user?.email || 'finance',
      {
        action: previous ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE,
        recordType: AUDIT_RECORD_TYPES.ACCOUNTING_BALANCE,
        recordId: lineType,
        oldValue: previous,
        newValue: saved,
      },
      'Opening balance audit'
    );

    const openings = await listOpeningBalances();
    await dispatchAccountingBalancesWebhook({
      kind: 'opening',
      month: '',
      lines: [saved],
      openings,
    }).catch((error) => {
      console.error('Opening balances sheet dual-write failed:', error);
    });

    return NextResponse.json({ success: true, data: saved, message: 'Opening balance saved.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save opening balance.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
