'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/** Monday-first, matching the holiday calendar grid. */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PANEL_GAP = 6;
const PANEL_MIN_WIDTH = 248;
const PANEL_MAX_WIDTH = 288;
const PANEL_HEIGHT = 300;
const VIEWPORT_MARGIN = 12;
const YEAR_PAGE = 12;

type PanelView = 'day' | 'month' | 'year';

type PanelPosition = {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
};

export type DatePickerProps = {
  /** ISO `YYYY-MM-DD`, or `''` when empty. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  onBlur?: () => void;
  placeholder?: string;
  /** Inclusive ISO bounds. */
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  /** Hide the built-in leading icon when the field wrapper already renders one. */
  hideIcon?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function isSameDay(a: Date, b: Date) {
  return toIsoDate(a) === toIsoDate(b);
}

function monthYearLabel(date: Date) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatDisplay(value: string) {
  const date = parseIsoDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(date);
}

/** Fixed 6-week grid so the panel never changes height between months. */
function buildWeeks(month: Date): Date[][] {
  const first = startOfMonth(month);
  const mondayIndex = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayIndex);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day))
  );
}

export default function DatePicker({
  value,
  onChange,
  id,
  name,
  onBlur,
  placeholder = 'Select date',
  min,
  max,
  disabled = false,
  invalid = false,
  clearable = true,
  hideIcon = false,
  className = '',
  ariaLabel,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [view, setView] = useState<PanelView>('day');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [activeIso, setActiveIso] = useState(() => toIsoDate(new Date()));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => parseIsoDate(value), [value]);
  const today = useMemo(() => new Date(), []);
  const activeDate = useMemo(() => parseIsoDate(activeIso) ?? today, [activeIso, today]);

  const isOutOfRange = useCallback(
    (iso: string) => {
      if (min && iso < min) return true;
      if (max && iso > max) return true;
      return false;
    },
    [min, max]
  );

  /** The panel is portalled, so it is positioned against the trigger's viewport rect. */
  const measure = useCallback((): PanelPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openUp = spaceBelow < PANEL_HEIGHT && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH);
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;

    return {
      top: openUp ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP,
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, Math.max(VIEWPORT_MARGIN, maxLeft))),
      width,
      openUp,
    };
  }, []);

  // Callers pass inline handlers; a ref keeps the panel effects from re-running each render.
  const onBlurRef = useRef(onBlur);
  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  const closePanel = useCallback((refocus = false) => {
    setIsOpen(false);
    setPosition(null);
    onBlurRef.current?.();
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openPanel = useCallback(() => {
    const next = measure();
    if (!next) return;
    const anchor = selected ?? parseIsoDate(min ?? '') ?? new Date();
    setPosition(next);
    setView('day');
    setViewMonth(startOfMonth(anchor));
    setActiveIso(toIsoDate(selected ?? anchor));
    setIsOpen(true);
  }, [measure, min, selected]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    const handleReflow = () => setPosition(measure());

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReflow);
    window.addEventListener('scroll', handleReflow, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReflow);
      window.removeEventListener('scroll', handleReflow, true);
    };
  }, [isOpen, closePanel, measure]);

  // The day grid owns keyboard navigation, so it takes focus whenever it appears.
  useEffect(() => {
    if (!isOpen || view !== 'day') return;
    gridRef.current?.focus();
  }, [isOpen, view]);

  const commit = useCallback(
    (date: Date) => {
      const iso = toIsoDate(date);
      if (isOutOfRange(iso)) return;
      onChange(iso);
      closePanel(true);
    },
    [closePanel, isOutOfRange, onChange]
  );

  const moveActive = useCallback((date: Date) => {
    setActiveIso(toIsoDate(date));
    setViewMonth(startOfMonth(date));
  }, []);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      'Enter',
      ' ',
      'Escape',
    ];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    switch (event.key) {
      case 'Escape':
        closePanel(true);
        return;
      case 'Enter':
      case ' ':
        commit(activeDate);
        return;
      case 'ArrowLeft':
        moveActive(addDays(activeDate, -1));
        return;
      case 'ArrowRight':
        moveActive(addDays(activeDate, 1));
        return;
      case 'ArrowUp':
        moveActive(addDays(activeDate, -7));
        return;
      case 'ArrowDown':
        moveActive(addDays(activeDate, 7));
        return;
      case 'PageUp':
        moveActive(addMonths(activeDate, -1));
        return;
      case 'PageDown':
        moveActive(addMonths(activeDate, 1));
        return;
      case 'Home':
        moveActive(addDays(activeDate, -((activeDate.getDay() + 6) % 7)));
        return;
      case 'End':
        moveActive(addDays(activeDate, 6 - ((activeDate.getDay() + 6) % 7)));
        return;
      default:
        return;
    }
  };

  const shiftView = (direction: 1 | -1) => {
    if (view === 'day') {
      setViewMonth((current) => addMonths(current, direction));
      return;
    }
    const years = view === 'month' ? 1 : YEAR_PAGE;
    setViewMonth(
      (current) => new Date(current.getFullYear() + direction * years, current.getMonth(), 1)
    );
  };

  const yearPageStart = Math.floor(viewMonth.getFullYear() / YEAR_PAGE) * YEAR_PAGE;

  const headerLabel =
    view === 'day'
      ? monthYearLabel(viewMonth)
      : view === 'month'
        ? String(viewMonth.getFullYear())
        : `${yearPageStart} – ${yearPageStart + YEAR_PAGE - 1}`;

  const navClass =
    'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink';

  const cellClass = (state: {
    selected: boolean;
    today: boolean;
    active: boolean;
    outside?: boolean;
    disabled: boolean;
  }) => {
    if (state.disabled) return 'cursor-not-allowed text-muted/35';
    if (state.selected) return 'cursor-pointer bg-ink font-semibold text-accent-fg';
    const tone = state.outside ? 'text-muted/45' : 'text-ink';
    const ring = state.active ? 'ring-2 ring-[var(--focus-ring)]' : '';
    const todayRing = state.today ? 'border border-ink/35 font-semibold' : '';
    return `cursor-pointer hover:bg-canvas ${tone} ${todayRing} ${ring}`;
  };

  const weeks = buildWeeks(viewMonth);

  const panel =
    isOpen && position
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel ? `${ariaLabel} calendar` : 'Choose a date'}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              transform: position.openUp ? 'translateY(-100%)' : undefined,
            }}
            className="z-[210] rounded-lg border border-border bg-surface p-2 shadow-panel animate-fade-in"
          >
            <div className="flex items-center justify-between gap-1">
              <button type="button" className={navClass} onClick={() => shiftView(-1)}>
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setView((current) =>
                    current === 'day' ? 'month' : current === 'month' ? 'year' : 'day'
                  )
                }
                className="inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
              >
                {headerLabel}
              </button>
              <button type="button" className={navClass} onClick={() => shiftView(1)}>
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next</span>
              </button>
            </div>

            {view === 'day' ? (
              <div className="mt-1.5">
                <div className="grid grid-cols-7 gap-0.5 pb-0.5">
                  {WEEKDAYS.map((weekday) => (
                    <span
                      key={weekday}
                      className="text-center text-[10px] font-medium uppercase tracking-[0.06em] text-muted"
                    >
                      {weekday}
                    </span>
                  ))}
                </div>
                <div
                  ref={gridRef}
                  role="grid"
                  tabIndex={0}
                  onKeyDown={handleGridKeyDown}
                  className="flex flex-col gap-0.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {weeks.map((week) => (
                    <div key={toIsoDate(week[0])} role="row" className="grid grid-cols-7 gap-0.5">
                      {week.map((date) => {
                        const iso = toIsoDate(date);
                        const isSelected = !!selected && isSameDay(date, selected);
                        const cellDisabled = isOutOfRange(iso);
                        return (
                          <div key={iso} role="gridcell" aria-selected={isSelected}>
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={cellDisabled}
                              onClick={() => commit(date)}
                              className={`h-7 w-full rounded-md text-xs transition-colors ${cellClass({
                                selected: isSelected,
                                today: isSameDay(date, today),
                                active: isSameDay(date, activeDate),
                                outside: date.getMonth() !== viewMonth.getMonth(),
                                disabled: cellDisabled,
                              })}`}
                            >
                              {date.getDate()}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {view === 'month' ? (
              <div className="mt-1.5 grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, month) => {
                  const monthDate = new Date(viewMonth.getFullYear(), month, 1);
                  const monthEnd = new Date(viewMonth.getFullYear(), month + 1, 0);
                  const monthDisabled =
                    (!!max && toIsoDate(monthDate) > max) || (!!min && toIsoDate(monthEnd) < min);
                  return (
                    <button
                      key={month}
                      type="button"
                      disabled={monthDisabled}
                      onClick={() => {
                        setViewMonth(monthDate);
                        setView('day');
                      }}
                      className={`h-8 rounded-md text-xs transition-colors ${cellClass({
                        selected:
                          !!selected &&
                          selected.getFullYear() === viewMonth.getFullYear() &&
                          selected.getMonth() === month,
                        today:
                          today.getFullYear() === viewMonth.getFullYear() &&
                          today.getMonth() === month,
                        active: false,
                        disabled: monthDisabled,
                      })}`}
                    >
                      {monthDate.toLocaleString('en-US', { month: 'short' })}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {view === 'year' ? (
              <div className="mt-1.5 grid grid-cols-4 gap-1">
                {Array.from({ length: YEAR_PAGE }, (_, index) => {
                  const year = yearPageStart + index;
                  const yearDisabled =
                    (!!max && `${year}-01-01` > max) || (!!min && `${year}-12-31` < min);
                  return (
                    <button
                      key={year}
                      type="button"
                      disabled={yearDisabled}
                      onClick={() => {
                        setViewMonth(new Date(year, viewMonth.getMonth(), 1));
                        setView('month');
                      }}
                      className={`h-8 rounded-md text-xs transition-colors ${cellClass({
                        selected: !!selected && selected.getFullYear() === year,
                        today: today.getFullYear() === year,
                        active: false,
                        disabled: yearDisabled,
                      })}`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5">
              <button
                type="button"
                disabled={isOutOfRange(toIsoDate(today))}
                onClick={() => commit(today)}
                className="inline-flex h-7 cursor-pointer items-center rounded-md px-1.5 text-[11px] font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent"
              >
                Today
              </button>
              {clearable && value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    closePanel(true);
                  }}
                  className="inline-flex h-7 cursor-pointer items-center rounded-md px-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        name={name}
        type="button"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        aria-autocomplete="none"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? closePanel() : openPanel())}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid
            ? 'border-danger'
            : isOpen
              ? 'border-ink/40 ring-2 ring-[var(--focus-ring)]'
              : 'border-border hover:border-ink/25'
        } ${disabled ? '' : 'cursor-pointer'} ${className}`}
      >
        {hideIcon ? null : <CalendarDays className="h-4 w-4 shrink-0 text-muted/70" />}
        <span className={`min-w-0 truncate ${value ? 'text-ink' : 'text-muted/50'}`}>
          {formatDisplay(value) || placeholder}
        </span>
      </button>
      {panel}
    </>
  );
}
