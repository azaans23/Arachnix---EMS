'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import OfferLetterModal from '@/components/documents/OfferLetterModal';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { OfferLetterRun } from '@/types/offer-letter';

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

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
];

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
];

const MAX_CANDIDATES = 20;

function currentYearOptions() {
  const year = new Date().getFullYear();
  return [year - 1, year, year + 1].map((value) => ({
    label: String(value),
    value: String(value),
  }));
}

function monthLabel(month: number) {
  return MONTH_OPTIONS.find((option) => option.value === String(month))?.label || String(month);
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
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

export default function OfferLettersPage() {
  const router = useRouter();
  const now = new Date();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [runs, setRuns] = useState<OfferLetterRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [candidateCount, setCandidateCount] = useState('1');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formCount, setFormCount] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const token = () => localStorage.getItem('token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/offer-letters', {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load offer letter runs.');
      }
      setRuns(result.data || []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load offer letter data.');
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
        /* keep JWT fallback */
      }
      const canView = canAccess(role, 'generated_documents');
      setCanGenerate(canWrite(role, 'generated_documents'));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const filteredRuns = useMemo(() => {
    let list = [...runs];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((run) => {
        const haystack = [
          run.runId,
          run.triggeredBy,
          run.status,
          monthLabel(run.month),
          String(run.year),
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return haystack.some((value) => value.includes(q));
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((run) => run.status.toLowerCase() === statusFilter.toLowerCase());
    }
    return list;
  }, [runs, search, statusFilter]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSizeNum));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRuns.slice(start, start + pageSizeNum);
  }, [filteredRuns, currentPage, pageSizeNum]);

  const rangeStart = filteredRuns.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRuns.length);
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  const openGenerate = () => {
    setMonth(String(now.getMonth() + 1));
    setYear(String(now.getFullYear()));
    setCandidateCount('1');
    setShowGenerate(true);
  };

  const continueToDetails = () => {
    const count = Number(candidateCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CANDIDATES) {
      toast.error(`Enter a whole number between 1 and ${MAX_CANDIDATES}.`);
      return;
    }
    setFormCount(count);
    setShowGenerate(false);
    setDetailsOpen(true);
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <TableSkeleton columns={8} rows={8} />
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center animate-scale-up">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Only Super Admin and HR Manager can manage offer letter runs.
        </p>
      </div>
    );
  }

  const generateModal = showGenerate
    ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowGenerate(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-offer-title"
            onClick={(event) => event.stopPropagation()}
            className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2
                  id="generate-offer-title"
                  className="text-lg font-semibold tracking-tight text-ink"
                >
                  Generate offer letter
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Choose the period and how many new candidates to add.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Month</label>
                  <CustomDropdown
                    id="offer-month"
                    name="month"
                    options={MONTH_OPTIONS}
                    value={month}
                    onChange={setMonth}
                    onBlur={() => {}}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Year</label>
                  <CustomDropdown
                    id="offer-year"
                    name="year"
                    options={currentYearOptions()}
                    value={year}
                    onChange={setYear}
                    onBlur={() => {}}
                  />
                </div>
              </div>

              <label className="block text-xs font-medium text-muted">
                How many employees to add?
                <input
                  type="number"
                  min={1}
                  max={MAX_CANDIDATES}
                  step={1}
                  value={candidateCount}
                  onChange={(event) => setCandidateCount(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  placeholder="1"
                />
              </label>
              <p className="text-xs text-muted">
                You can add up to {MAX_CANDIDATES} candidates in one run. Each gets a separate form
                on the next step.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setShowGenerate(false)}
                className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueToDetails}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
              >
                <UserPlus className="h-4 w-4" />
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Documents</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Offer Letter
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading && runs.length === 0
              ? 'Loading runs…'
              : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canGenerate && (
            <button
              type="button"
              onClick={openGenerate}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover"
            >
              <FileText className="h-4 w-4" />
              Generate
            </button>
          )}
        </div>
      </div>

      {loading && runs.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
          <TableSkeleton columns={8} rows={8} />
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No offer letter runs yet"
          description="Generate offer letters for one or more new candidates to start a run."
          actionLabel={canGenerate ? 'Generate' : undefined}
          onAction={canGenerate ? openGenerate : undefined}
          actionIcon={canGenerate ? <FileText className="h-4 w-4" /> : undefined}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search run ID, triggered by, status…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:w-44">
              <CustomDropdown
                id="offer-status-filter"
                name="statusFilter"
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                onBlur={() => {}}
                placeholder="All statuses"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setPage(1);
                }}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors hover:text-ink sm:shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredRuns.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching runs"
              description="Try a different search or clear the filters."
              actionLabel="Clear filters"
              onAction={() => {
                setSearch('');
                setStatusFilter('all');
                setPage(1);
              }}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-5 py-3.5">Run ID</th>
                        <th className="px-5 py-3.5">Triggered By</th>
                        <th className="px-5 py-3.5">Run Date</th>
                        <th className="px-5 py-3.5">Month</th>
                        <th className="px-5 py-3.5">Year</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Success</th>
                        <th className="px-5 py-3.5">Fail</th>
                        <th className="px-5 py-3.5">Offer Letters</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedRuns.map((run) => (
                        <tr
                          key={run.runId}
                          onClick={() =>
                            router.push(`/dashboard/offer-letter-run-details?runId=${run.runId}`)
                          }
                          className="cursor-pointer transition-colors duration-150 hover:bg-canvas/70"
                        >
                          <td className="px-5 py-3.5 font-medium">{run.runId}</td>
                          <td className="px-5 py-3.5 text-muted">{run.triggeredBy || '—'}</td>
                          <td className="px-5 py-3.5 text-muted">{displayDate(run.runDate)}</td>
                          <td className="px-5 py-3.5">{monthLabel(run.month)}</td>
                          <td className="px-5 py-3.5">{run.year}</td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusClasses(run.status)}`}
                            >
                              {run.status.toLowerCase() === 'processing' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              {run.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">{run.successCount}</td>
                          <td className="px-5 py-3.5">{run.failCount}</td>
                          <td className="px-5 py-3.5">{run.offerLetterCount}</td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={`/dashboard/offer-letter-run-details?runId=${run.runId}`}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                            >
                              Open <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">
                  Showing {rangeStart}–{rangeEnd} of {filteredRuns.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-[7.5rem]">
                    <CustomDropdown
                      id="offer-runs-page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={(value) => {
                        setPageSize(value);
                        setPage(1);
                      }}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
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
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
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

      {generateModal}

      {detailsOpen && (
        <OfferLetterModal
          count={formCount}
          month={Number(month)}
          year={Number(year)}
          onClose={() => setDetailsOpen(false)}
          onSuccess={(runId) => {
            void load();
            if (runId) router.push(`/dashboard/offer-letter-run-details?runId=${runId}`);
          }}
        />
      )}
    </div>
  );
}
