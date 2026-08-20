import { buildAccountingDashboardMetrics, listAccountingRecords } from '@/lib/db/accounting';
import { listEmployeeDbRows, type EmployeeDbRow } from '@/lib/db/employees';
import type { AppRole } from '@/lib/rbac';
import { overviewSectionsForRole } from '@/types/dashboard';
import type {
  CountSlice,
  DashboardOverview,
  FinanceOverview,
  HeadcountOverview,
} from '@/types/dashboard';

const DEFAULT_CURRENCY = 'PKR';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(period: string) {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function tally(values: string[]): CountSlice[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const label = String(raw || '').trim() || 'Unspecified';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function monthsBetween(from: string, to: Date): number {
  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 0;
  const months =
    (to.getUTCFullYear() - start.getUTCFullYear()) * 12 + (to.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months);
}

function buildHeadcount(rows: EmployeeDbRow[], month: string): HeadcountOverview {
  const isActive = (row: EmployeeDbRow) =>
    String(row.emsstatus || '').toLowerCase() === 'active';

  const active = rows.filter(isActive);
  const departments = new Set(
    rows.map((row) => String(row.department || '').trim()).filter(Boolean)
  );

  const joinMonth = (row: EmployeeDbRow) => String(row.joiningdate || '').slice(0, 7);
  const now = new Date();
  const tenures = rows
    .map((row) => String(row.joiningdate || '').slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map((date) => monthsBetween(date, now));

  return {
    total: rows.length,
    active: active.length,
    inactive: rows.length - active.length,
    departmentCount: departments.size,
    joinedThisMonth: rows.filter((row) => joinMonth(row) === month).length,
    averageTenureMonths: tenures.length
      ? Math.round(tenures.reduce((sum, value) => sum + value, 0) / tenures.length)
      : 0,
    byEmployeeType: tally(rows.map((row) => row.employeetype)),
    byDepartment: tally(rows.map((row) => row.department)),
    byRole: tally(rows.map((row) => row.role)),
  };
}

async function buildFinance(month: string): Promise<FinanceOverview> {
  const records = await listAccountingRecords();
  const metrics = buildAccountingDashboardMetrics(records, month);

  const monthRecords = records.filter((record) => record.uploadDate.startsWith(month));
  const currencyCounts = new Map<string, number>();
  for (const record of monthRecords.length > 0 ? monthRecords : records) {
    const key = String(record.currency || '').trim();
    if (!key) continue;
    currencyCounts.set(key, (currencyCounts.get(key) || 0) + 1);
  }
  const currency =
    [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_CURRENCY;

  return {
    currency,
    income: metrics.income,
    expenses: metrics.expenses,
    payroll: metrics.payroll,
    netCashflow: metrics.netCashflow,
    transactionCount: metrics.transactionCount,
    pendingDocuments: metrics.pendingDocuments,
    trend: metrics.trend,
    byCategory: metrics.byCategory,
  };
}

/** A failed section is dropped rather than failing the whole dashboard. */
async function optional<T>(enabled: boolean, load: () => Promise<T>): Promise<T | undefined> {
  if (!enabled) return undefined;
  try {
    return await load();
  } catch (error) {
    console.error('Dashboard overview section failed:', error);
    return undefined;
  }
}

export async function buildDashboardOverview(
  role: AppRole | string,
  month = currentMonth()
): Promise<DashboardOverview> {
  const sections = overviewSectionsForRole(role);

  const [headcount, finance] = await Promise.all([
    optional(sections.headcount, async () => buildHeadcount(await listEmployeeDbRows(), month)),
    optional(sections.finance, () => buildFinance(month)),
  ]);

  return {
    month,
    monthLabel: monthLabel(month),
    sections,
    headcount,
    finance,
  };
}
