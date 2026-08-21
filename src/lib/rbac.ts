/**
 * Role-based access control for Arachnix EMS.
 *
 * Super Admin     — everything; exactly one account; cannot be created/assigned by anyone;
 *                   only they can edit their own employee record
 * Admin           — broad operational access; can create Admin/HR/Finance/Employee roles,
 *                   edit self + staff, but cannot manage Super Admin
 * HR Manager      — employee management, leave, salary profiles, offer letters, holidays;
 *                   reports (employee and payroll only);
 *                   can manage HR and Employee (not Finance, Admin, or Super Admin)
 * Finance Manager — salary profiles, salary slips, accounting, and holiday read;
 *                   no employee directory
 * Director        — not a login role. Super Admin may toggle `isDirector` on any employee;
 *                   that unlocks read-only dashboard / accounting / reports overlay
 * HR + finance    — Super Admin / Admin may toggle `hasFinanceAccess` on HR Manager
 *                   so that person also receives Finance Manager permissions
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  HR_MANAGER: 'hr_manager',
  FINANCE_MANAGER: 'finance_manager',
  DIRECTOR: 'director',
  EMPLOYEE: 'employee',
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

/** Extra grants stored on the employee row / JWT app_metadata (not roles). */
export type AccessFlags = {
  hasFinanceAccess?: boolean;
  isDirector?: boolean;
};

export type AccessContext = AccessFlags & { role: AppRole | string };

export type ResourceKey =
  | 'dashboard'
  | 'employees'
  | 'audit_log'
  | 'salary'
  | 'salary_slip_runs'
  | 'salary_slip_run_details'
  | 'generated_documents'
  | 'leave_requests'
  | 'leave_balances'
  | 'holiday_calendar'
  | 'accounting_records'
  | 'search'
  | 'reports'
  | 'settings';

export type AccessLevel = 'none' | 'read' | 'write';

/** Canonical display labels for assigning roles in forms */
export const ROLE_OPTIONS = [
  { label: 'Super Admin', value: 'Super Admin' },
  { label: 'Admin', value: 'Admin' },
  { label: 'HR Manager', value: 'HR Manager' },
  { label: 'Finance Manager', value: 'Finance Manager' },
  { label: 'Employee', value: 'Employee' },
] as const;

export const KNOWN_ROLE_VALUES = ROLE_OPTIONS.map((option) => option.value);

const ROLE_ALIASES: Record<string, AppRole> = {
  'super admin': ROLES.SUPER_ADMIN,
  superadmin: ROLES.SUPER_ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
  admin: ROLES.ADMIN,
  administrator: ROLES.ADMIN,
  'hr manager': ROLES.HR_MANAGER,
  hr_manager: ROLES.HR_MANAGER,
  hr: ROLES.HR_MANAGER,
  'finance manager': ROLES.FINANCE_MANAGER,
  finance_manager: ROLES.FINANCE_MANAGER,
  finance: ROLES.FINANCE_MANAGER,
  'accounting manager': ROLES.FINANCE_MANAGER,
  accounting_manager: ROLES.FINANCE_MANAGER,
  accounting: ROLES.FINANCE_MANAGER,
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
    case ROLES.ADMIN:
      return 'Admin';
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

export function getTrustedRole(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): AppRole {
  const raw = user?.app_metadata?.role;
  if (typeof raw === 'string' && isKnownRoleValue(raw)) {
    return normalizeRole(raw);
  }
  return ROLES.EMPLOYEE;
}

function metadataFlag(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
  key: string
): boolean {
  const value = user?.app_metadata?.[key];
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export function getTrustedAccess(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): AccessContext {
  const role = getTrustedRole(user);
  return {
    role,
    hasFinanceAccess: metadataFlag(user, 'hasFinanceAccess'),
    isDirector: metadataFlag(user, 'isDirector') || role === ROLES.DIRECTOR,
  };
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
  const key = String(raw).toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const compact = key.replace(/\s/g, '_');
  return Boolean(ROLE_ALIASES[key] || ROLE_ALIASES[compact]);
}

const ASSIGNABLE_ROLES: Record<AppRole, AppRole[]> = {
  [ROLES.SUPER_ADMIN]: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.FINANCE_MANAGER, ROLES.EMPLOYEE],
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.FINANCE_MANAGER, ROLES.EMPLOYEE],
  [ROLES.HR_MANAGER]: [ROLES.HR_MANAGER, ROLES.EMPLOYEE],
  [ROLES.FINANCE_MANAGER]: [],
  [ROLES.DIRECTOR]: [],
  [ROLES.EMPLOYEE]: [],
};

/** Every role except Admin and Super Admin. */
export const STAFF_ROLES: AppRole[] = [ROLES.HR_MANAGER, ROLES.FINANCE_MANAGER, ROLES.EMPLOYEE];

export function isSuperAdminRole(role: AppRole | string | null | undefined): boolean {
  return normalizeRole(role) === ROLES.SUPER_ADMIN;
}

export function isAdminRole(role: AppRole | string | null | undefined): boolean {
  return normalizeRole(role) === ROLES.ADMIN;
}

export function canAssignRole(actorRole: AppRole | string, targetRole: AppRole | string): boolean {
  if (!isKnownRoleValue(String(targetRole))) return false;
  const target = normalizeRole(targetRole);
  // Super Admin is seeded once and cannot be created or reassigned by any role.
  if (target === ROLES.SUPER_ADMIN) return false;
  const actor = normalizeRole(actorRole);
  return ASSIGNABLE_ROLES[actor]?.includes(target) ?? false;
}

/**
 * Role-only check (no identity): may this actor manage someone who currently holds targetRole?
 * Does not cover Admin/Super Admin editing themselves — use canEditEmployeeRecord for that.
 */
export function canManageEmployeeRole(
  actorRole: AppRole | string,
  targetRole: AppRole | string
): boolean {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  // Nobody manages Super Admin via role alone (only self-edit, which needs identity).
  if (target === ROLES.SUPER_ADMIN) return false;
  if (actor === ROLES.SUPER_ADMIN) return true;
  if (actor === ROLES.ADMIN) {
    return STAFF_ROLES.includes(target);
  }
  if (actor === ROLES.HR_MANAGER) {
    return target === ROLES.HR_MANAGER || target === ROLES.EMPLOYEE;
  }
  return false;
}

export function emailsMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = String(left || '')
    .trim()
    .toLowerCase();
  const b = String(right || '')
    .trim()
    .toLowerCase();
  return Boolean(a && b && a === b);
}

/** True when actor and target resolve to the same person (email and/or auth user id). */
export function isActorSelf(input: {
  actorEmail?: string | null;
  actorUserId?: string | null;
  targetEmail?: string | null;
  targetSupabaseUserId?: string | null;
}): boolean {
  if (emailsMatch(input.actorEmail, input.targetEmail)) return true;
  const actorId = String(input.actorUserId || '').trim();
  const targetId = String(input.targetSupabaseUserId || '').trim();
  return Boolean(actorId && targetId && actorId === targetId);
}

/** Super Admin targeting their own employee record. */
export function isSuperAdminSelfTarget(
  actorRole: AppRole | string,
  actorEmail: string | null | undefined,
  targetEmail: string | null | undefined
): boolean {
  return isSuperAdminRole(actorRole) && emailsMatch(actorEmail, targetEmail);
}

/**
 * True when a Super Admin is targeting their own employee record
 * (matched by email and/or Supabase auth user id).
 */
export function isSuperAdminSelfEdit(input: {
  actorRole: AppRole | string;
  actorEmail?: string | null;
  actorUserId?: string | null;
  targetEmail?: string | null;
  targetSupabaseUserId?: string | null;
}): boolean {
  if (!isSuperAdminRole(input.actorRole)) return false;
  return isActorSelf(input);
}

/**
 * Who may edit an employee profile:
 * - Super Admin → everyone, including themselves; only they may edit a Super Admin
 * - Admin → themselves + staff (not other Admins, not Super Admin)
 * - HR → HR and Employee (not Finance, Admin, Super Admin, and not Director-as-role)
 */
export function canEditEmployeeRecord(input: {
  actorRole: AppRole | string;
  actorEmail?: string | null;
  actorUserId?: string | null;
  targetRole: AppRole | string | null | undefined;
  targetEmail?: string | null;
  targetSupabaseUserId?: string | null;
}): boolean {
  const actor = normalizeRole(input.actorRole);
  const target = normalizeRole(input.targetRole || '');
  const self = isActorSelf(input);

  if (target === ROLES.SUPER_ADMIN) {
    return actor === ROLES.SUPER_ADMIN && self;
  }

  if (actor === ROLES.SUPER_ADMIN) return true;

  if (actor === ROLES.ADMIN) {
    if (self) return true;
    return STAFF_ROLES.includes(target);
  }

  if (actor === ROLES.HR_MANAGER) {
    return target === ROLES.HR_MANAGER || target === ROLES.EMPLOYEE;
  }

  return false;
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
  if (target === ROLES.SUPER_ADMIN) {
    return {
      ok: false,
      error: 'Super Admin cannot be created or assigned. Only one Super Admin exists.',
    };
  }
  if (!canAssignRole(actorRole, target)) {
    return {
      ok: false,
      error: `${roleDisplayName(actorRole)} cannot assign role ${roleDisplayName(target)}`,
    };
  }
  return { ok: true, role: target };
}

export function assertCanEditEmployee(input: {
  actorRole: AppRole | string;
  actorEmail?: string | null;
  actorUserId?: string | null;
  targetEmail?: string | null;
  targetSupabaseUserId?: string | null;
  previousRole?: string | null;
  nextRole: string;
}): { ok: true; role: AppRole } | { ok: false; error: string } {
  const actor = normalizeRole(input.actorRole);
  const self = isActorSelf(input);
  const previous = input.previousRole ? normalizeRole(input.previousRole) : null;

  if (previous) {
    if (
      !canEditEmployeeRecord({
        actorRole: input.actorRole,
        actorEmail: input.actorEmail,
        actorUserId: input.actorUserId,
        targetRole: previous,
        targetEmail: input.targetEmail,
        targetSupabaseUserId: input.targetSupabaseUserId,
      })
    ) {
      return {
        ok: false,
        error: `${roleDisplayName(input.actorRole)} cannot edit employees with role ${roleDisplayName(previous)}`,
      };
    }
  }

  if (!isKnownRoleValue(input.nextRole)) {
    return { ok: false, error: `Invalid role: ${input.nextRole}` };
  }

  const next = normalizeRole(input.nextRole);

  // Super Admin may keep their own Super Admin role when editing themselves.
  if (next === ROLES.SUPER_ADMIN) {
    if (actor === ROLES.SUPER_ADMIN && self && (!previous || previous === ROLES.SUPER_ADMIN)) {
      return { ok: true, role: ROLES.SUPER_ADMIN };
    }
    return {
      ok: false,
      error: 'Super Admin cannot be created or assigned. Only one Super Admin exists.',
    };
  }

  // Admin may keep their own Admin role when editing themselves.
  if (
    next === ROLES.ADMIN &&
    actor === ROLES.ADMIN &&
    self &&
    (!previous || previous === ROLES.ADMIN)
  ) {
    return { ok: true, role: ROLES.ADMIN };
  }

  return assertCanAssignRole(input.actorRole, input.nextRole);
}

/** Matrix: which roles can access each resource, and at what level */
const PERMISSIONS: Record<ResourceKey, Partial<Record<AppRole, AccessLevel>>> = {
  dashboard: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
    [ROLES.DIRECTOR]: 'read',
  },
  employees: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  audit_log: {
    [ROLES.SUPER_ADMIN]: 'write',
  },
  salary: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
  },
  salary_slip_runs: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
  },
  salary_slip_run_details: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
  },
  generated_documents: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  leave_requests: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  leave_balances: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
  },
  holiday_calendar: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.HR_MANAGER]: 'write',
    [ROLES.FINANCE_MANAGER]: 'read',
  },
  accounting_records: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'write',
    [ROLES.FINANCE_MANAGER]: 'write',
    [ROLES.DIRECTOR]: 'read',
  },
  search: {
    [ROLES.SUPER_ADMIN]: 'read',
    [ROLES.ADMIN]: 'read',
    [ROLES.HR_MANAGER]: 'read',
    [ROLES.FINANCE_MANAGER]: 'read',
    [ROLES.DIRECTOR]: 'read',
  },
  reports: {
    [ROLES.SUPER_ADMIN]: 'read',
    [ROLES.ADMIN]: 'read',
    [ROLES.HR_MANAGER]: 'read',
    [ROLES.FINANCE_MANAGER]: 'read',
    [ROLES.DIRECTOR]: 'read',
  },
  settings: {
    [ROLES.SUPER_ADMIN]: 'write',
    [ROLES.ADMIN]: 'read',
    [ROLES.HR_MANAGER]: 'read',
    [ROLES.FINANCE_MANAGER]: 'read',
    [ROLES.DIRECTOR]: 'read',
    [ROLES.EMPLOYEE]: 'read',
  },
};

export function getAccessLevel(
  role: AppRole | string,
  resource: ResourceKey,
  flags?: AccessFlags
): AccessLevel {
  const normalized = normalizeRole(role);
  const isDirector = Boolean(flags?.isDirector) || normalized === ROLES.DIRECTOR;
  const baseRole = normalized === ROLES.DIRECTOR ? ROLES.EMPLOYEE : normalized;
  let level: AccessLevel = PERMISSIONS[resource]?.[baseRole] || 'none';

  if (isDirector) {
    level = higherAccess(level, PERMISSIONS[resource]?.[ROLES.DIRECTOR] || 'none');
  }
  if (flags?.hasFinanceAccess && baseRole === ROLES.HR_MANAGER) {
    level = higherAccess(level, PERMISSIONS[resource]?.[ROLES.FINANCE_MANAGER] || 'none');
  }
  return level;
}

function higherAccess(left: AccessLevel, right: AccessLevel): AccessLevel {
  const rank = (level: AccessLevel) => (level === 'write' ? 2 : level === 'read' ? 1 : 0);
  return rank(left) >= rank(right) ? left : right;
}

export function canAccess(
  role: AppRole | string,
  resource: ResourceKey,
  flags?: AccessFlags
): boolean {
  return getAccessLevel(role, resource, flags) !== 'none';
}

export function canWrite(
  role: AppRole | string,
  resource: ResourceKey,
  flags?: AccessFlags
): boolean {
  return getAccessLevel(role, resource, flags) === 'write';
}

/** Super Admin / Admin may grant Finance permissions to an HR Manager. */
export function canAssignHrFinanceAccess(actorRole: AppRole | string): boolean {
  const actor = normalizeRole(actorRole);
  return actor === ROLES.SUPER_ADMIN || actor === ROLES.ADMIN;
}

/** Only Super Admin may mark or unmark someone as a company director. */
export function canAssignDirectorFlag(actorRole: AppRole | string): boolean {
  return isSuperAdminRole(actorRole);
}

/** Route path → resource mapping */
export const ROUTE_RESOURCES: { prefix: string; resource: ResourceKey }[] = [
  { prefix: '/dashboard/employees', resource: 'employees' },
  { prefix: '/dashboard/audit-log', resource: 'audit_log' },
  { prefix: '/dashboard/salary', resource: 'salary' },
  { prefix: '/dashboard/salary-slip-runs', resource: 'salary_slip_runs' },
  { prefix: '/dashboard/salary-slip-run-details', resource: 'salary_slip_run_details' },
  { prefix: '/dashboard/payroll', resource: 'salary_slip_runs' },
  { prefix: '/dashboard/offer-letters', resource: 'generated_documents' },
  { prefix: '/dashboard/offer-letter-run-details', resource: 'generated_documents' },
  { prefix: '/dashboard/generated-documents', resource: 'generated_documents' },
  { prefix: '/dashboard/leave-requests', resource: 'leave_requests' },
  { prefix: '/dashboard/leave-balances', resource: 'leave_balances' },
  { prefix: '/dashboard/holiday-calendar', resource: 'holiday_calendar' },
  { prefix: '/dashboard/accounting-records', resource: 'accounting_records' },
  { prefix: '/dashboard/search', resource: 'search' },
  { prefix: '/dashboard/reports', resource: 'reports' },
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

export function canAccessPath(
  role: AppRole | string,
  pathname: string,
  flags?: AccessFlags
): boolean {
  const resource = resourceForPath(pathname);
  if (!resource) return false;
  return canAccess(role, resource, flags);
}

export type NavItemConfig = {
  href: string;
  label: string;
  resource: ResourceKey;
  section: 'overview' | 'hr' | 'finance' | 'system' | 'workspace';
};

export const NAV_ITEMS: NavItemConfig[] = [
  { href: '/dashboard', label: 'Dashboard', resource: 'dashboard', section: 'overview' },
  { href: '/dashboard/search', label: 'Search', resource: 'search', section: 'overview' },
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
    resource: 'salary',
    section: 'hr',
  },
  {
    href: '/dashboard/salary-slip-runs',
    label: 'Salary Slip Runs',
    resource: 'salary_slip_runs',
    section: 'finance',
  },
  {
    href: '/dashboard/offer-letters',
    label: 'Offer Letter',
    resource: 'generated_documents',
    section: 'hr',
  },
  {
    href: '/dashboard/accounting-records',
    label: 'Accounting Records',
    resource: 'accounting_records',
    section: 'finance',
  },
  { href: '/dashboard/reports', label: 'Reports', resource: 'reports', section: 'finance' },
  { href: '/dashboard/audit-log', label: 'Audit Log', resource: 'audit_log', section: 'system' },
  { href: '/dashboard/settings', label: 'Settings', resource: 'settings', section: 'workspace' },
];

export function getNavItemsForRole(role: AppRole | string, flags?: AccessFlags): NavItemConfig[] {
  return NAV_ITEMS.filter((item) => canAccess(role, item.resource, flags));
}

/** Safe landing page for roles that cannot access the dashboard overview. */
export function defaultDashboardPathForRole(role: AppRole | string, flags?: AccessFlags): string {
  return getNavItemsForRole(role, flags)[0]?.href || '/login';
}

/** Roles allowed to mutate employee APIs (get-users, update-user, signup) */
export const EMPLOYEE_API_ROLES: AppRole[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_MANAGER];

/** Only Admin / Super Admin may permanently delete an employee. */
export const EMPLOYEE_DELETE_ROLES: AppRole[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

export function canDeleteEmployee(actorRole: AppRole | string | null | undefined): boolean {
  if (!actorRole) return false;
  return EMPLOYEE_DELETE_ROLES.includes(normalizeRole(actorRole));
}
