import type { AccessFlags, AppRole } from '@/lib/rbac';
import { ROLES, normalizeRole, canAccess } from '@/lib/rbac';

export const SEARCH_SOURCES = [
  'employee',
  'accounting',
  'salary',
  'leave_request',
  'leave_balance',
] as const;

export type SearchSource = (typeof SEARCH_SOURCES)[number];

export type SearchHit = {
  id: string;
  source: SearchSource;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  matchedOn: string[];
};

export const REPORT_TYPES = [
  'payroll',
  'leave',
  'employee',
  'expense',
  'income',
  'cashflow',
  'director_account',
  'monthly_summary',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export type ReportDefinition = {
  type: ReportType;
  label: string;
  description: string;
  /** Which roles may run this report. Empty = nobody. */
  roles: AppRole[];
};

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    type: 'payroll',
    label: 'Payroll',
    description: 'Salary rows for a period — base, earnings, deductions, net.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'leave',
    label: 'Leave',
    description: 'Leave requests for a year, with status and days used.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR],
  },
  {
    type: 'employee',
    label: 'Employee',
    description: 'Roster snapshot — department, designation, status, join date.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'expense',
    label: 'Expense',
    description: 'Expense transactions for a month across all accounts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'income',
    label: 'Income',
    description: 'Income transactions for a month across all accounts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'cashflow',
    label: 'Cashflow',
    description: 'Income vs expenses and net cashflow for a month.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'director_account',
    label: 'Director account',
    description: 'Transactions filed against a director (or Arachnix Bank).',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'monthly_summary',
    label: 'Monthly summary',
    description: 'Income, expenses, payroll, net, and transaction counts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
];

export function reportsForRole(role: AppRole | string, flags?: AccessFlags): ReportDefinition[] {
  const normalized = normalizeRole(role);
  return REPORT_DEFINITIONS.filter((report) => {
    if (report.roles.includes(normalized)) return true;
    if (flags?.isDirector && report.roles.includes(ROLES.DIRECTOR)) return true;
    if (flags?.hasFinanceAccess && report.roles.includes(ROLES.FINANCE_MANAGER)) return true;
    return false;
  });
}

export function canRunReport(
  role: AppRole | string,
  type: ReportType,
  flags?: AccessFlags
): boolean {
  return reportsForRole(role, flags).some((report) => report.type === type);
}

/** Search sources a role is allowed to query. */
export function searchSourcesForRole(role: AppRole | string, flags?: AccessFlags): SearchSource[] {
  const normalized = normalizeRole(role);
  const sources = (() => {
    switch (normalized) {
      case ROLES.SUPER_ADMIN:
      case ROLES.ADMIN:
        return [...SEARCH_SOURCES];
      case ROLES.HR_MANAGER:
        return ['employee', 'leave_request', 'leave_balance', 'salary'] as SearchSource[];
      case ROLES.FINANCE_MANAGER:
        return ['accounting', 'salary'] as SearchSource[];
      case ROLES.DIRECTOR:
        return ['employee', 'salary', 'leave_request'] as SearchSource[];
      default:
        return [] as SearchSource[];
    }
  })();

  const extra: SearchSource[] = [];
  if (flags?.hasFinanceAccess && normalized === ROLES.HR_MANAGER) {
    extra.push('accounting');
  }
  if (flags?.isDirector) {
    extra.push('employee', 'salary', 'leave_request');
  }

  return Array.from(new Set([...sources, ...extra]));
}

/**
 * Destination for a search hit. Always returns a path the role can open so
 * middleware does not bounce the click back to /dashboard.
 */
export function hrefForSearchHit(
  role: AppRole | string,
  source: SearchSource,
  entityId?: string
): string {
  const normalized = normalizeRole(role);
  switch (source) {
    case 'employee':
      if (canAccess(normalized, 'employees') && entityId) {
        return `/dashboard/employees/${encodeURIComponent(entityId)}`;
      }
      return canAccess(normalized, 'reports') ? '/dashboard/reports' : '/dashboard';
    case 'accounting':
      return canAccess(normalized, 'accounting_records')
        ? '/dashboard/accounting-records'
        : '/dashboard';
    case 'salary':
      return canAccess(normalized, 'salary')
        ? '/dashboard/salary'
        : canAccess(normalized, 'reports')
          ? '/dashboard/reports'
          : '/dashboard';
    case 'leave_request':
      return canAccess(normalized, 'leave_requests')
        ? '/dashboard/leave-requests'
        : canAccess(normalized, 'reports')
          ? '/dashboard/reports'
          : '/dashboard';
    case 'leave_balance':
      return canAccess(normalized, 'leave_balances')
        ? '/dashboard/leave-balances'
        : canAccess(normalized, 'reports')
          ? '/dashboard/reports'
          : '/dashboard';
    default:
      return '/dashboard';
  }
}

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | null | undefined>;

export type ReportPayload = {
  type: ReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Email of the user who generated the export (PDF header). */
  generatedBy?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: Array<{ label: string; value: string }>;
};

export type DirectorDashboardMetrics = {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  payroll: number;
  netCashflow: number;
  transactionCount: number;
  pendingDocuments: number;
  employeeCount: number;
  activeEmployeeCount: number;
  departmentCount: number;
  byAccount: Array<{ account: string; amount: number; count: number }>;
  trend: Array<{ month: string; income: number; expenses: number }>;
};
