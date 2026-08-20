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
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import { toSheetUser, type SheetUser } from '@/types/employee';
import {
  LEAVE_BALANCE_FIELDS,
  buildLeaveId,
  reconcileLeaveBalance,
  remainingLeaveDays,
  validateLeaveBalanceRules,
  type LeaveBalanceFieldKey,
  type LeaveBalanceInput,
  type LeaveBalanceRecord,
} from '@/types/leave-balance';

type EmployeeOption = SheetUser & {
  department: string;
  designation: string;
  emsStatus: string;
};

type FormState = {
  leaveId: string;
  employeeId: string;
  year: string;
  annualQuota: string;
  annualUsed: string;
  sickQuota: string;
  sickUsed: string;
  casualQuota: string;
  casualUsed: string;
  carryForwardDays: string;
};

type CreateStep = 'pick' | 'form';

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
];

const inputClassName =
  'mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]';

function token() {
  return localStorage.getItem('token');
}

function currentYear() {
  return new Date().getFullYear();
}

function yearOptions() {
  const year = currentYear();
  return [year - 1, year, year + 1].map((value) => ({
    label: String(value),
    value: String(value),
  }));
}

function emptyForm(employeeId = '', year = String(currentYear())): FormState {
  return {
    leaveId: buildLeaveId(employeeId, year),
    employeeId,
    year,
    annualQuota: '0',
    annualUsed: '0',
    sickQuota: '0',
    sickUsed: '0',
    casualQuota: '0',
    casualUsed: '0',
    carryForwardDays: '0',
  };
}

function toForm(row: LeaveBalanceInput): FormState {
  return {
    leaveId: row.leaveId || buildLeaveId(row.employeeId, row.year),
    employeeId: row.employeeId,
    year: String(row.year),
    annualQuota: String(row.annualQuota),
    annualUsed: String(row.annualUsed),
    sickQuota: String(row.sickQuota),
    sickUsed: String(row.sickUsed),
    casualQuota: String(row.casualQuota),
    casualUsed: String(row.casualUsed),
    carryForwardDays: String(row.carryForwardDays),
  };
}

function formatDays(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formNumbers(form: FormState): Omit<LeaveBalanceInput, 'leaveId' | 'employeeId' | 'year'> {
  const read = (key: LeaveBalanceFieldKey) => {
    const value = Number(form[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return {
    annualQuota: read('annualQuota'),
    annualUsed: read('annualUsed'),
    sickQuota: read('sickQuota'),
    sickUsed: read('sickUsed'),
    casualQuota: read('casualQuota'),
    casualUsed: read('casualUsed'),
    carryForwardDays: read('carryForwardDays'),
  };
}

/**
 * Applies one field edit and rewrites the sibling inputs with the reconciled
 * values, reporting which of them the rules had to move.
 */
function applyBalanceFieldChange(
  form: FormState,
  field: keyof FormState,
  value: string
): { form: FormState; adjusted: LeaveBalanceFieldKey[] } {
  if (field === 'leaveId' || field === 'employeeId' || field === 'year') {
    const next = { ...form, [field]: value };
    next.leaveId = buildLeaveId(next.employeeId, next.year);
    return { form: next, adjusted: [] };
  }

  const draft: FormState = { ...form, [field]: value };
  if (!LEAVE_BALANCE_FIELDS.some((item) => item.key === field)) {
    return { form: draft, adjusted: [] };
  }

  // Allow incomplete typing (e.g. blank or trailing ".") without forcing siblings yet.
  if (value.trim() === '' || value.endsWith('.')) {
    return { form: draft, adjusted: [] };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { form: draft, adjusted: [] };
  }

  const editedKey = field as LeaveBalanceFieldKey;
  const before = formNumbers(draft);
  const reconciled = reconcileLeaveBalance(
    {
      leaveId: draft.leaveId,
      employeeId: draft.employeeId,
      year: Number(draft.year) || currentYear(),
      ...before,
      [editedKey]: parsed,
    },
    editedKey
  );

  const next: FormState = { ...draft };
  const adjusted: LeaveBalanceFieldKey[] = [];
  for (const item of LEAVE_BALANCE_FIELDS) {
    const reconciledValue = reconciled[item.key];
    // The edited box keeps exactly what was typed unless the rules changed it.
    if (item.key === editedKey) {
      next[item.key] = reconciledValue === parsed ? value : formatDays(reconciledValue);
    } else {
      next[item.key] = formatDays(reconciledValue);
    }
    if (reconciledValue !== before[item.key]) adjusted.push(item.key);
  }

  return { form: next, adjusted };
}

export default function LeaveBalancesPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<LeaveBalanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('pick');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [createForm, setCreateForm] = useState<FormState | null>(null);
  const [createAdjusted, setCreateAdjusted] = useState<LeaveBalanceFieldKey[]>([]);
  const [savingCreate, setSavingCreate] = useState(false);

  const [editing, setEditing] = useState<LeaveBalanceRecord | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [editAdjusted, setEditAdjusted] = useState<LeaveBalanceFieldKey[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leave-balances', {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load leave balances.');
      }
      setRows(Array.isArray(result.data) ? result.data : []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load leave balances.');
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
      const canView = canAccess(role, 'leave_balances');
      setCanEdit(canWrite(role, 'leave_balances'));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const yearFilterOptions = useMemo(() => {
    const years = Array.from(new Set(rows.map((row) => String(row.year)))).sort(
      (a, b) => Number(b) - Number(a)
    );
    return [
      { label: 'All years', value: 'all' },
      ...years.map((year) => ({ label: year, value: year })),
    ];
  }, [rows]);

  const departmentOptions = useMemo(() => {
    const departments = Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b)
    );
    return [
      { label: 'All departments', value: 'all' },
      ...departments.map((department) => ({ label: department, value: department })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        [row.fullName, row.email, row.employeeId, row.department, row.designation, String(row.year)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }
    if (yearFilter !== 'all') {
      list = list.filter((row) => String(row.year) === yearFilter);
    }
    if (departmentFilter !== 'all') {
      list = list.filter((row) => row.department === departmentFilter);
    }
    return list;
  }, [rows, search, yearFilter, departmentFilter]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSizeNum));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRows.slice(start, start + pageSizeNum);
  }, [filteredRows, currentPage, pageSizeNum]);
  const rangeStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRows.length);
  const hasActiveFilters =
    search.trim() !== '' || yearFilter !== 'all' || departmentFilter !== 'all';

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
    setCreateForm(null);
    setCreateAdjusted([]);
    setEmployeeSearch('');
    await loadEmployees();
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateStep('pick');
    setSelectedEmployee(null);
    setCreateForm(null);
    setCreateAdjusted([]);
  };

  const selectEmployeeForCreate = (employee: EmployeeOption) => {
    setSelectedEmployee(employee);
    setCreateStep('form');
    const year = currentYear();
    const existing = rows.find(
      (row) =>
        row.employeeId.trim().toLowerCase() === employee.employeeId.trim().toLowerCase() &&
        row.year === year
    );
    setCreateForm(existing ? toForm(existing) : emptyForm(employee.employeeId, String(year)));
    setCreateAdjusted([]);
  };

  const updateCreateField = (field: keyof FormState, value: string) => {
    if (!selectedEmployee) return;
    if (field === 'year') {
      const year = Number(value);
      const existing = rows.find(
        (row) =>
          row.employeeId.trim().toLowerCase() ===
            selectedEmployee.employeeId.trim().toLowerCase() && row.year === year
      );
      setCreateForm(existing ? toForm(existing) : emptyForm(selectedEmployee.employeeId, value));
      setCreateAdjusted([]);
      return;
    }

    setCreateForm((current) => {
      if (!current) return current;
      const result = applyBalanceFieldChange(current, field, value);
      setCreateAdjusted(result.adjusted.filter((key) => key !== field));
      return result.form;
    });
  };

  const openEdit = (row: LeaveBalanceRecord) => {
    setEditing(row);
    setEditForm(toForm(row));
    setEditAdjusted([]);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
    setEditAdjusted([]);
  };

  const updateEditField = (field: keyof FormState, value: string) => {
    setEditForm((current) => {
      if (!current) return current;
      const result = applyBalanceFieldChange(current, field, value);
      setEditAdjusted(result.adjusted.filter((key) => key !== field));
      return result.form;
    });
  };

  const parseForm = (form: FormState): LeaveBalanceInput | null => {
    const year = Number(form.year);
    if (!form.employeeId.trim()) {
      toast.error('Select an employee.');
      return null;
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      toast.error('Enter a valid year.');
      return null;
    }

    const numbers: Record<LeaveBalanceFieldKey, number> = {
      annualQuota: 0,
      annualUsed: 0,
      sickQuota: 0,
      sickUsed: 0,
      casualQuota: 0,
      casualUsed: 0,
      carryForwardDays: 0,
    };

    for (const field of LEAVE_BALANCE_FIELDS) {
      const raw = form[field.key];
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        toast.error(`${field.label} must be zero or more.`);
        return null;
      }
      numbers[field.key] = value;
    }

    const payload: LeaveBalanceInput = {
      leaveId: form.leaveId.trim() || buildLeaveId(form.employeeId, year),
      employeeId: form.employeeId.trim(),
      year,
      ...numbers,
    };

    const ruleError = validateLeaveBalanceRules(payload);
    if (ruleError) {
      toast.error(ruleError);
      return null;
    }

    return payload;
  };

  const saveBalance = async (
    form: FormState,
    setSaving: (value: boolean) => void,
    onDone: () => void
  ) => {
    const payload = parseForm(form);
    if (!payload) return;

    setSaving(true);
    try {
      const response = await fetch('/api/leave-balances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save leave balance.');
      }
      toast.success(result.message || 'Leave balance saved.');
      onDone();
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save leave balance.');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.employeeId,
        employee.department,
        employee.designation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [employees, employeeSearch]);

  const renderBalanceFields = (
    form: FormState,
    onChange: (field: keyof FormState, value: string) => void,
    adjusted: LeaveBalanceFieldKey[],
    options?: { lockEmployee?: boolean; lockYear?: boolean }
  ) => {
    const live: LeaveBalanceInput = {
      leaveId: form.leaveId,
      employeeId: form.employeeId,
      year: Number(form.year) || currentYear(),
      ...formNumbers(form),
    };
    const annualLeft = Math.max(0, live.annualQuota - live.annualUsed);
    const hint: Record<LeaveBalanceFieldKey, string> = {
      annualQuota: `${formatDays(annualLeft)} of ${formatDays(live.annualQuota)} still available`,
      annualUsed: `Sick + Casual used = ${formatDays(live.sickUsed + live.casualUsed)}`,
      sickQuota: `${formatDays(live.sickQuota + live.casualQuota)} of ${formatDays(live.annualQuota)} allocated to Sick + Casual`,
      sickUsed: `${formatDays(remainingLeaveDays('sick', live)?.remaining ?? 0)} sick days left`,
      casualQuota: `${formatDays(live.sickQuota + live.casualQuota)} of ${formatDays(live.annualQuota)} allocated to Sick + Casual`,
      casualUsed: `${formatDays(remainingLeaveDays('casual', live)?.remaining ?? 0)} casual days left`,
      carryForwardDays: 'Days carried over from the previous year',
    };

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted">
            Leave ID
            <input
              value={form.leaveId || buildLeaveId(form.employeeId, form.year)}
              readOnly
              className={`${inputClassName} bg-canvas text-muted`}
            />
          </label>
          <label className="text-xs font-medium text-muted">
            Employee ID
            <input
              value={form.employeeId}
              readOnly={options?.lockEmployee}
              onChange={(event) => onChange('employeeId', event.target.value)}
              className={`${inputClassName} ${options?.lockEmployee ? 'bg-canvas text-muted' : ''}`}
            />
          </label>
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Year <span className="text-danger">*</span>
            {options?.lockYear ? (
              <input
                value={form.year}
                readOnly
                className={`${inputClassName} bg-canvas text-muted`}
              />
            ) : (
              <div className="mt-1.5">
                <CustomDropdown
                  id="leave-balance-year"
                  name="year"
                  options={yearOptions()}
                  value={form.year}
                  onChange={(value) => onChange('year', value)}
                  onBlur={() => {}}
                />
              </div>
            )}
          </label>
        </div>

        <p className="rounded-md border border-border bg-canvas/60 px-3 py-2 text-xs text-muted">
          Total Leaves (Annual) is the overall pool. Sick and Casual quotas sit inside it. Changing
          any value auto-adjusts the others so Sick + Casual stay within Total Leaves, and used days
          stay within their quotas.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {LEAVE_BALANCE_FIELDS.map((field) => {
            const wasAdjusted = adjusted.includes(field.key);
            return (
              <label key={field.key} className="text-xs font-medium text-muted">
                <span className="flex items-center justify-between gap-2">
                  <span>
                    {field.label} <span className="text-danger">*</span>
                  </span>
                  {wasAdjusted && (
                    <span className="rounded border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                      Auto-adjusted
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={form[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  className={`${inputClassName} ${wasAdjusted ? 'border-ink/40 bg-canvas' : ''}`}
                />
                <span className="mt-1 block text-[11px] font-normal text-muted/80">
                  {hint[field.key]}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

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
          Only Super Admin, Admin, and HR Manager can manage leave balances.
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
            aria-labelledby="create-leave-balance-title"
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2
                  id="create-leave-balance-title"
                  className="text-lg font-semibold tracking-tight text-ink"
                >
                  {createStep === 'pick' ? 'Select employee' : 'Create leave balance'}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {createStep === 'pick'
                    ? 'Choose an employee, then set quotas for the year.'
                    : selectedEmployee
                      ? `${selectedEmployee.name || selectedEmployee.employeeId} · ${selectedEmployee.email || 'No email'}`
                      : 'Enter leave quotas and usage.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
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
                            onClick={() => selectEmployeeForCreate(employee)}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink">
                                {employee.name || employee.employeeId}
                              </span>
                              <span className="block truncate text-xs text-muted">
                                {employee.employeeId}
                                {employee.email ? ` · ${employee.email}` : ''}
                                {employee.department ? ` · ${employee.department}` : ''}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : createForm ? (
                renderBalanceFields(createForm, updateCreateField, createAdjusted, {
                  lockEmployee: true,
                })
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
              {createStep === 'form' && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateStep('pick');
                    setSelectedEmployee(null);
                    setCreateForm(null);
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
              {createStep === 'form' && createForm && (
                <button
                  type="button"
                  disabled={savingCreate}
                  onClick={() => void saveBalance(createForm, setSavingCreate, closeCreate)}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
                >
                  {savingCreate ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save leave balance'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  const editModal =
    editing && editForm
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
            onClick={closeEdit}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-leave-balance-title"
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="edit-leave-balance-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Update leave balance
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {editing.fullName || editing.employeeId} · {editing.year}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {renderBalanceFields(
                  editForm,
                  (field, value) => updateEditField(field, value),
                  editAdjusted,
                  { lockEmployee: true, lockYear: true }
                )}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() => void saveBalance(editForm, setSavingEdit, closeEdit)}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Update'
                  )}
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
            Leave Balances
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading && rows.length === 0
              ? 'Loading balances…'
              : `${rows.length} balance${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => void openCreate()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          )}
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full sm:w-40" />
            <Skeleton className="h-10 w-full sm:w-44" />
          </div>
          <TableSkeleton columns={9} rows={8} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-5 w-5" />}
          title="No leave balances yet"
          description="Create a leave balance for an employee to track annual, sick, and casual quotas."
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
                placeholder="Search name, ID, email, department…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:w-36">
              <CustomDropdown
                id="leave-year-filter"
                name="yearFilter"
                options={yearFilterOptions}
                value={yearFilter}
                onChange={(value) => {
                  setYearFilter(value);
                  setPage(1);
                }}
                onBlur={() => {}}
                placeholder="All years"
              />
            </div>
            <div className="sm:w-44">
              <CustomDropdown
                id="leave-department-filter"
                name="departmentFilter"
                options={departmentOptions}
                value={departmentFilter}
                onChange={(value) => {
                  setDepartmentFilter(value);
                  setPage(1);
                }}
                onBlur={() => {}}
                placeholder="All departments"
              />
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setYearFilter('all');
                  setDepartmentFilter('all');
                  setPage(1);
                }}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors hover:text-ink sm:shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching balances"
              description="Try a different search or clear the filters."
              actionLabel="Clear filters"
              onAction={() => {
                setSearch('');
                setYearFilter('all');
                setDepartmentFilter('all');
                setPage(1);
              }}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-5 py-3.5">Employee</th>
                        <th className="px-5 py-3.5">Year</th>
                        <th className="px-5 py-3.5">Total (Annual)</th>
                        <th className="px-5 py-3.5">Sick</th>
                        <th className="px-5 py-3.5">Casual</th>
                        <th className="px-5 py-3.5">Carry Forward</th>
                        {canEdit && <th className="px-5 py-3.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedRows.map((row) => (
                        <tr
                          key={row.leaveId || `${row.employeeId}-${row.year}`}
                          className="transition-colors duration-150 hover:bg-canvas/70"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-medium">{row.fullName || row.employeeId}</div>
                            <div className="text-xs text-muted">
                              {row.leaveId || buildLeaveId(row.employeeId, row.year)}
                              {row.department ? ` · ${row.department}` : ''}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">{row.year}</td>
                          <td className="px-5 py-3.5 text-muted">
                            <div>
                              {formatDays(row.annualUsed)} / {formatDays(row.annualQuota)} used
                            </div>
                            <div className="text-xs">
                              {formatDays(remainingLeaveDays('annual', row)?.remaining ?? 0)} left
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-muted">
                            <div>
                              {formatDays(row.sickUsed)} / {formatDays(row.sickQuota)} used
                            </div>
                            <div className="text-xs">
                              {formatDays(remainingLeaveDays('sick', row)?.remaining ?? 0)} left
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-muted">
                            <div>
                              {formatDays(row.casualUsed)} / {formatDays(row.casualQuota)} used
                            </div>
                            <div className="text-xs">
                              {formatDays(remainingLeaveDays('casual', row)?.remaining ?? 0)} left
                            </div>
                          </td>
                          <td className="px-5 py-3.5">{formatDays(row.carryForwardDays)}</td>
                          {canEdit && (
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Update
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
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
                      id="leave-balances-page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={(value) => {
                        setPageSize(value);
                        setPage(1);
                      }}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
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
      {editModal}
    </div>
  );
}
