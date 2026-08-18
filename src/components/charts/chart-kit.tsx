'use client';

import { useSyncExternalStore } from 'react';

export const AXIS_TICK = { fill: 'var(--muted)', fontSize: 11 } as const;

/** Ink ramp keeps the palette restrained while separating up to seven slices. */
export const INK_RAMP = [1, 0.82, 0.68, 0.56, 0.44, 0.32, 0.2];

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
] as const;

export function compactNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

export function money(amount: number, currency: string) {
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

export function shortMonth(period: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function longMonth(period: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

export type TooltipRow = { label: string; value: string; color?: string; opacity?: number };

/**
 * Shared across every chart:
 * - allowEscapeViewBox stops Recharts from clamping the card inside small plots
 *   (a donut is only ~168px wide, which pushed the tooltip over its centre).
 * - offset keeps the card clear of the cursor instead of sitting under it.
 */
export const TOOLTIP_PROPS = {
  offset: 14,
  allowEscapeViewBox: { x: true, y: true },
  wrapperStyle: { zIndex: 40, pointerEvents: 'none' as const, outline: 'none' },
} as const;

export function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div
      className="pointer-events-none min-w-[10rem] rounded-lg border px-3 py-2"
      // Inline so the card is always opaque, whatever the chart paints behind it.
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--elevation-panel)',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              {row.color && (
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: row.color, opacity: row.opacity ?? 1 }}
                />
              )}
              {row.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[13.5rem] items-center justify-center rounded-lg border border-dashed border-border px-6">
      <p className="max-w-[22rem] text-center text-xs leading-relaxed text-muted">{message}</p>
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string; shape?: 'square' | 'line' }>;
}) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.shape === 'line' ? 'h-0.5 w-3 rounded-full' : 'h-2 w-2 rounded-sm'}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
