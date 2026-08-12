/** Root Drive folder for all accounting uploads. */
export const ACCOUNTING_COMPANY_ROOT = 'Arachnix Directory';

/** Fixed company bank account (directors come from employee records). */
export const ACCOUNTING_BANK_ACCOUNT = 'Arachnix Bank';

/** @deprecated Use ACCOUNTING_BANK_ACCOUNT + director employees instead. */
export const ACCOUNTING_ACCOUNTS = [ACCOUNTING_BANK_ACCOUNT] as const;

export const ACCOUNTING_CATEGORIES = [
  'Income',
  'Expenses',
  'Receipts',
  'Payroll',
  'Taxes',
  'Transfers',
  'Statements',
  'Miscellaneous',
] as const;

/** Matches DB CHECK on accountingrecords.transactiontype */
export const ACCOUNTING_TRANSACTION_TYPES = ['Income', 'Expense', 'Transfer'] as const;

export const ACCOUNTING_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED'] as const;

/**
 * How long a record without a DriveLink counts as "archiving". The server waits
 * exactly this long for the link before rolling the record back, so the UI stops
 * showing progress at the same moment the upload is abandoned.
 */
export const ACCOUNTING_ARCHIVE_GRACE_MINUTES = 2;

export const ACCOUNTING_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.csv',
  '.xls',
  '.xlsx',
  '.zip',
] as const;

export type AccountingAccount = (typeof ACCOUNTING_ACCOUNTS)[number] | string;
export type AccountingCategory = (typeof ACCOUNTING_CATEGORIES)[number] | string;
export type AccountingTransactionType = (typeof ACCOUNTING_TRANSACTION_TYPES)[number] | string;

export interface AccountingRecord {
  recordId: string;
  uploadDate: string;
  account: AccountingAccount;
  category: AccountingCategory;
  transactionType: AccountingTransactionType;
  amount: number;
  currency: string;
  clientVendor: string;
  source: string;
  destination: string;
  reference: string;
  notes: string;
  fileName: string;
  driveLink: string;
  uploadedBy: string;
  status: string;
  /** Derived: no driveLink yet and still inside the archival grace window. */
  pendingDrive?: boolean;
  /** Derived: grace window elapsed and no driveLink was ever written back. */
  driveMissing?: boolean;
  /** Period folder target YYYY-MM (sent to n8n; not a DB column). */
  period?: string;
}

export interface AccountingUploadInput {
  period: string; // YYYY-MM
  account: AccountingAccount;
  category: AccountingCategory;
  transactionType: AccountingTransactionType;
  amount: number;
  currency: string;
  clientVendor?: string;
  source?: string;
  destination?: string;
  reference?: string;
  notes?: string;
}

export interface AccountingDashboardMetrics {
  month: string;
  income: number;
  expenses: number;
  payroll: number;
  netCashflow: number;
  transactionCount: number;
  /** Records with no Drive link recorded, whether archiving or missing. */
  pendingDocuments: number;
  byAccount: Array<{ account: string; amount: number; count: number }>;
  byCategory: Array<{ category: string; amount: number; count: number }>;
  trend: Array<{ month: string; income: number; expenses: number }>;
}

/** Sanitize a token for Drive filenames. */
export function sanitizeFileToken(value: string, fallback = 'NA'): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

/**
 * Target Drive filename:
 * YYYY-MM-DD_Account_TransactionType_Client_Amount_Reference.ext
 */
export function buildAccountingDriveFileName(input: {
  date: string; // YYYY-MM-DD
  account: string;
  transactionType: string;
  clientVendor?: string;
  amount: number;
  reference?: string;
  originalFileName: string;
}): string {
  const extMatch = /\.[^.]+$/.exec(input.originalFileName.trim());
  const ext = (extMatch?.[0] || '').toLowerCase() || '.bin';
  const parts = [
    sanitizeFileToken(input.date, new Date().toISOString().slice(0, 10)),
    sanitizeFileToken(input.account, 'Account'),
    sanitizeFileToken(input.transactionType, 'Type'),
    sanitizeFileToken(input.clientVendor || '', 'NA'),
    sanitizeFileToken(String(input.amount), '0'),
    sanitizeFileToken(input.reference || '', 'NA'),
  ];
  return `${parts.join('_')}${ext}`.slice(0, 240);
}

export function parsePeriodMonth(
  period: string
): { year: number; month: number; label: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  // Drive folder is Company/<Year>/<Month>/ — Month is name only (e.g. "August").
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return { year, month, label };
}

export function isAllowedAccountingFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return ACCOUNTING_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
