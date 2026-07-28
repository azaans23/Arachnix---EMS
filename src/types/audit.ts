export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  GRANT_ACCESS: 'GRANT_ACCESS',
  REVOKE_ACCESS: 'REVOKE_ACCESS',
  UPLOAD: 'UPLOAD',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  GENERATE: 'GENERATE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

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
