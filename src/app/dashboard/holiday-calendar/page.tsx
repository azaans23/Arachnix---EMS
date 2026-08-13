'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { HOLIDAY_TYPES, type Holiday } from '@/types/holiday';

type FormState = {
  holidayDate: string;
  holidayName: string;
  type: string;
  originalHolidayDate: string;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TYPE_OPTIONS = HOLIDAY_TYPES.map((type) => ({ label: type, value: type }));

const inputClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]';

function token() {
  return localStorage.getItem('token');
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthLabel(date: Date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(date);
}

function emptyForm(date = toIsoDate(new Date())): FormState {
  return {
    holidayDate: date,
    holidayName: '',
    type: HOLIDAY_TYPES[0],
    originalHolidayDate: date,
  };
}

function typeTone(type: string) {
  const value = type.toLowerCase();
  if (value.startsWith('public')) return 'border-border bg-ink text-accent-fg';
  if (value.startsWith('company')) return 'border-border bg-canvas text-ink';
  if (value.startsWith('optional')) return 'border-border bg-surface text-muted';
  return 'border-border bg-canvas text-ink';
}

/** Calendar cells are tight — drop the repeated "Holiday" suffix. */
function shortType(type: string) {
  return type.replace(/\s*holiday$/i, '') || type;
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  // Convert Sunday=0 calendar to Monday-first grid.
  const mondayIndex = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];

  for (let i = 0; i < mondayIndex; i += 1) {
    cells.push({ date: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    cells.push({ date: toIsoDate(date), day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null });
  }
  return cells;
}

export default function HolidayCalendarPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const today = toIsoDate(new Date());

  const year = month.getFullYear();

  const loadHolidays = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/holidays?year=${targetYear}`, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load holidays.');
      }
      setHolidays((result.data || []) as Holiday[]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load holidays.');
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) {
        setAllowed(false);
        setLoading(false);
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
      const canView = canAccess(role, 'holiday_calendar');
      setAllowed(canView);
      setCanEdit(canWrite(role, 'holiday_calendar'));
      if (!canView) setLoading(false);
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const handle = window.setTimeout(() => {
      void loadHolidays(year);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [allowed, year, loadHolidays]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const holiday of holidays) {
      map.set(holiday.holidayDate, holiday);
    }
    return map;
  }, [holidays]);

  const monthHolidays = useMemo(() => {
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    return holidays
      .filter((holiday) => holiday.holidayDate.startsWith(prefix))
      .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  }, [holidays, month]);

  const cells = useMemo(() => buildMonthCells(month), [month]);

  const openCreate = (date?: string) => {
    setEditing(false);
    setForm(emptyForm(date || today));
    setModalOpen(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditing(true);
    setForm({
      holidayDate: holiday.holidayDate,
      holidayName: holiday.holidayName,
      type: holiday.type || HOLIDAY_TYPES[0],
      originalHolidayDate: holiday.holidayDate,
    });
    setModalOpen(true);
  };

  const openDay = (date: string) => {
    const existing = holidayByDate.get(date);
    if (existing) {
      openEdit(existing);
      return;
    }
    if (canEdit) openCreate(date);
  };

  const saveHoliday = async () => {
    if (!form.holidayDate.trim() || !form.holidayName.trim() || !form.type.trim()) {
      toast.error('Date, name, and type are required.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          holidayDate: form.holidayDate,
          holidayName: form.holidayName.trim(),
          type: form.type.trim(),
          originalHolidayDate: editing ? form.originalHolidayDate : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save holiday.');
      }
      toast.success(result.message || (editing ? 'Holiday updated.' : 'Holiday created.'));
      setModalOpen(false);
      await loadHolidays(year);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save holiday.');
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up py-16">
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Access restricted"
          description="Holiday Calendar is available to Super Admin and HR Manager."
        />
      </div>
    );
  }

  const modal =
    modalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
            <button
              type="button"
              aria-label="Close dialog backdrop"
              className="absolute inset-0 cursor-default"
              disabled={saving}
              onClick={() => {
                if (!saving) setModalOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    Holiday
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">
                    {editing ? 'Update holiday' : 'Create holiday'}
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <label className="block text-xs font-medium text-muted">
                  Holiday date
                  <input
                    type="date"
                    value={form.holidayDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, holidayDate: event.target.value }))
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="block text-xs font-medium text-muted">
                  Holiday name
                  <input
                    type="text"
                    value={form.holidayName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, holidayName: event.target.value }))
                    }
                    placeholder="e.g. Independence Day"
                    className={inputClassName}
                  />
                </label>

                <label className="block text-xs font-medium text-muted">
                  Type
                  <div className="mt-1.5">
                    <CustomDropdown
                      id="holiday-type"
                      name="type"
                      options={TYPE_OPTIONS}
                      value={form.type}
                      onChange={(value) => setForm((current) => ({ ...current, type: value }))}
                      onBlur={() => {}}
                    />
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveHoliday()}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editing ? 'Save changes' : 'Create holiday'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Leave</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Holiday Calendar
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Company holidays by date, name, and type — stored in Supabase and synced to the sheet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadHolidays(year)}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add holiday
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-panel sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMonth((current) => addMonths(current, -1))}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-ink hover:bg-canvas"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-semibold text-ink">{monthLabel(month)}</h2>
              <p className="text-xs text-muted">{monthHolidays.length} holiday(s) this month</p>
            </div>
            <button
              type="button"
              onClick={() => setMonth((current) => addMonths(current, 1))}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-ink hover:bg-canvas"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
              >
                {day}
              </div>
            ))}

            {cells.map((cell, index) => {
              if (!cell.date) {
                return <div key={`empty-${index}`} className="min-h-[4.5rem] rounded-md" />;
              }

              const holiday = holidayByDate.get(cell.date);
              const isToday = cell.date === today;
              const interactive = Boolean(holiday) || canEdit;

              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!interactive}
                  onClick={() => openDay(cell.date!)}
                  className={`flex min-h-[4.5rem] flex-col items-start rounded-md border px-2 py-1.5 text-left transition-colors ${
                    holiday
                      ? 'border-ink/20 bg-canvas hover:bg-canvas/80'
                      : 'border-border bg-surface hover:bg-canvas/60'
                  } ${isToday ? 'ring-2 ring-[var(--focus-ring)]' : ''} ${
                    interactive ? 'cursor-pointer' : 'cursor-default'
                  } disabled:hover:bg-surface`}
                >
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      isToday ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {holiday ? (
                    <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-ink">
                      {holiday.holidayName}
                    </span>
                  ) : null}
                  {holiday ? (
                    <span
                      className={`mt-auto inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeTone(holiday.type)}`}
                    >
                      {shortType(holiday.type)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface shadow-panel">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">This month</h2>
            <p className="mt-0.5 text-xs text-muted">Click a holiday to update it.</p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : monthHolidays.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Plus className="h-5 w-5" />}
                title="No holidays this month"
                description={
                  canEdit
                    ? 'Click a date on the calendar or use Add holiday.'
                    : 'No company holidays are scheduled for this month.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {monthHolidays.map((holiday) => (
                <li key={holiday.holidayDate}>
                  <button
                    type="button"
                    onClick={() => openEdit(holiday)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{holiday.holidayName}</p>
                      <p className="mt-0.5 text-xs text-muted">{displayDate(holiday.holidayDate)}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeTone(holiday.type)}`}
                    >
                      {holiday.type}
                    </span>
                    {canEdit ? <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {modal}
    </div>
  );
}
