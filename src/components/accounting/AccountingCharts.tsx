'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
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
  ChartEmpty,
  ChartLegend,
  compactNumber,
  INK_RAMP,
  longMonth,
  money,
  shortMonth,
  TOOLTIP_PROPS,
  TooltipCard,
  usePrefersReducedMotion,
} from '@/components/charts/chart-kit';

type TrendPoint = { month: string; income: number; expenses: number };
type AccountSlice = { account: string; amount: number; count: number };
type CategorySlice = { category: string; amount: number; count: number };

export { ChartEmpty, ChartLegend };

/** Six-month income vs expenses, with net cashflow tracked as a line. */
export function CashflowTrendChart({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const reduced = usePrefersReducedMotion();
  const points = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        label: shortMonth(point.month),
        net: point.income - point.expenses,
      })),
    [data]
  );

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const point = props.payload[0]?.payload as (typeof points)[number] | undefined;
    if (!point) return null;
    return (
      <TooltipCard
        title={longMonth(point.month)}
        rows={[
          { label: 'Income', value: money(point.income, currency), color: 'var(--success)' },
          { label: 'Expenses', value: money(point.expenses, currency), color: 'var(--danger)' },
          { label: 'Net', value: money(point.net, currency), color: 'var(--ink)' },
        ]}
      />
    );
  };

  return (
    <div className="h-[13.5rem] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 4, bottom: 0, left: -8 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickMargin={8}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={compactNumber}
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            content={renderTooltip}
            cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
            animationDuration={reduced ? 0 : 120}
          />
          <Bar
            dataKey="income"
            name="Income"
            fill="var(--success)"
            fillOpacity={0.9}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            animationDuration={reduced ? 0 : 240}
          />
          <Bar
            dataKey="expenses"
            name="Expenses"
            fill="var(--danger)"
            fillOpacity={0.85}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            animationDuration={reduced ? 0 : 240}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="var(--ink)"
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: 1.5 }}
            activeDot={{ r: 4, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }}
            animationDuration={reduced ? 0 : 240}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share of the month's volume per account, as a donut plus a readable legend. */
export function AccountShareChart({ data, currency }: { data: AccountSlice[]; currency: string }) {
  const reduced = usePrefersReducedMotion();

  const slices = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.amount - a.amount);
    if (sorted.length <= INK_RAMP.length) return sorted;
    const head = sorted.slice(0, INK_RAMP.length - 1);
    const tail = sorted.slice(INK_RAMP.length - 1);
    return [
      ...head,
      {
        account: `${tail.length} other accounts`,
        amount: tail.reduce((sum, item) => sum + item.amount, 0),
        count: tail.reduce((sum, item) => sum + item.count, 0),
      },
    ];
  }, [data]);

  const total = slices.reduce((sum, item) => sum + item.amount, 0);
  const share = (amount: number) => (total > 0 ? Math.round((amount / total) * 100) : 0);

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const slice = props.payload[0]?.payload as AccountSlice | undefined;
    if (!slice) return null;
    return (
      <TooltipCard
        title={slice.account}
        rows={[
          { label: 'Volume', value: money(slice.amount, currency) },
          { label: 'Share', value: `${share(slice.amount)}%` },
          { label: 'Transactions', value: String(slice.count) },
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
              dataKey="amount"
              nameKey="account"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              animationDuration={reduced ? 0 : 240}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.account} fill="var(--ink)" fillOpacity={INK_RAMP[index] ?? 0.1} />
              ))}
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
            Volume
          </span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight text-ink">
            {compactNumber(total)}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2 self-stretch">
        {slices.map((slice, index) => (
          <li key={slice.account} className="flex items-baseline gap-2.5 text-xs">
            <span
              aria-hidden
              className="mt-1 h-2 w-2 shrink-0 rounded-sm"
              style={{ background: 'var(--ink)', opacity: INK_RAMP[index] ?? 0.1 }}
            />
            <span className="min-w-0 flex-1 truncate text-ink" title={slice.account}>
              {slice.account}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {share(slice.amount)}% · {money(slice.amount, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Category volume ranked highest first — long labels read better horizontally. */
export function CategoryBreakdownChart({
  data,
  currency,
}: {
  data: CategorySlice[];
  currency: string;
}) {
  const reduced = usePrefersReducedMotion();
  const bars = useMemo(() => [...data].sort((a, b) => b.amount - a.amount), [data]);
  const height = Math.max(140, bars.length * 34 + 16);

  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const bar = props.payload[0]?.payload as CategorySlice | undefined;
    if (!bar) return null;
    return (
      <TooltipCard
        title={bar.category}
        rows={[
          { label: 'Volume', value: money(bar.amount, currency) },
          { label: 'Transactions', value: String(bar.count) },
        ]}
      />
    );
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={bars}
          layout="vertical"
          margin={{ top: 4, right: 68, bottom: 4, left: 0 }}
          barCategoryGap={10}
          accessibilityLayer
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="category"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={92}
          />
          <Tooltip
            {...TOOLTIP_PROPS}
            content={renderTooltip}
            cursor={{ fill: 'var(--ink)', fillOpacity: 0.04 }}
            animationDuration={reduced ? 0 : 120}
          />
          <Bar
            dataKey="amount"
            fill="var(--ink)"
            fillOpacity={0.7}
            radius={[0, 3, 3, 0]}
            maxBarSize={16}
            animationDuration={reduced ? 0 : 240}
          >
            <LabelList
              dataKey="amount"
              position="right"
              offset={8}
              fill="var(--muted)"
              fontSize={11}
              formatter={(value: unknown) => compactNumber(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
