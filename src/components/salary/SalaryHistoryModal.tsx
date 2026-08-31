'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { SalaryHistoryRecord } from '@/types/salary-history';

type Props = {
  employeeId: string;
  employeeName?: string;
  token: string | null;
  onClose: () => void;
};

function formatCurrency(value: unknown) {
  const num = Number(value);
  if (value === undefined || value === null || String(value).trim() === '') return '—';
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(num);
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

function ChangeCell({ oldValue, newValue }: { oldValue: string; newValue: string }) {
  const same = Number(oldValue || 0) === Number(newValue || 0) && oldValue === newValue;
  if (!oldValue && !newValue) return <span className="text-muted">—</span>;
  if (same || !oldValue) {
    return <span className="font-medium">{formatCurrency(newValue || oldValue)}</span>;
  }
  return (
    <div>
      <div className="text-muted line-through">{formatCurrency(oldValue)}</div>
      <div className="font-medium text-ink">{formatCurrency(newValue)}</div>
    </div>
  );
}

export default function SalaryHistoryModal({ employeeId, employeeName, token, onClose }: Props) {
  const [rows, setRows] = useState<SalaryHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/salary-history?employeeId=${encodeURIComponent(employeeId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load salary history.');
        }
        if (!cancelled) {
          setRows(Array.isArray(result.data) ? result.data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load salary history.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeId, token]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="salary-history-title"
        className="flex max-h-[min(90vh,42rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2
              id="salary-history-title"
              className="text-lg font-semibold tracking-tight text-ink"
            >
              Salary history
            </h2>
            <p className="mt-1 text-sm text-muted">
              {employeeName || employeeId}
              {employeeName ? ` · ${employeeId}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <TableSkeleton columns={6} rows={5} />
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No salary changes yet"
              description="Raises and other compensation edits will appear here. Bank-only updates are not logged."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                    <th className="px-4 py-3">Changed</th>
                    <th className="px-4 py-3">By</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Base salary</th>
                    <th className="px-4 py-3">Allowance</th>
                    <th className="px-4 py-3">Tax</th>
                    <th className="px-4 py-3">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.historyId} className="align-top">
                      <td className="px-4 py-3 text-ink">{displayDate(row.changedAt)}</td>
                      <td className="px-4 py-3 text-muted">{row.changedBy || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-ink">
                          {row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChangeCell oldValue={row.oldBaseSalary} newValue={row.newBaseSalary} />
                      </td>
                      <td className="px-4 py-3">
                        <ChangeCell oldValue={row.oldAllowance} newValue={row.newAllowance} />
                      </td>
                      <td className="px-4 py-3">
                        <ChangeCell oldValue={row.oldTax} newValue={row.newTax} />
                      </td>
                      <td className="px-4 py-3">
                        <ChangeCell oldValue={row.oldNetSalary} newValue={row.newNetSalary} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Close
              </span>
            ) : (
              'Close'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
