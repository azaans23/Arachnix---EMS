/**
 * Aggregates behind the /dashboard overview charts.
 *
 * Every section is optional: the API only fills in the ones the caller's role
 * may see, so Finance never receives HR data and HR never receives accounting.
 */

import { normalizeRole, ROLES, type AppRole } from '@/lib/rbac';

export type CountSlice = { label: string; value: number };

export type DashboardSectionKey = 'headcount' | 'finance';

export type DashboardSections = Record<DashboardSectionKey, boolean>;

/**
 * Overview chart visibility by role:
 * - Headcount (employee charts): Super Admin, Admin, HR Manager, Director
 * - Cashflow: Super Admin, Admin, Finance Manager (accountant) only — not HR
 *
 * Kept free of server-only imports so the client can skip the request entirely
 * for roles with nothing to show.
 */
export function overviewSectionsForRole(role: AppRole | string): DashboardSections {
  const normalized = normalizeRole(role);
  return {
    headcount:
      normalized === ROLES.SUPER_ADMIN ||
      normalized === ROLES.ADMIN ||
      normalized === ROLES.HR_MANAGER ||
      normalized === ROLES.DIRECTOR,
    finance:
      normalized === ROLES.SUPER_ADMIN ||
      normalized === ROLES.ADMIN ||
      normalized === ROLES.FINANCE_MANAGER,
  };
}

export function hasAnyOverviewSection(sections: DashboardSections): boolean {
  return Object.values(sections).some(Boolean);
}

export type HeadcountOverview = {
  total: number;
  active: number;
  inactive: number;
  departmentCount: number;
  joinedThisMonth: number;
  averageTenureMonths: number;
  byEmployeeType: CountSlice[];
  byDepartment: CountSlice[];
  byRole: CountSlice[];
};

export type FinanceOverview = {
  currency: string;
  income: number;
  expenses: number;
  payroll: number;
  netCashflow: number;
  transactionCount: number;
  pendingDocuments: number;
  trend: Array<{ month: string; income: number; expenses: number }>;
  byCategory: Array<{ category: string; amount: number; count: number }>;
};

export type DashboardOverview = {
  month: string;
  monthLabel: string;
  sections: DashboardSections;
  headcount?: HeadcountOverview;
  finance?: FinanceOverview;
};
