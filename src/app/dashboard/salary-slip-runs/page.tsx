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
import { canAccess, canWrite, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import { formatSalaryPeriod } from '@/lib/payroll/period';
import {
  isPayrollEligible,
  parseBaseSalary,
  payrollEligibilityReason,
} from '@/lib/payroll/eligibility';
import { buildOffboardingIndex } from '@/lib/offboarding/status';
import type { OffboardingRecord } from '@/types/offboarding';
import { toSheetUser, type SheetUser } from '@/types/employee';
import {
  SALARY_DETAIL_FIELDS,
  SALARY_SLIP_EXTRA_FIELDS,
  type IncompleteSalaryDetail,
  type SalaryDetailInput,
  type SalaryDetailRecord,
  type SalarySlipExtraFieldKey,
  type SalarySlipExtrasInput,
  type SalarySlipRun,
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
  { label: 'Awaiting Approval', value: 'awaiting approval' },
  { label: 'Approved', value: 'approved' },
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

const REQUIRED_MISSING = new Set(['Base Salary', 'Account Number', 'Account Name', 'Bank Name']);

function currentYearOptions() {
  const year = new Date().getFullYear();
  return [year - 1, year, year + 1].map((value) => ({
    label: String(value),
    value: String(value),
  }));
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'awaiting approval':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'approved':
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

function isEmptyValue(value: unknown) {
  return String(value ?? '').trim() === '';
}

function buildSalaryForms(
  incomplete: IncompleteSalaryDetail[],
  details: SalaryDetailRecord[]
): SalaryDetailInput[] {
  const byId = new Map(details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail]));

  return incomplete.map((row) => {
    const key = row.employeeId.trim().toLowerCase();
    const existing = byId.get(key);
    if (existing) {
      return {
        employeeId: row.employeeId,
        salary: existing.salary || '',
        allowance: existing.allowance || '',
        tax: existing.tax || '',
        netSalary: existing.netSalary || '',
        accountNumber: existing.accountNumber || '',
        accountName: existing.accountName || '',
        bankName: existing.bankName || '',
        totalEarning: existing.totalEarning || '',
        totalDeduction: existing.totalDeduction || '',
      };
    }

    return {
      employeeId: row.employeeId,
      salary: '',
      allowance: '',
      tax: '',
      netSalary: '',
      accountNumber: '',
      accountName: '',
      bankName: '',
      totalEarning: '',
      totalDeduction: '',
    };
  });
}

function emptySlipExtras(employeeId: string): SalarySlipExtrasInput {
  return {
    employeeId,
    overtimePay: '',
    performanceBonus: '',
    others: '',
    contributions: '',
  };
}

function buildSlipExtrasForms(employeeIds: string[]): Record<string, SalarySlipExtrasInput> {
  const map: Record<string, SalarySlipExtrasInput> = {};
  for (const employeeId of employeeIds) {
    map[employeeId] = emptySlipExtras(employeeId);
  }
  return map;
}

function toSlipExtrasPayload(extras: SalarySlipExtrasInput): SalarySlipExtrasInput {
  return {
    employeeId: extras.employeeId,
    overtimePay: isEmptyValue(extras.overtimePay) ? '0' : extras.overtimePay,
    performanceBonus: isEmptyValue(extras.performanceBonus) ? '0' : extras.performanceBonus,
    others: isEmptyValue(extras.others) ? '0' : extras.others,
    contributions: isEmptyValue(extras.contributions) ? '0' : extras.contributions,
  };
}

function enrichIncompleteRows(
  incomplete: IncompleteSalaryDetail[],
  details: SalaryDetailRecord[],
  employees: PayrollEmployee[]
): IncompleteSalaryDetail[] {
  const byId = new Map(details.map((detail) => [detail.employeeId.trim().toLowerCase(), detail]));
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

function emptyFieldsForForm(row: SalaryDetailInput): string[] {
  return SALARY_DETAIL_FIELDS.filter((field) => isEmptyValue(row[field.key])).map(
    (field) => field.missing
  );
}

function requiredMissingForForm(row: SalaryDetailInput): string[] {
  return emptyFieldsForForm(row).filter((field) => REQUIRED_MISSING.has(field));
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
  const [salaryReview, setSalaryReview] = useState<IncompleteSalaryDetail[] | null>(null);
  const [salaryForms, setSalaryForms] = useState<SalaryDetailInput[]>([]);
  const [slipExtrasForms, setSlipExtrasForms] = useState<Record<string, SalarySlipExtrasInput>>({});
  const [savingDetails, setSavingDetails] = useState(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const token = () => localStorage.getItem('token');

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [runsRes, usersRes, salariesRes, offboardingRes] = await Promise.all([
        fetch('/api/salary-slip-runs', { headers, cache: 'no-store' }),
        fetch('/api/get-users', { headers, cache: 'no-store' }),
        fetch('/api/salary-details', { headers, cache: 'no-store' }),
        fetch('/api/offboarding', { headers, cache: 'no-store' }).catch(() => null),
      ]);
      const runsJson = await runsRes.json();
      const usersJson = await usersRes.json();
      const salariesJson = await salariesRes.json();
      const offboardingJson = offboardingRes ? await offboardingRes.json().catch(() => null) : null;

      if (!runsRes.ok || !runsJson.success) {
        throw new Error(runsJson.error || 'Failed to load salary slip runs.');
      }
      setRuns(runsJson.data || []);

      if (usersRes.ok && usersJson.success) {
        const salaryRows =
          salariesRes.ok && salariesJson.success
            ? ((salariesJson.data || []) as SalaryDetailRecord[])
            : [];
        const salaryById = new Map(
          salaryRows.map((row) => [row.employeeId.trim().toLowerCase(), row])
        );
        const salaryIds = new Set(salaryById.keys());
        const offboardings = buildOffboardingIndex(
          offboardingJson?.success && Array.isArray(offboardingJson.data)
            ? (offboardingJson.data as OffboardingRecord[])
            : []
        );
        const raw = Array.isArray(usersJson.data)
          ? usersJson.data
          : usersJson.data
            ? [usersJson.data]
            : [];
        setEmployees(
          raw.map((row: unknown) => {
            const record = mapRawToEmployee(row);
            const sheetUser = toSheetUser(record);
            const salaryDetail = salaryById.get(record.employeeId.trim().toLowerCase());
            const salary = parseBaseSalary(salaryDetail?.salary);
            return {
              ...sheetUser,
              eligible: isPayrollEligible(record, salaryIds, offboardings),
              reason: payrollEligibilityReason(record, salaryIds, offboardings),
              salaryLabel: salary > 0 ? String(salary) : '—',
            };
          })
        );
      }
    } catch (error: unknown) {
      if (!options.silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to load payroll data.');
      }
    } finally {
      if (!options.silent) setLoading(false);
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
        /* keep JWT fallback */
      }
      const canView = canAccess(role, 'salary_slip_runs', flags);
      setCanGenerate(canWrite(role, 'salary_slip_runs', flags));
      setAllowed(canView);
      if (canView) await load();
      else setLoading(false);
    };
    void boot();
  }, [load]);

  const hasProcessingRuns = useMemo(
    () => runs.some((run) => ['processing', 'approved'].includes(run.status.toLowerCase())),
    [runs]
  );

  useEffect(() => {
    if (!allowed || !hasProcessingRuns) return;
    const timer = window.setInterval(() => void load({ silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [allowed, hasProcessingRuns, load]);

  const eligibleEmployees = useMemo(
    () => employees.filter((employee) => employee.eligible),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return eligibleEmployees;
    return eligibleEmployees.filter((employee) => {
      const haystack = [employee.name, employee.email, employee.employeeId, employee.role]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystack.some((value) => value.includes(q));
    });
  }, [eligibleEmployees, employeeSearch]);

  const filteredRuns = useMemo(() => {
    let list = [...runs];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((run) => {
        const haystack = [
          run.runId,
          run.triggeredBy,
          run.status,
          monthLabel(run.month),
          String(run.year),
          formatSalaryPeriod(run.month, run.year),
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        return haystack.some((value) => value.includes(q));
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((run) => run.status.toLowerCase() === statusFilter.toLowerCase());
    }
    return list;
  }, [runs, search, statusFilter]);

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all';
  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);
  const pagedRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredRuns.slice(start, start + pageSizeNum);
  }, [filteredRuns, currentPage, pageSizeNum]);
  const rangeStart = filteredRuns.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredRuns.length);

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

  const closeSalaryReview = () => {
    setSalaryReview(null);
    setSalaryForms([]);
    setSlipExtrasForms({});
  };

  const handleGenerate = async (
    options: {
      confirmIncomplete?: boolean;
      slipExtras?: SalarySlipExtrasInput[];
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
          slipExtras: options.slipExtras,
        }),
      });
      const result = await response.json();

      if (response.status === 409 && result.needsConfirmation) {
        const incomplete = (result.data?.incomplete || []) as IncompleteSalaryDetail[];
        const details = (result.data?.details || []) as SalaryDetailRecord[];
        const forms = buildSalaryForms(
          incomplete.length > 0
            ? incomplete
            : (mode === 'selected'
                ? selectedIds
                : eligibleEmployees.map((employee) => employee.employeeId)
              ).map((employeeId) => ({ employeeId, missingFields: [] as string[] })),
          details
        );

        setShowGenerate(false);
        setSalaryReview(
          enrichIncompleteRows(
            incomplete.length > 0
              ? incomplete
              : forms.map((form) => ({
                  employeeId: form.employeeId,
                  missingFields: emptyFieldsForForm(form),
                })),
            details,
            employees
          )
        );
        setSalaryForms(forms);
        setSlipExtrasForms(buildSlipExtrasForms(forms.map((form) => form.employeeId)));
        toast.message(result.message || 'Review salary details, then generate.');
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to start salary slip run.');
      }

      closeSalaryReview();
      toast.success(result.message || 'Salary slip run started.');
      setShowGenerate(false);
      setSelectedIds([]);
      setMode('all');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate salary slips.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateSlipExtraField = (
    employeeId: string,
    field: SalarySlipExtraFieldKey,
    value: string
  ) => {
    setSlipExtrasForms((current) => {
      const existing = current[employeeId] || emptySlipExtras(employeeId);
      return {
        ...current,
        [employeeId]: { ...existing, [field]: value },
      };
    });
  };

  const blockedByIncompleteSalary = useMemo(
    () => salaryForms.some((row) => requiredMissingForForm(row).length > 0),
    [salaryForms]
  );

  const handleConfirmAndGenerate = async () => {
    if (!salaryReview || salaryForms.length === 0) return;

    for (const row of salaryForms) {
      const missing = requiredMissingForForm(row);
      if (missing.length > 0) {
        toast.error(
          `${row.employeeId} is missing ${missing.join(', ')}. Update the salary record on the Salary page, then try again.`
        );
        return;
      }
    }

    const slipExtras = salaryForms.map((row) =>
      toSlipExtrasPayload(slipExtrasForms[row.employeeId] || emptySlipExtras(row.employeeId))
    );

    setSavingDetails(true);
    try {
      await handleGenerate({
        confirmIncomplete: true,
        slipExtras,
      });
    } finally {
      setSavingDetails(false);
    }
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
          Only Super Admin, Admin, and Finance Manager can manage salary slips.
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
  const runPeriodLabel = formatSalaryPeriod(Number(month), Number(year));

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
              className="relative flex max-h-[min(92vh,52rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="generate-slips-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Generate salary slips
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Choose the period and who should receive slips. Generating only builds the
                    PDFs — an Admin approves the run before employees are emailed.
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

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
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
                <p className="text-xs text-muted">
                  Period key: <span className="font-medium text-ink">{runPeriodLabel}</span>
                </p>

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
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
                    <div className="shrink-0 border-b border-border p-2">
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
                    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      {filteredEmployees.length === 0 ? (
                        <li className="px-3 py-4 text-center text-xs text-muted">
                          No eligible employees found.
                        </li>
                      ) : (
                        filteredEmployees.map((employee) => {
                          const checked = selectedIds.includes(employee.employeeId);
                          return (
                            <li key={employee.employeeId}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleId(employee.employeeId)}
                                  className="h-4 w-4 rounded border-border"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-ink">
                                    {employee.name || employee.employeeId}
                                  </span>
                                  <span className="block truncate text-xs text-muted">
                                    {employee.employeeId}
                                    {employee.email ? ` · ${employee.email}` : ''}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
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
                      Loading…
                    </>
                  ) : (
                    <>
                      <Banknote className="h-4 w-4" />
                      Continue ({generateCount})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const salaryReviewModal =
    mounted && salaryReview
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="salary-review-title"
              className="flex max-h-[min(90vh,46rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2
                    id="salary-review-title"
                    className="text-lg font-semibold tracking-tight text-ink"
                  >
                    Salary details
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Slip period <span className="font-medium text-ink">{runPeriodLabel}</span>.
                    Stored salary is read-only here — edit base salary, tax, allowance, or bank
                    details on the{' '}
                    <Link href="/dashboard/salary" className="font-medium text-ink underline">
                      Salary
                    </Link>{' '}
                    page. Overtime, bonus, others, and contributions apply to this slip only and are
                    not saved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSalaryReview}
                  className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {blockedByIncompleteSalary ? (
                  <div className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
                    One or more employees are missing required salary fields. Fix them on the{' '}
                    <Link href="/dashboard/salary" className="font-medium underline">
                      Salary
                    </Link>{' '}
                    page, then generate again.
                  </div>
                ) : null}
                {salaryForms.map((row) => {
                  const meta =
                    salaryReview.find((item) => item.employeeId === row.employeeId) || null;
                  const empty = emptyFieldsForForm(row);
                  const extras = slipExtrasForms[row.employeeId] || emptySlipExtras(row.employeeId);
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
                        {empty.length > 0 ? (
                          <p className="mt-1.5 text-xs text-danger">
                            Missing on Salary page: {empty.join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Stored salary (read-only)
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SALARY_DETAIL_FIELDS.map((field) => {
                          const isEmpty = isEmptyValue(row[field.key]);
                          const isRequired = REQUIRED_MISSING.has(field.missing);
                          return (
                            <label key={field.key} className="block text-xs">
                              <span
                                className={`mb-1 block font-medium ${
                                  isEmpty ? 'text-danger' : 'text-muted'
                                }`}
                              >
                                {field.label}
                                {isRequired ? ' *' : ''}
                                {isEmpty ? ' (empty)' : ''}
                              </span>
                              <input
                                type="text"
                                value={row[field.key] || ''}
                                readOnly
                                tabIndex={-1}
                                className={`h-9 w-full cursor-default rounded-md border bg-canvas px-3 text-sm text-ink ${
                                  isEmpty
                                    ? 'border-danger-border ring-1 ring-danger/30'
                                    : 'border-border'
                                }`}
                              />
                            </label>
                          );
                        })}
                      </div>
                      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Slip-only extras
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SALARY_SLIP_EXTRA_FIELDS.map((field) => (
                          <label key={field.key} className="block text-xs">
                            <span className="mb-1 block font-medium text-muted">{field.label}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={extras[field.key] || ''}
                              onChange={(e) =>
                                updateSlipExtraField(row.employeeId, field.key, e.target.value)
                              }
                              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                              placeholder={`Enter ${field.label} (optional)`}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={closeSalaryReview}
                  className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmAndGenerate()}
                  disabled={submitting || savingDetails || blockedByIncompleteSalary}
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingDetails || submitting ? (
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
            onClick={() => void load()}
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
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
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
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
                            {formatSalaryPeriod(run.month, run.year)}
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
                      onChange={(val) => {
                        setPageSize(val);
                        setPage(1);
                      }}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
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
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
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
      {salaryReviewModal}
    </div>
  );
}
