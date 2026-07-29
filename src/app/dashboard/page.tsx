'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator, LayoutDashboard, Users } from 'lucide-react';
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

type SessionUser = {
  name: string;
  email: string;
  role: AppRole;
  roleLabel: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

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
        return 'Read-only financial overview and headcount.';
      default:
        return 'Your Arachnix workspace for account settings.';
    }
  })();

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
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
    <div className="mx-auto max-w-5xl" role="status" aria-label="Loading dashboard">
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
    case 'audit_log':
      return 'Who changed which records, and when.';
    default:
      return 'Open this workspace module.';
  }
}

function iconForHref(href: string) {
  if (href.includes('employees')) return <Users className="h-4 w-4" />;
  if (href.includes('accounting')) return <Calculator className="h-4 w-4" />;
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
      className={`group flex flex-col rounded-lg border p-5 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 ${
        primary
          ? 'border-ink bg-ink text-accent-fg shadow-panel'
          : 'border-border bg-surface text-ink hover:border-ink/25'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
            primary ? 'bg-white/10 text-accent-fg' : 'bg-canvas text-muted'
          }`}
        >
          {icon}
        </span>
        <ArrowRight
          className={`h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 ${
            primary ? 'text-accent-fg/70' : 'text-muted'
          }`}
        />
      </div>
      <h2 className="mt-4 text-sm font-semibold tracking-tight">{title}</h2>
      <p className={`mt-1.5 text-sm leading-relaxed ${primary ? 'text-accent-fg/65' : 'text-muted'}`}>
        {description}
      </p>
    </Link>
  );
}
