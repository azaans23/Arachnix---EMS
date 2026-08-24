'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2Off as LinkOff,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AccountShareChart,
  CashflowTrendChart,
  CategoryBreakdownChart,
  ChartEmpty,
  ChartLegend,
} from '@/components/accounting/AccountingCharts';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import {
  ACCOUNTING_ARCHIVE_GRACE_MINUTES,
  ACCOUNTING_BANK_ACCOUNT,
  ACCOUNTING_CATEGORIES,
  ACCOUNTING_COMPANY_ROOT,
  ACCOUNTING_CURRENCIES,
  ACCOUNTING_NO_FILE_LABEL,
  ACCOUNTING_TRANSACTION_TYPES,
  buildAccountingDriveFileName,
  isAllowedAccountingFileName,
  nextAccountingInvoiceReference,
  type AccountingDashboardMetrics,
  type AccountingRecord,
} from '@/types/accounting';

type DirectorAccount = {
  employeeId: string;
  name: string;
  email: string;
};

const PAGE_SIZE_OPTIONS = [
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
];

const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx,.zip';
const MAX_FILE_MB = 20;

const inputClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]';

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
      label: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    };
  });
}

function monthLabel(period: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatMoney(amount: number, currency = 'PKR') {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

type UploadForm = {
  period: string;
  account: string;
  category: string;
  transactionType: string;
  amount: string;
  currency: string;
  clientVendor: string;
  source: string;
  destination: string;
  reference: string;
  notes: string;
};

const emptyForm = (period: string): UploadForm => ({
  period,
  account: ACCOUNTING_BANK_ACCOUNT,
  category: ACCOUNTING_CATEGORIES[0],
  transactionType: ACCOUNTING_TRANSACTION_TYPES[0],
  amount: '',
  currency: 'PKR',
  clientVendor: '',
  source: '',
  destination: '',
  reference: '',
  notes: '',
});

export default function AccountingRecordsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountingRecord[]>([]);
  const [metrics, setMetrics] = useState<AccountingDashboardMetrics | null>(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState(currentPeriod());
  const [accountFilter, setAccountFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState<UploadForm>(() => emptyForm(currentPeriod()));
  const [nextReference, setNextReference] = useState('INV-0001');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [directors, setDirectors] = useState<DirectorAccount[]>([]);
  const archivingRef = useRef<{ key: string; ids: string[] }>({ key: '', ids: [] });

  const reportRolledBackUploads = useCallback((nextRows: AccountingRecord[], key: string) => {
    const previous = archivingRef.current;
    const present = new Set(nextRows.map((row) => row.recordId));
    const rolledBack = previous.key === key ? previous.ids.filter((id) => !present.has(id)) : [];

    archivingRef.current = {
      key,
      ids: nextRows.filter((row) => row.pendingDrive).map((row) => row.recordId),
    };

    if (rolledBack.length > 0) {
      toast.error(
        rolledBack.length === 1
          ? 'Drive archival failed, so that upload was rolled back. Nothing was saved — check the n8n run and try again.'
          : `Drive archival failed for ${rolledBack.length} uploads, so they were rolled back. Check the n8n run and try again.`
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthFilter });
      if (accountFilter !== 'all') params.set('account', accountFilter);
      const response = await fetch(`/api/accounting-records?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load accounting records.');
      }

      const nextRows: AccountingRecord[] = result.data || [];
      reportRolledBackUploads(nextRows, `${monthFilter}|${accountFilter}`);
      setRows(nextRows);
      setMetrics(result.metrics || null);
      if (Array.isArray(result.directors)) {
        setDirectors(result.directors);
      }
      setNextReference(
        String(result.nextReference || '').trim() ||
          nextAccountingInvoiceReference(nextRows.map((row) => row.reference))
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load accounting records.');
    } finally {
      setLoading(false);
    }
  }, [monthFilter, accountFilter, reportRolledBackUploads]);

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
        /* keep JWT fallback */
      }
      const canView = canAccess(role, 'accounting_records', flags);
      setCanEdit(canWrite(role, 'accounting_records', flags));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const syncingCount = rows.filter((row) => row.pendingDrive).length;

  // Keep polling only while Drive archival is still in flight.
  useEffect(() => {
    if (!allowed || syncingCount === 0) return;
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [allowed, syncingCount, load]);

  useEffect(() => {
    if (!uploadOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setUploadOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [uploadOpen, saving]);

  const dominantCurrency = useMemo(() => {
    const tally = new Map<string, number>();
    for (const row of rows) tally.set(row.currency, (tally.get(row.currency) || 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'PKR';
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.recordId,
        row.account,
        row.category,
        row.transactionType,
        row.clientVendor,
        row.reference,
        row.fileName,
        row.uploadedBy,
        row.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const amountNumber = Number(form.amount);
  const amountValid =
    form.amount.trim() !== '' && Number.isFinite(amountNumber) && amountNumber >= 0;
  const fileValid = Boolean(
    file &&
    isAllowedAccountingFileName(file.name) &&
    file.size > 0 &&
    file.size <= MAX_FILE_MB * 1024 * 1024
  );
  const canSubmit = amountValid && (!file || fileValid) && !saving;

  const driveFileNamePreview = useMemo(() => {
    if (!file) return '';
    return buildAccountingDriveFileName({
      date: `${form.period}-01`,
      account: form.account,
      transactionType: form.transactionType,
      clientVendor: form.clientVendor,
      amount: amountValid ? amountNumber : 0,
      reference: form.reference,
      originalFileName: file.name,
    });
  }, [file, form, amountValid, amountNumber]);

  const directorNames = useMemo(
    () => directors.map((director) => director.name).filter(Boolean),
    [directors]
  );

  /** Bank account first, then every Director employee by name. */
  const uploadAccountOptions = useMemo(
    () =>
      [
        ACCOUNTING_BANK_ACCOUNT,
        ...directorNames.filter((name) => name !== ACCOUNTING_BANK_ACCOUNT),
      ].map((account) => ({ label: account, value: account })),
    [directorNames]
  );

  /** Filter list also includes accounts already on existing records. */
  const accountOptions = useMemo(() => {
    const fromRows = rows.map((row) => row.account).filter(Boolean);
    return Array.from(new Set([ACCOUNTING_BANK_ACCOUNT, ...directorNames, ...fromRows])).sort(
      (a, b) => {
        if (a === ACCOUNTING_BANK_ACCOUNT) return -1;
        if (b === ACCOUNTING_BANK_ACCOUNT) return 1;
        return a.localeCompare(b);
      }
    );
  }, [directorNames, rows]);

  const openUpload = () => {
    const invoice =
      nextReference || nextAccountingInvoiceReference(rows.map((row) => row.reference));
    setForm({ ...emptyForm(monthFilter), reference: invoice });
    setFile(null);
    setUploadOpen(true);
  };

  const submitUpload = async () => {
    if (file && !fileValid) {
      toast.error('Choose a supported file up to the size limit, or remove it.');
      return;
    }
    if (!amountValid) {
      toast.error('Enter an amount of zero or more.');
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      if (file) body.append('file', file);
      body.append('period', form.period);
      body.append('account', form.account);
      body.append('category', form.category);
      body.append('transactionType', form.transactionType);
      body.append('amount', String(amountNumber));
      body.append('currency', form.currency);
      body.append('clientVendor', form.clientVendor);
      body.append('source', form.source);
      body.append('destination', form.destination);
      body.append('reference', form.reference);
      body.append('notes', form.notes);

      const response = await fetch('/api/accounting-records', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed.');
      }

      toast.success(result.message || 'Upload accepted. Drive archival is running.');
      setUploadOpen(false);
      setFile(null);
      const used = String(form.reference || '').trim();
      setNextReference(
        nextAccountingInvoiceReference([
          ...rows.map((row) => row.reference),
          used,
          nextReference,
        ])
      );
      setForm(emptyForm(monthFilter));
      if (form.period !== monthFilter) setMonthFilter(form.period);
      else await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="mb-6 h-20 w-full" />
        <TableSkeleton columns={7} rows={6} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Accounting records are available to Finance Manager, Admin, and Super Admin."
        />
      </div>
    );
  }

  const trend = metrics?.trend ?? [];
  const byAccount = metrics?.byAccount ?? [];
  const byCategory = metrics?.byCategory ?? [];
  const net = metrics?.netCashflow ?? 0;

  const summary = [
  {
    label: 'Income',
    value: formatMoney(metrics?.income ?? 0, dominantCurrency),
    tone: 'text-success', // green
  },
  {
    label: 'Expenses',
    value: formatMoney(metrics?.expenses ?? 0, dominantCurrency),
    tone: 'text-danger', // red
  },
  {
    label: 'Payroll',
    value: formatMoney(metrics?.payroll ?? 0, dominantCurrency),
    tone: 'text-warning', // yellow
  },
  {
    label: 'Net cashflow',
    value: formatMoney(net, dominantCurrency),
    tone: 'text-ink',
  },
  { label: 'Transactions', value: String(metrics?.transactionCount ?? 0) },
  {
    label: 'Unlinked docs',
    value: String(metrics?.pendingDocuments ?? 0),
    tone: (metrics?.pendingDocuments ?? 0) > 0 ? 'text-danger' : 'text-ink',
  },
];

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Finance</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Accounting Records
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading && rows.length === 0
              ? 'Loading records…'
              : `${rows.length} record${rows.length === 1 ? '' : 's'} in ${monthLabel(monthFilter)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openUpload}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <Upload className="h-4 w-4" />
              Upload transaction
            </button>
          )}
        </div>
      </div>

      {syncingCount > 0 && (
        <div
          aria-live="polite"
          className="mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-muted"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink" />
          <span>
            <span className="font-medium text-ink">
              {syncingCount} file{syncingCount === 1 ? '' : 's'}
            </span>{' '}
            archiving to Drive. This list refreshes itself — you can keep working. If no Drive link
            arrives within {ACCOUNTING_ARCHIVE_GRACE_MINUTES} minutes, the upload is rolled back.
          </span>
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          {summary.map((item) => (
            <div key={item.label} className="px-4 py-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {item.label}
              </div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums tracking-tight ${item.tone || 'text-ink'}`}
              >
                {loading && rows.length === 0 ? '—' : item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-panel lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Cashflow</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Last {trend.length || 6} months in {dominantCurrency}
              </p>
            </div>
            <ChartLegend
              items={[
                { label: 'Income', color: 'var(--success)' },
                { label: 'Expenses', color: 'var(--danger)' },
                { label: 'Net', color: 'var(--ink)', shape: 'line' },
              ]}
            />
          </div>

          {loading && rows.length === 0 ? (
            <Skeleton className="h-[13.5rem] w-full" />
          ) : trend.length === 0 ? (
            <ChartEmpty message="No monthly history yet. Upload a transaction and the income, expense, and net lines start filling in." />
          ) : (
            <CashflowTrendChart data={trend} currency={dominantCurrency} />
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-panel lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Account split</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Income positive, expenses negative · net of {monthLabel(monthFilter)} in{' '}
              {dominantCurrency}
            </p>
          </div>

          {loading && rows.length === 0 ? (
            <Skeleton className="h-[13.5rem] w-full" />
          ) : byAccount.length === 0 ? (
            <ChartEmpty
              message={`Nothing filed against an account in ${monthLabel(monthFilter)}.`}
            />
          ) : (
            <AccountShareChart data={byAccount} currency={dominantCurrency} />
          )}
        </section>
      </div>

      {byCategory.length > 0 && (
        <section className="mb-6 rounded-lg border border-border bg-surface p-5 shadow-panel">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Folder volume</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Where {monthLabel(monthFilter)} money sits, largest first
            </p>
          </div>
          <CategoryBreakdownChart data={byCategory} currency={dominantCurrency} />
        </section>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search account, vendor, reference, file…"
              className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
          </div>
          <div className="lg:w-48">
            <CustomDropdown
              id="accounting-month"
              name="month"
              options={periodOptions()}
              value={monthFilter}
              onChange={(value) => {
                setMonthFilter(value);
                setPage(1);
              }}
              onBlur={() => {}}
            />
          </div>
          <div className="lg:w-56">
            <CustomDropdown
              id="accounting-account"
              name="account"
              options={[
                { label: 'All accounts', value: 'all' },
                ...accountOptions.map((account) => ({ label: account, value: account })),
              ]}
              value={accountFilter}
              onChange={(value) => {
                setAccountFilter(value);
                setPage(1);
              }}
              onBlur={() => {}}
            />
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <TableSkeleton columns={7} rows={6} actions={false} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Upload className="h-5 w-5" />}
            title={`Nothing filed for ${monthLabel(monthFilter)}`}
            description="Upload a bank statement, receipt, or invoice. It gets renamed, filed in the right Drive folder, and logged here automatically."
            actionLabel={canEdit ? 'Upload transaction' : undefined}
            onAction={canEdit ? openUpload : undefined}
            actionIcon={canEdit ? <Upload className="h-4 w-4" /> : undefined}
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No matching records"
            description="Try a different search term, month, or account."
            actionLabel="Clear search"
            onAction={() => setSearch('')}
            actionIcon={<X className="h-4 w-4" />}
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      <th className="px-5 py-3.5">Record</th>
                      <th className="px-5 py-3.5">Account</th>
                      <th className="px-5 py-3.5">Type</th>
                      <th className="px-5 py-3.5 text-right">Amount</th>
                      <th className="px-5 py-3.5">Client / Vendor</th>
                      <th className="px-5 py-3.5">Document</th>
                      <th className="px-5 py-3.5">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-ink">
                    {pagedRows.map((row) => (
                      <tr key={row.recordId} className="transition-colors hover:bg-canvas/70">
                        <td className="px-5 py-3.5">
                          <div className="font-medium tabular-nums">#{row.recordId}</div>
                          <div
                            className="max-w-[15rem] truncate text-xs text-muted"
                            title={row.fileName || ACCOUNTING_NO_FILE_LABEL}
                          >
                            {row.fileName || ACCOUNTING_NO_FILE_LABEL}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div>{row.account}</div>
                          <div className="text-xs text-muted">{row.category}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                              row.transactionType === 'Income'
                                ? 'border-border bg-success/10 text-success'
                                : row.transactionType === 'Expense'
                                  ? 'border-danger-border bg-danger-bg text-danger'
                                  : 'border-border bg-canvas text-ink'
                            }`}
                          >
                            {row.transactionType}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums">
                          {formatMoney(row.amount, row.currency)}
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          <div className="max-w-[12rem] truncate">{row.clientVendor || '—'}</div>
                          {row.reference ? (
                            <div className="max-w-[12rem] truncate text-xs">
                              Ref {row.reference}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5">
                          {!row.fileName ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted"
                              title="This transaction was filed without a document."
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              {ACCOUNTING_NO_FILE_LABEL}
                            </span>
                          ) : row.pendingDrive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Archiving…
                            </span>
                          ) : row.driveMissing ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted"
                              title="No Drive link was recorded for this file. The archival ran before rollback existed, or the link write-back failed — re-run the n8n workflow to attach it."
                            >
                              <LinkOff className="h-3.5 w-3.5 shrink-0" />
                              No Drive link
                            </span>
                          ) : (
                            <a
                              href={row.driveLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded text-xs font-semibold text-ink underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                            >
                              Open in Drive
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          <div>{displayDate(row.uploadDate)}</div>
                          <div className="max-w-[12rem] truncate text-xs">
                            {row.uploadedBy || '—'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-36">
                  <CustomDropdown
                    id="accounting-page-size"
                    name="pageSize"
                    options={PAGE_SIZE_OPTIONS}
                    value={String(pageSize)}
                    onChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                    onBlur={() => {}}
                  />
                </div>
                <span className="text-xs text-muted">
                  {filteredRows.length} of {rows.length} shown
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm tabular-nums text-muted">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {uploadOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accounting-upload-title"
            onClick={() => !saving && setUploadOpen(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="accounting-upload-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Upload transaction
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Filed to {ACCOUNTING_COMPANY_ROOT} / {form.period.slice(0, 4)} /{' '}
                    {monthLabel(form.period)} / {form.account} / {form.category}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={saving}
                  onClick={() => setUploadOpen(false)}
                  className="rounded-md p-1 text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted">
                    Month <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <CustomDropdown
                        id="upload-period"
                        name="period"
                        options={periodOptions()}
                        value={form.period}
                        onChange={(value) => setForm((prev) => ({ ...prev, period: value }))}
                        onBlur={() => {}}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Account <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <CustomDropdown
                        id="upload-account"
                        name="account"
                        options={uploadAccountOptions}
                        value={form.account}
                        onChange={(value) => setForm((prev) => ({ ...prev, account: value }))}
                        onBlur={() => {}}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Folder <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <CustomDropdown
                        id="upload-category"
                        name="category"
                        options={ACCOUNTING_CATEGORIES.map((category) => ({
                          label: category,
                          value: category,
                        }))}
                        value={form.category}
                        onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                        onBlur={() => {}}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Transaction type <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <CustomDropdown
                        id="upload-type"
                        name="transactionType"
                        options={ACCOUNTING_TRANSACTION_TYPES.map((type) => ({
                          label: type,
                          value: type,
                        }))}
                        value={form.transactionType}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, transactionType: value }))
                        }
                        onBlur={() => {}}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Amount <span className="text-danger">*</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, amount: event.target.value }))
                      }
                      placeholder="0.00"
                      aria-invalid={form.amount.trim() !== '' && !amountValid}
                      className={`${inputClassName} tabular-nums ${
                        form.amount.trim() !== '' && !amountValid
                          ? 'border-danger-border focus:border-danger'
                          : ''
                      }`}
                    />
                    {form.amount.trim() !== '' && !amountValid && (
                      <span className="mt-1 block text-[11px] font-normal text-danger">
                        Enter a number of zero or more.
                      </span>
                    )}
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Currency
                    <div className="mt-1.5">
                      <CustomDropdown
                        id="upload-currency"
                        name="currency"
                        options={ACCOUNTING_CURRENCIES.map((currency) => ({
                          label: currency,
                          value: currency,
                        }))}
                        value={form.currency}
                        onChange={(value) => setForm((prev) => ({ ...prev, currency: value }))}
                        onBlur={() => {}}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Client / Vendor
                    <input
                      value={form.clientVendor}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, clientVendor: event.target.value }))
                      }
                      placeholder="Acme Ltd"
                      className={inputClassName}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Invoice number
                    <input
                      value={form.reference}
                      readOnly
                      aria-readonly="true"
                      title="Auto-generated invoice number"
                      className={`${inputClassName} cursor-not-allowed bg-canvas text-muted dark:bg-canvas/80`}
                    />
                    <span className="mt-1 block text-[11px] font-normal text-muted">
                      Generated automatically
                    </span>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Source
                    <input
                      value={form.source}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, source: event.target.value }))
                      }
                      placeholder="HBL ••4821"
                      className={inputClassName}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted">
                    Destination
                    <input
                      value={form.destination}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, destination: event.target.value }))
                      }
                      placeholder="Meezan ••7130"
                      className={inputClassName}
                    />
                  </label>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="accounting-file"
                      className="block text-xs font-medium text-muted"
                    >
                      Document{' '}
                      <span className="font-normal text-muted/80">(optional)</span>
                    </label>
                    <input
                      id="accounting-file"
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      className="mt-1.5 w-full cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    />
                    <p className="mt-1.5 text-[11px] text-muted">
                      Optional. PDF, PNG, JPEG, CSV, Excel, or ZIP · up to {MAX_FILE_MB} MB
                    </p>

                    {file && !fileValid && (
                      <p className="mt-2 text-[11px] text-danger">
                        {!isAllowedAccountingFileName(file.name)
                          ? 'That file type is not supported.'
                          : `File is too large (${formatBytes(file.size)}). Max ${MAX_FILE_MB} MB.`}
                      </p>
                    )}

                    {file && fileValid && (
                      <div className="mt-2.5 rounded-lg border border-border bg-canvas px-3 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-ink">
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
                          <span className="truncate" title={file.name}>
                            {file.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {formatBytes(file.size)}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[11px] text-muted">
                          Saved as{' '}
                          <span className="break-all font-medium text-ink">
                            {driveFileNamePreview}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="text-xs font-medium text-muted sm:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      placeholder="Anything the finance team should know about this document"
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <p className="hidden text-[11px] text-muted sm:block">
                  {file
                    ? 'Drive archival runs in the background.'
                    : 'A document is optional. You can save this transaction without a file.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setUploadOpen(false)}
                    className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => void submitUpload()}
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {saving ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
