import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listEmployeeDbRows } from '@/lib/db/employees';
import { normalizeRole, ROLES } from '@/lib/rbac';
import {
  parsePeriodMonth,
  ACCOUNTING_ARCHIVE_GRACE_MINUTES,
  ACCOUNTING_COMPANY_ROOT,
  ACCOUNTING_BANK_ACCOUNT,
  type AccountingRecord,
  type AccountingUploadInput,
  type AccountingDashboardMetrics,
} from '@/types/accounting';

type AccountingDbRow = {
  recordid: number;
  uploaddate: string | null;
  account: string;
  category: string;
  transactiontype: string;
  amount: number | string | null;
  currency: string | null;
  clientvendor: string | null;
  source: string | null;
  destination: string | null;
  reference: string | null;
  notes: string | null;
  filename: string | null;
  drivelink: string | null;
  uploadedby: string | null;
  status: string | null;
};

const TABLE = 'accountingrecords';
const ALLOWED_TYPES = new Set(['Income', 'Expense', 'Transfer']);

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function toAmount(value: unknown): number {
  const n = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  );
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Amount must be zero or greater.');
  }
  return n;
}

/** Postgres `timestamp without time zone` values are UTC; tag them so Date parses them as UTC. */
function toUtcTimestamp(value: string | null): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
}

export function mapAccountingRow(row: AccountingDbRow): AccountingRecord {
  const driveLink = (row.drivelink || '').trim();
  const uploadDate = toUtcTimestamp(row.uploaddate);
  const uploadedAt = uploadDate ? Date.parse(uploadDate) : NaN;
  const withinGrace =
    Number.isFinite(uploadedAt) &&
    Date.now() - uploadedAt < ACCOUNTING_ARCHIVE_GRACE_MINUTES * 60_000;

  return {
    recordId: String(row.recordid),
    uploadDate,
    account: row.account || '',
    category: row.category || '',
    transactionType: row.transactiontype || '',
    amount: Number(row.amount ?? 0),
    currency: row.currency || 'PKR',
    clientVendor: row.clientvendor || '',
    source: row.source || '',
    destination: row.destination || '',
    reference: row.reference || '',
    notes: row.notes || '',
    fileName: row.filename || '',
    driveLink,
    uploadedBy: row.uploadedby || '',
    status: row.status || 'Active',
    pendingDrive: !driveLink && withinGrace,
    driveMissing: !driveLink && !withinGrace,
  };
}

/** Directors used as accounting sub-accounts (name is the Account value). */
export type AccountingDirectorAccount = {
  employeeId: string;
  name: string;
  email: string;
};

/**
 * Every Director in the employee table, regardless of EMS status — a director's
 * accounting sub-account exists for as long as their folder does, and login access
 * has no bearing on whether finance can file documents against them.
 */
export async function listAccountingDirectorAccounts(): Promise<AccountingDirectorAccount[]> {
  const employees = await listEmployeeDbRows();
  const directors = employees
    .filter((employee) => normalizeRole(employee.role) === ROLES.DIRECTOR)
    .map((employee) => ({
      employeeId: employee.employeeid,
      name: String(employee.fullname || '').trim(),
      email: String(employee.email || '').trim(),
    }))
    .filter((employee) => Boolean(employee.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Account values are names, so two directors sharing one would collide.
  const seen = new Set<string>();
  return directors.filter((director) => {
    const key = director.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fixed bank + live director names for account pickers. */
export function buildAccountingAccountOptions(directors: AccountingDirectorAccount[]): string[] {
  const names = directors.map((director) => director.name);
  return [ACCOUNTING_BANK_ACCOUNT, ...names.filter((name) => name !== ACCOUNTING_BANK_ACCOUNT)];
}

export function toWebhookAccountingRow(record: AccountingRecord, period?: string) {
  const parsed = period ? parsePeriodMonth(period) : null;
  return {
    RecordID: Number(record.recordId) || record.recordId,
    UploadDate: record.uploadDate,
    Account: record.account,
    Category: record.category,
    TransactionType: record.transactionType,
    Amount: record.amount,
    Currency: record.currency,
    ClientVendor: record.clientVendor || '',
    Source: record.source || '',
    Destination: record.destination || '',
    Reference: record.reference || '',
    Notes: record.notes || '',
    FileName: record.fileName || '',
    DriveLink: record.driveLink || '',
    UploadedBy: record.uploadedBy || '',
    Status: record.status || 'Active',
    Period: period || '',
    Company: ACCOUNTING_COMPANY_ROOT,
    Year: parsed?.year ?? '',
    Month: parsed?.label ?? '',
    MonthNumber: parsed?.month ?? '',
  };
}

export function normalizeAccountingUploadInput(
  raw: Record<string, unknown>
): AccountingUploadInput {
  const period = requiredText(raw.period ?? raw.Period, 'Period');
  if (!parsePeriodMonth(period)) {
    throw new Error('Period must be YYYY-MM.');
  }

  const transactionType = requiredText(
    raw.transactionType ?? raw.TransactionType,
    'Transaction type'
  );
  if (!ALLOWED_TYPES.has(transactionType)) {
    throw new Error('Transaction type must be Income, Expense, or Transfer.');
  }

  return {
    period,
    account: requiredText(raw.account ?? raw.Account, 'Account'),
    category: requiredText(raw.category ?? raw.Category, 'Category'),
    transactionType,
    amount: toAmount(raw.amount ?? raw.Amount),
    currency:
      String(raw.currency ?? raw.Currency ?? 'PKR')
        .trim()
        .toUpperCase()
        .slice(0, 3) || 'PKR',
    clientVendor: String(raw.clientVendor ?? raw.ClientVendor ?? '').trim(),
    source: String(raw.source ?? raw.Source ?? '').trim(),
    destination: String(raw.destination ?? raw.Destination ?? '').trim(),
    reference: String(raw.reference ?? raw.Reference ?? '').trim(),
    notes: String(raw.notes ?? raw.Notes ?? '').trim(),
  };
}

export async function listAccountingRecords(filters?: {
  account?: string;
  category?: string;
  month?: string; // YYYY-MM on uploadDate
}): Promise<AccountingRecord[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*');

  if (filters?.account) query = query.eq('account', filters.account.trim());
  if (filters?.category) query = query.eq('category', filters.category.trim());

  const { data, error } = await query.order('recordid', { ascending: false });
  if (error) throw new Error(`Failed to list accounting records: ${error.message}`);

  let rows = ((data as AccountingDbRow[]) || []).map(mapAccountingRow);

  if (filters?.month) {
    const prefix = filters.month.trim();
    rows = rows.filter((row) => row.uploadDate.startsWith(prefix));
  }

  return rows;
}

export async function getAccountingRecord(recordId: string): Promise<AccountingRecord | null> {
  const id = Number(recordId);
  if (!Number.isFinite(id)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('recordid', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load accounting record: ${error.message}`);
  if (!data) return null;
  return mapAccountingRow(data as AccountingDbRow);
}

export async function createAccountingRecord(input: {
  meta: AccountingUploadInput;
  fileName: string;
  uploadedBy: string;
}): Promise<AccountingRecord> {
  const payload = {
    account: input.meta.account,
    category: input.meta.category,
    transactiontype: input.meta.transactionType,
    amount: input.meta.amount,
    currency: input.meta.currency,
    clientvendor: input.meta.clientVendor || null,
    source: input.meta.source || null,
    destination: input.meta.destination || null,
    reference: input.meta.reference || null,
    notes: input.meta.notes || null,
    filename: input.fileName,
    drivelink: null,
    uploadedby: input.uploadedBy.slice(0, 255),
    status: 'Active',
  };

  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(payload).select('*').single();

  if (error) throw new Error(`Failed to create accounting record: ${error.message}`);
  return mapAccountingRow(data as AccountingDbRow);
}

export async function updateAccountingRecordDriveLink(
  recordId: string,
  patch: { driveLink?: string | null; fileName?: string | null; notes?: string | null }
): Promise<AccountingRecord> {
  const id = Number(recordId);
  if (!Number.isFinite(id)) throw new Error('Invalid record ID.');

  const payload: Record<string, unknown> = {};
  if (patch.driveLink !== undefined) payload.drivelink = patch.driveLink || null;
  if (patch.fileName !== undefined) payload.filename = patch.fileName || null;
  if (patch.notes !== undefined) payload.notes = patch.notes || null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('recordid', id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update accounting record: ${error.message}`);
  return mapAccountingRow(data as AccountingDbRow);
}

export async function deleteAccountingRecord(recordId: string): Promise<void> {
  const id = Number(recordId);
  if (!Number.isFinite(id)) throw new Error('Invalid record ID.');
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('recordid', id);
  if (error) throw new Error(`Failed to delete accounting record: ${error.message}`);
}

export function buildAccountingDashboardMetrics(
  records: AccountingRecord[],
  month: string
): AccountingDashboardMetrics {
  const monthRecords = records.filter((row) => row.uploadDate.startsWith(month));
  const income = monthRecords
    .filter((r) => r.transactionType === 'Income' || r.category === 'Income')
    .reduce((sum, r) => sum + r.amount, 0);
  const expenses = monthRecords
    .filter(
      (r) =>
        r.transactionType === 'Expense' ||
        r.category === 'Expenses' ||
        r.category === 'Taxes' ||
        r.category === 'Payroll'
    )
    .reduce((sum, r) => sum + r.amount, 0);
  const payroll = monthRecords
    .filter((r) => r.category === 'Payroll')
    .reduce((sum, r) => sum + r.amount, 0);

  /** Income adds, Expense subtracts — transfers do not affect the signed totals. */
  const signedAmount = (row: AccountingRecord) => {
    if (row.transactionType === 'Income' || row.category === 'Income') return row.amount;
    if (
      row.transactionType === 'Expense' ||
      row.category === 'Expenses' ||
      row.category === 'Taxes' ||
      row.category === 'Payroll'
    ) {
      return -row.amount;
    }
    return 0;
  };

  const byAccountMap = new Map<string, { amount: number; count: number }>();
  const byCategoryMap = new Map<string, { amount: number; count: number }>();
  for (const row of monthRecords) {
    const signed = signedAmount(row);
    const account = byAccountMap.get(row.account) || { amount: 0, count: 0 };
    account.amount += signed;
    account.count += 1;
    byAccountMap.set(row.account, account);

    const category = byCategoryMap.get(row.category) || { amount: 0, count: 0 };
    // Folder volume stays absolute magnitude for ranking bars.
    category.amount += row.amount;
    category.count += 1;
    byCategoryMap.set(row.category, category);
  }

  const trendMap = new Map<string, { income: number; expenses: number }>();
  for (const row of records) {
    const key = row.uploadDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const bucket = trendMap.get(key) || { income: 0, expenses: 0 };
    if (row.transactionType === 'Income' || row.category === 'Income') {
      bucket.income += row.amount;
    } else if (
      row.transactionType === 'Expense' ||
      row.category === 'Expenses' ||
      row.category === 'Taxes' ||
      row.category === 'Payroll'
    ) {
      bucket.expenses += row.amount;
    }
    trendMap.set(key, bucket);
  }

  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([m, value]) => ({ month: m, ...value }));

  return {
    month,
    income,
    expenses,
    payroll,
    netCashflow: income - expenses,
    transactionCount: monthRecords.length,
    pendingDocuments: monthRecords.filter((r) => r.pendingDrive || r.driveMissing).length,
    // Charts read these in order; zero-value buckets would render invisible slices.
    byAccount: [...byAccountMap.entries()]
      .map(([account, value]) => ({ account, ...value }))
      .filter((item) => item.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    byCategory: [...byCategoryMap.entries()]
      .map(([category, value]) => ({ category, ...value }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    trend,
  };
}
