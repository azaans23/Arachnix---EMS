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
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { HOLIDAY_TYPES, type Holiday } from '@/types/holiday';

type FormState = {
  id: string;
  holidayDate: string;
  holidayName: string;
  type: string;
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
    id: '',
    holidayDate: date,
    holidayName: '',
    type: HOLIDAY_TYPES[0],
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dayDate, setDayDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<Holiday | null>(null);
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
      let flags = { hasFinanceAccess: false, isDirector: false };
      try {
        const synced = await syncSessionCookies(session.access_token);
        role = synced.role;
        flags = { hasFinanceAccess: synced.hasFinanceAccess, isDirector: synced.isDirector };
      } catch {
        /* keep JWT */
      }
      const canView = canAccess(role, 'holiday_calendar', flags);
      setAllowed(canView);
      setCanEdit(canWrite(role, 'holiday_calendar', flags));
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

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const holiday of holidays) {
      const list = map.get(holiday.holidayDate) || [];
      list.push(holiday);
      map.set(holiday.holidayDate, list);
    }
    return map;
  }, [holidays]);

  const monthHolidays = useMemo(() => {
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    return holidays
      .filter((holiday) => holiday.holidayDate.startsWith(prefix))
      .sort((a, b) =>
        a.holidayDate === b.holidayDate
          ? Number(a.id) - Number(b.id)
          : a.holidayDate.localeCompare(b.holidayDate)
      );
  }, [holidays, month]);

  const dayHolidays = useMemo(
    () => (dayDate ? holidaysByDate.get(dayDate) || [] : []),
    [dayDate, holidaysByDate]
  );

  const cells = useMemo(() => buildMonthCells(month), [month]);

  const openCreate = (date?: string) => {
    setEditing(false);
    setForm(emptyForm(date || dayDate || today));
    setFormOpen(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditing(true);
    setForm({
      id: holiday.id,
      holidayDate: holiday.holidayDate,
      holidayName: holiday.holidayName,
      type: holiday.type || HOLIDAY_TYPES[0],
    });
    setFormOpen(true);
  };

  const openDay = (date: string) => {
    setDayDate(date);
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
          id: editing ? form.id : undefined,
          holidayDate: form.holidayDate,
          holidayName: form.holidayName.trim(),
          type: form.type.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save holiday.');
      }
      toast.success(result.message || (editing ? 'Holiday updated.' : 'Holiday created.'));
      setFormOpen(false);
      if (result.data?.holidayDate) setDayDate(String(result.data.holidayDate));
      await loadHolidays(year);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save holiday.');
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (holiday: Holiday) => {
    setDeletingId(holiday.id);
    try {
      const response = await fetch('/api/holidays', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: holiday.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete holiday.');
      }
      toast.success(result.message || 'Holiday deleted.');
      setConfirmDelete(null);
      await loadHolidays(year);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete holiday.');
    } finally {
      setDeletingId(null);
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
          description="Holiday Calendar is writable by Super Admin, Admin, and HR Manager; Finance Manager has read-only access."
        />
      </div>
    );
  }

  const dayModal =
    dayDate && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
            <button
              type="button"
              aria-label="Close dialog backdrop"
              className="absolute inset-0 cursor-default"
              onClick={() => setDayDate(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    Date
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{displayDate(dayDate)}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {dayHolidays.length} holiday{dayHolidays.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDayDate(null)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {dayHolidays.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<Plus className="h-5 w-5" />}
                      title="No holidays on this date"
                      description={
                        canEdit
                          ? 'Add one or more holidays for this day.'
                          : 'Nothing is scheduled for this date.'
                      }
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {dayHolidays.map((holiday) => (
                      <li key={holiday.id} className="flex items-start gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">{holiday.holidayName}</p>
                          <p className="mt-0.5 text-xs text-muted">ID {holiday.id}</p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeTone(holiday.type)}`}
                        >
                          {holiday.type}
                        </span>
                        {canEdit ? (
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(holiday)}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-muted hover:bg-canvas hover:text-ink"
                              title="Edit holiday"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(holiday)}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-danger-border text-danger hover:bg-danger-bg"
                              title="Delete holiday"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => setDayDate(null)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Close
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => openCreate(dayDate)}
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-medium text-accent-fg hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    Add holiday
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const formModal =
    formOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[130] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
            <button
              type="button"
              aria-label="Close dialog backdrop"
              className="absolute inset-0 cursor-default"
              disabled={saving}
              onClick={() => {
                if (!saving) setFormOpen(false);
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
                  onClick={() => setFormOpen(false)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <label className="block text-xs font-medium text-muted">
                  Holiday date
                  <div className="mt-1.5">
                    <DatePicker
                      ariaLabel="Holiday date"
                      clearable={false}
                      value={form.holidayDate}
                      onChange={(next) => setForm((current) => ({ ...current, holidayDate: next }))}
                    />
                  </div>
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
                  onClick={() => setFormOpen(false)}
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

  const deleteModal =
    confirmDelete && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-ink/40 p-4">
            <button
              type="button"
              aria-label="Close dialog backdrop"
              className="absolute inset-0 cursor-default"
              disabled={Boolean(deletingId)}
              onClick={() => {
                if (!deletingId) setConfirmDelete(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-panel animate-scale-up"
            >
              <h2 className="text-lg font-semibold text-ink">Delete holiday?</h2>
              <p className="mt-2 text-sm text-muted">
                Remove <span className="font-medium text-ink">{confirmDelete.holidayName}</span> on{' '}
                {displayDate(confirmDelete.holidayDate)}. This cannot be undone from the calendar.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => setConfirmDelete(null)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => void removeHoliday(confirmDelete)}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-3.5 text-sm font-semibold text-danger hover:opacity-90 disabled:opacity-50"
                >
                  {deletingId === confirmDelete.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
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
            Multiple holidays can share the same date. Click a day to view, add, or delete.
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

              const dayList = holidaysByDate.get(cell.date) || [];
              const primary = dayList[0];
              const isToday = cell.date === today;
              const hasHolidays = dayList.length > 0;

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => openDay(cell.date!)}
                  className={`flex min-h-[4.5rem] cursor-pointer flex-col items-start rounded-md border px-2 py-1.5 text-left transition-colors ${
                    hasHolidays
                      ? 'border-ink/20 bg-canvas hover:bg-canvas/80'
                      : 'border-border bg-surface hover:bg-canvas/60'
                  } ${isToday ? 'ring-2 ring-[var(--focus-ring)]' : ''}`}
                >
                  <span
                    className={`flex w-full items-center justify-between gap-1 text-xs font-semibold tabular-nums ${
                      isToday ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    {cell.day}
                    {dayList.length > 1 ? (
                      <span className="rounded bg-ink px-1 py-0.5 text-[10px] font-medium text-accent-fg">
                        {dayList.length}
                      </span>
                    ) : null}
                  </span>
                  {primary ? (
                    <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-ink">
                      {primary.holidayName}
                      {dayList.length > 1 ? ` +${dayList.length - 1}` : ''}
                    </span>
                  ) : null}
                  {primary ? (
                    <span
                      className={`mt-auto inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeTone(primary.type)}`}
                    >
                      {shortType(primary.type)}
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
            <p className="mt-0.5 text-xs text-muted">Click a holiday to open its date.</p>
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
                <li key={holiday.id}>
                  <button
                    type="button"
                    onClick={() => openDay(holiday.holidayDate)}
                    className="flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{holiday.holidayName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {displayDate(holiday.holidayDate)} · ID {holiday.id}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeTone(holiday.type)}`}
                    >
                      {holiday.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dayModal}
      {formModal}
      {deleteModal}
    </div>
  );
}
