'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import {
  type ReportDefinition,
  type ReportExportFormat,
  type ReportPayload,
  type ReportType,
} from '@/types/search-reports';

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

function yearOptions() {
  const year = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, index) => {
    const value = String(year - index);
    return { label: value, value };
  });
}

function monthToSalaryPeriod(month: string) {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const label = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${label}-${year}`;
}

export default function ReportsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<ReportDefinition[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [type, setType] = useState<ReportType | ''>('');
  const [month, setMonth] = useState(currentPeriod());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [account, setAccount] = useState('');
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) {
        setAllowed(false);
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
      const canView = canAccess(role, 'reports');
      setAllowed(canView);
      if (!canView) return;

      try {
        const response = await fetch('/api/reports', {
          headers: { Authorization: `Bearer ${token()}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load reports.');
        }
        const reports = (result.reports || []) as ReportDefinition[];
        setCatalog(reports);
        setAccounts(result.accounts || []);
        if (reports[0]) setType(reports[0].type);
        if (result.accounts?.[0]) setAccount(result.accounts[0]);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Failed to load reports.');
      }
    };
    void boot();
  }, []);

  const selected = useMemo(
    () => catalog.find((item) => item.type === type) || null,
    [catalog, type]
  );

  const needsMonth = [
    'expense',
    'income',
    'cashflow',
    'director_account',
    'monthly_summary',
    'payroll',
  ].includes(type);
  const needsYear = type === 'leave';
  const needsAccount = type === 'director_account';

  useEffect(() => {
    if (!allowed || !type) return;

    let cancelled = false;
    const loadReport = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ type });
        if (needsMonth) {
          params.set('month', month);
          if (type === 'payroll') params.set('period', monthToSalaryPeriod(month));
        }
        if (needsYear) params.set('year', year);
        if (needsAccount && account) params.set('account', account);

        const response = await fetch(`/api/reports?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to build report.');
        }
        if (!cancelled) setReport(result.data);
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to build report.');
          setReport(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [allowed, type, month, year, account, needsMonth, needsYear, needsAccount, reloadKey]);

  const download = async (format: ReportExportFormat) => {
    if (!type) return;
    setExporting(format);
    try {
      const params = new URLSearchParams({ type, format });
      if (needsMonth) {
        params.set('month', month);
        if (type === 'payroll') params.set('period', monthToSalaryPeriod(month));
      }
      if (needsYear) params.set('year', year);
      if (needsAccount && account) params.set('account', account);

      const response = await fetch(`/api/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Export failed.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const fileName = match?.[1] || `report.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()}.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
        </div>
        <TableSkeleton columns={6} rows={6} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Reports are available to Super Admin, HR Manager, Finance Manager, and Director."
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
            Reports
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Payroll, leave, employee, expense, income, cashflow, director account, and monthly
            summary — export as PDF, Excel, or CSV.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading || !type}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <section className="mb-6 grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-panel sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-muted">
          Report
          <div className="mt-1.5">
            <CustomDropdown
              id="report-type"
              name="type"
              options={catalog.map((item) => ({ label: item.label, value: item.type }))}
              value={type}
              onChange={(value) => setType(value as ReportType)}
              onBlur={() => {}}
            />
          </div>
        </label>

        {needsMonth && (
          <label className="text-xs font-medium text-muted">
            Month
            <div className="mt-1.5">
              <CustomDropdown
                id="report-month"
                name="month"
                options={periodOptions()}
                value={month}
                onChange={setMonth}
                onBlur={() => {}}
              />
            </div>
          </label>
        )}

        {needsYear && (
          <label className="text-xs font-medium text-muted">
            Year
            <div className="mt-1.5">
              <CustomDropdown
                id="report-year"
                name="year"
                options={yearOptions()}
                value={year}
                onChange={setYear}
                onBlur={() => {}}
              />
            </div>
          </label>
        )}

        {needsAccount && (
          <label className="text-xs font-medium text-muted">
            Account
            <div className="mt-1.5">
              <CustomDropdown
                id="report-account"
                name="account"
                options={accounts.map((item) => ({ label: item, value: item }))}
                value={account}
                onChange={setAccount}
                onBlur={() => {}}
              />
            </div>
          </label>
        )}
      </section>

      {selected && (
        <p className="mb-4 text-sm text-muted">{selected.description}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <ExportButton
          label="CSV"
          icon={<FileText className="h-4 w-4" />}
          busy={exporting === 'csv'}
          disabled={!report || Boolean(exporting)}
          onClick={() => void download('csv')}
        />
        <ExportButton
          label="Excel"
          icon={<FileSpreadsheet className="h-4 w-4" />}
          busy={exporting === 'xlsx'}
          disabled={!report || Boolean(exporting)}
          onClick={() => void download('xlsx')}
        />
        <ExportButton
          label="PDF"
          icon={<Download className="h-4 w-4" />}
          busy={exporting === 'pdf'}
          disabled={!report || Boolean(exporting)}
          onClick={() => void download('pdf')}
        />
      </div>

      {loading && !report ? (
        <TableSkeleton columns={6} rows={8} />
      ) : !report ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No report selected"
          description="Pick a report type above to generate a preview."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">{report.title}</h2>
              <p className="mt-0.5 text-xs text-muted">{report.subtitle}</p>
            </div>
            {report.summary && report.summary.length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                {report.summary.map((item) => (
                  <span key={item.label}>
                    <span className="text-ink">{item.label}:</span> {item.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          {report.rows.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No rows for this period"
              description="Try another month, year, or account."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {report.columns.map((column) => (
                        <th key={column.key} className="px-5 py-3.5">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-ink">
                    {report.rows.map((row, index) => (
                      <tr key={index} className="transition-colors hover:bg-canvas/70">
                        {report.columns.map((column) => (
                          <td key={column.key} className="px-5 py-3.5 tabular-nums">
                            {row[column.key] == null || row[column.key] === ''
                              ? '—'
                              : String(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExportButton({
  label,
  icon,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
