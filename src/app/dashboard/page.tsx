'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Database, FileText, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type SessionUser = {
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
};

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      const role =
        authUser.app_metadata?.role || authUser.user_metadata?.role || 'Employee';
      const name =
        authUser.user_metadata?.name ||
        authUser.email?.split('@')[0] ||
        'there';

      setUser({
        name,
        email: authUser.email || '',
        role,
        isAdmin: String(role).toLowerCase().trim() === 'admin',
      });
    };
    load();
  }, []);

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          {user ? `Welcome back, ${firstName}` : 'Welcome back'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {user?.isAdmin
            ? 'Manage employee records, register accounts, and keep access in sync.'
            : 'Your Arachnix workspace for payroll and account settings.'}
        </p>
        {user && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 font-medium text-ink">
              {user.role}
            </span>
            <span className="text-muted/80">{user.email}</span>
          </div>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {user?.isAdmin && (
          <QuickLink
            href="/dashboard/employees"
            title="Employees"
            description="View roster, register accounts, and update profiles."
            icon={<Database className="h-4 w-4" />}
            primary
          />
        )}
        <QuickLink
          href="/dashboard/payroll"
          title="Payroll"
          description="Payroll tools will land here next."
          icon={<FileText className="h-4 w-4" />}
        />
        <QuickLink
          href="/dashboard/settings"
          title="Settings"
          description="Account preferences and workspace options."
          icon={<Settings className="h-4 w-4" />}
        />
      </section>
    </div>
  );
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
