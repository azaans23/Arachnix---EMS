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
  ROLES,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { Skeleton } from '@/components/ui/Skeleton';
import type { DirectorDashboardMetrics } from '@/types/search-reports';
import {
  AccountShareChart,
  CashflowTrendChart,
  ChartEmpty,
  ChartLegend,
} from '@/components/accounting/AccountingCharts';

type SessionUser = {
  name: string;
  email: string;
  role: AppRole;
  roleLabel: string;
};

function token() {
  return localStorage.getItem('token');
}

function formatMoney(amount: number) {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `PKR ${Math.round(amount).toLocaleString()}`;
  }
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [directorMetrics, setDirectorMetrics] = useState<DirectorDashboardMetrics | null>(null);
  const [directorLoading, setDirectorLoading] = useState(false);

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

        const name =
          authUser.user_metadata?.name ||
          authUser.email?.split('@')[0] ||
          'there';

        setUser({
          name,
          email: authUser.email || '',
          role,
          roleLabel,
        });

        if (
          role === ROLES.DIRECTOR ||
          role === ROLES.SUPER_ADMIN ||
          role === ROLES.FINANCE_MANAGER
        ) {
          setDirectorLoading(true);
          try {
            const response = await fetch('/api/director-dashboard', {
              headers: { Authorization: `Bearer ${token()}` },
              cache: 'no-store',
            });
            const result = await response.json();
            if (response.ok && result.success) {
              setDirectorMetrics(result.data);
            }
          } catch {
            /* overview cards are optional */
          } finally {
            setDirectorLoading(false);
          }
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
  const isDirector = user?.role === ROLES.DIRECTOR;
  const showFinanceOverview =
    user &&
    (user.role === ROLES.DIRECTOR ||
      user.role === ROLES.SUPER_ADMIN ||
      user.role === ROLES.FINANCE_MANAGER);

  const quickLinks = user
    ? getNavItemsForRole(user.role)
        .filter((item) => item.href !== '/dashboard' && item.href !== '/dashboard/settings')
        .slice(0, 6)
    : [];

  const subtitle = (() => {
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
  })();

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          {user ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{subtitle}</p>
        {user && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 font-medium text-ink">
              {user.roleLabel}
            </span>
            <span className="text-muted/80">{user.email}</span>
          </div>
        )}
      </header>

      {showFinanceOverview && (
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                {isDirector ? 'Director overview' : 'Financial overview'}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {directorMetrics
                  ? directorMetrics.monthLabel
                  : 'Monthly expenses, payroll, cashflow, and headcount'}
              </p>
            </div>
            {canAccess(user!.role, 'reports') && (
              <Link
                href="/dashboard/reports"
                className="text-xs font-semibold text-ink underline-offset-2 hover:underline"
              >
                Open reports
              </Link>
            )}
          </div>

          {directorLoading && !directorMetrics ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : directorMetrics ? (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
                  {[
                    { label: 'Income', value: formatMoney(directorMetrics.income) },
                    { label: 'Expenses', value: formatMoney(directorMetrics.expenses) },
                    { label: 'Payroll', value: formatMoney(directorMetrics.payroll) },
                    {
                      label: 'Net cashflow',
                      value: formatMoney(directorMetrics.netCashflow),
                      tone:
                        directorMetrics.netCashflow > 0
                          ? 'text-success'
                          : directorMetrics.netCashflow < 0
                            ? 'text-danger'
                            : 'text-ink',
                    },
                    {
                      label: 'Transactions',
                      value: String(directorMetrics.transactionCount),
                    },
                    {
                      label: 'Employees',
                      value: String(directorMetrics.employeeCount),
                    },
                    {
                      label: 'Active staff',
                      value: String(directorMetrics.activeEmployeeCount),
                    },
                    {
                      label: 'Departments',
                      value: String(directorMetrics.departmentCount),
                    },
                  ].map((item) => (
                    <div key={item.label} className="px-4 py-3.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {item.label}
                      </div>
                      <div
                        className={`mt-1 text-lg font-semibold tabular-nums tracking-tight ${item.tone || 'text-ink'}`}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-5">
                <div className="rounded-lg border border-border bg-surface p-5 shadow-panel lg:col-span-3">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">Cashflow</h3>
                    <ChartLegend
                      items={[
                        { label: 'Income', color: 'var(--success)' },
                        { label: 'Expenses', color: 'var(--danger)' },
                        { label: 'Net', color: 'var(--ink)', shape: 'line' },
                      ]}
                    />
                  </div>
                  {directorMetrics.trend.length === 0 ? (
                    <ChartEmpty message="No monthly history yet." />
                  ) : (
                    <CashflowTrendChart data={directorMetrics.trend} currency="PKR" />
                  )}
                </div>
                <div className="rounded-lg border border-border bg-surface p-5 shadow-panel lg:col-span-2">
                  <h3 className="mb-4 text-sm font-semibold text-ink">Account split</h3>
                  {directorMetrics.byAccount.length === 0 ? (
                    <ChartEmpty message="No account activity this month." />
                  ) : (
                    <AccountShareChart data={directorMetrics.byAccount} currency="PKR" />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-label="Loading dashboard">
      <header className="mb-10 space-y-3 border-b border-border pb-8">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex flex-col rounded-lg border border-border bg-surface p-5"
          >
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
      <p className={`mt-1.5 text-xs leading-relaxed ${primary ? 'text-accent-fg/75' : 'text-muted'}`}>
        {description}
      </p>
    </Link>
  );
}
