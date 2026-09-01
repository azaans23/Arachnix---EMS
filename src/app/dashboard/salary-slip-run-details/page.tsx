'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Banknote,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, getTrustedRole, normalizeRole, ROLES } from '@/lib/rbac';
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
  { label: 'Rejected', value: 'rejected' },
  { label: 'Failed', value: 'failed' },
];

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' },
];

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'awaiting approval':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'approved':
    case 'success':
    case 'completed':
    case 'sent':
      return 'border-border bg-success/10 text-success';
    case 'rejected':
    case 'failed':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
  }
}

type ApprovalStage = {
  tone: 'info' | 'warning' | 'success' | 'danger';
  title: string;
  description: string;
  /** 0 generate · 1 review & approve · 2 send. */
  step: number;
};

const APPROVAL_STEPS = ['Generated', 'Approved', 'Sent'];

function stageClasses(tone: ApprovalStage['tone']) {
  switch (tone) {
    case 'warning':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'success':
      return 'border-border bg-success/10 text-success';
    case 'danger':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
  }
}

function buildApprovalStage(
  run: SalarySlipRun,
  options: { canApprove: boolean; generatedCount: number }
): ApprovalStage {
  const status = run.status.trim().toLowerCase();
  const approved = Boolean(run.approvedAt || run.approvedBy);

  if (status === 'processing') {
    return {
      tone: 'info',
      step: 0,
      title: 'Generating slips',
      description:
        'The workflow is building PDFs. The run moves to Awaiting approval once generation finishes — no employee has been emailed yet.',
    };
  }

  if (status === 'failed') {
    return {
      tone: 'danger',
      step: 0,
      title: 'Generation failed',
      description: 'Nothing was distributed. Fix the errors listed below and start a new run.',
    };
  }

  if (status === 'rejected') {
    return {
      tone: 'danger',
      step: 1,
      title: 'Payroll run rejected',
      description: `${run.rejectedBy ? `Rejected by ${run.rejectedBy}. ` : ''}${
        run.rejectionReason || 'No salary slips from this run will be emailed.'
      }`,
    };
  }

  if (status === 'awaiting approval') {
    if (!options.canApprove) {
      return {
        tone: 'warning',
        step: 1,
        title: 'Waiting for Admin approval',
        description:
          'Slips are generated but not emailed yet. An Admin or Super Admin has to approve this run before employees receive anything.',
      };
    }
    return {
      tone: 'warning',
      step: 1,
      title: 'Waiting for your approval',
      description:
        options.generatedCount === 0
          ? 'No PDF links are ready yet, so distribution cannot be approved.'
          : `Open each of the ${options.generatedCount} generated ${
              options.generatedCount === 1 ? 'slip' : 'slips'
            } below, then use Approve & send to release the emails.`,
    };
  }

  if (status === 'approved') {
    return {
      tone: 'info',
      step: 2,
      title: 'Approved — sending emails',
      description: `${
        run.approvedBy ? `Approved by ${run.approvedBy}. ` : ''
      }The send workflow is emailing slips and will mark this run Completed.`,
    };
  }

  if (approved) {
    return {
      tone: 'success',
      step: 2,
      title: 'Approved and distributed',
      description: `Approved by ${run.approvedBy || 'an administrator'}${
        run.approvedAt ? ` on ${displayDate(run.approvedAt)}` : ''
      }. Slips have been emailed to employees.`,
    };
  }

  return {
    tone: 'warning',
    step: 2,
    title: 'Sent without recorded approval',
    description:
      'This run went straight to Completed, so it skipped the approval gate. The generate workflow in n8n is still emailing slips itself — it should stop after creating PDFs and set the run to Awaiting Approval instead.',
  };
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [actorRole, setActorRole] = useState('');
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<SalarySlipRunDetail | 'run' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const lastStatusRef = useRef('');

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!runId) {
        setLoading(false);
        return;
      }
      if (!options.silent) setLoading(true);
      try {
        const response = await fetch(`/api/salary-slip-runs/${encodeURIComponent(runId)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load run details.');
        }
        const nextRun = result.data.run as SalarySlipRun;
        const prevStatus = lastStatusRef.current;
        const nextStatus = String(nextRun.status || '').toLowerCase();
        lastStatusRef.current = nextStatus;
        setRun(nextRun);
        setDetails(result.data.details || []);

        if (
          options.silent &&
          (prevStatus === 'processing' || prevStatus === 'approved') &&
          nextStatus &&
          nextStatus !== prevStatus
        ) {
          if (nextStatus === 'completed') {
            toast.success(
              `Salary slip run completed: ${nextRun.successCount} succeeded, ${nextRun.failCount} failed.`
            );
          } else if (nextStatus === 'partial') {
            toast.message(
              `Salary slip run partial: ${nextRun.successCount} succeeded, ${nextRun.failCount} failed.`
            );
          } else if (nextStatus === 'failed') {
            toast.error(`Salary slip run failed: ${nextRun.failCount || 0} failed.`);
          }
        }
      } catch (error: unknown) {
        if (!options.silent) {
          toast.error(error instanceof Error ? error.message : 'Failed to load run details.');
          setRun(null);
          setDetails([]);
        }
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [runId]
  );

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
        /* keep JWT */
      }
      setActorRole(role);
      const canRead = canAccess(role, 'salary_slip_run_details', flags);
      setAllowed(canRead);
      if (canRead) await load();
      else setLoading(false);
    };
    boot();
  }, [load]);

  useEffect(() => {
    if (!run || !['processing', 'approved'].includes(run.status.toLowerCase())) return;
    const timer = window.setInterval(() => void load({ silent: true }), 5000);
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

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredDetails.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);
  const pagedDetails = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredDetails.slice(start, start + pageSizeNum);
  }, [filteredDetails, currentPage, pageSizeNum]);
  const rangeStart = filteredDetails.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredDetails.length);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPage(1);
  };

  const approveRun = async () => {
    if (!run) return;
    setApproving(true);
    try {
      const response = await fetch(
        `/api/salary-slip-runs/${encodeURIComponent(run.runId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ action: 'approve' }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to approve payroll.');
      }
      setConfirmApproval(false);
      toast.success(result.message || 'Payroll approved.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve payroll.');
    } finally {
      setApproving(false);
    }
  };

  const rejectSalarySlip = async () => {
    if (!run || !rejectTarget) return;
    const reason = rejectionReason.trim();
    if (!reason) {
      toast.error('Enter a reason for rejecting the salary slip.');
      return;
    }

    setRejecting(true);
    try {
      const response = await fetch(
        `/api/salary-slip-runs/${encodeURIComponent(run.runId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            action: 'reject',
            scope: rejectTarget === 'run' ? 'run' : 'employee',
            employeeId: rejectTarget === 'run' ? undefined : rejectTarget.employeeId,
            reason,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reject salary slip.');
      }
      setRejectTarget(null);
      setRejectionReason('');
      toast.success(result.message || 'Salary slip rejected.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject salary slip.');
    } finally {
      setRejecting(false);
    }
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
          Only Super Admin, Admin, and Finance Manager can view salary slip details.
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
  const normalizedActorRole = normalizeRole(actorRole);
  const canApprove =
    normalizedActorRole === ROLES.ADMIN || normalizedActorRole === ROLES.SUPER_ADMIN;
  const awaitingApproval = run?.status.trim().toLowerCase() === 'awaiting approval';
  const generatedCount = details.filter((detail) => {
    const status = detail.status.trim().toLowerCase();
    return (status === 'success' || status === 'completed') && Boolean(detail.pdfLink);
  }).length;
  const stage = run ? buildApprovalStage(run, { canApprove, generatedCount }) : null;

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
              ? `${displayDate(run.runDate)} · ${run.successCount} ok · ${run.failCount} failed · ${recordLabel}`
              : recordLabel}
          </p>
          {run?.approvedBy ? (
            <p className="mt-1 text-xs text-muted">
              Approved by {run.approvedBy}
              {run.approvedAt ? ` · ${displayDate(run.approvedAt)}` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {run && awaitingApproval && canApprove ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRejectTarget('run');
                  setRejectionReason('');
                }}
                disabled={loading || generatedCount === 0}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-3.5 text-sm font-semibold text-danger transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />
                Reject all
              </button>
              <button
                type="button"
                onClick={() => setConfirmApproval(true)}
                disabled={loading || generatedCount === 0}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  generatedCount === 0
                    ? 'No generated PDF links are ready to distribute'
                    : 'Approve and start employee email distribution'
                }
              >
                <ShieldCheck className="h-4 w-4" />
                Approve &amp; send
              </button>
            </>
          ) : null}
          {run && (
            <span
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${statusClasses(run.status)}`}
            >
              {run.status.toLowerCase() === 'processing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : ['failed', 'rejected'].includes(run.status.toLowerCase()) ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {run.status}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {stage ? (
        <section
          aria-label="Payroll approval status"
          className="mb-6 rounded-lg border border-border bg-surface p-5 shadow-panel"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${stageClasses(stage.tone)}`}
              >
                {stage.step === 2 && stage.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : stage.tone === 'danger' ? (
                  <XCircle className="h-4 w-4" />
                ) : stage.step === 0 || stage.tone === 'info' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">{stage.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                  {stage.description}
                </p>
              </div>
            </div>
            <ol className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium">
              {APPROVAL_STEPS.map((label, index) => (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-md border px-2 py-1 ${
                      index <= stage.step
                        ? 'border-border bg-canvas text-ink'
                        : 'border-border/60 bg-surface text-muted/60'
                    }`}
                  >
                    {label}
                  </span>
                  {index < APPROVAL_STEPS.length - 1 ? (
                    <ChevronRight className="h-3 w-3 text-muted/50" />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
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
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
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
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-5 py-3.5 font-semibold">Employee</th>
                        <th className="px-5 py-3.5 font-semibold">Status</th>
                        <th className="px-5 py-3.5 font-semibold">Email</th>
                        <th className="px-5 py-3.5 font-semibold">PDF</th>
                        <th className="px-5 py-3.5 font-semibold">Reason / error</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedDetails.map((detail) => (
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
                            title={detail.rejectionReason || detail.errorReason}
                          >
                            {detail.rejectionReason || detail.errorReason || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {awaitingApproval &&
                            canApprove &&
                            ['success', 'completed'].includes(
                              detail.status.trim().toLowerCase()
                            ) &&
                            detail.emailStatus.trim().toLowerCase() !== 'sent' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(detail);
                                  setRejectionReason('');
                                }}
                                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-danger-border bg-danger-bg px-2.5 text-xs font-semibold text-danger transition-opacity hover:opacity-80"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">
                  Showing {rangeStart}–{rangeEnd} of {filteredDetails.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-[7.5rem]">
                    <CustomDropdown
                      id="details-page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={(val) => {
                        setPageSize(val);
                        setPage(1);
                      }}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <span className="min-w-[4.5rem] text-center text-xs font-medium text-muted">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {confirmApproval && run && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-4">
              <button
                type="button"
                aria-label="Close approval dialog"
                className="absolute inset-0 cursor-default"
                disabled={approving}
                onClick={() => setConfirmApproval(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="approve-payroll-title"
                className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
              >
                <div className="border-b border-border px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    Payroll approval
                  </p>
                  <h2 id="approve-payroll-title" className="mt-1 text-lg font-semibold text-ink">
                    Approve {MONTH_NAMES[run.month - 1]} {run.year}?
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    This starts email distribution for {generatedCount} generated salary{' '}
                    {generatedCount === 1 ? 'slip' : 'slips'}. Review every PDF link before
                    continuing. Approval cannot be edited after the send workflow starts.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-4">
                  <button
                    type="button"
                    disabled={approving}
                    onClick={() => setConfirmApproval(false)}
                    className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
                  >
                    Keep reviewing
                  </button>
                  <button
                    type="button"
                    disabled={approving}
                    onClick={() => void approveRun()}
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                  >
                    {approving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Approve &amp; send
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {rejectTarget && run && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-4">
              <button
                type="button"
                aria-label="Close rejection dialog"
                className="absolute inset-0 cursor-default"
                disabled={rejecting}
                onClick={() => setRejectTarget(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="reject-payroll-title"
                className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
              >
                <div className="border-b border-border px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-danger">
                    Payroll rejection
                  </p>
                  <h2 id="reject-payroll-title" className="mt-1 text-lg font-semibold text-ink">
                    {rejectTarget === 'run'
                      ? `Reject all ${generatedCount} salary slips?`
                      : `Reject ${rejectTarget.employeeName || rejectTarget.employeeId}'s slip?`}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {rejectTarget === 'run'
                      ? 'No employee in this run will receive a salary slip. This run cannot be approved afterward.'
                      : 'This employee will be excluded when the remaining salary slips are approved and sent.'}
                  </p>
                </div>
                <div className="space-y-2 px-5 py-4">
                  <label htmlFor="salary-slip-rejection-reason" className="text-xs font-medium text-ink">
                    Rejection reason
                  </label>
                  <textarea
                    id="salary-slip-rejection-reason"
                    rows={3}
                    maxLength={500}
                    autoFocus
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Explain what must be corrected…"
                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                  <p className="text-right text-[11px] text-muted">
                    {rejectionReason.length}/500
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                  <button
                    type="button"
                    disabled={rejecting}
                    onClick={() => setRejectTarget(null)}
                    className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={rejecting || !rejectionReason.trim()}
                    onClick={() => void rejectSalarySlip()}
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-danger px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rejecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                    Confirm rejection
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
