'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Calculator,
  FileBarChart2,
  LayoutDashboard,
  Search,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  AppRole,
  canAccess,
  getNavItemsForRole,
  getTrustedRole,
  roleDisplayName,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { Skeleton } from '@/components/ui/Skeleton';
import { CashflowTrendChart, ChartLegend } from '@/components/accounting/AccountingCharts';
import {
  ChartPanel,
  CountBarChart,
  CountDonutChart,
} from '@/components/dashboard/DashboardCharts';
import { compactNumber } from '@/components/charts/chart-kit';
import {
  hasAnyOverviewSection,
  overviewSectionsForRole,
  type DashboardOverview,
} from '@/types/dashboard';

type SessionUser = {
  name: string;
  email: string;
  role: AppRole;
  roleLabel: string;
};

type Stat = { label: string; value: string; tone?: string };

/** Static strings so Tailwind keeps these column counts in the build. */
const STAT_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

function token() {
  return localStorage.getItem('token');
}

function compactMoney(value: number, currency: string) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${currency} ${compactNumber(Math.abs(value))}`;
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authUser = session?.user;
        if (!authUser || !session.access_token) return;

        localStorage.setItem('token', session.access_token);
        let role = getTrustedRole(authUser);
        let roleLabel = roleDisplayName(role);

        try {
          const synced = await syncSessionCookies(session.access_token);
          role = synced.role;
          roleLabel = synced.roleLabel;
        } catch {
          /* keep JWT role fallback */
        }

        const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'there';

        setUser({
          name,
          email: authUser.email || '',
          role,
          roleLabel,
        });

        if (!hasAnyOverviewSection(overviewSectionsForRole(role))) return;

        setOverviewLoading(true);
        try {
          const response = await fetch('/api/dashboard-overview', {
            headers: { Authorization: `Bearer ${token()}` },
            cache: 'no-store',
          });
          const result = await response.json();
          if (response.ok && result.success) {
            setOverview(result.data as DashboardOverview);
          }
        } catch {
          /* overview charts are optional — quick links still render */
        } finally {
          setOverviewLoading(false);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const firstName = user?.name?.split(' ')[0] || 'there';
  const quickLinks = user
    ? getNavItemsForRole(user.role)
        .filter((item) => item.href !== '/dashboard' && item.href !== '/dashboard/settings')
        .slice(0, 6)
    : [];

  const roleSections = user ? overviewSectionsForRole(user.role) : null;
  const sections = overview?.sections ?? roleSections;
  const headcount = overview?.headcount;
  const finance = overview?.finance;
  const currency = finance?.currency || 'PKR';
  const showOverview = Boolean(roleSections && hasAnyOverviewSection(roleSections));

  const stats: Stat[] = [];
  if (roleSections?.headcount && (headcount || overviewLoading)) {
    stats.push(
      {
        label: 'Employees',
        value: headcount ? headcount.total.toLocaleString() : '—',
      },
      {
        label: 'EMS Active',
        value: headcount ? headcount.active.toLocaleString() : '—',
        tone: 'text-success',
      },
      {
        label: 'Departments',
        value: headcount ? headcount.departmentCount.toLocaleString() : '—',
      }
    );
  }
  if (roleSections?.finance && (finance || overviewLoading)) {
    stats.push({
      label: 'Net cashflow',
      value: finance ? compactMoney(finance.netCashflow, currency) : '—',
      tone: finance && finance.netCashflow < 0 ? 'text-danger' : 'text-success',
    });
    // Finance-only roles have room for the fuller money strip.
    if (!roleSections.headcount) {
      stats.push(
        {
          label: 'Income',
          value: finance ? compactMoney(finance.income, currency) : '—',
          tone: 'text-success',
        },
        {
          label: 'Expenses',
          value: finance ? compactMoney(finance.expenses, currency) : '—',
          tone: 'text-danger',
        },
        {
          label: 'Transactions',
          value: finance ? finance.transactionCount.toLocaleString() : '—',
        }
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <header className="mb-8 border-b border-border pb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          {user ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{subtitleForUser(user)}</p>
        {user && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 font-medium text-ink">
              {user.roleLabel}
            </span>
            <span className="text-muted/80">{user.email}</span>
            {overview && <span className="text-muted/80">· {overview.monthLabel}</span>}
          </div>
        )}
      </header>

      {showOverview && (
        <>
          {stats.length > 0 && (
          <section className="mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
            <div
              className={`grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:divide-y-0 ${
                STAT_COLUMNS[stats.length] || 'lg:grid-cols-6'
              }`}
            >
              {stats.map((item) => (
                <div key={item.label} className="px-4 py-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {item.label}
                  </div>
                  <div
                    className={`mt-1 text-lg font-semibold tabular-nums tracking-tight ${
                      item.tone || 'text-ink'
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {sections?.headcount && (
            <>
              <div className="mb-4 grid gap-4 lg:grid-cols-5">
                <ChartPanel
                  title="Employee category"
                  subtitle="Share of the roster by employment type"
                  className="lg:col-span-2"
                  loading={overviewLoading}
                  isEmpty={!headcount || headcount.byEmployeeType.length === 0}
                  emptyMessage="No employees on the roster yet. Register someone and the category split appears here."
                >
                  {headcount && (
                    <CountDonutChart
                      data={headcount.byEmployeeType}
                      centerLabel="People"
                      unit="person"
                      unitPlural="people"
                    />
                  )}
                </ChartPanel>

                <ChartPanel
                  title="Department split"
                  subtitle="Headcount per department, largest first"
                  className="lg:col-span-3"
                  loading={overviewLoading}
                  isEmpty={!headcount || headcount.byDepartment.length === 0}
                  emptyMessage="No departments recorded yet."
                >
                  {headcount && (
                    <CountBarChart
                      data={headcount.byDepartment}
                      unit="employee"
                      maxBars={7}
                    />
                  )}
                </ChartPanel>
              </div>
            </>
          )}

          {sections?.finance && (
            <div className="mb-4">
              <ChartPanel
                title="Cashflow"
                subtitle={`Last ${finance?.trend.length || 6} months in ${currency}`}
                legend={
                  <ChartLegend
                    items={[
                      { label: 'Income', color: 'var(--success)' },
                      { label: 'Expenses', color: 'var(--danger)' },
                      { label: 'Net', color: 'var(--ink)', shape: 'line' },
                    ]}
                  />
                }
                loading={overviewLoading}
                isEmpty={!finance || finance.trend.length === 0}
                emptyMessage="No monthly history yet. Upload a transaction and the income, expense, and net lines start filling in."
              >
                {finance && <CashflowTrendChart data={finance.trend} currency={currency} />}
              </ChartPanel>
            </div>
          )}
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Jump back in
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.length === 0 ? (
            <QuickLink
              href="/dashboard/settings"
              title="Settings"
              description="Account preferences and workspace options."
              icon={<LayoutDashboard className="h-4 w-4" />}
            />
          ) : (
            quickLinks.map((item, index) => (
              <QuickLink
                key={item.href}
                href={item.href}
                title={item.label}
                description={descriptionForResource(item.resource)}
                icon={iconForHref(item.href)}
                primary={Boolean(user && index === 0 && canAccess(user.role, 'employees'))}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function subtitleForUser(user: SessionUser | null) {
  if (!user) return 'Your Arachnix workspace.';
  switch (user.role) {
    case 'super_admin':
      return 'Full access across HR, payroll documents, leave, and accounting.';
    case 'hr_manager':
      return 'Manage employees, leave, salary slips, and generated documents.';
    case 'finance_manager':
      return 'Accounting uploads, records, and finance dashboards.';
    case 'director':
      return 'Read-only financial overview, payroll totals, and headcount.';
    default:
      return 'Your Arachnix workspace for account settings.';
  }
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-label="Loading dashboard">
      <header className="mb-8 space-y-3 border-b border-border pb-8">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      </header>

      <Skeleton className="mb-4 h-[4.75rem] w-full" />

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[20rem] lg:col-span-2" />
        <Skeleton className="h-[20rem] lg:col-span-3" />
      </div>
      <Skeleton className="mb-4 h-[20rem] w-full" />

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex flex-col rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="mt-4 h-4 w-28" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-4/5" />
          </div>
        ))}
      </section>
    </div>
  );
}

function descriptionForResource(resource: string): string {
  switch (resource) {
    case 'employees':
      return 'View roster, register accounts, and update profiles.';
    case 'leave_requests':
      return 'Leave request intake and approvals.';
    case 'leave_balances':
      return 'Quotas and usage by employee.';
    case 'holiday_calendar':
      return 'Company holidays for leave calculations.';
    case 'salary_slip_runs':
      return 'Batch salary slip processing runs.';
    case 'salary_slip_run_details':
      return 'Per-employee slip outcomes.';
    case 'generated_documents':
      return 'Contracts, offer letters, and Drive links.';
    case 'accounting_records':
      return 'Accounting uploads and transaction records.';
    case 'search':
      return 'Global search across people, vendors, amounts, and references.';
    case 'reports':
      return 'Payroll, leave, expense, income, and cashflow exports.';
    case 'audit_log':
      return 'Who changed which records, and when.';
    default:
      return 'Open this workspace module.';
  }
}

function iconForHref(href: string) {
  if (href.includes('employees')) return <Users className="h-4 w-4" />;
  if (href.includes('salary') || href.includes('payroll')) return <Banknote className="h-4 w-4" />;
  if (href.includes('accounting')) return <Calculator className="h-4 w-4" />;
  if (href.includes('search')) return <Search className="h-4 w-4" />;
  if (href.includes('reports')) return <FileBarChart2 className="h-4 w-4" />;
  return <LayoutDashboard className="h-4 w-4" />;
}

function QuickLink({
  href,
  title,
  description,
  icon,
  primary = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-lg border p-5 transition-colors ${
        primary
          ? 'border-ink bg-ink text-accent-fg hover:bg-accent-hover'
          : 'border-border bg-surface text-ink hover:bg-canvas'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${
            primary ? 'border-white/20 bg-white/10' : 'border-border bg-canvas'
          }`}
        >
          {icon}
        </span>
        <ArrowRight
          className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${
            primary ? 'text-accent-fg/70' : 'text-muted'
          }`}
        />
      </div>
      <h2 className="mt-4 text-sm font-semibold tracking-tight">{title}</h2>
      <p
        className={`mt-1.5 text-xs leading-relaxed ${primary ? 'text-accent-fg/75' : 'text-muted'}`}
      >
        {description}
      </p>
    </Link>
  );
}
