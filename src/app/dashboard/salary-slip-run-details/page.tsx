'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
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
      return 'border-border bg-ink text-accent-fg';
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
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {run && (
        <header className="mb-8 border-b border-border pb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Slip run details
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Run #{run.runId}
              </h1>
              <p className="mt-1.5 text-sm text-muted">
                {MONTH_NAMES[run.month - 1]} {run.year} · {displayDate(run.runDate)} ·{' '}
                {run.triggeredBy}
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
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
            <span>
              <strong className="text-ink">{run.successCount}</strong> succeeded
            </span>
            <span>
              <strong className="text-danger">{run.failCount}</strong> failed
            </span>
            <span>
              <strong className="text-ink">{details.length}</strong> employees
            </span>
          </div>
          {run.status.toLowerCase() === 'processing' && (
            <p className="mt-3 text-xs text-muted">
              Workflow is still running. This page refreshes automatically every few seconds.
            </p>
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
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
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
                {details.map((detail) => (
                  <tr key={`${detail.runId}-${detail.employeeId}`} className="hover:bg-canvas/50">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-ink">
                        {detail.employeeName || detail.employeeId}
                      </div>
                      <div className="text-xs text-muted">
                        {detail.employeeId}
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
                    <td className="max-w-xs truncate px-4 py-3.5 text-xs text-danger" title={detail.errorReason}>
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
  );
}
