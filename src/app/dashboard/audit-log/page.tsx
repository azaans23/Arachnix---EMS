'use client';

import { useEffect, useMemo, useState, Fragment } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import CustomDropdown from '@/components/ui/Dropdown';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import type { AuditLogRecord } from '@/types/audit';

type SortKey = 'timestamp' | 'userEmail' | 'action' | 'recordType';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' },
];

async function requestAuditLog(): Promise<AuditLogRecord[]> {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/audit-log', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to load audit log.');
  }
  return Array.isArray(result.data) ? result.data : [];
}

function displayDate(value: string): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PK', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function prettyValue(value: string): string {
  if (!value) return 'No value';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function actionClasses(action: string): string {
  switch (action.toUpperCase()) {
    case 'CREATE':
    case 'GRANT_ACCESS':
    case 'APPROVE':
      return 'border-border bg-ink text-accent-fg';
    case 'DELETE':
    case 'REJECT':
    case 'REVOKE_ACCESS':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
  }
}

export default function AuditLogPage() {
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const loadAuditLog = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await requestAuditLog());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    requestAuditLog()
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load audit log.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const actionOptions = useMemo(
    () => [
      { label: 'All actions', value: 'all' },
      ...Array.from(new Set(records.map((record) => record.action).filter(Boolean)))
        .sort()
        .map((action) => ({ label: action.replaceAll('_', ' '), value: action })),
    ],
    [records]
  );

  const typeOptions = useMemo(
    () => [
      { label: 'All record types', value: 'all' },
      ...Array.from(new Set(records.map((record) => record.recordType).filter(Boolean)))
        .sort()
        .map((type) => ({ label: type, value: type })),
    ],
    [records]
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...records]
      .filter((record) => {
        if (actionFilter !== 'all' && record.action !== actionFilter) return false;
        if (typeFilter !== 'all' && record.recordType !== typeFilter) return false;
        if (!query) return true;
        return [
          record.logId,
          record.userEmail,
          record.action,
          record.recordType,
          record.recordId,
        ].some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const left =
          sortKey === 'timestamp'
            ? new Date(a.timestamp).getTime() || 0
            : String(a[sortKey] || '').toLowerCase();
        const right =
          sortKey === 'timestamp'
            ? new Date(b.timestamp).getTime() || 0
            : String(b[sortKey] || '').toLowerCase();
        const comparison = left < right ? -1 : left > right ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [records, search, actionFilter, typeFilter, sortKey, sortDirection]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);
  const visibleRecords = filteredRecords.slice(
    (currentPage - 1) * pageSizeNum,
    currentPage * pageSizeNum
  );
  const hasFilters = Boolean(search.trim() || actionFilter !== 'all' || typeFilter !== 'all');
  const rangeStart =
    filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRecords.length);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, typeFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  const changeSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'timestamp' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey !== column ? (
      <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    ) : sortDirection === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-ink" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-ink" />
    );

  if (loading && records.length === 0) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-40" />
          <Skeleton className="h-10 w-full sm:w-44" />
        </div>
        <TableSkeleton columns={6} rows={8} actions={false} />
      </div>
    );
  }

  if (error && records.length === 0) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Audit log unavailable"
          description={error}
          actionLabel="Retry"
          onAction={loadAuditLog}
          actionIcon={<RefreshCw className="h-4 w-4" />}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">System</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Audit Log
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {hasFilters
              ? `${filteredRecords.length} of ${records.length} events`
              : `${records.length} event${records.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={loadAuditLog}
          disabled={loading}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search user, action, type, or record ID…"
            className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0 sm:gap-3">
          <div className="sm:w-40">
            <CustomDropdown
              id="audit-action-filter"
              name="actionFilter"
              options={actionOptions}
              value={actionFilter}
              onChange={(value) => {
                setActionFilter(value);
                setPage(1);
              }}
              onBlur={() => {}}
            />
          </div>
          <div className="sm:w-44">
            <CustomDropdown
              id="audit-type-filter"
              name="typeFilter"
              options={typeOptions}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
              onBlur={() => {}}
            />
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title={hasFilters ? 'No matching audit events' : 'No audit events yet'}
          description={
            hasFilters
              ? 'Try a different search or clear the filters.'
              : 'Employee create and update actions will appear here.'
          }
          actionLabel={hasFilters ? 'Clear filters' : undefined}
          onAction={hasFilters ? clearFilters : undefined}
          actionIcon={hasFilters ? <X className="h-4 w-4" /> : undefined}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left table-fixed">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[22%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {(
                      [
                        ['timestamp', 'Timestamp'],
                        ['userEmail', 'User'],
                        ['action', 'Action'],
                        ['recordType', 'Type'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th key={key} className="px-4 py-3.5 font-semibold">
                        <button
                          type="button"
                          onClick={() => changeSort(key)}
                          className="inline-flex cursor-pointer items-center gap-1.5 hover:text-ink"
                        >
                          {label} <SortIcon column={key} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3.5 font-semibold">Record ID</th>
                    <th className="px-4 py-3.5 text-right font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm text-ink">
                  {visibleRecords.map((record, index) => {
                    const rowId = record.logId || `${record.timestamp}-${index}`;
                    const expanded = expandedId === rowId;
                    return (
                      <Fragment key={rowId}>
                        <tr className="hover:bg-canvas/50">
                          <td className="whitespace-nowrap px-4 py-3.5 text-muted">
                            {displayDate(record.timestamp)}
                          </td>
                          <td className="truncate px-4 py-3.5" title={record.userEmail || 'System'}>
                            {record.userEmail || 'System'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-xs font-semibold ${actionClasses(record.action)}`}
                            >
                              {String(record.action || '').replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td className="truncate px-4 py-3.5">
                            {record.recordType || 'N/A'}
                          </td>
                          <td
                            className="truncate px-4 py-3.5 font-mono text-xs text-muted"
                            title={record.recordId || 'N/A'}
                          >
                            {record.recordId || 'N/A'}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : rowId)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas"
                            >
                              {expanded ? 'Hide' : 'View'}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-canvas/40">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <AuditValue label="Before" value={record.oldValue} />
                                <AuditValue label="After" value={record.newValue} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredRecords.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                Showing {rangeStart}–{rangeEnd} of {filteredRecords.length}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[7.5rem]">
                  <CustomDropdown
                    id="audit-page-size"
                    name="pageSize"
                    options={PAGE_SIZE_OPTIONS}
                    value={pageSize}
                    onChange={setPageSize}
                    onBlur={() => {}}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
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
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
        {prettyValue(value)}
      </pre>
    </div>
  );
}
