/**
 * Role-based access control for Arachnix EMS.
 *
 * Super Admin     — everything
 * HR Manager      — employees, salary slips, contracts/offer letters, leave (not accounting)
 * Finance Manager — accounting upload/records/dashboard (not HR data)
 * Director        — read-only financial + headcount dashboard
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HR_MANAGER: 'hr_manager',
  FINANCE_MANAGER: 'finance_manager',
  DIRECTOR: 'director',
  EMPLOYEE: 'employee',
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export type ResourceKey =
  | 'dashboard'
  | 'employees'
  | 'audit_log'
  | 'salary_slip_runs'
  | 'salary_slip_run_details'
  | 'generated_documents'
  | 'leave_requests'
  | 'leave_balances'
  | 'holiday_calendar'
  | 'accounting_records'
  | 'settings';

export type AccessLevel = 'none' | 'read' | 'write';

/** Canonical display labels for assigning roles in forms */
export const ROLE_OPTIONS = [
  { label: 'Super Admin', value: 'Super Admin' },
  { label: 'HR Manager', value: 'HR Manager' },
  { label: 'Finance Manager', value: 'Finance Manager' },
  { label: 'Director', value: 'Director' },
  { label: 'Employee', value: 'Employee' },
] as const;

export const KNOWN_ROLE_VALUES = ROLE_OPTIONS.map((option) => option.value);

const ROLE_ALIASES: Record<string, AppRole> = {
  'super admin': ROLES.SUPER_ADMIN,
  superadmin: ROLES.SUPER_ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
  admin: ROLES.SUPER_ADMIN,
  'hr manager': ROLES.HR_MANAGER,
  hr_manager: ROLES.HR_MANAGER,
  hr: ROLES.HR_MANAGER,
  'finance manager': ROLES.FINANCE_MANAGER,
  finance_manager: ROLES.FINANCE_MANAGER,
  finance: ROLES.FINANCE_MANAGER,
  director: ROLES.DIRECTOR,
  employee: ROLES.EMPLOYEE,
};

export function normalizeRole(raw: string | null | undefined): AppRole {
  const key = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = key.replace(/\s/g, '_');
  return ROLE_ALIASES[key] || ROLE_ALIASES[compact] || ROLES.EMPLOYEE;
}

export function roleDisplayName(role: AppRole | string): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case ROLES.SUPER_ADMIN:
      return 'Super Admin';
    case ROLES.HR_MANAGER:
      return 'HR Manager';
    case ROLES.FINANCE_MANAGER:
      return 'Finance Manager';
    case ROLES.DIRECTOR:
      return 'Director';
    default:
      return 'Employee';
  }
}

/**
 * Authorization role must come from app_metadata only (client JWT claim).
 * For legacy accounts missing app_metadata, use resolveTrustedRole() server-side
 * which can fall back to the employee sheet and backfill metadata.
 * Never trust user_metadata.role — it is client-writable.
 */
export function getTrustedRole(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): AppRole {
  const raw = user?.app_metadata?.role;
  if (typeof raw === 'string' && isKnownRoleValue(raw)) {
    return normalizeRole(raw);
  }
  return ROLES.EMPLOYEE;
}

/** True when app_metadata already carries a recognized role. */
export function hasTrustedAppRole(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  const raw = user?.app_metadata?.role;
  return typeof raw === 'string' && isKnownRoleValue(raw);
}

export function isKnownRoleValue(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const key = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  const compact = key.replace(/\s/g, '_');
  return Boolean(ROLE_ALIASES[key] || ROLE_ALIASES[compact]);
}

/**
 * Who may assign which system roles.
 * HR Manager cannot grant Super Admin (prevents privilege escalation).
 */
const ASSIGNABLE_ROLES: Record<AppRole, AppRole[]> = {
  [ROLES.SUPER_ADMIN]: [
    ROLES.SUPER_ADMIN,
    ROLES.HR_MANAGER,
    ROLES.FINANCE_MANAGER,
    ROLES.DIRECTOR,
    ROLES.EMPLOYEE,
  ],
  [ROLES.HR_MANAGER]: [
    ROLES.HR_MANAGER,
    ROLES.FINANCE_MANAGER,
    ROLES.DIRECTOR,
    ROLES.EMPLOYEE,
  ],
  [ROLES.FINANCE_MANAGER]: [],
  [ROLES.DIRECTOR]: [],
  [ROLES.EMPLOYEE]: [],
};

export function canAssignRole(actorRole: AppRole | string, targetRole: AppRole | string): boolean {
  if (!isKnownRoleValue(String(targetRole))) return false;
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  return ASSIGNABLE_ROLES[actor]?.includes(target) ?? false;
}

export function assignableRoleOptions(actorRole: AppRole | string) {
  return ROLE_OPTIONS.filter((option) => canAssignRole(actorRole, option.value));
}

export function assertCanAssignRole(
  actorRole: AppRole | string,
  targetRole: string
): { ok: true; role: AppRole } | { ok: false; error: string } {
  if (!isKnownRoleValue(targetRole)) {
    return { ok: false, error: `Invalid role: ${targetRole}` };
  }
  const target = normalizeRole(targetRole);
  if (!canAssignRole(actorRole, target)) {
    return {
      ok: false,
      error: `${roleDisplayName(actorRole)} cannot assign role ${roleDisplayName(target)}`,
    };
  }
  return { ok: true, role: target };
}

/** Matrix: which roles can access each resource, and at what level */
const PERMISSIONS: Record<ResourceKey, Partial<Record<AppRole, AccessLevel>>> = {
  dashboard: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
    [ROLES.DIRECTOR]: 'read',
    [ROLES.EMPLOYEE]: 'read',
  },
  employees: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  audit_log: {
    [ROLES.SUPER_ADMIN]: 'write',
  },
  salary_slip_runs: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  salary_slip_run_details: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  generated_documents: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  leave_requests: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  leave_balances: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  holiday_calendar: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  accounting_records: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
    [ROLES.DIRECTOR]: 'read',
  },
  settings: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
    [ROLES.DIRECTOR]: 'read',
    [ROLES.EMPLOYEE]: 'read',
  },
};

export function getAccessLevel(role: AppRole | string, resource: ResourceKey): AccessLevel {
  const normalized = normalizeRole(role);
  return PERMISSIONS[resource]?.[normalized] || 'none';
}

export function canAccess(role: AppRole | string, resource: ResourceKey): boolean {
  return getAccessLevel(role, resource) !== 'none';
}

export function canWrite(role: AppRole | string, resource: ResourceKey): boolean {
  return getAccessLevel(role, resource) === 'write';
}

/** Route path → resource mapping */
export const ROUTE_RESOURCES: { prefix: string; resource: ResourceKey }[] = [
  { prefix: '/dashboard/employees', resource: 'employees' },
  { prefix: '/dashboard/audit-log', resource: 'audit_log' },
  { prefix: '/dashboard/salary', resource: 'salary_slip_runs' },
  { prefix: '/dashboard/salary-slip-runs', resource: 'salary_slip_runs' },
  { prefix: '/dashboard/salary-slip-run-details', resource: 'salary_slip_run_details' },
  { prefix: '/dashboard/payroll', resource: 'salary_slip_runs' },
  { prefix: '/dashboard/generated-documents', resource: 'generated_documents' },
  { prefix: '/dashboard/leave-requests', resource: 'leave_requests' },
  { prefix: '/dashboard/leave-balances', resource: 'leave_balances' },
  { prefix: '/dashboard/holiday-calendar', resource: 'holiday_calendar' },
  { prefix: '/dashboard/accounting-records', resource: 'accounting_records' },
  { prefix: '/dashboard/settings', resource: 'settings' },
  { prefix: '/dashboard', resource: 'dashboard' },
];

export function resourceForPath(pathname: string): ResourceKey | null {
  const path = pathname.replace(/\/$/, '') || '/';
  for (const entry of ROUTE_RESOURCES) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      return entry.resource;
    }
  }
  return null;
}

export function canAccessPath(role: AppRole | string, pathname: string): boolean {
  const resource = resourceForPath(pathname);
  if (!resource) return false;
  return canAccess(role, resource);
}

export type NavItemConfig = {
  href: string;
  label: string;
  resource: ResourceKey;
  section: 'overview' | 'hr' | 'finance' | 'system' | 'workspace';
};

export const NAV_ITEMS: NavItemConfig[] = [
  { href: '/dashboard', label: 'Dashboard', resource: 'dashboard', section: 'overview' },
  { href: '/dashboard/employees', label: 'Employees', resource: 'employees', section: 'hr' },
  {
    href: '/dashboard/leave-requests',
    label: 'Leave Requests',
    resource: 'leave_requests',
    section: 'hr',
  },
  {
    href: '/dashboard/leave-balances',
    label: 'Leave Balances',
    resource: 'leave_balances',
    section: 'hr',
  },
  {
    href: '/dashboard/holiday-calendar',
    label: 'Holiday Calendar',
    resource: 'holiday_calendar',
    section: 'hr',
  },
  {
    href: '/dashboard/salary',
    label: 'Salary',
    resource: 'salary_slip_runs',
    section: 'hr',
  },
  {
    href: '/dashboard/salary-slip-runs',
    label: 'Salary Slip Runs',
    resource: 'salary_slip_runs',
    section: 'hr',
  },
  {
    href: '/dashboard/generated-documents',
    label: 'Generated Documents',
    resource: 'generated_documents',
    section: 'hr',
  },
  {
    href: '/dashboard/accounting-records',
    label: 'Accounting Records',
    resource: 'accounting_records',
    section: 'finance',
  },
  { href: '/dashboard/audit-log', label: 'Audit Log', resource: 'audit_log', section: 'system' },
  { href: '/dashboard/settings', label: 'Settings', resource: 'settings', section: 'workspace' },
];

export function getNavItemsForRole(role: AppRole | string): NavItemConfig[] {
  return NAV_ITEMS.filter((item) => canAccess(role, item.resource));
}

/** Roles allowed to mutate employee APIs (get-users, update-user, signup) */
export const EMPLOYEE_API_ROLES: AppRole[] = [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER];
