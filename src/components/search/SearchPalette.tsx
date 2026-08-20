'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, FileText, Loader2, Search, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { canAccess, getTrustedRole, ROLES, type AppRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { useSearchPalette } from '@/hooks/useSearchPalette';
import { SEARCH_GUIDANCE, SOURCE_META } from '@/components/search/source-meta';
import type { SearchHit, SearchSource } from '@/types/search-reports';

export default function SearchPalette() {
  const { isOpen, closeSearch, toggleSearch } = useSearchPalette();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSearch]);

  // Mounted only while open so each session starts with a clean query.
  if (!isOpen) return null;
  return <SearchDialog onClose={closeSearch} />;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [role, setRole] = useState<AppRole | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'all' | SearchSource>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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
      let resolved = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        resolved = synced.role;
      } catch {
        /* keep JWT role */
      }
      setRole(resolved);
      setAllowed(canAccess(resolved, 'search'));
    };
    void boot();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
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
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Search failed.');
        }
        if (!cancelled) {
          setHits(result.data || []);
          setActiveIndex(0);
        }
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

  const filtered = useMemo(
    () => (sourceFilter === 'all' ? hits : hits.filter((hit) => hit.source === sourceFilter)),
    [hits, sourceFilter]
  );

  const counts = useMemo(() => {
    const map = new Map<SearchSource, number>();
    for (const hit of hits) {
      map.set(hit.source, (map.get(hit.source) || 0) + 1);
    }
    return map;
  }, [hits]);

  const guidance = SEARCH_GUIDANCE[role || ROLES.EMPLOYEE];

  /** The dropdown only exists once there is something to answer. */
  const showResults =
    allowed === false ? debounced.length > 0 : debounced.length >= 2 && !(loading && !hits.length);

  const openHit = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      onClose();
      router.push(hit.href);
    },
    [onClose, router]
  );

  useEffect(() => {
    const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!filtered.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openHit(filtered[activeIndex]);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-ink/20 p-4 pt-[12vh] animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-2xl animate-scale-up"
      >
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-panel">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={allowed === false ? 'Search…' : guidance.placeholder}
            disabled={allowed === false}
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted/60 focus:outline-none disabled:cursor-not-allowed"
          />
          {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" /> : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showResults ? (
          <div className="mt-2 flex max-h-[min(60vh,28rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-fade-in">
            {allowed && hits.length > 0 ? (
              <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
                <FilterChip
                  active={sourceFilter === 'all'}
                  onClick={() => {
                    setSourceFilter('all');
                    setActiveIndex(0);
                  }}
                  label={`All (${hits.length})`}
                />
                {([...counts.entries()] as Array<[SearchSource, number]>).map(([source, count]) => (
                  <FilterChip
                    key={source}
                    active={sourceFilter === source}
                    onClick={() => {
                      setSourceFilter(source);
                      setActiveIndex(0);
                    }}
                    label={`${SOURCE_META[source].label} (${count})`}
                  />
                ))}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {allowed === false ? (
                <Message
                  icon={<ShieldAlert className="h-4 w-4" />}
                  title="Access restricted"
                  description="Global search is available to Super Admin, Admin, HR Manager, Finance Manager, and Director."
                />
              ) : filtered.length === 0 ? (
                <Message
                  icon={<FileText className="h-4 w-4" />}
                  title="No matches"
                  description={`Nothing matched “${debounced}”. ${guidance.noMatch}`}
                />
              ) : (
                <ul ref={listRef} className="divide-y divide-border">
                  {filtered.map((hit, index) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => openHit(hit)}
                        className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors ${
                          index === activeIndex ? 'bg-canvas' : 'hover:bg-canvas/60'
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium ${SOURCE_META[hit.source].tone}`}
                        >
                          {SOURCE_META[hit.source].icon}
                          {SOURCE_META[hit.source].label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="truncate text-sm font-medium text-ink">
                              {hit.title}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">
                              {hit.meta}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {hit.subtitle}
                          </span>
                        </span>
                        {index === activeIndex ? (
                          <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {filtered.length > 0 ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2 text-[11px] text-muted">
                <span>
                  <Key>↑</Key> <Key>↓</Key> to navigate · <Key>Enter</Key> to open
                </span>
                <span>
                  <Key>Esc</Key> to close
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
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
      className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
        active
          ? 'border-ink bg-ink text-accent-fg'
          : 'border-border bg-surface text-ink hover:bg-canvas'
      }`}
    >
      {label}
    </button>
  );
}

function Message({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-canvas text-muted">
        {icon}
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted">{description}</p>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-canvas px-1.5 py-0.5 font-sans text-[10px] text-ink">
      {children}
    </kbd>
  );
}
