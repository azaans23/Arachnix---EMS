'use client';

import { useMemo, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import {
  AXIS_TICK,
  compactNumber,
  INK_RAMP,
  shortMonth,
  TOOLTIP_PROPS,
  TooltipCard,
  usePrefersReducedMotion,
} from '@/components/charts/chart-kit';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CountSlice } from '@/types/dashboard';

type SliceStyle = { color: string; opacity: number };

function inkRamp(_label: string, index: number): SliceStyle {
  return { color: 'var(--ink)', opacity: INK_RAMP[index] ?? 0.1 };
}

function monthAndYear(period: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

/** Card shell shared by every panel on the overview, including its loading and empty states. */
export function ChartPanel({
  title,
  subtitle,
  legend,
  loading,
  isEmpty,
  emptyMessage,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-5 shadow-panel ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
        </div>
        {legend}
      </div>

      {loading ? (
        <Skeleton className="h-[13.5rem] w-full" />
      ) : isEmpty ? (
        <div className="flex h-[13.5rem] items-center justify-center rounded-lg border border-dashed border-border px-6">
          <p className="max-w-[22rem] text-center text-xs leading-relaxed text-muted">
            {emptyMessage}
          </p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Donut plus a readable legend — the chart alone cannot label small slices, so
 * the list carries the exact counts and shares.
 */
export function CountDonutChart({
  data,
  centerLabel,
  unit = 'record',
  unitPlural,
  styleForLabel = inkRamp,
}: {
  data: CountSlice[];
  centerLabel: string;
  unit?: string;
  unitPlural?: string;
  styleForLabel?: (label: string, index: number) => SliceStyle;
}) {
  const reduced = usePrefersReducedMotion();

  const slices = useMemo(() => {
    const sorted = [...data].filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= INK_RAMP.length) return sorted;
    const head = sorted.slice(0, INK_RAMP.length - 1);
    const tail = sorted.slice(INK_RAMP.length - 1);
    return [
      ...head,
      { label: `${tail.length} other`, value: tail.reduce((sum, item) => sum + item.value, 0) },
    ];
  }, [data]);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const slice = props.payload[0]?.payload as CountSlice | undefined;
    if (!slice) return null;
    return (
      <TooltipCard
        title={slice.label}
        rows={[
          { label: 'Count', value: plural(slice.value, unit, unitPlural) },
          { label: 'Share', value: `${share(slice.value)}%` },
        ]}
      />
    );
  };

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[10.5rem] w-[10.5rem] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              animationDuration={reduced ? 0 : 240}
            >
              {slices.map((slice, index) => {
                const style = styleForLabel(slice.label, index);
                return (
                  <Cell key={slice.label} fill={style.color} fillOpacity={style.opacity} />
                );
              })}
            </Pie>
            <Tooltip
              {...TOOLTIP_PROPS}
              content={renderTooltip}
              animationDuration={reduced ? 0 : 120}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            {centerLabel}
          </span>
          <span className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-ink">
            {total.toLocaleString()}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2 self-stretch">
        {slices.map((slice, index) => {
          const style = styleForLabel(slice.label, index);
          return (
            <li key={slice.label} className="flex items-baseline gap-2.5 text-xs">
              <span
                aria-hidden
                className="mt-1 h-2 w-2 shrink-0 rounded-sm"
                style={{ background: style.color, opacity: style.opacity }}
              />
              <span className="min-w-0 flex-1 truncate text-ink" title={slice.label}>
                {slice.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {slice.value.toLocaleString()} · {share(slice.value)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars — long department and leave-type labels read better sideways. */
export function CountBarChart({
  data,
  unit = 'record',
  unitPlural,
  maxBars = 8,
}: {
  data: CountSlice[];
  unit?: string;
  unitPlural?: string;
  maxBars?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const bars = useMemo(
    () =>
      [...data]
        .filter((slice) => slice.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, maxBars),
    [data, maxBars]
  );
  const height = Math.max(140, bars.length * 34 + 16);

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const bar = props.payload[0]?.payload as CountSlice | undefined;
    if (!bar) return null;
    return <TooltipCard title={bar.label} rows={[{ label: 'Total', value: plural(bar.value, unit, unitPlural) }]} />;
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={bars}
          layout="vertical"
          margin={{ top: 4, right: 44, bottom: 4, left: 0 }}
          barCategoryGap={10}
          accessibilityLayer
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={104}
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            content={renderTooltip}
            cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
            animationDuration={reduced ? 0 : 120}
          />
          <Bar
            dataKey="value"
            fill="var(--ink)"
            fillOpacity={0.7}
            radius={[0, 3, 3, 0]}
            maxBarSize={16}
            animationDuration={reduced ? 0 : 240}
          >
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              fill="var(--muted)"
              fontSize={11}
              formatter={(value: unknown) => Number(value).toLocaleString()}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rolling roster size as an area, with each month's new joiners as bars behind it. */
export function HeadcountTrendChart({
  data,
}: {
  data: Array<{ month: string; joined: number; headcount: number }>;
}) {
  const reduced = usePrefersReducedMotion();
  const points = useMemo(
    () => data.map((point) => ({ ...point, label: shortMonth(point.month) })),
    [data]
  );

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const point = props.payload[0]?.payload as (typeof points)[number] | undefined;
    if (!point) return null;
    return (
      <TooltipCard
        title={monthAndYear(point.month)}
        rows={[
          { label: 'Headcount', value: point.headcount.toLocaleString(), color: 'var(--ink)' },
          {
            label: 'New joiners',
            value: point.joined.toLocaleString(),
            color: 'var(--ink)',
            opacity: 0.35,
          },
        ]}
      />
    );
  };

  return (
    <div className="h-[13.5rem] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="headcount"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={compactNumber}
          />
          <YAxis yAxisId="joined" orientation="right" hide allowDecimals={false} />
          <Tooltip
            {...TOOLTIP_PROPS}
            content={renderTooltip}
            cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
            animationDuration={reduced ? 0 : 120}
          />
          <Bar
            yAxisId="joined"
            dataKey="joined"
            name="New joiners"
            fill="var(--ink)"
            fillOpacity={0.28}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            animationDuration={reduced ? 0 : 240}
          />
          <Area
            yAxisId="headcount"
            type="monotone"
            dataKey="headcount"
            name="Headcount"
            stroke="var(--ink)"
            strokeWidth={1.5}
            fill="var(--ink)"
            fillOpacity={0.08}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={reduced ? 0 : 240}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
