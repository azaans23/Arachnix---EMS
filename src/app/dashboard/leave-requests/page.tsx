'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import { toSheetUser, type SheetUser } from '@/types/employee';
import {
  LEAVE_TYPES,
  countLeaveDays,
  type LeaveRequest,
  type LeaveRequestAction,
} from '@/types/leave-request';
import { findDepartmentLeaveConflicts } from '@/lib/leave/conflicts';

type EmployeeOption = SheetUser & {
  department: string;
  designation: string;
  emsStatus: string;
};

type CreateStep = 'pick' | 'form';
type ActionModal = {
  request: LeaveRequest;
  action: 'reject' | 'request_changes' | 'approve';
};

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
];

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Changes requested', value: 'changes' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
];

const LEAVE_TYPE_OPTIONS = LEAVE_TYPES.map((type) => ({ label: type, value: type }));

function token() {
  return localStorage.getItem('token');
}

function statusClasses(status: string, changesRequested?: boolean) {
  if (changesRequested) return 'border-border bg-canvas text-ink';
  switch (status.toLowerCase()) {
    case 'approved':
      return 'border-border bg-success/10 text-success';
    case 'rejected':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
  }
}

function statusLabel(row: LeaveRequest) {
  if (row.changesRequested) return 'Changes requested';
  return row.status;
}

function displayDate(value: string) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(date);
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function parseLeaveDate(value: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLeaveRange(start: Date, end: Date) {
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' });
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric' });
  const full = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return full.format(start);

  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${day.format(start)}-${day.format(end)} ${month.format(start)} ${year.format(start)}`;
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${day.format(start)} ${month.format(start)} - ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
  }

  return `${full.format(start)} - ${full.format(end)}`;
}

function DateRangeCell({ start, end }: { start: string; end: string }) {
  const startDate = parseLeaveDate(start);
  const endDate = parseLeaveDate(end);

  if (!startDate && !endDate) {
    return <span className="text-muted">—</span>;
  }

  if (!startDate || !endDate) {
    return <span className="text-ink">{displayDate(start || end)}</span>;
  }

  return <span className="tabular-nums text-ink">{formatLeaveRange(startDate, endDate)}</span>;
}

export default function LeaveRequestsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [actingId, setActingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('pick');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    leaveType: 'Annual',
    startDate: '',
    endDate: '',
    daysRequested: '0',
    reason: '',
  });

  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [savingAction, setSavingAction] = useState(false);
  const [detailRequest, setDetailRequest] = useState<LeaveRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leave-requests', {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load leave requests.');
      }
      setRows(Array.isArray(result.data) ? result.data : []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load leave requests.');
      setRows([]);
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
        /* keep JWT fallback */
      }
      const canView = canAccess(role, 'leave_requests');
      setCanEdit(canWrite(role, 'leave_requests'));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const typeFilterOptions = useMemo(() => {
    const types = Array.from(new Set(rows.map((row) => row.leaveType).filter(Boolean))).sort();
    return [
      { label: 'All types', value: 'all' },
      ...types.map((type) => ({ label: type, value: type })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (q) {
        const matches = [
          row.requestId,
          row.fullName,
          row.employeeId,
          row.email,
          row.leaveType,
          row.status,
          row.reason,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (typeFilter !== 'all' && row.leaveType !== typeFilter) return false;

      if (statusFilter === 'changes') return Boolean(row.changesRequested);
      if (statusFilter === 'Pending') return row.status === 'Pending' && !row.changesRequested;
      if (statusFilter !== 'all') return row.status === statusFilter;
      return true;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSizeNum));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRows.slice(start, start + pageSizeNum);
  }, [filteredRows, currentPage, pageSizeNum]);
  const rangeStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRows.length);
  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all';

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const response = await fetch('/api/get-users', {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load employees.');
      }
      const raw = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      setEmployees(
        raw.map((row: unknown) => {
          const record = mapRawToEmployee(row);
          return {
            ...toSheetUser(record),
            department: record.department,
            designation: record.designation,
            emsStatus: record.emsStatus,
          };
        })
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load employees.');
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const openCreate = async () => {
    setCreateOpen(true);
    setCreateStep('pick');
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setCreateForm({
      leaveType: 'Annual',
      startDate: '',
      endDate: '',
      daysRequested: '0',
      reason: '',
    });
    await loadEmployees();
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateStep('pick');
    setSelectedEmployee(null);
  };

  const selectEmployee = (employee: EmployeeOption) => {
    setSelectedEmployee(employee);
    setCreateStep('form');
  };

  const updateCreateDates = (field: 'startDate' | 'endDate', value: string) => {
    setCreateForm((current) => {
      const next = { ...current, [field]: value };
      if (next.startDate && next.endDate && next.endDate >= next.startDate) {
        next.daysRequested = String(countLeaveDays(next.startDate, next.endDate));
      } else {
        next.daysRequested = '0';
      }
      return next;
    });
  };

  const saveCreate = async () => {
    if (!selectedEmployee) {
      toast.error('Select an employee.');
      return;
    }
    if (!createForm.startDate || !createForm.endDate) {
      toast.error('Enter start and end dates.');
      return;
    }
    if (createForm.endDate < createForm.startDate) {
      toast.error('End date cannot be before start date.');
      return;
    }
    const days = Number(createForm.daysRequested);
    if (!Number.isFinite(days) || days <= 0) {
      toast.error('Days requested must be greater than zero.');
      return;
    }

    setSavingCreate(true);
    try {
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          employeeId: selectedEmployee.employeeId,
          leaveType: createForm.leaveType,
          startDate: createForm.startDate,
          endDate: createForm.endDate,
          daysRequested: days,
          reason: createForm.reason.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create leave request.');
      }
      toast.success(result.message || 'Leave request created.');
      closeCreate();
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create leave request.');
    } finally {
      setSavingCreate(false);
    }
  };

  const runAction = async (request: LeaveRequest, action: LeaveRequestAction, reason?: string) => {
    setActingId(request.requestId);
    try {
      const response = await fetch(`/api/leave-requests/${encodeURIComponent(request.requestId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ action, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update leave request.');
      }
      toast.success(result.message || 'Leave request updated.');
      setActionModal(null);
      setActionReason('');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update leave request.');
    } finally {
      setActingId(null);
      setSavingAction(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.email, employee.employeeId, employee.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [employees, employeeSearch]);

  const createConflicts = useMemo(() => {
    if (!selectedEmployee || !createForm.startDate || !createForm.endDate) return [];
    return findDepartmentLeaveConflicts(
      {
        requestId: '',
        employeeId: selectedEmployee.employeeId,
        department: selectedEmployee.department,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
      },
      rows
    );
  }, [
    selectedEmployee,
    createForm.startDate,
    createForm.endDate,
    rows,
  ]);

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <TableSkeleton columns={8} rows={8} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          Only Super Admin, Admin, and HR Manager can manage leave requests.
        </p>
      </div>
    );
  }

  const createModal = createOpen
    ? createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
        onClick={closeCreate}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-leave-request-title"
          onClick={(event) => event.stopPropagation()}
          className="relative flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2
                id="create-leave-request-title"
                className="text-lg font-semibold tracking-tight text-ink"
              >
                {createStep === 'pick' ? 'Select employee' : 'Create leave request'}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {createStep === 'pick'
                  ? 'HR enters leave on behalf of the employee.'
                  : selectedEmployee
                    ? `${selectedEmployee.name || selectedEmployee.employeeId} · ${selectedEmployee.email || 'No email'}`
                    : 'Enter leave details.'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeCreate}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {createStep === 'pick' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
                  <input
                    type="search"
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Search employees…"
                    className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                </div>
                {employeesLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading employees…
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">No employees found.</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {filteredEmployees.map((employee) => (
                      <li key={employee.employeeId || employee.email}>
                        <button
                          type="button"
                          onClick={() => selectEmployee(employee)}
                          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {employee.name || employee.employeeId}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {employee.employeeId}
                              {employee.email ? ` · ${employee.email}` : ''}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs font-medium text-muted">
                  Leave type <span className="text-danger">*</span>
                  <div className="mt-1.5">
                    <CustomDropdown
                      id="leave-type"
                      name="leaveType"
                      options={LEAVE_TYPE_OPTIONS}
                      value={createForm.leaveType}
                      onChange={(value) =>
                        setCreateForm((current) => ({ ...current, leaveType: value }))
                      }
                      onBlur={() => { }}
                    />
                  </div>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted">
                    Start date <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <DatePicker
                        ariaLabel="Start date"
                        value={createForm.startDate}
                        max={createForm.endDate || undefined}
                        onChange={(next) => updateCreateDates('startDate', next)}
                      />
                    </div>
                  </label>
                  <label className="text-xs font-medium text-muted">
                    End date <span className="text-danger">*</span>
                    <div className="mt-1.5">
                      <DatePicker
                        ariaLabel="End date"
                        value={createForm.endDate}
                        min={createForm.startDate || undefined}
                        onChange={(next) => updateCreateDates('endDate', next)}
                      />
                    </div>
                  </label>
                </div>
                <label className="block text-xs font-medium text-muted">
                  Days requested
                  <input
                    type="number"
                    readOnly
                    tabIndex={-1}
                    value={createForm.daysRequested}
                    className="mt-1.5 h-10 w-full cursor-not-allowed rounded-lg border border-border px-3 text-sm text-muted shadow-none focus:outline-none focus:ring-0 [background:color-mix(in_oklab,var(--muted)_14%,var(--surface))] dark:[background:color-mix(in_oklab,var(--muted)_22%,var(--surface))]"
                    aria-readonly="true"
                    title="Calculated from start and end dates"
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Reason
                  <textarea
                    rows={3}
                    value={createForm.reason}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, reason: event.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    placeholder="Optional note for the request"
                  />
                </label>
                {createConflicts.length > 0 ? (
                  <DepartmentConflictBanner
                    department={selectedEmployee?.department || ''}
                    conflicts={createConflicts}
                    title="Team overlap"
                    description="Someone else in this department already has pending or approved leave on these dates. You can still create the request; HR will see the warning at approval."
                  />
                ) : null}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
            {createStep === 'form' && (
              <button
                type="button"
                onClick={() => {
                  setCreateStep('pick');
                  setSelectedEmployee(null);
                }}
                className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={closeCreate}
              className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
            >
              Cancel
            </button>
            {createStep === 'form' && (
              <button
                type="button"
                disabled={savingCreate}
                onClick={() => void saveCreate()}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
              >
                {savingCreate ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Create request'
                )}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
    : null;

  const reasonModal = actionModal
    ? createPortal(
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          if (!savingAction) setActionModal(null);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {actionModal.action === 'reject'
                ? 'Reject leave request'
                : actionModal.action === 'approve'
                  ? 'Approve with team overlap'
                  : 'Request changes'}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {actionModal.request.fullName || actionModal.request.employeeId}
            </p>
          </div>
          <div className="space-y-4 p-5">
            {actionModal.action === 'approve' ? (
              <DepartmentConflictBanner
                department={actionModal.request.department || ''}
                conflicts={actionModal.request.departmentConflicts || []}
                title="Team overlap"
                description="Approving this leave will put more than one person from the same department off on overlapping dates."
              />
            ) : (
              <label className="block text-xs font-medium text-muted">
                {actionModal.action === 'reject' ? 'Rejection reason' : 'Feedback'}{' '}
                <span className="text-danger">*</span>
                <textarea
                  autoFocus
                  rows={4}
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                  placeholder={
                    actionModal.action === 'reject'
                      ? 'Explain why this leave is rejected'
                      : 'What should HR/employee change before re-approval?'
                  }
                />
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              disabled={savingAction}
              onClick={() => setActionModal(null)}
              className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                savingAction ||
                (actionModal.action !== 'approve' && !actionReason.trim())
              }
              onClick={() => {
                setSavingAction(true);
                void runAction(
                  actionModal.request,
                  actionModal.action,
                  actionModal.action === 'approve' ? undefined : actionReason.trim()
                );
              }}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {actionModal.action === 'approve' ? 'Approve anyway' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
    : null;

  const detailModal = detailRequest
    ? createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
        onClick={() => setDetailRequest(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-request-detail-title"
          onClick={(event) => event.stopPropagation()}
          className="relative flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2
                id="leave-request-detail-title"
                className="truncate text-lg font-semibold tracking-tight text-ink"
              >
                {detailRequest.fullName || detailRequest.employeeId}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {detailRequest.employeeId}
                {detailRequest.department ? ` · ${detailRequest.department}` : ''}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${statusClasses(detailRequest.status, detailRequest.changesRequested)}`}
            >
              {statusLabel(detailRequest)}
            </span>
            <button
              type="button"
              onClick={() => setDetailRequest(null)}
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-lg border border-border bg-canvas/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Leave reason
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
                {detailRequest.reason?.trim() || 'No reason provided.'}
              </p>
            </div>

            {detailRequest.rejectionReason?.trim() ? (
              <div
                className={`rounded-lg border p-4 ${detailRequest.status === 'Rejected'
                  ? 'border-danger-border bg-danger-bg'
                  : 'border-border bg-canvas/40'
                  }`}
              >
                <p
                  className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${detailRequest.status === 'Rejected' ? 'text-danger' : 'text-muted'
                    }`}
                >
                  {detailRequest.status === 'Rejected' ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : (
                    <MessageSquareWarning className="h-3.5 w-3.5" />
                  )}
                  {detailRequest.status === 'Rejected'
                    ? 'Rejection reason'
                    : detailRequest.changesRequested
                      ? 'Changes requested'
                      : 'Review note'}
                </p>
                <p
                  className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed ${detailRequest.status === 'Rejected' ? 'text-danger' : 'text-ink'
                    }`}
                >
                  {detailRequest.rejectionReason}
                </p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-canvas/40 px-4 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {displayDate(detailRequest.startDate)} — {displayDate(detailRequest.endDate)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {detailRequest.daysRequested}{' '}
                    {Number(detailRequest.daysRequested) === 1 ? 'day' : 'days'}
                    {detailRequest.leaveType ? ` · ${detailRequest.leaveType} leave` : ''}
                  </p>
                </div>
              </div>
              <dl className="divide-y divide-border">
                <DetailRow label="Leave type" value={detailRequest.leaveType || '—'} />
                <DetailRow label="Days requested" value={String(detailRequest.daysRequested)} />
                <DetailRow label="Reviewed by" value={detailRequest.approvedBy?.trim() || '—'} />
                <DetailRow
                  label="Reviewed on"
                  value={
                    detailRequest.approvalDate ? displayDate(detailRequest.approvalDate) : '—'
                  }
                />
              </dl>
            </div>

            {(detailRequest.departmentConflicts?.length || 0) > 0 ? (
              <DepartmentConflictBanner
                department={detailRequest.department || ''}
                conflicts={detailRequest.departmentConflicts || []}
                title="Team overlap"
                description="Another person in this department has pending or approved leave on overlapping dates. Review before approving."
              />
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={() => setDetailRequest(null)}
              className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              Close
            </button>
            {canEdit && detailRequest.status === 'Pending' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDetailRequest(null);
                    setActionReason('');
                    setActionModal({ request: detailRequest, action: 'request_changes' });
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailRequest(null);
                    setActionReason('');
                    setActionModal({ request: detailRequest, action: 'reject' });
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-danger-border bg-danger-bg px-3.5 text-sm font-semibold text-danger transition-opacity hover:opacity-90"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  type="button"
                  disabled={actingId === detailRequest.requestId}
                  onClick={() => {
                    setDetailRequest(null);
                    if ((detailRequest.departmentConflicts?.length || 0) > 0) {
                      setActionModal({ request: detailRequest, action: 'approve' });
                      return;
                    }
                    void runAction(detailRequest, 'approve');
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
              </>
            ) : null}
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
            Leave Requests
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading && rows.length === 0
              ? 'Loading requests…'
              : `${rows.length} request${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => void openCreate()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          )}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <TableSkeleton columns={8} rows={8} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-5 w-5" />}
          title="No leave requests yet"
          description="Create a leave request on behalf of an employee to start approvals."
          actionLabel={canEdit ? 'Create' : undefined}
          onAction={canEdit ? () => void openCreate() : undefined}
          actionIcon={canEdit ? <Plus className="h-4 w-4" /> : undefined}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search employee, request ID, reference…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:w-44">
              <CustomDropdown
                id="leave-request-status-filter"
                name="statusFilter"
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                onBlur={() => { }}
              />
            </div>
            <div className="sm:w-40">
              <CustomDropdown
                id="leave-request-type-filter"
                name="typeFilter"
                options={typeFilterOptions}
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value);
                  setPage(1);
                }}
                onBlur={() => { }}
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setPage(1);
                }}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching requests"
              description="Try a different search or clear the filters."
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-5 py-3.5">Employee</th>
                        <th className="px-5 py-3.5">Type</th>
                        <th className="px-5 py-3.5">Dates</th>
                        <th className="px-5 py-3.5">Days</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5">Reason</th>
                        <th className="px-5 py-3.5">Overlap</th>
                        {canEdit && <th className="px-5 py-3.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedRows.map((row) => {
                        const busy = actingId === row.requestId;
                        const pending = row.status === 'Pending';
                        return (
                          <tr
                            key={row.requestId}
                            className="cursor-pointer hover:bg-canvas/70"
                            onClick={() => setDetailRequest(row)}
                          >
                            <td className="px-5 py-3.5">
                              <div className="font-medium">{row.fullName || row.employeeId}</div>
                            </td>
                            <td className="px-5 py-3.5">{row.leaveType}</td>
                            <td className="px-5 py-3.5">
                              <DateRangeCell start={row.startDate} end={row.endDate} />
                            </td>
                            <td className="px-5 py-3.5">{row.daysRequested}</td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusClasses(row.status, row.changesRequested)}`}
                              >
                                {statusLabel(row)}
                              </span>
                              {row.rejectionReason ? (
                                <div
                                  className="mt-1 max-w-[14rem] truncate text-xs text-muted"
                                  title={row.rejectionReason}
                                >
                                  {row.rejectionReason}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-5 py-3.5">
                              {row.reason?.trim() ? (
                                <div
                                  className="max-w-[16rem] truncate text-sm text-ink"
                                  title={row.reason}
                                >
                                  {row.reason}
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              {(row.departmentConflicts?.length || 0) > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-danger-border bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
                                  <TriangleAlert className="h-3 w-3" />
                                  {row.departmentConflicts?.length}
                                </span>
                              ) : (
                                <span className="text-muted">None</span>
                              )}
                            </td>
                            {canEdit && (
                              <td
                                className="px-5 py-3.5"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {pending ? (
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        if ((row.departmentConflicts?.length || 0) > 0) {
                                          setActionModal({ request: row, action: 'approve' });
                                          return;
                                        }
                                        void runAction(row, 'approve');
                                      }}
                                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-50"
                                    >
                                      {busy ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                      )}
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        setActionReason('');
                                        setActionModal({ request: row, action: 'request_changes' });
                                      }}
                                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-ink hover:bg-canvas disabled:opacity-50"
                                    >
                                      <MessageSquareWarning className="h-3.5 w-3.5" />
                                      Changes
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => {
                                        setActionReason('');
                                        setActionModal({ request: row, action: 'reject' });
                                      }}
                                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-danger-border bg-danger-bg px-2.5 text-xs font-semibold text-danger hover:opacity-90 disabled:opacity-50"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-right text-xs text-muted">
                                    {row.approvedBy || '—'}
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">
                  Showing {rangeStart}–{rangeEnd} of {filteredRows.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-[7.5rem]">
                    <CustomDropdown
                      id="leave-requests-page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={(value) => {
                        setPageSize(value);
                        setPage(1);
                      }}
                      onBlur={() => { }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <span className="min-w-[4.5rem] text-center text-xs font-medium text-muted">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {createModal}
      {reasonModal}
      {detailModal}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

function DepartmentConflictBanner({
  department,
  conflicts,
  title,
  description,
}: {
  department: string;
  conflicts: NonNullable<LeaveRequest['departmentConflicts']>;
  title: string;
  description: string;
}) {
  if (conflicts.length === 0) return null;
  return (
    <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-danger">
        <TriangleAlert className="h-3.5 w-3.5" />
        {title}
      </p>
      {department ? <p className="mt-1 text-xs font-medium text-ink">{department}</p> : null}
      <p className="mt-1.5 text-sm leading-relaxed text-ink">{description}</p>
      <ul className="mt-3 divide-y divide-danger-border/40 overflow-hidden rounded-md border border-danger-border/60 bg-surface">
        {conflicts.map((conflict) => (
          <li key={conflict.requestId} className="px-3 py-2.5">
            <p className="text-sm font-medium text-ink">{conflict.fullName}</p>
            <p className="mt-0.5 text-xs text-muted">
              {conflict.leaveType} · {conflict.status}
            </p>
            <p className="mt-0.5 text-xs text-ink">
              {displayDate(conflict.startDate)} – {displayDate(conflict.endDate)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
