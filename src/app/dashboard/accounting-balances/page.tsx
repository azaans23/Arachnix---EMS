'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole, isSuperAdminRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { AccountingBalanceRow } from '@/types/financial-statements';

type DraftLine = {
  key: string;
  lineType: 'Liability' | 'OtherAsset';
  label: string;
  amount: string;
};

function token() {
  return localStorage.getItem('token');
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function periodOptions() {
  const now = new Date();
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return {
      value: date.toISOString().slice(0, 7),
      label: date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
  });
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

function newLine(lineType: DraftLine['lineType']): DraftLine {
  return {
    key: `${lineType}-${crypto.randomUUID()}`,
    lineType,
    label: '',
    amount: '',
  };
}

export default function AccountingBalancesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(currentPeriod());
  const [liabilities, setLiabilities] = useState<DraftLine[]>([newLine('Liability')]);
  const [otherAssets, setOtherAssets] = useState<DraftLine[]>([newLine('OtherAsset')]);
  const [openings, setOpenings] = useState<AccountingBalanceRow[]>([]);
  const [editingOpening, setEditingOpening] = useState<'OpeningCash' | 'OpeningEquity' | null>(
    null
  );
  const [openingDraft, setOpeningDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/accounting-balances?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load balances.');
      }
      const lines = (result.data?.lines || []) as AccountingBalanceRow[];
      const nextLiabilities = lines
        .filter((row) => row.lineType === 'Liability')
        .map((row) => ({
          key: row.balanceId,
          lineType: 'Liability' as const,
          label: row.label,
          amount: String(row.amount),
        }));
      const nextAssets = lines
        .filter((row) => row.lineType === 'OtherAsset')
        .map((row) => ({
          key: row.balanceId,
          lineType: 'OtherAsset' as const,
          label: row.label,
          amount: String(row.amount),
        }));
      setLiabilities(nextLiabilities.length ? nextLiabilities : [newLine('Liability')]);
      setOtherAssets(nextAssets.length ? nextAssets : [newLine('OtherAsset')]);
      setOpenings(result.data?.openings || []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load balances.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      localStorage.setItem('token', session.access_token);
      let role = getTrustedRole(session.user);
      let flags = { hasFinanceAccess: false, isDirector: false };
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
        flags = { hasFinanceAccess: synced.hasFinanceAccess, isDirector: synced.isDirector };
      } catch {
        /* JWT fallback */
      }
      const canView = canAccess(role, 'accounting_records', flags);
      setCanEdit(canWrite(role, 'accounting_records', flags));
      setIsSuperAdmin(isSuperAdminRole(role));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const openingCash = openings.find((row) => row.lineType === 'OpeningCash');
  const openingEquity = openings.find((row) => row.lineType === 'OpeningEquity');
  const monthLabel = useMemo(
    () => periodOptions().find((option) => option.value === month)?.label || month,
    [month]
  );

  const saveMonth = async () => {
    const lines = [...liabilities, ...otherAssets]
      .map((line) => ({
        lineType: line.lineType,
        label: line.label.trim(),
        amount: Number(line.amount),
      }))
      .filter((line) => line.label || line.amount);
    if (lines.some((line) => !line.label || !Number.isFinite(line.amount) || line.amount < 0)) {
      toast.error('Each saved line needs a label and an amount of zero or more.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/accounting-balances', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month, lines }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save balances.');
      }
      toast.success('Month balances saved. Opening cash and equity were left unchanged.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save balances.');
    } finally {
      setSaving(false);
    }
  };

  const saveOpening = async (lineType: 'OpeningCash' | 'OpeningEquity') => {
    const amount = Number(openingDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('Opening amount must be zero or greater.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/accounting-balances', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lineType, amount }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save opening balance.');
      }
      toast.success('Opening balance saved.');
      setEditingOpening(null);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save opening balance.');
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <Skeleton className="mb-6 h-20 w-full" />
        <TableSkeleton columns={3} rows={6} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Monthly balances are available to Super Admin, Admin, and Finance Manager."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Finance</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Monthly Balances
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Enter liabilities and other assets for {monthLabel}. Cash and equity come from
            statements. Loan receipts need a liability line; owner injections need Super Admin to
            update opening equity. Paying a loan or buying an asset moves cash only — reduce the
            matching balance line yourself. Saving a month never rewrites opening cash or equity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-48">
            <CustomDropdown
              id="balances-month"
              name="month"
              options={periodOptions()}
              value={month}
              onChange={setMonth}
              onBlur={() => {}}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void saveMonth()}
              disabled={saving || loading}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-canvas disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save month
            </button>
          ) : null}
        </div>
      </div>

      <section className="mb-6 grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-panel sm:grid-cols-2">
        <OpeningCard
          title="Opening cash"
          amount={openingCash?.amount ?? null}
          canEdit={isSuperAdmin}
          editing={editingOpening === 'OpeningCash'}
          draft={openingDraft}
          saving={saving}
          onEdit={() => {
            setEditingOpening('OpeningCash');
            setOpeningDraft(String(openingCash?.amount ?? 0));
          }}
          onCancel={() => setEditingOpening(null)}
          onDraft={setOpeningDraft}
          onSave={() => void saveOpening('OpeningCash')}
        />
        <OpeningCard
          title="Opening equity"
          amount={openingEquity?.amount ?? null}
          canEdit={isSuperAdmin}
          editing={editingOpening === 'OpeningEquity'}
          draft={openingDraft}
          saving={saving}
          onEdit={() => {
            setEditingOpening('OpeningEquity');
            setOpeningDraft(String(openingEquity?.amount ?? 0));
          }}
          onCancel={() => setEditingOpening(null)}
          onDraft={setOpeningDraft}
          onSave={() => void saveOpening('OpeningEquity')}
        />
      </section>

      {loading ? (
        <TableSkeleton columns={3} rows={6} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <LineEditor
            title="Liabilities"
            hint="Loans and other amounts owed at month end."
            lines={liabilities}
            canEdit={canEdit}
            onChange={setLiabilities}
            onAdd={() => setLiabilities((rows) => [...rows, newLine('Liability')])}
          />
          <LineEditor
            title="Other assets"
            hint="Non-cash assets. Asset purchases do not update this list automatically."
            lines={otherAssets}
            canEdit={canEdit}
            onChange={setOtherAssets}
            onAdd={() => setOtherAssets((rows) => [...rows, newLine('OtherAsset')])}
          />
        </div>
      )}
    </div>
  );
}

function OpeningCard(props: {
  title: string;
  amount: number | null;
  canEdit: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDraft: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{props.title}</p>
      {props.editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={props.draft}
            onChange={(event) => props.onDraft(event.target.value)}
            className="h-10 w-40 rounded-lg border border-border bg-canvas px-3 text-sm text-ink"
          />
          <button
            type="button"
            onClick={props.onSave}
            disabled={props.saving}
            className="h-10 rounded-lg bg-ink px-3 text-sm font-medium text-canvas disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={props.onCancel}
            className="h-10 rounded-lg border border-border px-3 text-sm text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-lg font-semibold tabular-nums text-ink">
            {props.amount == null ? 'Not set' : formatMoney(props.amount)}
          </p>
          {props.canEdit ? (
            <button
              type="button"
              onClick={props.onEdit}
              className="text-sm font-medium text-ink underline-offset-2 hover:underline"
            >
              Edit
            </button>
          ) : (
            <p className="text-xs text-muted">Super Admin only</p>
          )}
        </div>
      )}
    </div>
  );
}

function LineEditor(props: {
  title: string;
  hint: string;
  lines: DraftLine[];
  canEdit: boolean;
  onChange: (lines: DraftLine[]) => void;
  onAdd: () => void;
}) {
  const update = (key: string, patch: Partial<DraftLine>) => {
    props.onChange(props.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{props.title}</h2>
          <p className="mt-1 text-xs text-muted">{props.hint}</p>
        </div>
        {props.canEdit ? (
          <button
            type="button"
            onClick={props.onAdd}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        ) : null}
      </div>
      <div className="divide-y divide-border">
        {props.lines.map((line) => (
          <div key={line.key} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2 px-4 py-3">
            <input
              value={line.label}
              disabled={!props.canEdit}
              onChange={(event) => update(line.key, { label: event.target.value })}
              placeholder="Label"
              className="h-10 rounded-lg border border-border bg-canvas px-3 text-sm text-ink disabled:opacity-60"
            />
            <input
              type="number"
              min="0"
              step="1"
              value={line.amount}
              disabled={!props.canEdit}
              onChange={(event) => update(line.key, { amount: event.target.value })}
              placeholder="0"
              className="h-10 rounded-lg border border-border bg-canvas px-3 text-sm tabular-nums text-ink disabled:opacity-60"
            />
            {props.canEdit ? (
              <button
                type="button"
                aria-label="Remove line"
                onClick={() => props.onChange(props.lines.filter((item) => item.key !== line.key))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
