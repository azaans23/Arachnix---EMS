'use client';

import { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, User, ShieldAlert, CheckCircle, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { canAccess, getTrustedRole, isSuperAdminSelfEdit } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { useModal } from '@/hooks/useModal';
import EmployeeForm from '@/components/employees/EmployeeForm';
import { FormSkeleton, Skeleton } from '@/components/ui/Skeleton';
import type { SheetUser } from '@/types/employee';
import { emsStatusOf, hasEmsLogin, supabaseUserIdOf } from '@/types/employee';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EmployeeProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const { openModal } = useModal();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [user, setUser] = useState<SheetUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string | null>(null);

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/get-users/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to load employee.');
      }
      setUser(result.data as SheetUser);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load employee.';
      setError(message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user || !session.access_token) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      localStorage.setItem('token', session.access_token);
      setActorEmail(session.user.email || null);
      setActorUserId(session.user.id || null);
      let role = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
      } catch {
        /* keep JWT fallback */
      }

      setActorRole(role);
      const ok = canAccess(role, 'employees');
      setAllowed(ok);
      if (ok) {
        await loadEmployee();
      } else {
        setLoading(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [loadEmployee]);

  if (allowed === null || (allowed && loading && !user)) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <Skeleton className="mb-6 h-4 w-36" />
        <div className="mb-8 flex items-center gap-4 border-b border-border pb-6">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
        <FormSkeleton />
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          Only Super Admin, Admin, and HR Manager can view employee profiles.
        </p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up">
        <Link
          href="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        <div className="mt-6 rounded-lg border border-border bg-surface px-5 py-8">
          <h1 className="text-lg font-semibold text-ink">Employee not found</h1>
          <p className="mt-2 text-sm text-muted">{error || 'No profile matches this ID.'}</p>
          <button
            type="button"
            onClick={loadEmployee}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const raw = user.raw || {};
  const registered = hasEmsLogin(user);
  const isActive = registered && emsStatusOf(user).toLowerCase() === 'active';
  const isSelfSuperAdmin = isSuperAdminSelfEdit({
    actorRole: actorRole || '',
    actorEmail,
    actorUserId,
    targetEmail: user.email,
    targetSupabaseUserId: supabaseUserIdOf(user),
  });

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        {!registered && !isSelfSuperAdmin && (
          <button
            type="button"
            onClick={() =>
              openModal('registerEmployee', {
                user,
                onSuccess: () => {
                  loadEmployee();
                  toast.success('EMS access granted');
                },
              })
            }
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            <UserCheck className="h-3.5 w-3.5" /> Give EMS Access
          </button>
        )}
      </div>

      <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-canvas">
            <User className="h-8 w-8 text-muted" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
              Employee profile
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {user.name || 'N/A'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {String(raw.Designation || raw.designation || 'Staff Member')}
              {user.employeeId ? ` · ${user.employeeId}` : ''}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold ${
            isActive ? 'border-border bg-canvas text-ink' : 'border-border bg-surface text-muted'
          }`}
        >
          {isActive ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          {isActive ? 'EMS Active' : registered ? 'EMS Inactive' : 'No login yet'}
        </span>
      </header>

      {isSelfSuperAdmin ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-panel">
          <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Editing disabled</p>
              <p className="mt-1 text-danger/90">
                Super Admin cannot change their own account. Ask another administrator if a change
                is required outside this system.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-panel">
          <EmployeeForm
            user={user}
            embedded
            submitLabel="Save"
            onSuccess={async () => {
              await loadEmployee();
            }}
          />
        </div>
      )}
    </div>
  );
}
