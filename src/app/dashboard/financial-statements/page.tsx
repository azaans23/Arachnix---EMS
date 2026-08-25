'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { MonthlyStatements } from '@/types/financial-statements';

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

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

type StatementKind = 'income' | 'balance' | 'cashflow';
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export default function FinancialStatementsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [month, setMonth] = useState(currentPeriod());
  const [statements, setStatements] = useState<MonthlyStatements | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/financial-statements?month=${encodeURIComponent(month)}`,
        {
          headers: { Authorization: `Bearer ${token()}` },
          cache: 'no-store',
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load statements.');
      }
      setStatements(result.data as MonthlyStatements);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load statements.');
    } finally {
      setLoading(false);
    }
  }, [month]);

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
        /* JWT fallback */
      }
      const canView = canAccess(role, 'financial_statements', flags);
      setCanGenerate(canWrite(role, 'financial_statements', flags));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/financial-statements', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate statements.');
      }
      setStatements(result.data as MonthlyStatements);
      toast.success('Statements generated.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate statements.');
    } finally {
      setGenerating(false);
    }
  };

  const download = async (statement: StatementKind, format: ExportFormat) => {
    const key = `${statement}-${format}`;
    setExporting(key);
    try {
      const response = await fetch(
        `/api/financial-statements?month=${encodeURIComponent(month)}&format=${format}&statement=${statement}`,
        {
          headers: { Authorization: `Bearer ${token()}` },
          cache: 'no-store',
        }
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      link.href = url;
      link.download = match?.[1] || `${statement}-${month}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const monthLabel = useMemo(
    () => periodOptions().find((option) => option.value === month)?.label || month,
    [month]
  );
  const unbalanced = statements?.balanceSheet && !statements.balanceSheet.balanced;
  const warnings = statements?.income?.warnings || [];

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <Skeleton className="mb-6 h-20 w-full" />
        <TableSkeleton columns={2} rows={6} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Financial statements are available to Super Admin, Admin, Finance Manager, and directors."
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
            Financial Statements
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Income statement, balance sheet, and cash flow for {monthLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-48">
            <CustomDropdown
              id="statements-month"
              name="month"
              options={periodOptions()}
              value={month}
              onChange={setMonth}
              onBlur={() => {}}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canGenerate ? (
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating || loading}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-canvas disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate
            </button>
          ) : null}
        </div>
      </div>

      {unbalanced ? (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-ink">
          This month is not balanced. Discrepancy:{' '}
          <span className="font-semibold tabular-nums">
            {formatMoney(statements?.balanceSheet?.discrepancy || 0)}
          </span>
          . Nothing was auto-adjusted.
        </div>
      ) : null}


      {loading ? (
        <TableSkeleton columns={2} rows={8} />
      ) : !statements?.income && !statements?.balanceSheet && !statements?.cashFlow ? (
        <EmptyState
          icon={<Download className="h-5 w-5" />}
          title={`No statements for ${monthLabel}`}
          description={
            canGenerate
              ? 'Generate this month after opening cash and equity are set on Monthly Balances.'
              : 'Statements appear here after finance generates them.'
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <StatementCard
            title="Income statement"
            kind="income"
            exporting={exporting}
            onExport={download}
            rows={[
              ['Revenue', statements.income?.revenue],
              ['Cost of services', statements.income?.costOfServices],
              ['Gross profit', statements.income?.grossProfit],
              ['Operating expense', statements.income?.operatingExpense],
              ['Net income', statements.income?.netIncome],
            ]}
          />
          <StatementCard
            title="Balance sheet"
            kind="balance"
            exporting={exporting}
            onExport={download}
            rows={[
              ['Cash', statements.balanceSheet?.cash],
              ['Other assets', statements.balanceSheet?.otherAssets],
              ['Total assets', statements.balanceSheet?.totalAssets],
              ['Liabilities', statements.balanceSheet?.liabilities],
              ['Equity', statements.balanceSheet?.equity],
              ['Liabilities + equity', statements.balanceSheet?.totalLiabilitiesAndEquity],
              ['Discrepancy', statements.balanceSheet?.discrepancy],
            ]}
          />
          <StatementCard
            title="Cash flow"
            kind="cashflow"
            exporting={exporting}
            onExport={download}
            rows={[
              ['Operations', statements.cashFlow?.cashFromOperations],
              ['Investing', statements.cashFlow?.cashFromInvesting],
              ['Financing', statements.cashFlow?.cashFromFinancing],
              ['Net change in cash', statements.cashFlow?.netChangeInCash],
            ]}
          />
        </div>
      )}
    </div>
  );
}

function StatementCard(props: {
  title: string;
  kind: StatementKind;
  rows: Array<[string, number | undefined]>;
  exporting: string | null;
  onExport: (kind: StatementKind, format: ExportFormat) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{props.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((format) => {
            const key = `${props.kind}-${format}`;
            return (
              <button
                key={format}
                type="button"
                disabled={Boolean(props.exporting)}
                onClick={() => props.onExport(props.kind, format)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-ink disabled:opacity-50"
              >
                {props.exporting === key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {format.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {props.rows.map(([label, amount]) => (
            <tr key={label}>
              <td className="px-4 py-2.5 text-muted">{label}</td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink">
                {formatMoney(amount || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
