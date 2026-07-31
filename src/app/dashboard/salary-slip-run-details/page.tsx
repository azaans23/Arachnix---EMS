'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { SalarySlipRun, SalarySlipRunDetail } from '@/types/salary-slip';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
];

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
    case 'sent':
      return 'border-border bg-success/10 text-success';
    case 'failed':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
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

export default function SalarySlipRunDetailsPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId') || '';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<SalarySlipRun | null>(null);
  const [details, setDetails] = useState<SalarySlipRunDetail[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    if (!runId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/salary-slip-runs/${encodeURIComponent(runId)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load run details.');
      }
      setRun(result.data.run);
      setDetails(result.data.details || []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load run details.');
      setRun(null);
      setDetails([]);
    } finally {
      setLoading(false);
    }
  }, [runId]);

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
      if (canRead) await load();
      else setLoading(false);
    };
    boot();
  }, [load]);

  useEffect(() => {
    if (!run || run.status.toLowerCase() !== 'processing') return;
    const timer = window.setInterval(() => load(), 8000);
    return () => window.clearInterval(timer);
  }, [run, load]);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  const filteredDetails = useMemo(() => {
    const query = search.trim().toLowerCase();
    return details.filter((detail) => {
      if (statusFilter !== 'all' && detail.status.toLowerCase() !== statusFilter) return false;
      if (!query) return true;
      return [
        detail.runDetailId,
        detail.employeeName,
        detail.employeeId,
        detail.employeeEmail,
        detail.status,
        detail.emailStatus,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [details, search, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <TableSkeleton columns={5} rows={8} />
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
          Only Super Admin and HR Manager can view salary slip details.
        </p>
      </div>
    );
  }

  if (!runId) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <Link
          href="/dashboard/salary-slip-runs"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Salary slips
        </Link>
        <EmptyState
          icon={<Banknote className="h-5 w-5" />}
          title="Select a run"
          description="Open a run from the salary slips list to see employee results."
          actionLabel="View runs"
          onAction={() => {
            window.location.href = '/dashboard/salary-slip-runs';
          }}
        />
      </div>
    );
  }

  if (!loading && !run) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <Link
          href="/dashboard/salary-slip-runs"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Salary slips
        </Link>
        <EmptyState
          icon={<Banknote className="h-5 w-5" />}
          title="Run not found"
          description={`No salary slip run matches #${runId}.`}
          actionLabel="Back to runs"
          onAction={() => {
            window.location.href = '/dashboard/salary-slip-runs';
          }}
        />
      </div>
    );
  }

  const recordLabel =
    loading && !run
      ? 'Loading…'
      : hasActiveFilters
        ? `${filteredDetails.length} of ${details.length} employee${details.length === 1 ? '' : 's'}`
        : `${details.length} employee${details.length === 1 ? '' : 's'}`;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <Link
        href="/dashboard/salary-slip-runs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Salary slips
      </Link>

      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Run #{run?.runId || runId}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {run ? `${MONTH_NAMES[run.month - 1]} ${run.year}` : 'Salary slip run'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {run
              ? `${displayDate(run.runDate)} · ${run.successCount} ok${
                  run.failCount > 0 ? ` · ${run.failCount} failed` : ''
                } · ${recordLabel}`
              : recordLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {run && (
            <span
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${statusClasses(run.status)}`}
            >
              {run.status.toLowerCase() === 'processing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : run.status.toLowerCase() === 'failed' ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {run.status}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && details.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
          <TableSkeleton columns={5} rows={8} />
        </div>
      ) : details.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No employee results yet"
          description={
            run?.status.toLowerCase() === 'processing'
              ? 'Results appear as the workflow finishes each employee.'
              : 'This run has no employee detail rows.'
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, ID, email, status…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:w-40">
              <CustomDropdown
                id="detail-status-filter"
                name="detailStatusFilter"
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                onBlur={() => {}}
                placeholder="All statuses"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors duration-200 hover:border-ink/25 hover:text-ink sm:shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredDetails.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching employees"
              description="Try a different search or clear the filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      <th className="px-5 py-3.5 font-semibold">Employee</th>
                      <th className="px-5 py-3.5 font-semibold">Status</th>
                      <th className="px-5 py-3.5 font-semibold">Email</th>
                      <th className="px-5 py-3.5 font-semibold">PDF</th>
                      <th className="px-5 py-3.5 font-semibold">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-ink">
                    {filteredDetails.map((detail) => (
                      <tr
                        key={`${detail.runId}-${detail.employeeId}`}
                        className="transition-colors duration-150 hover:bg-canvas/70"
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium">
                            {detail.employeeName || detail.employeeId}
                          </div>
                          <div className="text-xs text-muted">
                            {detail.runDetailId || detail.employeeId}
                            {detail.employeeEmail ? ` · ${detail.employeeEmail}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusClasses(detail.status)}`}
                          >
                            {detail.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusClasses(detail.emailStatus)}`}
                          >
                            {detail.emailStatus}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {detail.pdfLink ? (
                            <a
                              href={detail.pdfLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td
                          className="max-w-xs truncate px-5 py-3.5 text-xs text-danger"
                          title={detail.errorReason}
                        >
                          {detail.errorReason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
