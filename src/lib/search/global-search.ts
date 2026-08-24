import { listAccountingRecords } from '@/lib/db/accounting';
import { ACCOUNTING_NO_FILE_LABEL } from '@/types/accounting';
import { listEmployeeDbRows } from '@/lib/db/employees';
import { listLeaveBalances } from '@/lib/db/leave-balances';
import { listLeaveRequests } from '@/lib/db/leave-requests';
import { listSalaryDbRows } from '@/lib/db/salaries';
import {
  canSeeSalaryBankDetails,
  hrefForSearchHit,
  searchSourcesForRole,
  type SearchHit,
  type SearchSource,
} from '@/types/search-reports';
import type { AccessFlags, AppRole } from '@/lib/rbac';

/** Who is searching — role plus the director / finance overlays. */
type SearchViewer = {
  role: AppRole | string;
  flags: AccessFlags;
};

const MAX_HITS = 60;
const PER_SOURCE = 20;

function normalizeQuery(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function includes(haystack: unknown, needle: string) {
  if (!needle) return false;
  return String(haystack ?? '')
    .toLowerCase()
    .includes(needle);
}

function pushHit(hits: SearchHit[], hit: SearchHit) {
  if (hits.length >= MAX_HITS) return;
  hits.push(hit);
}

function matchFields(query: string, fields: Array<{ label: string; value: unknown }>): string[] {
  return fields.filter((field) => includes(field.value, query)).map((field) => field.label);
}

export async function runGlobalSearch(params: {
  query: string;
  role: AppRole | string;
  hasFinanceAccess?: boolean;
  isDirector?: boolean;
  sources?: SearchSource[];
}): Promise<SearchHit[]> {
  const query = normalizeQuery(params.query);
  if (query.length < 2) return [];

  const viewer: SearchViewer = {
    role: params.role,
    flags: {
      hasFinanceAccess: params.hasFinanceAccess,
      isDirector: params.isDirector,
    },
  };

  const allowed = new Set(searchSourcesForRole(viewer.role, viewer.flags));
  const requested = params.sources?.length
    ? params.sources.filter((source) => allowed.has(source))
    : [...allowed];

  if (requested.length === 0) return [];

  const hits: SearchHit[] = [];
  await Promise.all(
    requested.map(async (source) => {
      const sourceHits = await searchSource(source, query, viewer);
      for (const hit of sourceHits.slice(0, PER_SOURCE)) {
        pushHit(hits, hit);
      }
    })
  );

  return hits.sort((a, b) => a.title.localeCompare(b.title)).slice(0, MAX_HITS);
}

async function searchSource(
  source: SearchSource,
  query: string,
  viewer: SearchViewer
): Promise<SearchHit[]> {
  switch (source) {
    case 'employee':
      return searchEmployees(query, viewer);
    case 'accounting':
      return searchAccounting(query, viewer);
    case 'salary':
      return searchSalaries(query, viewer);
    case 'leave_request':
      return searchLeaveRequests(query, viewer);
    case 'leave_balance':
      return searchLeaveBalances(query, viewer);
    default:
      return [];
  }
}

async function searchEmployees(query: string, viewer: SearchViewer): Promise<SearchHit[]> {
  const rows = await listEmployeeDbRows();
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const matchedOn = matchFields(query, [
      { label: 'Employee ID', value: row.employeeid },
      { label: 'Name', value: row.fullname },
      { label: 'Email', value: row.email },
      { label: 'Department', value: row.department },
      { label: 'Designation', value: row.designation },
      { label: 'Phone', value: row.phone },
      { label: 'Role', value: row.role },
      { label: 'Status', value: row.emsstatus },
      { label: 'Joining date', value: row.joiningdate },
    ]);
    if (matchedOn.length === 0) continue;

    hits.push({
      id: `employee:${row.employeeid}`,
      source: 'employee',
      title: row.fullname || row.employeeid,
      subtitle: [row.employeeid, row.department, row.designation].filter(Boolean).join(' · '),
      meta: row.emsstatus || '—',
      href: hrefForSearchHit(viewer.role, 'employee', row.employeeid, viewer.flags),
      matchedOn,
    });
  }

  return hits;
}

async function searchAccounting(query: string, viewer: SearchViewer): Promise<SearchHit[]> {
  const rows = await listAccountingRecords();
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const matchedOn = matchFields(query, [
      { label: 'Client / Vendor', value: row.clientVendor },
      { label: 'Amount', value: row.amount },
      { label: 'Reference', value: row.reference },
      { label: 'Invoice / Reference', value: row.reference },
      { label: 'Account', value: row.account },
      { label: 'Category', value: row.category },
      { label: 'Transaction type', value: row.transactionType },
      { label: 'Document type', value: row.category },
      { label: 'File name', value: row.fileName || ACCOUNTING_NO_FILE_LABEL },
      { label: 'Notes', value: row.notes },
      { label: 'Source', value: row.source },
      { label: 'Destination', value: row.destination },
      { label: 'Upload date', value: row.uploadDate },
      { label: 'Month', value: row.uploadDate.slice(0, 7) },
      { label: 'Currency', value: row.currency },
      { label: 'Record ID', value: row.recordId },
    ]);
    if (matchedOn.length === 0) continue;

    hits.push({
      id: `accounting:${row.recordId}`,
      source: 'accounting',
      title: `${row.transactionType} · ${row.clientVendor || row.account || 'Transaction'}`,
      subtitle: [
        row.account,
        row.category,
        `${row.currency} ${Number(row.amount).toLocaleString()}`,
        row.reference ? `Ref ${row.reference}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      meta: row.uploadDate.slice(0, 10) || '—',
      href: hrefForSearchHit(viewer.role, 'accounting', undefined, viewer.flags),
      matchedOn,
    });
  }

  return hits;
}

async function searchSalaries(query: string, viewer: SearchViewer): Promise<SearchHit[]> {
  const rows = await listSalaryDbRows();
  const hits: SearchHit[] = [];
  // Bank details never leave this function for a viewer without salary access,
  // even if the source itself was somehow reached.
  const showBankDetails = canSeeSalaryBankDetails(viewer.role, viewer.flags);

  for (const row of rows) {
    const matchedOn = matchFields(query, [
      { label: 'Employee ID', value: row.employeeid },
      { label: 'Amount', value: row.netsalary },
      { label: 'Base salary', value: row.basesalary },
      ...(showBankDetails
        ? [
            { label: 'Account name', value: row.accountname },
            { label: 'Account number', value: row.accountnumber },
            { label: 'Bank', value: row.bankname },
          ]
        : []),
    ]);
    if (matchedOn.length === 0) continue;

    hits.push({
      id: `salary:${row.employeeid || row.salaryid}`,
      source: 'salary',
      title: `Salary · ${row.employeeid}`,
      subtitle: [
        `Net ${Number(row.netsalary).toLocaleString()}`,
        showBankDetails ? row.accountname : '',
      ]
        .filter(Boolean)
        .join(' · '),
      meta: (showBankDetails ? row.bankname : '') || '—',
      href: hrefForSearchHit(viewer.role, 'salary', undefined, viewer.flags),
      matchedOn,
    });
  }

  return hits;
}

async function searchLeaveRequests(query: string, viewer: SearchViewer): Promise<SearchHit[]> {
  const rows = await listLeaveRequests();
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const matchedOn = matchFields(query, [
      { label: 'Employee ID', value: row.employeeId },
      { label: 'Name', value: row.fullName },
      { label: 'Leave type', value: row.leaveType },
      { label: 'Status', value: row.status },
      { label: 'Start date', value: row.startDate },
      { label: 'End date', value: row.endDate },
      { label: 'Reason', value: row.reason },
      { label: 'Request ID', value: row.requestId },
      { label: 'Department', value: row.department },
    ]);
    if (matchedOn.length === 0) continue;

    hits.push({
      id: `leave_request:${row.requestId}`,
      source: 'leave_request',
      title: `Leave · ${row.fullName || row.employeeId}`,
      subtitle: [
        row.leaveType,
        `${row.startDate} → ${row.endDate}`,
        `${row.daysRequested} day(s)`,
      ]
        .filter(Boolean)
        .join(' · '),
      meta: String(row.status || '—'),
      href: hrefForSearchHit(viewer.role, 'leave_request', undefined, viewer.flags),
      matchedOn,
    });
  }

  return hits;
}

async function searchLeaveBalances(query: string, viewer: SearchViewer): Promise<SearchHit[]> {
  const rows = await listLeaveBalances();
  const hits: SearchHit[] = [];

  for (const row of rows) {
    const matchedOn = matchFields(query, [
      { label: 'Employee ID', value: row.employeeId },
      { label: 'Name', value: row.fullName },
      { label: 'Year', value: row.year },
      { label: 'Leave ID', value: row.leaveId },
      { label: 'Department', value: row.department },
    ]);
    if (matchedOn.length === 0) continue;

    hits.push({
      id: `leave_balance:${row.leaveId}`,
      source: 'leave_balance',
      title: `Leave balance · ${row.fullName || row.employeeId}`,
      subtitle: [
        String(row.year),
        `Annual ${row.annualUsed}/${row.annualQuota}`,
        row.department,
      ]
        .filter(Boolean)
        .join(' · '),
      meta: row.leaveId,
      href: hrefForSearchHit(viewer.role, 'leave_balance', undefined, viewer.flags),
      matchedOn,
    });
  }

  return hits;
}
