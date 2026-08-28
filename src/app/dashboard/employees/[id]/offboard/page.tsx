'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import DatePicker from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import {
  canAccess,
  canEditEmployeeRecord,
  getTrustedRole,
  isSuperAdminRole,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { EmployeeRecord } from '@/types/employee';
import type { OffboardingChecklistItem, OffboardingRecord } from '@/types/offboarding';
import { OFFBOARDING_STATUSES } from '@/types/offboarding';

type PageProps = {
  params: Promise<{ id: string }>;
};

function token() {
  return localStorage.getItem('token');
}

function money(value: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function SettlementRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`text-sm ${muted ? 'text-muted' : 'font-medium text-ink'}`}>{value}</dd>
    </div>
  );
}

export default function EmployeeOffboardPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [open, setOpen] = useState<OffboardingRecord | null>(null);
  const [history, setHistory] = useState<OffboardingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [unpaidDays, setUnpaidDays] = useState('0');
  const [otherAdditions, setOtherAdditions] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');
  const [checklist, setChecklist] = useState<OffboardingChecklistItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/offboarding?employeeId=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load offboarding.');
      }
      const data = result.data as {
        employee: EmployeeRecord;
        open: OffboardingRecord | null;
        history: OffboardingRecord[];
      };
      setEmployee(data.employee);
      setOpen(data.open);
      setHistory(data.history || []);
      if (data.open) {
        setReason(data.open.reason || '');
        setNotes(data.open.notes || '');
        setLastWorkingDate(data.open.lastWorkingDate || '');
        setUnpaidDays(String(data.open.unpaidDays || 0));
        setOtherAdditions(String(data.open.otherAdditions || 0));
        setOtherDeductions(String(data.open.otherDeductions || 0));
        setChecklist(data.open.checklist || []);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load offboarding.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user || !session.access_token) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      localStorage.setItem('token', session.access_token);
      let role = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
      } catch {
        /* JWT fallback */
      }
      const ok = canAccess(role, 'employees');
      setAllowed(ok);
      if (ok) await load();
      else setLoading(false);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!employee) {
      setCanEdit(false);
      return;
    }
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      let role = getTrustedRole(session.user);
      try {
        role = (await syncSessionCookies(session.access_token)).role;
      } catch {
        /* JWT fallback */
      }
      setCanEdit(
        canEditEmployeeRecord({
          actorRole: role,
          actorEmail: session.user.email,
          actorUserId: session.user.id,
          targetRole: employee.role,
          targetEmail: employee.email,
          targetSupabaseUserId: employee.supabaseUserId,
        }) && !isSuperAdminRole(employee.role)
      );
    })();
  }, [employee]);

  const patch = async (action: 'save' | 'complete' | 'cancel') => {
    if (!open) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/offboarding/${encodeURIComponent(open.offboardingId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          action,
          lastWorkingDate,
          reason,
          notes,
          unpaidDays: Number(unpaidDays) || 0,
          otherAdditions: Number(otherAdditions) || 0,
          otherDeductions: Number(otherDeductions) || 0,
          checklist,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update offboarding.');
      }
      toast.success(result.message || 'Saved.');
      if (action === 'complete') {
        router.push(`/dashboard/employees/${encodeURIComponent(id)}`);
        return;
      }
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update offboarding.');
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/offboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ employeeId: id, lastWorkingDate, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start offboarding.');
      }
      toast.success(result.message || 'Offboarding started.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to start offboarding.');
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null || loading) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <Skeleton className="mb-6 h-4 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!allowed || !employee) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-danger" />
        <h1 className="text-xl font-semibold text-ink">Access denied</h1>
      </div>
    );
  }

  const completed = history.find((row) => row.status === OFFBOARDING_STATUSES.COMPLETED);
  const display = open || completed;
  const locked = !open || !canEdit;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <Link
        href={`/dashboard/employees/${encodeURIComponent(id)}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>

      <header className="mb-8 border-b border-border pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Exit</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Offboard {employee.fullName || employee.employeeId}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {employee.employeeId}
          {employee.department ? ` · ${employee.department}` : ''}
          {employee.designation ? ` · ${employee.designation}` : ''}
        </p>
      </header>

      {!open && !completed ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-panel">
          <p className="text-sm text-muted">
            This starts an exit case. The employee record is kept. Completing it revokes EMS login,
            archives documents, closes pending leave, and stores a settlement snapshot.
          </p>
          <label className="mt-4 block text-xs font-medium text-muted">
            Last working date
            <div className="mt-1.5">
              <DatePicker
                ariaLabel="Last working date"
                value={lastWorkingDate}
                onChange={setLastWorkingDate}
              />
            </div>
          </label>
          <label className="mt-4 block text-xs font-medium text-muted">
            Reason
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="Resignation, end of contract, termination…"
            />
          </label>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={saving || !canEdit}
              onClick={() => void start()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Start offboarding
            </button>
          </div>
        </div>
      ) : null}

      {display ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-panel">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Exit details</h2>
              <span className="rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-ink">
                {display.status}
              </span>
            </div>
            <label className="block text-xs font-medium text-muted">
              Last working date
              <div className="mt-1.5">
                <DatePicker
                  ariaLabel="Last working date"
                  value={lastWorkingDate}
                  onChange={setLastWorkingDate}
                  disabled={locked}
                />
              </div>
            </label>
            <label className="mt-4 block text-xs font-medium text-muted">
              Reason
              <textarea
                rows={3}
                disabled={locked}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:text-muted"
              />
            </label>
          </div>

          <div className="rounded-lg border border-border bg-surface shadow-panel">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Final settlement</h2>
              <p className="mt-1 text-xs text-muted">
                Pro-rated salary through last working date, plus unused annual leave at monthly
                salary / 30. Save to refresh from current salary and leave balances.
              </p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <label className="text-xs font-medium text-muted">
                Unpaid days
                <input
                  type="number"
                  min="0"
                  disabled={locked}
                  value={unpaidDays}
                  onChange={(event) => setUnpaidDays(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
                />
              </label>
              <label className="text-xs font-medium text-muted">
                Other additions
                <input
                  type="number"
                  min="0"
                  disabled={locked}
                  value={otherAdditions}
                  onChange={(event) => setOtherAdditions(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
                />
              </label>
              <label className="text-xs font-medium text-muted">
                Other deductions
                <input
                  type="number"
                  min="0"
                  disabled={locked}
                  value={otherDeductions}
                  onChange={(event) => setOtherDeductions(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
                />
              </label>
            </div>
            <dl className="divide-y divide-border border-t border-border">
              <SettlementRow label="Monthly salary" value={money(display.monthlySalary)} />
              <SettlementRow
                label="Days worked this month"
                value={`${display.daysWorked} of ${display.daysInMonth || '—'}`}
              />
              <SettlementRow label="Pro-rated salary" value={money(display.proratedSalary)} />
              <SettlementRow
                label="Unused annual leave"
                value={`${display.unusedLeaveDays} days`}
              />
              <SettlementRow label="Daily rate" value={money(display.dailyRate)} muted />
              <SettlementRow label="Leave encashment" value={money(display.leaveEncashment)} />
              <SettlementRow label="Unpaid deduction" value={money(display.unpaidDeduction)} />
              <SettlementRow label="Net settlement" value={money(display.netSettlement)} />
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-panel">
            <h2 className="text-sm font-semibold text-ink">Access and exit checklist</h2>
            <p className="mt-1 text-xs text-muted">
              Manual items must be ticked before complete. Automatic items run when you complete.
            </p>
            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-canvas/40 px-3 py-2.5"
                >
                  {item.automatic ? (
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${item.done ? 'text-success' : 'text-muted'}`}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={item.done}
                      onChange={(event) =>
                        setChecklist((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  done: event.target.checked,
                                  doneAt: event.target.checked ? new Date().toISOString() : '',
                                }
                              : entry
                          )
                        )
                      }
                      className="mt-1 h-4 w-4 cursor-pointer"
                    />
                  )}
                  <div>
                    <p className="text-sm text-ink">{item.label}</p>
                    <p className="text-xs text-muted">
                      {item.automatic ? 'Runs on complete' : 'Mark when done'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {open && canEdit ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void patch('cancel')}
                className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
              >
                Cancel case
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void patch('save')}
                className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void patch('complete')}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <TriangleAlert className="h-4 w-4" />}
                Complete offboarding
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
