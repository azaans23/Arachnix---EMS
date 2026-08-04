'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import CustomDropdown from '@/components/ui/Dropdown';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import {
  hasPayrollSalary,
  parseBaseSalary,
  payrollEligibilityReason,
} from '@/lib/payroll/generate';
import { toSheetUser, type SheetUser } from '@/types/employee';
import type {
  IncompleteSalaryDetail,
  SalaryDetailInput,
  SalaryDetailRecord,
  SalaryRunExtraInput,
  SalarySlipRun,
} from '@/types/salary-slip';

type PayrollEmployee = SheetUser & {
  eligible: boolean;
  reason: string | null;
  salaryLabel: string;
};

const MONTH_OPTIONS = [
  { label: 'January', value: '1' },
  { label: 'February', value: '2' },
  { label: 'March', value: '3' },
  { label: 'April', value: '4' },
  { label: 'May', value: '5' },
  { label: 'June', value: '6' },
  { label: 'July', value: '7' },
  { label: 'August', value: '8' },
  { label: 'September', value: '9' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Partial', value: 'partial' },
  { label: 'Failed', value: 'failed' },
];

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' },
];

function currentYearOptions() {
  const year = new Date().getFullYear();
  return [year - 1, year, year + 1].map((value) => ({
    label: String(value),
    value: String(value),
  }));
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'border-border bg-success/10 text-success';
    case 'failed':
      return 'border-danger-border bg-danger-bg text-danger';
    default:
      return 'border-border bg-canvas text-ink';
  }
}

function displayDate(value: string) {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PK', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function monthLabel(month: number) {
  return MONTH_OPTIONS.find((option) => option.value === String(month))?.label || String(month);
}

const SALARY_FORM_FIELDS = [
  { key: 'salary', label: 'Salary', missing: 'Salary' },
  { key: 'allowance', label: 'Allowance', missing: 'Allowance' },
  { key: 'tax', label: 'Tax', missing: 'Tax' },
  { key: 'accountNumber', label: 'Account Number', missing: 'Account Number' },
  { key: 'accountName', label: 'Account Name', missing: 'Account Name' },
  { key: 'bankName', label: 'Bank Name', missing: 'Bank Name' },
] as const;

type SalaryFormFieldKey = (typeof SALARY_FORM_FIELDS)[number]['key'];

const EARNING_EXTRA_FIELDS = [
  { key: 'overtimePay', label: 'Overtime Pay' },
  { key: 'performanceBonus', label: 'Performance Bonus' },
] as const;

const DEDUCTION_EXTRA_FIELDS = [
  { key: 'contribution', label: 'Contribution' },
  { key: 'others', label: 'Others' },
] as const;

type ExtraFormFieldKey =
  | (typeof EARNING_EXTRA_FIELDS)[number]['key']
  | (typeof DEDUCTION_EXTRA_FIELDS)[number]['key'];

function emptyExtraForm(employeeId: string): SalaryRunExtraInput {
  return {
    employeeId,
    overtimePay: '',
    performanceBonus: '',
    contribution: '',
    others: '',
  };
}

function buildExtraForms(
  employeeIds: string[],
  details: SalaryDetailRecord[],
  employees: PayrollEmployee[]
): SalaryRunExtraInput[] {
  const detailById = new Map(
    details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail])
  );
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
  );

  return employeeIds.map((employeeId) => {
    const key = employeeId.trim().toLowerCase();
    const detail = detailById.get(key);
    const employee = employeeById.get(key);
    return emptyExtraForm(detail?.employeeId || employee?.employeeId || employeeId);
  });
}

function extraMetaForEmployee(
  employeeId: string,
  details: SalaryDetailRecord[],
  employees: PayrollEmployee[]
) {
  const key = employeeId.trim().toLowerCase();
  const detail = details.find((row) => row.employeeId.trim().toLowerCase() === key);
  const employee = employees.find((row) => row.employeeId.trim().toLowerCase() === key);
  return {
    fullName: detail?.fullName || employee?.name || employeeId,
    email: detail?.email || employee?.email || '',
    designation: detail?.designation || '',
    department: detail?.department || '',
  };
}

function toSalaryDetailInput(detail: SalaryDetailRecord): SalaryDetailInput {
  return {
    employeeId: detail.employeeId,
    salary: detail.salary,
    allowance: detail.allowance,
    tax: detail.tax,
    accountNumber: detail.accountNumber,
    accountName: detail.accountName,
    bankName: detail.bankName,
  };
}

function buildSalaryForms(
  incomplete: IncompleteSalaryDetail[],
  details: SalaryDetailRecord[],
  employees: PayrollEmployee[] = []
): SalaryDetailInput[] {
  const byId = new Map(
    details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail])
  );
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
  );

  return incomplete.map((row) => {
    const key = row.employeeId.trim().toLowerCase();
    const existing = byId.get(key);
    const employee = employeeById.get(key);
    const fallbackSalary =
      employee?.salaryLabel && employee.salaryLabel !== '—' ? employee.salaryLabel : '';
    return {
      employeeId: row.employeeId,
      salary: existing?.salary || fallbackSalary,
      allowance: existing?.allowance || '',
      tax: existing?.tax || '',
      accountNumber: existing?.accountNumber || '',
      accountName: existing?.accountName || '',
      bankName: existing?.bankName || '',
    };
  });
}

function enrichIncompleteRows(
  incomplete: IncompleteSalaryDetail[],
  details: SalaryDetailRecord[],
  employees: PayrollEmployee[]
): IncompleteSalaryDetail[] {
  const byId = new Map(
    details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail])
  );
  const employeeById = new Map(
    employees.map((employee) => [employee.employeeId.trim().toLowerCase(), employee])
  );

  return incomplete.map((row) => {
    const key = row.employeeId.trim().toLowerCase();
    const detail = byId.get(key);
    const employee = employeeById.get(key);
    return {
      ...row,
      fullName: row.fullName || detail?.fullName || employee?.name || '',
      email: row.email || detail?.email || employee?.email || '',
      department: row.department || detail?.department || '',
      designation: row.designation || detail?.designation || '',
    };
  });
}

export default function SalarySlipRunsPage() {
  const router = useRouter();
  const now = new Date();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [runs, setRuns] = useState<SalarySlipRun[]>([]);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [incompleteConfirm, setIncompleteConfirm] = useState<IncompleteSalaryDetail[] | null>(
    null
  );
  const [salaryForms, setSalaryForms] = useState<SalaryDetailInput[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extraForms, setExtraForms] = useState<SalaryRunExtraInput[]>([]);
  const [extrasDetails, setExtrasDetails] = useState<SalaryDetailRecord[]>([]);
  const [pendingSalaryDetails, setPendingSalaryDetails] = useState<SalaryDetailInput[] | undefined>(
    undefined
  );
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const token = () => localStorage.getItem('token');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [runsRes, usersRes] = await Promise.all([
        fetch('/api/salary-slip-runs', { headers, cache: 'no-store' }),
        fetch('/api/get-users', { headers, cache: 'no-store' }),
      ]);
      const runsJson = await runsRes.json();
      const usersJson = await usersRes.json();

      if (!runsRes.ok || !runsJson.success) {
        throw new Error(runsJson.error || 'Failed to load salary slip runs.');
      }
      setRuns(runsJson.data || []);

      if (usersRes.ok && usersJson.success) {
        const raw = Array.isArray(usersJson.data)
          ? usersJson.data
          : usersJson.data
            ? [usersJson.data]
            : [];
        setEmployees(
          raw.map((row: unknown) => {
            const record = mapRawToEmployee(row);
            const sheetUser = toSheetUser(record);
            const salary = parseBaseSalary(record.baseSalary);
            return {
              ...sheetUser,
              eligible: hasPayrollSalary(record),
              reason: payrollEligibilityReason(record),
              salaryLabel: salary > 0 ? String(salary) : '—',
            };
          })
        );
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll data.');
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
      const canRead = role === 'super_admin' || role === 'hr_manager';
      setAllowed(canRead);
      setCanGenerate(canRead);
      if (canRead) await load();
      else setLoading(false);
    };
    boot();
  }, [load]);

  const eligibleEmployees = useMemo(
    () => employees.filter((employee) => employee.eligible),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return eligibleEmployees;
    return eligibleEmployees.filter(
      (employee) =>
        employee.name.toLowerCase().includes(q) ||
        employee.email.toLowerCase().includes(q) ||
        employee.employeeId.toLowerCase().includes(q)
    );
  }, [eligibleEmployees, employeeSearch]);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';

  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (statusFilter !== 'all' && run.status.toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        String(run.runId).includes(q) ||
        monthLabel(run.month).toLowerCase().includes(q) ||
        String(run.year).includes(q) ||
        run.triggeredBy.toLowerCase().includes(q) ||
        run.status.toLowerCase().includes(q)
      );
    });
  }, [runs, search, statusFilter]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);
  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRuns.slice(start, start + pageSizeNum);
  }, [filteredRuns, currentPage, pageSizeNum]);
  const rangeStart = filteredRuns.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRuns.length);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setPage(1);
  };

  const toggleId = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const openExtrasStep = (
    details: SalaryDetailRecord[],
    employeeIds: string[],
    salaryDetails?: SalaryDetailInput[]
  ) => {
    setIncompleteConfirm(null);
    setSalaryForms([]);
    setShowGenerate(false);
    setExtrasDetails(details);
    setPendingSalaryDetails(salaryDetails);
    setExtraForms(buildExtraForms(employeeIds, details, employees));
    setExtrasOpen(true);
    toast.message('Enter earnings and deductions for each employee.');
  };

  const handleGenerate = async (
    options: {
      confirmIncomplete?: boolean;
      confirmExtras?: boolean;
      salaryDetails?: SalaryDetailInput[];
      salaryExtras?: SalaryRunExtraInput[];
    } = {}
  ) => {
    if (!canGenerate) return;
    if (mode === 'selected' && selectedIds.length === 0) {
      toast.error('Select at least one employee.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/salary-slip-runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          month: Number(month),
          year: Number(year),
          employeeIds: mode === 'selected' ? selectedIds : undefined,
          confirmIncomplete: options.confirmIncomplete || undefined,
          confirmExtras: options.confirmExtras || undefined,
          salaryDetails: options.salaryDetails,
          salaryExtras: options.salaryExtras,
        }),
      });
      const result = await response.json();

      if (response.status === 409 && result.needsConfirmation) {
        const incomplete = (result.data?.incomplete || []) as IncompleteSalaryDetail[];
        const details = (result.data?.details || []) as SalaryDetailRecord[];

        // Prefer fetched rows that are already complete — continue to extras step.
        const completeDetails = details.filter(
          (detail) =>
            detail.employeeId &&
            detail.salary &&
            detail.allowance &&
            detail.tax &&
            detail.accountNumber &&
            detail.accountName &&
            detail.bankName
        );

        const completeCoversAllIncomplete =
          incomplete.length > 0 &&
          incomplete.every((row) =>
            completeDetails.some(
              (detail) =>
                detail.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase()
            )
          );

        if (completeCoversAllIncomplete) {
          await handleGenerate({
            confirmIncomplete: true,
            salaryDetails: completeDetails.map(toSalaryDetailInput),
          });
          return;
        }

        if (incomplete.length === 0 && completeDetails.length > 0) {
          await handleGenerate({
            confirmIncomplete: true,
            salaryDetails: completeDetails.map(toSalaryDetailInput),
          });
          return;
        }

        const forms = buildSalaryForms(incomplete, details, employees);
        const stillMissing = forms.filter((row) =>
          SALARY_FORM_FIELDS.some((field) => !String(row[field.key] || '').trim())
        );

        if (stillMissing.length === 0 && forms.length > 0) {
          await handleGenerate({
            confirmIncomplete: true,
            salaryDetails: forms,
          });
          return;
        }

        const incompleteIds = new Set(
          incomplete.map((row) => row.employeeId.trim().toLowerCase())
        );
        const reallyIncomplete = incomplete.filter(
          (row) =>
            incompleteIds.has(row.employeeId.trim().toLowerCase()) &&
            stillMissing.some((form) => form.employeeId === row.employeeId)
        );

        setIncompleteConfirm(
          enrichIncompleteRows(
            reallyIncomplete.length > 0 ? reallyIncomplete : incomplete,
            details,
            employees
          )
        );
        setSalaryForms(forms);
        toast.message(result.message || 'Some salary details are incomplete.');
        return;
      }

      if (response.status === 409 && result.needsExtras) {
        const details = (result.data?.details || []) as SalaryDetailRecord[];
        const employeeIdsFromApi = (result.data?.employeeIds || []) as string[];
        const employeeIds =
          employeeIdsFromApi.length > 0
            ? employeeIdsFromApi
            : details.map((detail) => detail.employeeId).filter(Boolean);
        openExtrasStep(details, employeeIds, options.salaryDetails);
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start salary slip run.');
      }

      setIncompleteConfirm(null);
      setSalaryForms([]);
      setExtrasOpen(false);
      setExtraForms([]);
      setExtrasDetails([]);
      setPendingSalaryDetails(undefined);
      toast.success(result.message || 'Salary slip run started.');
      setShowGenerate(false);
      setSelectedIds([]);
      setMode('all');
      await load();
      if (result.data?.runId) {
        router.push(`/dashboard/salary-slip-run-details?runId=${result.data.runId}`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate salary slips.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateSalaryFormField = (
    employeeId: string,
    field: SalaryFormFieldKey,
    value: string
  ) => {
    setSalaryForms((current) =>
      current.map((row) =>
        row.employeeId === employeeId ? { ...row, [field]: value } : row
      )
    );
  };

  const updateExtraFormField = (
    employeeId: string,
    field: ExtraFormFieldKey,
    value: string
  ) => {
    setExtraForms((current) =>
      current.map((row) =>
        row.employeeId === employeeId ? { ...row, [field]: value } : row
      )
    );
  };

  const handleSaveDetailsAndContinue = async () => {
    if (!incompleteConfirm || salaryForms.length === 0) return;

    for (const row of salaryForms) {
      const incomplete = incompleteConfirm.find((item) => item.employeeId === row.employeeId);
      const missing = incomplete?.missingFields || [];
      for (const field of SALARY_FORM_FIELDS) {
        if (missing.includes(field.missing) && !String(row[field.key] || '').trim()) {
          toast.error(`Enter ${field.label} for ${row.employeeId}.`);
          return;
        }
      }
    }

    setSavingDetails(true);
    try {
      const updateRes = await fetch('/api/salary-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ details: salaryForms }),
      });
      const updateJson = await updateRes.json();
      if (!updateRes.ok || !updateJson.success) {
        throw new Error(updateJson.error || 'Failed to update salary details.');
      }

      toast.success(updateJson.message || 'Salary details updated.');
      await handleGenerate({
        confirmIncomplete: true,
        salaryDetails: salaryForms,
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update salary details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleConfirmExtrasAndGenerate = async () => {
    if (extraForms.length === 0) return;
    await handleGenerate({
      confirmIncomplete: true,
      confirmExtras: true,
      salaryDetails: pendingSalaryDetails,
      salaryExtras: extraForms,
    });
  };

  if (allowed === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <TableSkeleton columns={5} rows={8} />
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
          Only Super Admin and HR Manager can manage salary slips.
        </p>
      </div>
    );
  }

  const recordLabel =
    loading && runs.length === 0
      ? 'Loading runs…'
      : hasActiveFilters
        ? `${filteredRuns.length} of ${runs.length} run${runs.length === 1 ? '' : 's'}`
        : `${runs.length} run${runs.length === 1 ? '' : 's'}`;

  const generateCount = mode === 'all' ? eligibleEmployees.length : selectedIds.length;

  const generateModal =
    showGenerate && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowGenerate(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="generate-slips-title"
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 id="generate-slips-title" className="text-lg font-semibold tracking-tight text-ink">
                    Generate salary slips
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Choose the period and who should receive slips.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGenerate(false)}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Month</label>
                    <CustomDropdown
                      id="slip-month"
                      name="month"
                      options={MONTH_OPTIONS}
                      value={month}
                      onChange={setMonth}
                      onBlur={() => {}}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Year</label>
                    <CustomDropdown
                      id="slip-year"
                      name="year"
                      options={currentYearOptions()}
                      value={year}
                      onChange={setYear}
                      onBlur={() => {}}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('all')}
                    className={`h-9 flex-1 rounded-lg border text-sm font-medium ${
                      mode === 'all'
                        ? 'border-ink bg-ink text-accent-fg'
                        : 'border-border bg-surface text-ink hover:bg-canvas'
                    }`}
                  >
                    All employees
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('selected')}
                    className={`h-9 flex-1 rounded-lg border text-sm font-medium ${
                      mode === 'selected'
                        ? 'border-ink bg-ink text-accent-fg'
                        : 'border-border bg-surface text-ink hover:bg-canvas'
                    }`}
                  >
                    Select employees
                  </button>
                </div>

                {mode === 'selected' && (
                  <div className="rounded-lg border border-border">
                    <div className="border-b border-border p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                        <input
                          type="search"
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          placeholder="Search employees…"
                          className="h-9 w-full rounded-md bg-canvas py-1 pl-8 pr-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                        />
                      </div>
                    </div>
                    <ul className="max-h-[7.5rem] overflow-y-auto overscroll-contain">
                      {filteredEmployees.length === 0 ? (
                        <li className="px-3 py-6 text-center text-sm text-muted">
                          No employees with a base salary.
                        </li>
                      ) : (
                        filteredEmployees.map((employee) => (
                          <li
                            key={employee.employeeId}
                            className="border-t border-border first:border-t-0"
                          >
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-canvas">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(employee.employeeId)}
                                onChange={() => toggleId(employee.employeeId)}
                                className="h-4 w-4 accent-[var(--ink)]"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium text-ink">{employee.name}</span>
                                <span className="ml-2 text-xs text-muted">
                                  {employee.employeeId}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-muted">
                  {mode === 'all'
                    ? `${eligibleEmployees.length} employees will receive slips.`
                    : `${selectedIds.length} selected.`}
                </p>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowGenerate(false)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={submitting || generateCount === 0}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Banknote className="h-4 w-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const incompleteModal =
    mounted && incompleteConfirm
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="incomplete-salary-title"
              className="flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="incomplete-salary-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Enter missing salary details
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    These values will be saved via update-salary-detail, then you can enter
                    earnings and deductions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIncompleteConfirm(null);
                    setSalaryForms([]);
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {salaryForms.map((row) => {
                  const meta =
                    incompleteConfirm.find((item) => item.employeeId === row.employeeId) || null;
                  const missing = meta?.missingFields || [];
                  return (
                    <div
                      key={row.employeeId}
                      className="rounded-lg border border-border bg-canvas/40 p-4"
                    >
                      <div className="mb-3 border-b border-border pb-3">
                        <p className="text-sm font-semibold text-ink">
                          {meta?.fullName || row.employeeId}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {row.employeeId}
                          {meta?.designation ? ` · ${meta.designation}` : ''}
                          {meta?.department ? ` · ${meta.department}` : ''}
                        </p>
                        {meta?.email ? (
                          <p className="mt-0.5 truncate text-xs text-muted">{meta.email}</p>
                        ) : null}
                        {missing.length > 0 ? (
                          <p className="mt-1.5 text-xs text-danger">
                            Missing: {missing.join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SALARY_FORM_FIELDS.map((field) => {
                          const isMissing = missing.includes(field.missing);
                          return (
                            <label key={field.key} className="block text-xs">
                              <span
                                className={`mb-1 block font-medium ${
                                  isMissing ? 'text-danger' : 'text-muted'
                                }`}
                              >
                                {field.label}
                                {isMissing ? ' *' : ''}
                              </span>
                              <input
                                type="text"
                                value={row[field.key]}
                                onChange={(e) =>
                                  updateSalaryFormField(row.employeeId, field.key, e.target.value)
                                }
                                className={`h-9 w-full rounded-md border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] ${
                                  isMissing ? 'border-danger-border' : 'border-border'
                                }`}
                                placeholder={isMissing ? `Enter ${field.label}` : undefined}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setIncompleteConfirm(null);
                    setSalaryForms([]);
                  }}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveDetailsAndContinue()}
                  disabled={submitting || savingDetails}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingDetails || submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save & continue'
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const extrasModal =
    mounted && extrasOpen
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="salary-extras-title"
              className="flex max-h-[min(90vh,42rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="salary-extras-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Earnings & deductions
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Optional adjustments for this run. Leave blank for zero.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExtrasOpen(false);
                    setExtraForms([]);
                    setExtrasDetails([]);
                    setPendingSalaryDetails(undefined);
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {extraForms.map((row) => {
                  const meta = extraMetaForEmployee(row.employeeId, extrasDetails, employees);
                  return (
                    <div
                      key={row.employeeId}
                      className="rounded-lg border border-border bg-canvas/40 p-4"
                    >
                      <div className="mb-3 border-b border-border pb-3">
                        <p className="text-sm font-semibold text-ink">{meta.fullName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {row.employeeId}
                          {meta.designation ? ` · ${meta.designation}` : ''}
                          {meta.department ? ` · ${meta.department}` : ''}
                        </p>
                        {meta.email ? (
                          <p className="mt-0.5 truncate text-xs text-muted">{meta.email}</p>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                            Earnings
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {EARNING_EXTRA_FIELDS.map((field) => (
                              <label key={field.key} className="block text-xs">
                                <span className="mb-1 block font-medium text-muted">
                                  {field.label}
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row[field.key]}
                                  onChange={(e) =>
                                    updateExtraFormField(row.employeeId, field.key, e.target.value)
                                  }
                                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                                  placeholder="0"
                                />
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                            Deductions
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {DEDUCTION_EXTRA_FIELDS.map((field) => (
                              <label key={field.key} className="block text-xs">
                                <span className="mb-1 block font-medium text-muted">
                                  {field.label}
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row[field.key]}
                                  onChange={(e) =>
                                    updateExtraFormField(row.employeeId, field.key, e.target.value)
                                  }
                                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                                  placeholder="0"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setExtrasOpen(false);
                    setExtraForms([]);
                    setExtrasDetails([]);
                    setPendingSalaryDetails(undefined);
                  }}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmExtrasAndGenerate()}
                  disabled={submitting}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Banknote className="h-4 w-4" />
                      Generate slips
                    </>
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
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Payroll</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Salary slips
          </h1>
          <p className="mt-1.5 text-sm text-muted">{recordLabel}</p>
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
          {canGenerate && (
            <button
              type="button"
              onClick={() => setShowGenerate(true)}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover"
            >
              <Banknote className="h-4 w-4" />
              Generate slips
            </button>
          )}
        </div>
      </div>

      {loading && runs.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
          <TableSkeleton columns={5} rows={8} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search month, year, run ID, email…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:w-40">
              <CustomDropdown
                id="status-filter"
                name="statusFilter"
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                onBlur={() => {}}
                placeholder="All statuses"
              />
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

          {runs.length === 0 ? (
            <EmptyState
              icon={<Banknote className="h-5 w-5" />}
              title="No salary slip runs"
              description="Generate slips to create your first payroll run."
              actionLabel={canGenerate ? 'Generate slips' : undefined}
              onAction={canGenerate ? () => setShowGenerate(true) : undefined}
              actionIcon={<Banknote className="h-4 w-4" />}
            />
          ) : filteredRuns.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching runs"
              description="Try a different search or clear the filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <th className="px-5 py-3.5 font-semibold">Period</th>
                        <th className="px-5 py-3.5 font-semibold">Run</th>
                        <th className="px-5 py-3.5 font-semibold">Triggered by</th>
                        <th className="px-5 py-3.5 font-semibold">Status</th>
                        <th className="px-5 py-3.5 font-semibold">Results</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedRuns.map((run) => (
                        <tr
                          key={run.runId}
                          onClick={() =>
                            router.push(`/dashboard/salary-slip-run-details?runId=${run.runId}`)
                          }
                          className="cursor-pointer transition-colors duration-150 hover:bg-canvas/70"
                        >
                          <td className="px-5 py-3.5 font-medium">
                            {monthLabel(run.month)} {run.year}
                          </td>
                          <td className="px-5 py-3.5 text-muted">
                            <div>#{run.runId}</div>
                            <div className="text-xs">{displayDate(run.runDate)}</div>
                          </td>
                          <td className="truncate px-5 py-3.5 text-muted">{run.triggeredBy}</td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${statusClasses(run.status)}`}
                            >
                              {run.status.toLowerCase() === 'processing' ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : run.status.toLowerCase() === 'failed' ? (
                                <XCircle className="h-3 w-3" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              {run.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-muted">
                            {run.successCount} ok
                            <span className={run.failCount > 0 ? ' text-danger' : ''}>
                              {' '}
                              · {run.failCount} failed
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={`/dashboard/salary-slip-run-details?runId=${run.runId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                            >
                              Open <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">
                  Showing {rangeStart}–{rangeEnd} of {filteredRuns.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-[7.5rem]">
                    <CustomDropdown
                      id="runs-page-size"
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

      {generateModal}
      {incompleteModal}
      {extrasModal}
    </div>
  );
}
