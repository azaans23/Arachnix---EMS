'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
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

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
    case 'sent':
      return 'border-success/25 bg-success/10 text-success';
    case 'processing':
    case 'pending':
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

export default function SalarySlipRunDetailsPage() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId') || '';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<SalarySlipRun | null>(null);
  const [details, setDetails] = useState<SalarySlipRunDetail[]>([]);
  const [search, setSearch] = useState('');

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

  // Auto-refresh while processing
  useEffect(() => {
    if (!run || run.status.toLowerCase() !== 'processing') return;
    const timer = window.setInterval(() => {
      load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [run, load]);

  const filteredDetails = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return details;
    return details.filter((detail) =>
      [
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
      )
    );
  }, [details, search]);

  if (allowed === null || (allowed && loading && !run && runId)) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <Skeleton className="mb-6 h-4 w-40" />
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-72 max-w-full" />
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
          Only Super Admin and HR Manager can view salary slip run details.
        </p>
      </div>
    );
  }

  if (!runId) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up">
        <Link
          href="/dashboard/salary-slip-runs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>
        <div className="mt-6">
          <EmptyState
            icon={<Banknote className="h-5 w-5" />}
            title="Select a run"
            description="Open a salary slip run from the history list to see per-employee PDF and email status."
            actionLabel="View runs"
            onAction={() => {
              window.location.href = '/dashboard/salary-slip-runs';
            }}
          />
        </div>
      </div>
    );
  }

  if (!loading && !run) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up">
        <Link
          href="/dashboard/salary-slip-runs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>
        <div className="mt-6 rounded-lg border border-border bg-surface px-5 py-8">
          <h1 className="text-lg font-semibold text-ink">Run not found</h1>
          <p className="mt-2 text-sm text-muted">No salary slip run matches #{runId}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/salary-slip-runs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {run && (
        <header className="mb-8 border-b border-border pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Salary slips · {MONTH_NAMES[run.month - 1]} {run.year}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Run #{run.runId} · Started {displayDate(run.runDate)} by {run.triggeredBy}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold ${statusClasses(run.status)}`}
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
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm text-muted">
            <span>
              <strong className="font-semibold text-success">{run.successCount}</strong> succeeded
            </span>
            <span>
              <strong className="font-semibold text-danger">{run.failCount}</strong> failed
            </span>
            <span>
              <strong className="font-semibold text-ink">{details.length}</strong> employees
            </span>
          </div>
          {run.status.toLowerCase() === 'processing' && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-canvas px-3 py-2.5 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink" />
              Workflow in progress. Results refresh automatically every eight seconds.
            </div>
          )}
        </header>
      )}

      {details.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No employee results yet"
          description={
            run?.status.toLowerCase() === 'processing'
              ? 'Details will appear as the n8n workflow finishes each employee.'
              : 'This run has no per-employee detail rows.'
          }
        />
      ) : (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">Employee results</h2>
              <p className="mt-1 text-xs text-muted">
                {search
                  ? `${filteredDetails.length} of ${details.length} results`
                  : `${details.length} employee${details.length === 1 ? '' : 's'} in this run`}
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee or status…"
                aria-label="Search employee results"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
          </div>

          {filteredDetails.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching results"
              description="Try another employee name, ID, email, or delivery status."
              actionLabel="Clear search"
              onAction={() => setSearch('')}
            />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {filteredDetails.map((detail) => (
                  <article
                    key={`${detail.runId}-${detail.employeeId}`}
                    className="rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-ink">
                          {detail.employeeName || detail.employeeId}
                        </h3>
                        <p className="mt-1 truncate text-xs text-muted">
                          {detail.runDetailId || detail.employeeId}
                          {detail.employeeEmail ? ` · ${detail.employeeEmail}` : ''}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(detail.status)}`}
                      >
                        {detail.status}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      <div>
                        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </p>
                        <span
                          className={`mt-1.5 inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(detail.emailStatus)}`}
                        >
                          {detail.emailStatus}
                        </span>
                      </div>
                      <div>
                        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </p>
                        {detail.pdfLink ? (
                          <a
                            href={detail.pdfLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                          >
                            Open slip <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="mt-1.5 text-xs text-muted">Not available</p>
                        )}
                      </div>
                    </div>
                    {detail.errorReason && (
                      <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-xs leading-5 text-danger">
                        {detail.errorReason}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-panel md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-4 py-3.5">Employee</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5">Email</th>
                        <th className="px-4 py-3.5">PDF</th>
                        <th className="px-4 py-3.5">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {filteredDetails.map((detail) => (
                        <tr
                          key={`${detail.runId}-${detail.employeeId}`}
                          className="hover:bg-canvas/50"
                        >
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-ink">
                              {detail.employeeName || detail.employeeId}
                            </div>
                            <div className="text-xs text-muted">
                              {detail.runDetailId || detail.employeeId}
                              {detail.employeeEmail ? ` · ${detail.employeeEmail}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(detail.status)}`}
                            >
                              {detail.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClasses(detail.emailStatus)}`}
                            >
                              {detail.emailStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
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
                            className="max-w-xs truncate px-4 py-3.5 text-xs text-danger"
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
            </>
          )}
        </section>
      )}
    </div>
  );
}
