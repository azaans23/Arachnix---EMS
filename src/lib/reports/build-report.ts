import { ACCOUNTING_BANK_ACCOUNT } from '@/types/accounting';
import {
  canRunReport,
  type ReportColumn,
  type ReportPayload,
  type ReportRow,
  type ReportType,
  type DirectorDashboardMetrics,
} from '@/types/search-reports';
import {
  buildAccountingDashboardMetrics,
  listAccountingRecords,
  listAccountingDirectorAccounts,
} from '@/lib/db/accounting';
import { listEmployeeDbRows } from '@/lib/db/employees';
import { listLeaveRequests } from '@/lib/db/leave-requests';
import { listSalaryDbRows } from '@/lib/db/salaries';
import type { AppRole } from '@/lib/rbac';
import { normalizeRole, ROLES } from '@/lib/rbac';

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

function money(value: number) {
  return Math.round(Number(value) || 0);
}

function text(value: unknown) {
  return value == null ? '' : String(value);
}

function isExpenseRow(row: { transactionType: string; category: string }) {
  return (
    row.transactionType === 'Expense' ||
    row.category === 'Expenses' ||
    row.category === 'Taxes' ||
    row.category === 'Payroll'
  );
}

function isIncomeRow(row: { transactionType: string; category: string }) {
  return row.transactionType === 'Income' || row.category === 'Income';
}

export async function buildReport(params: {
  type: ReportType;
  role: AppRole | string;
  month?: string;
  year?: string;
  account?: string;
  period?: string;
}): Promise<ReportPayload> {
  if (!canRunReport(params.role, params.type)) {
    throw new Error('You do not have access to this report.');
  }

  const month = (params.month || currentMonth()).trim();
  const year = (params.year || month.slice(0, 4) || String(new Date().getFullYear())).trim();
  const period = (params.period || '').trim();
  const account = (params.account || '').trim();
  const generatedAt = new Date().toISOString();

  switch (params.type) {
    case 'payroll':
      return buildPayrollReport({ period: period || monthToSalaryPeriod(month), generatedAt });
    case 'leave':
      return buildLeaveReport({ year, generatedAt });
    case 'employee':
      return buildEmployeeReport({ generatedAt, role: params.role });
    case 'expense':
      return buildAccountingTypeReport({
        type: 'expense',
        month,
        generatedAt,
        title: 'Expense report',
      });
    case 'income':
      return buildAccountingTypeReport({
        type: 'income',
        month,
        generatedAt,
        title: 'Income report',
      });
    case 'cashflow':
      return buildCashflowReport({ month, generatedAt });
    case 'director_account':
      return buildDirectorAccountReport({ month, account, generatedAt, role: params.role });
    case 'monthly_summary':
      return buildMonthlySummaryReport({ month, generatedAt });
    default:
      throw new Error('Unknown report type.');
  }
}

/** Convert YYYY-MM to Month-Year used by salaries. */
function monthToSalaryPeriod(month: string) {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const label = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${label}-${year}`;
}

async function buildPayrollReport(params: {
  period: string;
  generatedAt: string;
}): Promise<ReportPayload> {
  const employees = await listEmployeeDbRows();
  const nameById = new Map(employees.map((row) => [row.employeeid, row.fullname]));
  const rows = await listSalaryDbRows();

  const columns: ReportColumn[] = [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name' },
    { key: 'baseSalary', label: 'Base salary' },
    { key: 'allowance', label: 'Allowance' },
    { key: 'tax', label: 'Tax' },
    { key: 'totalEarning', label: 'Total earning' },
    { key: 'totalDeduction', label: 'Total deduction' },
    { key: 'netSalary', label: 'Net salary' },
  ];

  const reportRows: ReportRow[] = rows.map((row) => ({
    employeeId: row.employeeid,
    name: nameById.get(row.employeeid) || '',
    baseSalary: money(row.basesalary),
    allowance: money(row.allowance ?? 0),
    tax: money(row.tax ?? 0),
    totalEarning: money(row.totalearning),
    totalDeduction: money(row.totaldeduction),
    netSalary: money(row.netsalary),
  }));

  const netTotal = reportRows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);

  return {
    type: 'payroll',
    title: 'Payroll report',
    subtitle: params.period
      ? `Salary profiles (slip period ${params.period})`
      : 'Current salary profiles',
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Employees', value: String(reportRows.length) },
      { label: 'Net payroll', value: String(netTotal) },
    ],
  };
}

async function buildLeaveReport(params: {
  year: string;
  generatedAt: string;
}): Promise<ReportPayload> {
  const rows = await listLeaveRequests();
  const filtered = rows.filter(
    (row) => row.startDate.startsWith(params.year) || row.endDate.startsWith(params.year)
  );

  const columns: ReportColumn[] = [
    { key: 'requestId', label: 'Request ID' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name' },
    { key: 'leaveType', label: 'Leave type' },
    { key: 'startDate', label: 'Start' },
    { key: 'endDate', label: 'End' },
    { key: 'days', label: 'Days' },
    { key: 'status', label: 'Status' },
  ];

  const reportRows: ReportRow[] = filtered.map((row) => ({
    requestId: row.requestId,
    employeeId: row.employeeId,
    name: row.fullName || '',
    leaveType: row.leaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.daysRequested,
    status: row.status,
  }));

  return {
    type: 'leave',
    title: 'Leave report',
    subtitle: `Year ${params.year}`,
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Requests', value: String(reportRows.length) },
      {
        label: 'Approved days',
        value: String(
          filtered
            .filter((row) => row.status === 'Approved')
            .reduce((sum, row) => sum + Number(row.daysRequested || 0), 0)
        ),
      },
    ],
  };
}

async function buildEmployeeReport(params: {
  generatedAt: string;
  role: AppRole | string;
}): Promise<ReportPayload> {
  const rows = await listEmployeeDbRows();
  const isDirector = normalizeRole(params.role) === ROLES.DIRECTOR;

  const columns: ReportColumn[] = isDirector
    ? [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'department', label: 'Department' },
        { key: 'designation', label: 'Designation' },
        { key: 'role', label: 'Role' },
      ]
    : [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'department', label: 'Department' },
        { key: 'designation', label: 'Designation' },
        { key: 'role', label: 'Role' },
        { key: 'joiningDate', label: 'Joining date' },
      ];

  const reportRows: ReportRow[] = rows.map((row) =>
    isDirector
      ? {
          employeeId: row.employeeid,
          name: row.fullname,
          department: row.department,
          designation: row.designation,
          role: row.role,
        }
      : {
          employeeId: row.employeeid,
          name: row.fullname,
          email: row.email,
          department: row.department,
          designation: row.designation,
          role: row.role,
          joiningDate: row.joiningdate,
        }
  );

  return {
    type: 'employee',
    title: 'Employee report',
    subtitle: 'Full roster',
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [{ label: 'Employees', value: String(rows.length) }],
  };
}

async function buildAccountingTypeReport(params: {
  type: 'expense' | 'income';
  month: string;
  generatedAt: string;
  title: string;
}): Promise<ReportPayload> {
  const records = await listAccountingRecords();
  const monthRows = records.filter((row) => row.uploadDate.startsWith(params.month));
  const filtered = monthRows.filter((row) =>
    params.type === 'expense' ? isExpenseRow(row) : isIncomeRow(row)
  );

  const columns: ReportColumn[] = [
    { key: 'recordId', label: 'Record ID' },
    { key: 'date', label: 'Date' },
    { key: 'account', label: 'Account' },
    { key: 'category', label: 'Category' },
    { key: 'clientVendor', label: 'Client / Vendor' },
    { key: 'reference', label: 'Reference' },
    { key: 'amount', label: 'Amount' },
    { key: 'currency', label: 'Currency' },
  ];

  const reportRows: ReportRow[] = filtered.map((row) => ({
    recordId: row.recordId,
    date: row.uploadDate.slice(0, 10),
    account: row.account,
    category: row.category,
    clientVendor: row.clientVendor,
    reference: row.reference,
    amount: money(row.amount),
    currency: row.currency,
  }));

  const total = reportRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    type: params.type,
    title: params.title,
    subtitle: monthLabel(params.month),
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Transactions', value: String(reportRows.length) },
      { label: 'Total', value: String(total) },
    ],
  };
}

async function buildCashflowReport(params: {
  month: string;
  generatedAt: string;
}): Promise<ReportPayload> {
  const records = await listAccountingRecords();
  const metrics = buildAccountingDashboardMetrics(records, params.month);

  const columns: ReportColumn[] = [
    { key: 'metric', label: 'Metric' },
    { key: 'amount', label: 'Amount' },
  ];

  const reportRows: ReportRow[] = [
    { metric: 'Income', amount: money(metrics.income) },
    { metric: 'Expenses', amount: money(metrics.expenses) },
    { metric: 'Payroll', amount: money(metrics.payroll) },
    { metric: 'Net cashflow', amount: money(metrics.netCashflow) },
    { metric: 'Transactions', amount: metrics.transactionCount },
    { metric: 'Unlinked documents', amount: metrics.pendingDocuments },
  ];

  return {
    type: 'cashflow',
    title: 'Cashflow report',
    subtitle: monthLabel(params.month),
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Net cashflow', value: String(money(metrics.netCashflow)) },
      { label: 'Transactions', value: String(metrics.transactionCount) },
    ],
  };
}

async function buildDirectorAccountReport(params: {
  month: string;
  account: string;
  generatedAt: string;
  role: AppRole | string;
}): Promise<ReportPayload> {
  const directors = await listAccountingDirectorAccounts();
  const accounts = [ACCOUNTING_BANK_ACCOUNT, ...directors.map((d) => d.name)];
  const account = params.account || accounts[0] || ACCOUNTING_BANK_ACCOUNT;

  const records = await listAccountingRecords({ account });
  const filtered = records.filter((row) => row.uploadDate.startsWith(params.month));

  const columns: ReportColumn[] = [
    { key: 'recordId', label: 'Record ID' },
    { key: 'date', label: 'Date' },
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type' },
    { key: 'clientVendor', label: 'Client / Vendor' },
    { key: 'reference', label: 'Reference' },
    { key: 'amount', label: 'Amount' },
    { key: 'currency', label: 'Currency' },
  ];

  const reportRows: ReportRow[] = filtered.map((row) => ({
    recordId: row.recordId,
    date: row.uploadDate.slice(0, 10),
    category: row.category,
    type: row.transactionType,
    clientVendor: row.clientVendor,
    reference: row.reference,
    amount: money(row.amount),
    currency: row.currency,
  }));

  const total = reportRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return {
    type: 'director_account',
    title: 'Director account report',
    subtitle: `${account} · ${monthLabel(params.month)}`,
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Account', value: account },
      { label: 'Transactions', value: String(reportRows.length) },
      { label: 'Volume', value: String(total) },
    ],
  };
}

async function buildMonthlySummaryReport(params: {
  month: string;
  generatedAt: string;
}): Promise<ReportPayload> {
  const records = await listAccountingRecords();
  const metrics = buildAccountingDashboardMetrics(records, params.month);
  const employees = await listEmployeeDbRows();

  const columns: ReportColumn[] = [
    { key: 'section', label: 'Section' },
    { key: 'detail', label: 'Detail' },
    { key: 'value', label: 'Value' },
  ];

  const reportRows: ReportRow[] = [
    { section: 'Finance', detail: 'Income', value: money(metrics.income) },
    { section: 'Finance', detail: 'Expenses', value: money(metrics.expenses) },
    { section: 'Finance', detail: 'Payroll', value: money(metrics.payroll) },
    { section: 'Finance', detail: 'Net cashflow', value: money(metrics.netCashflow) },
    { section: 'Finance', detail: 'Transactions', value: metrics.transactionCount },
    { section: 'Headcount', detail: 'Employees', value: employees.length },
    {
      section: 'Headcount',
      detail: 'Active employees',
      value: employees.filter((row) => String(row.emsstatus || '').toLowerCase() === 'active')
        .length,
    },
    ...metrics.byAccount.map((item) => ({
      section: 'Account',
      detail: item.account,
      value: money(item.amount),
    })),
    ...metrics.byCategory.map((item) => ({
      section: 'Category',
      detail: item.category,
      value: money(item.amount),
    })),
  ];

  return {
    type: 'monthly_summary',
    title: 'Monthly summary',
    subtitle: monthLabel(params.month),
    generatedAt: params.generatedAt,
    columns,
    rows: reportRows,
    summary: [
      { label: 'Net cashflow', value: String(money(metrics.netCashflow)) },
      { label: 'Employees', value: String(employees.length) },
    ],
  };
}

export async function buildDirectorDashboard(
  month = currentMonth()
): Promise<DirectorDashboardMetrics> {
  const [records, employees] = await Promise.all([listAccountingRecords(), listEmployeeDbRows()]);
  const metrics = buildAccountingDashboardMetrics(records, month);
  const departments = new Set(
    employees.map((row) => String(row.department || '').trim()).filter(Boolean)
  );

  return {
    month,
    monthLabel: monthLabel(month),
    income: metrics.income,
    expenses: metrics.expenses,
    payroll: metrics.payroll,
    netCashflow: metrics.netCashflow,
    transactionCount: metrics.transactionCount,
    pendingDocuments: metrics.pendingDocuments,
    employeeCount: employees.length,
    activeEmployeeCount: employees.filter(
      (row) => String(row.emsstatus || '').toLowerCase() === 'active'
    ).length,
    departmentCount: departments.size,
    byAccount: metrics.byAccount,
    trend: metrics.trend,
  };
}

export function serializeReportValue(value: unknown): string {
  if (value == null) return '';
  return text(value);
}
