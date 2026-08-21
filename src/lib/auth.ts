import { NextResponse } from 'next/server';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  AccessContext,
  AppRole,
  canAccess,
  canWrite,
  EMPLOYEE_API_ROLES,
  getTrustedAccess,
  getTrustedRole,
  hasTrustedAppRole,
  isKnownRoleValue,
  normalizeRole,
  ResourceKey,
  roleDisplayName,
  ROLES,
} from '@/lib/rbac';
import { fetchEmployees } from '@/lib/sheets/employees';

export type AuthResult = {
  user?: User;
  role?: AppRole;
  hasFinanceAccess?: boolean;
  isDirector?: boolean;
  errorResponse?: NextResponse;
};

export async function syncAuthAppMetadataRole(
  userId: string,
  roleLabel: string,
  flags?: { hasFinanceAccess?: boolean; isDirector?: boolean }
): Promise<boolean> {
  const id = userId.trim();
  const label = roleLabel.trim();
  if (!id || !label) return false;

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(id, {
      app_metadata: {
        role: label,
        hasFinanceAccess: Boolean(flags?.hasFinanceAccess),
        isDirector: Boolean(flags?.isDirector),
      },
    });
    if (error) {
      console.error('Failed to sync app_metadata.role:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to sync app_metadata.role:', err);
    return false;
  }
}

/** Permanently remove a Supabase Auth user so they can no longer sign in. */
export async function deleteAuthUser(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    // Already gone is fine — employee row can still drop the link.
    const message = error.message || '';
    if (/not\s*found|user\s*not\s*found/i.test(message)) return;
    throw new Error(`Failed to delete Auth user: ${message}`);
  }
}

/** Resolve Auth user id when the employee row has email but no SupabaseUserID. */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const admin = getSupabaseAdmin();
    // GoTrue admin filter: exact email match.
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) {
      console.error('Failed to look up Auth user by email:', error.message);
      return null;
    }
    const match = (data.users || []).find(
      (user) => (user.email || '').trim().toLowerCase() === normalized
    );
    return match?.id || null;
  } catch (err) {
    console.error('Failed to look up Auth user by email:', err);
    return null;
  }
}

export async function syncEmployeeAuthRole(params: {
  supabaseUserId?: string | null;
  email?: string | null;
  roleLabel: string;
  hasFinanceAccess?: boolean;
  isDirector?: boolean;
}): Promise<{ synced: boolean; userId: string | null }> {
  const roleLabel = roleDisplayName(normalizeRole(params.roleLabel));
  let userId = String(params.supabaseUserId || '').trim();
  if (!userId && params.email) {
    userId = (await findAuthUserIdByEmail(params.email)) || '';
  }
  if (!userId) return { synced: false, userId: null };

  const synced = await syncAuthAppMetadataRole(userId, roleLabel, {
    hasFinanceAccess: params.hasFinanceAccess,
    isDirector: params.isDirector,
  });
  return { synced, userId };
}

export async function resolveTrustedAccess(
  user: User,
  options?: { reconcileWithSheet?: boolean }
): Promise<AccessContext> {
  const email = (user.email || '').trim().toLowerCase();
  const reconcile = Boolean(options?.reconcileWithSheet);
  const jwt = getTrustedAccess(user);

  let sheet: AccessContext | null = null;
  const needSheet = reconcile || !hasTrustedAppRole(user);

  if (needSheet && email) {
    try {
      const employees = await fetchEmployees();
      const match = employees.find((e) => e.email.trim().toLowerCase() === email);
      if (match) {
        const role =
          match.role && isKnownRoleValue(match.role)
            ? normalizeRole(match.role) === ROLES.DIRECTOR
              ? ROLES.EMPLOYEE
              : normalizeRole(match.role)
            : ROLES.EMPLOYEE;
        sheet = {
          role,
          hasFinanceAccess: Boolean(match.hasFinanceAccess) && role === ROLES.HR_MANAGER,
          isDirector: Boolean(match.isDirector),
        };
      }
    } catch (err) {
      console.error('Failed to resolve role from employee sheet:', err);
    }
  }

  const flagsChanged =
    Boolean(sheet) &&
    (sheet!.role !== jwt.role ||
      Boolean(sheet!.hasFinanceAccess) !== Boolean(jwt.hasFinanceAccess) ||
      Boolean(sheet!.isDirector) !== Boolean(jwt.isDirector));

  if (hasTrustedAppRole(user) && sheet && reconcile && flagsChanged) {
    await syncAuthAppMetadataRole(user.id, roleDisplayName(sheet.role), sheet);
    return sheet;
  }
  if (hasTrustedAppRole(user)) return jwt;

  if (!sheet) {
    return { role: ROLES.EMPLOYEE, hasFinanceAccess: false, isDirector: false };
  }

  await syncAuthAppMetadataRole(user.id, roleDisplayName(sheet.role), sheet);
  return sheet;
}

export async function resolveTrustedRole(
  user: User,
  options?: { reconcileWithSheet?: boolean }
): Promise<AppRole> {
  const access = await resolveTrustedAccess(user, options);
  return normalizeRole(access.role);
}

async function getAuthenticatedUser(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Unauthorized: No token provided' },
        { status: 401 }
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token' },
        { status: 401 }
      ),
    };
  }

  const access = getTrustedAccess(user);

  return {
    user,
    role: normalizeRole(access.role),
    hasFinanceAccess: access.hasFinanceAccess,
    isDirector: access.isDirector,
  };
}

export async function verifyAuth(request: Request): Promise<AuthResult> {
  return getAuthenticatedUser(request);
}

/** Require one of the allowed roles (API-level RBAC). */
export async function verifyRole(request: Request, allowedRoles: AppRole[]): Promise<AuthResult> {
  const result = await getAuthenticatedUser(request);
  if (result.errorResponse) return result;

  if (!result.role || !allowedRoles.includes(result.role)) {
    const allowed = allowedRoles.map(roleDisplayName).join(', ');
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: `Forbidden: requires one of [${allowed}]`,
        },
        { status: 403 }
      ),
    };
  }

  return result;
}

export async function verifyEmployeeAccess(request: Request): Promise<AuthResult> {
  return verifyRole(request, EMPLOYEE_API_ROLES);
}

/** Require read or write access to an RBAC resource. */
export async function verifyResourceAccess(
  request: Request,
  resource: ResourceKey,
  access: 'read' | 'write' = 'read'
): Promise<AuthResult> {
  const result = await getAuthenticatedUser(request);
  if (result.errorResponse) return result;

  const flags = {
    hasFinanceAccess: result.hasFinanceAccess,
    isDirector: result.isDirector,
  };
  const allowed =
    result.role &&
    (access === 'write'
      ? canWrite(result.role, resource, flags)
      : canAccess(result.role, resource, flags));

  if (!allowed) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: `Forbidden: ${access} access to ${resource} is required` },
        { status: 403 }
      ),
    };
  }

  return result;
}
