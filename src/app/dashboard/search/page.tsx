'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calculator,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  Users,
  Banknote,
  TreePalm,
  CalendarRange,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, getTrustedRole, ROLES, type AppRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import type { SearchHit, SearchSource } from '@/types/search-reports';

const SOURCE_META: Record<SearchSource, { label: string; icon: React.ReactNode; tone: string }> = {
  employee: {
    label: 'Employee',
    icon: <Users className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  accounting: {
    label: 'Accounting',
    icon: <Calculator className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  salary: {
    label: 'Payroll',
    icon: <Banknote className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  leave_request: {
    label: 'Leave request',
    icon: <TreePalm className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  leave_balance: {
    label: 'Leave balance',
    icon: <CalendarRange className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
};

const SEARCH_GUIDANCE: Record<AppRole, { description: string; placeholder: string; noMatch: string }> =
  {
    [ROLES.SUPER_ADMIN]: {
      description: 'Search employees, payroll, leave, and accounting records in one place.',
      placeholder: 'Search people, vendors, amounts, references, payroll, or leave…',
      noMatch: 'Try an employee, vendor, reference, amount, payroll period, or leave type.',
    },
    [ROLES.ADMIN]: {
      description: 'Search employees, payroll, leave, and accounting records in one place.',
      placeholder: 'Search people, vendors, amounts, references, payroll, or leave…',
      noMatch: 'Try an employee, vendor, reference, amount, payroll period, or leave type.',
    },
    [ROLES.HR_MANAGER]: {
      description: 'Search HR information only: employees, payroll, leave requests, and balances.',
      placeholder: 'Search employee, department, payroll period, or leave…',
      noMatch: 'Try an employee name or ID, department, payroll period, or leave type.',
    },
    [ROLES.FINANCE_MANAGER]: {
      description: 'Search accounting information only: transactions, vendors, accounts, and references.',
      placeholder: 'Search vendor, account, amount, reference, invoice, or month…',
      noMatch: 'Try a vendor, account, reference, amount, invoice, or month.',
    },
    [ROLES.DIRECTOR]: {
      description: 'Search the financial and operational information available to Directors.',
      placeholder: 'Search people, accounting, payroll, or leave…',
      noMatch: 'Try an employee, vendor, reference, payroll period, or leave type.',
    },
    [ROLES.EMPLOYEE]: {
      description: 'Search is not available for this role.',
      placeholder: 'Search…',
      noMatch: 'Try another search.',
    },
  };

function token() {
  return localStorage.getItem('token');
}

export default function SearchPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | SearchSource>('all');

  useEffect(() => {
    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) {
        setAllowed(false);
        return;
      }
      localStorage.setItem('token', session.access_token);
      let role = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
      } catch {
        /* keep JWT */
      }
      setRole(role);
      setAllowed(canAccess(role, 'search'));
    };
    void boot();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!allowed) return;

    let cancelled = false;
    const run = async () => {
      if (debounced.length < 2) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: debounced });
        const response = await fetch(`/api/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Search failed.');
        }
        if (!cancelled) setHits(result.data || []);
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Search failed.');
          setHits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [allowed, debounced]);

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return hits;
    return hits.filter((hit) => hit.source === sourceFilter);
  }, [hits, sourceFilter]);

  const counts = useMemo(() => {
    const map = new Map<SearchSource, number>();
    for (const hit of hits) {
      map.set(hit.source, (map.get(hit.source) || 0) + 1);
    }
    return map;
  }, [hits]);
  const guidance = SEARCH_GUIDANCE[role || ROLES.EMPLOYEE];

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Global search is available to Super Admin, Admin, HR Manager, Finance Manager, and Director."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="mb-8 border-b border-border pb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Overview</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Search
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {guidance.description}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={guidance.placeholder}
          autoFocus
          className="h-12 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-12 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
        )}
      </div>

      {hits.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip
            active={sourceFilter === 'all'}
            onClick={() => setSourceFilter('all')}
            label={`All (${hits.length})`}
          />
          {([...counts.entries()] as Array<[SearchSource, number]>).map(([source, count]) => (
            <FilterChip
              key={source}
              active={sourceFilter === source}
              onClick={() => setSourceFilter(source)}
              label={`${SOURCE_META[source].label} (${count})`}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        {debounced.length < 2 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Type at least 2 characters"
            description={guidance.description}
          />
        ) : loading && hits.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No matches"
            description={`Nothing matched “${debounced}”. ${guidance.noMatch}`}
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
            {filtered.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={hit.href}
                  className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-canvas/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
                >
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium ${SOURCE_META[hit.source].tone}`}
                  >
                    {SOURCE_META[hit.source].icon}
                    {SOURCE_META[hit.source].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate font-medium text-ink">{hit.title}</p>
                      <span className="shrink-0 text-xs tabular-nums text-muted">{hit.meta}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">{hit.subtitle}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Matched on {hit.matchedOn.join(', ')}
                    </p>
                  </div>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium transition-colors ${
        active
          ? 'border-ink bg-ink text-accent-fg'
          : 'border-border bg-surface text-ink hover:bg-canvas'
      }`}
    >
      {label}
    </button>
  );
}
