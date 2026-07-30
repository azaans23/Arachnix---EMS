'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import { toSheetUser, type SheetUser } from '@/types/employee';
import type { SalarySlipRun } from '@/types/salary-slip';

const MONTH_OPTIONS = [
  { label: 'January', value: '1' },
  { label: 'February', value: '2' },
  { label: 'March', value: '3' },
  { label: 'April', value: '4' },
  { label: 'May', value: '5' },
  { label: 'June', value: '6' },
  { label: 'July', value: '7' },
  { label: 'August', value: '8' },
  { label: 'September', value: '9' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

function currentYearOptions() {
  const year = new Date().getFullYear();
  return [year - 1, year, year + 1].map((value) => ({
    label: String(value),
    value: String(value),
  }));
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'border-border bg-ink text-accent-fg';
    case 'processing':
      return 'border-border bg-canvas text-ink';
    case 'partial':
      return 'border-border bg-canvas text-ink';
    case 'failed':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-surface text-muted';
  }
}

function displayDate(value: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PK', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function monthLabel(month: number) {
  return MONTH_OPTIONS.find((option) => option.value === String(month))?.label || String(month);
}

export default function SalarySlipRunsPage() {
  const router = useRouter();
  const now = new Date();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [runs, setRuns] = useState<SalarySlipRun[]>([]);
  const [employees, setEmployees] = useState<SheetUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const token = () => localStorage.getItem('token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [runsRes, usersRes] = await Promise.all([
        fetch('/api/salary-slip-runs', { headers, cache: 'no-store' }),
        fetch('/api/get-users', { headers, cache: 'no-store' }),
      ]);
      const runsJson = await runsRes.json();
      const usersJson = await usersRes.json();

      if (!runsRes.ok || !runsJson.success) {
        throw new Error(runsJson.error || 'Failed to load salary slip runs.');
      }
      setRuns(runsJson.data || []);

      if (usersRes.ok && usersJson.success) {
        const raw = Array.isArray(usersJson.data)
          ? usersJson.data
          : usersJson.data
            ? [usersJson.data]
            : [];
        setEmployees(
          raw
            .map((row: unknown) => toSheetUser(mapRawToEmployee(row)))
            .filter((user: SheetUser) => {
              const status = String(user.raw?.EMSStatus || user.raw?.emsStatus || '').toLowerCase();
              const salary = Number(user.raw?.BaseSalary || user.raw?.baseSalary || 0);
              return status === 'active' && Number.isFinite(salary) && salary > 0;
            })
        );
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll data.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
      } catch {
        /* keep JWT */
      }
      const canRead = role === 'super_admin' || role === 'hr_manager';
      setAllowed(canRead);
      setCanGenerate(canRead);
      if (canRead) await load();
      else setLoading(false);
    };
    boot();
  }, [load]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(q) ||
        employee.email.toLowerCase().includes(q) ||
        employee.employeeId.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const toggleId = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredEmployees.map((employee) => employee.employeeId);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
    }
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (mode === 'selected' && selectedIds.length === 0) {
      toast.error('Select at least one employee.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/salary-slip-runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          month: Number(month),
          year: Number(year),
          employeeIds: mode === 'selected' ? selectedIds : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start salary slip run.');
      }
      toast.success(result.message || 'Salary slip run started.');
      await load();
      if (result.data?.runId) {
        router.push(`/dashboard/salary-slip-run-details?runId=${result.data.runId}`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate salary slips.');
    } finally {
      setSubmitting(false);
    }
  };

  if (allowed === null || (allowed && loading && runs.length === 0 && employees.length === 0)) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <TableSkeleton columns={6} rows={6} actions={false} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          Only Super Admin and HR Manager can manage salary slip runs.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Payroll</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Salary Slip Runs
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Generate slips for {monthLabel(Number(month))} {year}, track delivery, and review history.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {canGenerate && (
        <section className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-panel">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-canvas text-muted">
                <Banknote className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Generate salary slips</h2>
                <p className="text-xs text-muted">One click runs PDF + email via n8n.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Month
                </label>
                <CustomDropdown
                  id="slip-month"
                  name="month"
                  options={MONTH_OPTIONS}
                  value={month}
                  onChange={setMonth}
                  onBlur={() => {}}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Year
                </label>
                <CustomDropdown
                  id="slip-year"
                  name="year"
                  options={currentYearOptions()}
                  value={year}
                  onChange={setYear}
                  onBlur={() => {}}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                  mode === 'all'
                    ? 'border-ink bg-ink text-accent-fg'
                    : 'border-border bg-surface text-ink hover:bg-canvas'
                }`}
              >
                All eligible
              </button>
              <button
                type="button"
                onClick={() => setMode('selected')}
                className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                  mode === 'selected'
                    ? 'border-ink bg-ink text-accent-fg'
                    : 'border-border bg-surface text-ink hover:bg-canvas'
                }`}
              >
                Select people
              </button>
            </div>

            <p className="mt-3 text-xs text-muted">
              {mode === 'all'
                ? `${employees.length} active employee${employees.length === 1 ? '' : 's'} with base salary.`
                : `${selectedIds.length} selected.`}
            </p>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={submitting || employees.length === 0}
              className="mt-5 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting run…
                </>
              ) : (
                <>
                  <Banknote className="h-4 w-4" />
                  Generate salary slips
                </>
              )}
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Eligible employees</h2>
                <p className="text-xs text-muted">Active EMS accounts with a base salary.</p>
              </div>
              {mode === 'selected' && (
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="text-xs font-semibold text-ink hover:underline"
                >
                  Toggle visible
                </button>
              )}
            </div>
            <div className="border-b border-border px-4 py-2">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, ID…"
                className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No eligible employees.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredEmployees.map((employee) => {
                    const checked = selectedIds.includes(employee.employeeId);
                    return (
                      <li key={employee.employeeId}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-canvas/70 ${
                            mode === 'all' ? 'opacity-70' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={mode === 'all'}
                            checked={mode === 'all' ? true : checked}
                            onChange={() => toggleId(employee.employeeId)}
                            className="h-4 w-4 accent-[var(--ink)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                              {employee.name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {employee.employeeId} · {employee.email}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {String(employee.raw?.BaseSalary || employee.raw?.baseSalary || '—')}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Run history</h2>
          <p className="text-xs text-muted">{runs.length} run{runs.length === 1 ? '' : 's'}</p>
        </div>

        {runs.length === 0 ? (
          <EmptyState
            icon={<Banknote className="h-5 w-5" />}
            title="No salary slip runs yet"
            description="Generate your first batch to see status, success counts, and delivery history here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    <th className="px-4 py-3.5">Run</th>
                    <th className="px-4 py-3.5">Period</th>
                    <th className="px-4 py-3.5">Triggered by</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Results</th>
                    <th className="px-4 py-3.5 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {runs.map((run) => (
                    <tr
                      key={run.runId}
                      onClick={() =>
                        router.push(`/dashboard/salary-slip-run-details?runId=${run.runId}`)
                      }
                      className="cursor-pointer hover:bg-canvas/60"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-ink">#{run.runId}</div>
                        <div className="text-xs text-muted">{displayDate(run.runDate)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-ink">
                        {monthLabel(run.month)} {run.year}
                      </td>
                      <td className="truncate px-4 py-3.5 text-muted">{run.triggeredBy}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(run.status)}`}
                        >
                          {run.status.toLowerCase() === 'processing' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : run.status.toLowerCase() === 'failed' ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-muted">
                        <span className="text-ink">{run.successCount}</span> ok
                        {run.failCount > 0 ? (
                          <>
                            {' · '}
                            <span className="text-danger">{run.failCount}</span> failed
                          </>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/dashboard/salary-slip-run-details?runId=${run.runId}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                        >
                          Details <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
