export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  GRANT_ACCESS: 'GRANT_ACCESS',
  REVOKE_ACCESS: 'REVOKE_ACCESS',
  UPLOAD: 'UPLOAD',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
  GENERATE: 'GENERATE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

/** Canonical recordType values written to the audit log. */
export const AUDIT_RECORD_TYPES = {
  EMPLOYEE: 'Employee',
  SALARY_DETAIL: 'SalaryDetail',
  SALARY_SLIP_RUN: 'SalarySlipRun',
  OFFER_LETTER_RUN: 'OfferLetterRun',
  LEAVE_REQUEST: 'LeaveRequest',
  LEAVE_BALANCE: 'LeaveBalance',
  HOLIDAY: 'Holiday',
  ACCOUNTING_RECORD: 'AccountingRecord',
  ACCOUNTING_BALANCE: 'AccountingBalance',
  FINANCIAL_STATEMENT: 'FinancialStatement',
} as const;

export type AuditRecordType =
  (typeof AUDIT_RECORD_TYPES)[keyof typeof AUDIT_RECORD_TYPES] | string;

/** Fallback actor when a background job or callback has no user email. */
export const SYSTEM_AUDIT_EMAIL = 'system@arachnix.io';

/** Canonical AuditLog sheet row from the PRD schema. */
export interface AuditLogRecord {
  logId: string;
  timestamp: string;
  userEmail: string;
  action: AuditAction;
  recordType: string;
  recordId: string;
  oldValue: string;
  newValue: string;
}

/** Values supplied by a mutation; ID, timestamp, and actor are server-owned. */
export interface CreateAuditEventInput {
  action: AuditAction;
  recordType: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditActor {
  email: string;
}

export interface AuditedMutationResult<T> {
  result: T;
  auditLogged: boolean;
}
