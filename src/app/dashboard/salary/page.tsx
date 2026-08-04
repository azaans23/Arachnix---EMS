'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import CustomDropdown from '@/components/ui/Dropdown';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import {
  Database,
  RefreshCw,
  Pencil,
  ShieldAlert,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import { toSheetUser, type SheetUser } from '@/types/employee';
import type { SalaryDetailInput, SalaryDetailRecord } from '@/types/salary-slip';

type SortKey = 'fullName' | 'email' | 'designation' | 'department' | 'salary';
type SortDir = 'asc' | 'desc';
type CreateStep = 'pick' | 'form';

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' },
];

const SALARY_FORM_FIELDS = [
  { key: 'salary', label: 'Salary' },
  { key: 'allowance', label: 'Allowance' },
  { key: 'tax', label: 'Tax' },
  { key: 'accountNumber', label: 'Account Number' },
  { key: 'accountName', label: 'Account Name' },
  { key: 'bankName', label: 'Bank Name' },
] as const;

const SALARY_STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Processed', value: 'Processed' },
  { label: 'Paid', value: 'Paid' },
];

type SalaryFormFieldKey = (typeof SALARY_FORM_FIELDS)[number]['key'];

type EmployeeOption = SheetUser & {
  department: string;
  designation: string;
  emsStatus: string;
  baseSalary: string;
  bankAccountDetails: string;
};

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toEditForm(detail: SalaryDetailRecord): SalaryDetailInput {
  return {
    employeeId: detail.employeeId,
    salary: detail.salary,
    allowance: detail.allowance,
    tax: detail.tax,
    accountNumber: detail.accountNumber,
    accountName: detail.accountName,
    bankName: detail.bankName,
    period: detail.period,
    status: detail.status,
    totalEarning: detail.totalEarning,
    totalDeduction: detail.totalDeduction,
  };
}

function emptyCreateForm(employee: EmployeeOption, period: string): SalaryDetailInput {
  return {
    employeeId: employee.employeeId,
    salary: employee.baseSalary || '',
    allowance: '',
    tax: '',
    accountNumber: employee.bankAccountDetails || '',
    accountName: employee.name || '',
    bankName: '',
    period,
    status: 'Pending',
  };
}

function findExactSalary(
  employeeId: string,
  period: string,
  rows: SalaryDetailRecord[]
): SalaryDetailRecord | null {
  const key = employeeId.trim().toLowerCase();
  return (
    rows.find(
      (row) =>
        row.employeeId.trim().toLowerCase() === key &&
        (row.period || '').trim() === period.trim()
    ) || null
  );
}

function findLatestSalary(
  employeeId: string,
  rows: SalaryDetailRecord[]
): SalaryDetailRecord | null {
  const key = employeeId.trim().toLowerCase();
  const matches = rows
    .filter((row) => row.employeeId.trim().toLowerCase() === key)
    .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));
  return matches[0] || null;
}

function formatCurrency(value: unknown) {
  const num = Number(value);
  if (value === undefined || value === null || String(value).trim() === '') return '—';
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(num);
}

function statusBadgeClasses(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') {
    return 'border-border bg-canvas text-ink';
  }
  return 'border-border bg-surface text-muted';
}

function token() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

function uniqueSortedOptions(
  rows: SalaryDetailRecord[],
  pick: (row: SalaryDetailRecord) => string,
  allLabel: string
) {
  const values = Array.from(
    new Set(
      rows
        .map(pick)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return [{ label: allLabel, value: 'all' }, ...values.map((value) => ({ label: value, value }))];
}

function isSalaryRowComplete(row: SalaryDetailRecord) {
  return [row.salary, row.allowance, row.tax, row.accountNumber, row.accountName, row.bankName].every(
    (value) => String(value || '').trim() !== ''
  );
}

export default function SalaryPage() {
  const [rows, setRows] = useState<SalaryDetailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [designationFilter, setDesignationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [completenessFilter, setCompletenessFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState<SalaryDetailRecord | null>(null);
  const [editForm, setEditForm] = useState<SalaryDetailInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('pick');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDeptFilter, setEmployeeDeptFilter] = useState('all');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [createForm, setCreateForm] = useState<SalaryDetailInput | null>(null);
  const [createExisting, setCreateExisting] = useState<SalaryDetailRecord | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDetails = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await fetch('/api/salary-details', {
        headers: {
          Authorization: `Bearer ${token()}`,
        },
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Server returned status ${response.status}`);
      }

      const data = Array.isArray(result.data) ? result.data : [];
      setRows(data as SalaryDetailRecord[]);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to fetch salary details.';
      setErrorText(message);
      toast.error('Failed to load salary details.');
    } finally {
      setLoading(false);
    }
  };

  const departmentOptions = useMemo(
    () => uniqueSortedOptions(rows, (row) => row.department, 'All departments'),
    [rows]
  );
  const designationOptions = useMemo(
    () => uniqueSortedOptions(rows, (row) => row.designation, 'All designations'),
    [rows]
  );
  const statusOptions = useMemo(
    () =>
      uniqueSortedOptions(
        rows,
        (row) => row.status || row.emsStatus,
        'All statuses'
      ),
    [rows]
  );
  const periodOptions = useMemo(
    () => uniqueSortedOptions(rows, (row) => row.period || '', 'All periods'),
    [rows]
  );
  const completenessOptions = [
    { label: 'All completeness', value: 'all' },
    { label: 'Complete', value: 'complete' },
    { label: 'Incomplete', value: 'incomplete' },
  ];

  const hasActiveFilters =
    search.trim() !== '' ||
    departmentFilter !== 'all' ||
    designationFilter !== 'all' ||
    statusFilter !== 'all' ||
    periodFilter !== 'all' ||
    completenessFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('all');
    setDesignationFilter('all');
    setStatusFilter('all');
    setPeriodFilter('all');
    setCompletenessFilter('all');
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const filteredRows = useMemo(() => {
    let list = [...rows];
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter((row) => {
        const haystack = [
          row.fullName,
          row.email,
          row.employeeId,
          row.department,
          row.designation,
          row.role,
          row.bankName,
          row.accountName,
          row.accountNumber,
          row.phone,
          row.emsStatus,
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        return haystack.some((v) => v.includes(q));
      });
    }

    if (departmentFilter !== 'all') {
      list = list.filter(
        (row) => row.department.trim().toLowerCase() === departmentFilter.toLowerCase()
      );
    }

    if (designationFilter !== 'all') {
      list = list.filter(
        (row) => row.designation.trim().toLowerCase() === designationFilter.toLowerCase()
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter((row) => {
        const value = (row.status || row.emsStatus || '').trim().toLowerCase();
        return value === statusFilter.toLowerCase();
      });
    }

    if (periodFilter !== 'all') {
      list = list.filter(
        (row) => (row.period || '').trim().toLowerCase() === periodFilter.toLowerCase()
      );
    }

    if (completenessFilter === 'complete') {
      list = list.filter((row) => isSalaryRowComplete(row));
    } else if (completenessFilter === 'incomplete') {
      list = list.filter((row) => !isSalaryRowComplete(row));
    }

    list.sort((a, b) => {
      if (sortKey === 'salary') {
        const av = Number(a.salary) || 0;
        const bv = Number(b.salary) || 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const av = String(a[sortKey] || '').toLowerCase();
      const bv = String(b[sortKey] || '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [
    rows,
    search,
    departmentFilter,
    designationFilter,
    statusFilter,
    periodFilter,
    completenessFilter,
    sortKey,
    sortDir,
  ]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRows.slice(start, start + pageSizeNum);
  }, [filteredRows, currentPage, pageSizeNum]);

  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, designationFilter, statusFilter, periodFilter, completenessFilter, pageSize]);

  useEffect(() => {
    // Drop stale filter values if refreshed data no longer includes them.
    if (
      departmentFilter !== 'all' &&
      !departmentOptions.some((option) => option.value === departmentFilter)
    ) {
      setDepartmentFilter('all');
    }
    if (
      designationFilter !== 'all' &&
      !designationOptions.some((option) => option.value === designationFilter)
    ) {
      setDesignationFilter('all');
    }
    if (
      statusFilter !== 'all' &&
      !statusOptions.some((option) => option.value === statusFilter)
    ) {
      setStatusFilter('all');
    }
    if (
      periodFilter !== 'all' &&
      !periodOptions.some((option) => option.value === periodFilter)
    ) {
      setPeriodFilter('all');
    }
  }, [
    departmentFilter,
    designationFilter,
    statusFilter,
    periodFilter,
    departmentOptions,
    designationOptions,
    statusOptions,
    periodOptions,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user && session.access_token) {
        localStorage.setItem('token', session.access_token);
        let role = getTrustedRole(session.user);
        try {
          const synced = await syncSessionCookies(session.access_token);
          role = synced.role;
        } catch {
          /* keep JWT fallback */
        }
        const canView = canAccess(role, 'salary_slip_runs');
        setAllowed(canView);
        setCanEdit(canWrite(role, 'salary_slip_runs'));
        if (canView) {
          fetchDetails();
        }
      } else {
        setAllowed(false);
      }
    };
    checkRole();
  }, []);

  const openEdit = (row: SalaryDetailRecord) => {
    setEditing(row);
    setEditForm(toEditForm(row));
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const updateEditField = (field: SalaryFormFieldKey, value: string) => {
    setEditForm((current) => (current ? { ...current, [field]: value } : current));
  };

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
      const raw = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      setEmployees(
        raw.map((row: unknown) => {
          const record = mapRawToEmployee(row);
          const sheetUser = toSheetUser(record);
          return {
            ...sheetUser,
            department: record.department,
            designation: record.designation,
            emsStatus: record.emsStatus,
            baseSalary: record.baseSalary,
            bankAccountDetails: record.bankAccountDetails,
          } as EmployeeOption;
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
    setCreateExisting(null);
    setEmployeeSearch('');
    setEmployeeDeptFilter('all');
    setEmployeeStatusFilter('all');
    await loadEmployees();
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateStep('pick');
    setSelectedEmployee(null);
    setCreateForm(null);
    setCreateExisting(null);
  };

  const selectEmployeeForCreate = (employee: EmployeeOption, period = currentPeriod()) => {
    const exact = findExactSalary(employee.employeeId, period, rows);
    const latest = exact || findLatestSalary(employee.employeeId, rows);
    setSelectedEmployee(employee);
    setCreateExisting(exact);
    setCreateForm(
      exact
        ? { ...toEditForm(exact), period: exact.period || period }
        : latest
          ? {
              ...toEditForm(latest),
              period,
              status: latest.status || 'Pending',
            }
          : emptyCreateForm(employee, period)
    );
    setCreateStep('form');
  };

  const updateCreateField = (field: keyof SalaryDetailInput, value: string) => {
    setCreateForm((current) => {
      if (!current || !selectedEmployee) return current;
      if (field === 'period') {
        const exact = findExactSalary(selectedEmployee.employeeId, value, rows);
        setCreateExisting(exact);
        if (exact) {
          return { ...toEditForm(exact), period: value };
        }
        return { ...current, period: value };
      }
      return { ...current, [field]: value };
    });
  };

  const handleSave = async () => {
    if (!editForm) return;

    for (const field of SALARY_FORM_FIELDS) {
      if (!String(editForm[field.key] || '').trim()) {
        toast.error(`Enter ${field.label}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch('/api/salary-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ details: [editForm] }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update salary details.');
      }

      toast.success(result.message || 'Salary details updated.');
      closeEdit();
      await fetchDetails();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update salary details.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSave = async () => {
    if (!createForm || !selectedEmployee) return;

    if (!String(createForm.period || '').trim()) {
      toast.error('Enter a period (YYYY-MM).');
      return;
    }

    for (const field of SALARY_FORM_FIELDS) {
      if (!String(createForm[field.key] || '').trim()) {
        toast.error(`Enter ${field.label}.`);
        return;
      }
    }

    setSavingCreate(true);
    try {
      const response = await fetch('/api/salary-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ details: [createForm] }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save salary details.');
      }

      toast.success(
        createExisting
          ? result.message || 'Salary details updated.'
          : result.message || 'Salary details created.'
      );
      closeCreate();
      await fetchDetails();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save salary details.');
    } finally {
      setSavingCreate(false);
    }
  };

  const employeeDeptOptions = useMemo(() => {
    const values = Array.from(
      new Set(employees.map((employee) => employee.department.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return [
      { label: 'All departments', value: 'all' },
      ...values.map((value) => ({ label: value, value })),
    ];
  }, [employees]);

  const employeeStatusOptions = useMemo(() => {
    const values = Array.from(
      new Set(employees.map((employee) => employee.emsStatus.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return [
      { label: 'All statuses', value: 'all' },
      ...values.map((value) => ({ label: value, value })),
    ];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    let list = [...employees];
    const q = employeeSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((employee) => {
        const haystack = [
          employee.name,
          employee.email,
          employee.employeeId,
          employee.department,
          employee.designation,
          employee.role,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return haystack.some((value) => value.includes(q));
      });
    }
    if (employeeDeptFilter !== 'all') {
      list = list.filter(
        (employee) =>
          employee.department.trim().toLowerCase() === employeeDeptFilter.toLowerCase()
      );
    }
    if (employeeStatusFilter !== 'all') {
      list = list.filter(
        (employee) =>
          employee.emsStatus.trim().toLowerCase() === employeeStatusFilter.toLowerCase()
      );
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [employees, employeeSearch, employeeDeptFilter, employeeStatusFilter]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    }
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-ink" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-ink" />
    );
  };

  const SortableHeader = ({
    column,
    label,
  }: {
    column: SortKey;
    label: string;
  }) => (
    <th className="px-5 py-3.5 font-semibold">
      <button
        type="button"
        onClick={() => handleSort(column)}
        className={`inline-flex cursor-pointer items-center gap-1.5 transition-colors duration-150 hover:text-ink ${
          sortKey === column ? 'text-ink' : 'text-muted'
        }`}
      >
        {label}
        <SortIcon column={column} />
      </button>
    </th>
  );

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <TableSkeleton columns={6} rows={8} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center animate-scale-up">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Only Super Admin and HR Manager can view salary details.
        </p>
      </div>
    );
  }

  const recordLabel =
    loading && rows.length === 0
      ? 'Loading salary details…'
      : hasActiveFilters
        ? `${filteredRows.length} of ${rows.length} record${rows.length === 1 ? '' : 's'}`
        : `${rows.length} record${rows.length === 1 ? '' : 's'}`;

  const rangeStart =
    filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRows.length);

  const editModal =
    mounted && editing && editForm
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-salary-title"
              className="flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="edit-salary-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Edit salary details
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {editing.fullName || editing.employeeId}
                    {editing.designation ? ` · ${editing.designation}` : ''}
                    {editing.department ? ` · ${editing.department}` : ''}
                    {editing.period ? ` · ${editing.period}` : ''}
                  </p>
                  {editing.email ? (
                    <p className="mt-0.5 text-xs text-muted">{editing.email}</p>
                  ) : null}
                  {(editing.baseSalary || editing.totalEarning) && (
                    <p className="mt-1.5 text-xs text-muted">
                      {editing.baseSalary
                        ? `Base ${formatCurrency(editing.baseSalary)}`
                        : ''}
                      {editing.baseSalary && editing.totalEarning ? ' · ' : ''}
                      {editing.totalEarning
                        ? `Earning ${formatCurrency(editing.totalEarning)}`
                        : ''}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {SALARY_FORM_FIELDS.map((field) => (
                    <label key={field.key} className="block text-xs">
                      <span className="mb-1 block font-medium text-muted">{field.label}</span>
                      <input
                        type="text"
                        value={editForm[field.key]}
                        onChange={(e) => updateEditField(field.key, e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                        placeholder={`Enter ${field.label}`}
                      />
                    </label>
                  ))}
                </div>
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
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const createModal =
    mounted && createOpen
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-salary-title"
              className="flex max-h-[min(90vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="create-salary-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    {createStep === 'pick'
                      ? 'Select employee'
                      : createExisting
                        ? 'Update salary details'
                        : 'Create salary details'}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {createStep === 'pick'
                      ? 'Search and filter employees, then choose one to create or update salary info.'
                      : selectedEmployee
                        ? `${selectedEmployee.name || selectedEmployee.employeeId}${
                            selectedEmployee.designation
                              ? ` · ${selectedEmployee.designation}`
                              : ''
                          }${
                            selectedEmployee.department
                              ? ` · ${selectedEmployee.department}`
                              : ''
                          }`
                        : 'Enter salary details for the selected employee.'}
                  </p>
                  {createStep === 'form' && selectedEmployee?.email ? (
                    <p className="mt-0.5 text-xs text-muted">{selectedEmployee.email}</p>
                  ) : null}
                  {createStep === 'form' && createExisting ? (
                    <p className="mt-1.5 text-xs font-medium text-ink">
                      Existing record for {createExisting.period || 'this period'} — values
                      prefilled below.
                    </p>
                  ) : null}
                  {createStep === 'form' && !createExisting && createForm?.period ? (
                    <p className="mt-1.5 text-xs text-muted">
                      No salary row for {createForm.period} yet — saving will create one.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {createStep === 'pick' ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
                        <input
                          type="search"
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          placeholder="Search name, email, ID, designation…"
                          className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:flex sm:w-auto sm:shrink-0">
                        <div className="sm:w-44">
                          <CustomDropdown
                            id="create-employee-dept"
                            name="employeeDeptFilter"
                            options={employeeDeptOptions}
                            value={employeeDeptFilter}
                            onChange={setEmployeeDeptFilter}
                            onBlur={() => {}}
                            placeholder="All departments"
                          />
                        </div>
                        <div className="sm:w-40">
                          <CustomDropdown
                            id="create-employee-status"
                            name="employeeStatusFilter"
                            options={employeeStatusOptions}
                            value={employeeStatusFilter}
                            onChange={setEmployeeStatusFilter}
                            onBlur={() => {}}
                            placeholder="All statuses"
                          />
                        </div>
                      </div>
                    </div>

                    {employeesLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading employees…
                      </div>
                    ) : filteredEmployees.length === 0 ? (
                      <div className="rounded-lg border border-border bg-canvas px-4 py-10 text-center text-sm text-muted">
                        No employees match these filters.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-border">
                        <div className="max-h-[min(50vh,24rem)] overflow-y-auto">
                          <table className="w-full border-collapse text-left text-sm">
                            <thead className="sticky top-0 bg-canvas">
                              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Department</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {filteredEmployees.map((employee) => {
                                const hasSalary = Boolean(
                                  findLatestSalary(employee.employeeId, rows)
                                );
                                return (
                                  <tr
                                    key={employee.employeeId || employee.email}
                                    className="hover:bg-canvas/70"
                                  >
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-ink">
                                        {employee.name || 'N/A'}
                                      </div>
                                      <div className="mt-0.5 text-xs text-muted">
                                        {employee.employeeId || '—'}
                                        {employee.email ? ` · ${employee.email}` : ''}
                                      </div>
                                      {employee.designation ? (
                                        <div className="mt-0.5 text-xs text-muted">
                                          {employee.designation}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3 text-muted">
                                      {employee.department || '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {employee.emsStatus ? (
                                          <span
                                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClasses(employee.emsStatus)}`}
                                          >
                                            {employee.emsStatus}
                                          </span>
                                        ) : (
                                          <span className="text-muted">—</span>
                                        )}
                                        {hasSalary ? (
                                          <span className="inline-flex items-center rounded-md border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">
                                            Has salary
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => selectEmployeeForCreate(employee)}
                                        className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-ink hover:bg-canvas"
                                      >
                                        Select
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : createForm ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-medium text-muted">
                          Period (YYYY-MM)
                        </span>
                        <input
                          type="month"
                          value={createForm.period || ''}
                          onChange={(e) => updateCreateField('period', e.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                        />
                      </label>
                      <div className="block text-xs">
                        <span className="mb-1 block font-medium text-muted">Status</span>
                        <CustomDropdown
                          id="create-salary-status"
                          name="createSalaryStatus"
                          options={SALARY_STATUS_OPTIONS}
                          value={createForm.status || 'Pending'}
                          onChange={(value) => updateCreateField('status', value)}
                          onBlur={() => {}}
                          placeholder="Status"
                        />
                      </div>
                      {SALARY_FORM_FIELDS.map((field) => (
                        <label key={field.key} className="block text-xs">
                          <span className="mb-1 block font-medium text-muted">{field.label}</span>
                          <input
                            type="text"
                            value={createForm[field.key] || ''}
                            onChange={(e) => updateCreateField(field.key, e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                            placeholder={`Enter ${field.label}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-border px-5 py-4">
                <div>
                  {createStep === 'form' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCreateStep('pick');
                        setSelectedEmployee(null);
                        setCreateForm(null);
                        setCreateExisting(null);
                      }}
                      className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                    >
                      Back
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={closeCreate}
                    className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                  >
                    Cancel
                  </button>
                  {createStep === 'form' ? (
                    <button
                      type="button"
                      onClick={() => void handleCreateSave()}
                      disabled={savingCreate}
                      className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                    >
                      {savingCreate ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : createExisting ? (
                        'Update salary'
                      ) : (
                        'Create salary'
                      )}
                    </button>
                  ) : null}
                </div>
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
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Payroll</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Salary
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {recordLabel}
            {errorText ? ` · Sync issue` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={() => void openCreate()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Create salary detail
            </button>
          ) : null}
          <button
            type="button"
            onClick={fetchDetails}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <TableSkeleton columns={8} rows={8} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title="No salary details found"
          description={
            canEdit
              ? 'Create a salary detail for an employee, or sync again if records should already exist.'
              : 'No payroll rows were retrieved. Confirm the sheet has records, then sync again.'
          }
          actionLabel={canEdit ? 'Create salary detail' : 'Retry sync'}
          onAction={canEdit ? () => void openCreate() : fetchDetails}
          actionIcon={canEdit ? <Plus className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, ID, designation, department…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:flex lg:w-auto lg:shrink-0 lg:gap-3">
              <div className="lg:w-44">
                <CustomDropdown
                  id="department-filter"
                  name="departmentFilter"
                  options={departmentOptions}
                  value={departmentFilter}
                  onChange={setDepartmentFilter}
                  onBlur={() => {}}
                  placeholder="All departments"
                />
              </div>
              <div className="lg:w-44">
                <CustomDropdown
                  id="designation-filter"
                  name="designationFilter"
                  options={designationOptions}
                  value={designationFilter}
                  onChange={setDesignationFilter}
                  onBlur={() => {}}
                  placeholder="All designations"
                />
              </div>
              <div className="lg:w-40">
                <CustomDropdown
                  id="status-filter"
                  name="statusFilter"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  onBlur={() => {}}
                  placeholder="All statuses"
                />
              </div>
              <div className="lg:w-40">
                <CustomDropdown
                  id="period-filter"
                  name="periodFilter"
                  options={periodOptions}
                  value={periodFilter}
                  onChange={setPeriodFilter}
                  onBlur={() => {}}
                  placeholder="All periods"
                />
              </div>
              <div className="lg:w-44">
                <CustomDropdown
                  id="completeness-filter"
                  name="completenessFilter"
                  options={completenessOptions}
                  value={completenessFilter}
                  onChange={setCompletenessFilter}
                  onBlur={() => {}}
                  placeholder="All completeness"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors duration-200 hover:border-ink/25 hover:text-ink sm:shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching records"
              description="Try a different search or clear the filter to see all salary details."
              actionLabel="Clear filters"
              onAction={clearFilters}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <SortableHeader column="fullName" label="Name" />
                        <SortableHeader column="email" label="Email" />
                        <SortableHeader column="designation" label="Designation" />
                        <SortableHeader column="department" label="Department" />
                        <SortableHeader column="salary" label="Salary" />
                        <th className="px-5 py-3.5 font-semibold text-muted">Allowance</th>
                        <th className="px-5 py-3.5 font-semibold text-muted">Tax</th>
                        <th className="px-5 py-3.5 font-semibold text-muted">Bank</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedRows.map((row, idx) => {
                        const status = row.status || row.emsStatus || '';
                        return (
                          <tr
                            key={row.employeeId || row.email || idx}
                            className="transition-colors duration-150 hover:bg-canvas/70"
                          >
                            <td className="px-5 py-3.5">
                              <div className="font-medium">{row.fullName || 'N/A'}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                <span>{row.employeeId || '—'}</span>
                                {row.period ? (
                                  <span className="inline-flex items-center rounded-md border border-border bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">
                                    {row.period}
                                  </span>
                                ) : null}
                                {status ? (
                                  <span
                                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClasses(status)}`}
                                  >
                                    {status}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-muted">{row.email || '—'}</td>
                            <td className="px-5 py-3.5 text-muted">
                              {row.designation || '—'}
                            </td>
                            <td className="px-5 py-3.5 text-muted">
                              {row.department || '—'}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="font-medium">{formatCurrency(row.salary)}</div>
                              {row.totalEarning ? (
                                <div className="mt-0.5 text-xs text-muted">
                                  Net {formatCurrency(row.totalEarning)}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-5 py-3.5 text-muted">
                              {formatCurrency(row.allowance)}
                            </td>
                            <td className="px-5 py-3.5 text-muted">
                              {formatCurrency(row.tax)}
                            </td>
                            <td className="px-5 py-3.5 text-muted">
                              <div>{row.bankName || '—'}</div>
                              {row.accountName ? (
                                <div className="mt-0.5 text-xs text-muted/80">
                                  {row.accountName}
                                </div>
                              ) : null}
                              {row.accountNumber ? (
                                <div className="mt-0.5 text-xs text-muted/80">
                                  {row.accountNumber}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => openEdit(row)}
                                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors duration-150 hover:border-ink/30 hover:text-ink"
                                  title="Edit salary details"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                                  View only
                                </span>
                              )}
                            </td>
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
                      id="page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={setPageSize}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {editModal}
      {createModal}
    </div>
  );
}
