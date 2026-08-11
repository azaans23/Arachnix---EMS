import type { AppRole } from '@/lib/rbac';
import { ROLES, normalizeRole } from '@/lib/rbac';

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
    roles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'leave',
    label: 'Leave',
    description: 'Leave requests for a year, with status and days used.',
    roles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'employee',
    label: 'Employee',
    description: 'Roster snapshot — department, designation, status, join date.',
    roles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'expense',
    label: 'Expense',
    description: 'Expense transactions for a month across all accounts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'income',
    label: 'Income',
    description: 'Income transactions for a month across all accounts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'cashflow',
    label: 'Cashflow',
    description: 'Income vs expenses and net cashflow for a month.',
    roles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'director_account',
    label: 'Director account',
    description: 'Transactions filed against a director (or Arachnix Bank).',
    roles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
  {
    type: 'monthly_summary',
    label: 'Monthly summary',
    description: 'Income, expenses, payroll, net, and transaction counts.',
    roles: [ROLES.SUPER_ADMIN, ROLES.FINANCE_MANAGER, ROLES.DIRECTOR],
  },
];

export function reportsForRole(role: AppRole | string): ReportDefinition[] {
  const normalized = normalizeRole(role);
  return REPORT_DEFINITIONS.filter((report) => report.roles.includes(normalized));
}

export function canRunReport(role: AppRole | string, type: ReportType): boolean {
  return reportsForRole(role).some((report) => report.type === type);
}

/** Search sources a role is allowed to query. */
export function searchSourcesForRole(role: AppRole | string): SearchSource[] {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case ROLES.SUPER_ADMIN:
      return [...SEARCH_SOURCES];
    case ROLES.HR_MANAGER:
      return ['employee', 'salary', 'leave_request', 'leave_balance'];
    case ROLES.FINANCE_MANAGER:
      return ['accounting', 'employee'];
    case ROLES.DIRECTOR:
      return ['accounting', 'employee', 'salary', 'leave_request'];
    default:
      return [];
  }
}

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | null | undefined>;

export type ReportPayload = {
  type: ReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
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
