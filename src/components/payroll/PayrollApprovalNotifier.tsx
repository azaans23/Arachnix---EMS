'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { formatMonthName } from '@/lib/payroll/period';
import { getTrustedRole, normalizeRole, ROLES } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { SALARY_SLIP_RUN_STATUSES, type SalarySlipRun } from '@/types/salary-slip';

const TOAST_ID = 'payroll-awaiting-approval';
const STORAGE_KEY = 'arachnix.payrollAwaitingToast';
const POLL_MS = 30_000;

function canApprovePayroll(role: string): boolean {
  const normalized = normalizeRole(role);
  return normalized === ROLES.ADMIN || normalized === ROLES.SUPER_ADMIN;
}

function readToastedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}

function writeToastedIds(ids: Set<string>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

function isAwaitingApproval(run: SalarySlipRun): boolean {
  return run.status.trim().toLowerCase() === SALARY_SLIP_RUN_STATUSES.AWAITING_APPROVAL.toLowerCase();
}

export default function PayrollApprovalNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const notify = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const response = await fetch('/api/salary-slip-runs', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !Array.isArray(result.data)) return;

    const awaiting = (result.data as SalarySlipRun[]).filter(isAwaitingApproval);
    const awaitingIds = awaiting.map((run) => String(run.runId));
    const toasted = readToastedIds();
    const stillOpen = new Set(awaitingIds.filter((id) => toasted.has(id)));
    const fresh = awaiting.filter((run) => !toasted.has(String(run.runId)));

    if (fresh.length === 0) {
      writeToastedIds(stillOpen);
      if (awaiting.length === 0) toast.dismiss(TOAST_ID);
      return;
    }

    const path = pathnameRef.current || '';
    const onlyFresh = fresh.length === 1 ? fresh[0] : null;
    if (
      onlyFresh &&
      awaiting.length === 1 &&
      path.startsWith('/dashboard/salary-slip-run-details') &&
      new URLSearchParams(window.location.search).get('runId') === String(onlyFresh.runId)
    ) {
      stillOpen.add(String(onlyFresh.runId));
      writeToastedIds(stillOpen);
      return;
    }

    const href =
      awaiting.length === 1
        ? `/dashboard/salary-slip-run-details?runId=${encodeURIComponent(String(awaiting[0].runId))}`
        : '/dashboard/salary-slip-runs';
    const period = awaiting[0]
      ? `${formatMonthName(awaiting[0].month)} ${awaiting[0].year}`
      : 'payroll';

    toast.warning(
      awaiting.length === 1
        ? `Salary slips for ${period} are waiting for your approval`
        : `${awaiting.length} salary slip runs are waiting for approval`,
      {
        id: TOAST_ID,
        description:
          awaiting.length === 1
            ? 'Review the PDFs, then approve to email employees.'
            : 'Open Salary slips to review each run before employees are emailed.',
        duration: 12_000,
        action: {
          label: awaiting.length === 1 ? 'Review' : 'Open runs',
          onClick: () => router.push(href),
        },
      }
    );

    for (const run of fresh) stillOpen.add(String(run.runId));
    writeToastedIds(stillOpen);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) return;

      localStorage.setItem('token', session.access_token);
      let role = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
      } catch {
        /* JWT fallback */
      }
      if (cancelled || !canApprovePayroll(role)) return;

      await notify();
      if (cancelled) return;
      timer = window.setInterval(() => void notify(), POLL_MS);
    };

    void boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(STORAGE_KEY);
        toast.dismiss(TOAST_ID);
      }
    });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      subscription.unsubscribe();
    };
  }, [notify]);

  return null;
}
