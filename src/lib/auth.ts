import { NextResponse } from 'next/server';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  AppRole,
  canAccess,
  canWrite,
  EMPLOYEE_API_ROLES,
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
  errorResponse?: NextResponse;
};

/**
 * Write the display role into Supabase Auth app_metadata so JWT / getUser()
 * match the employee roster after signup or a later role change.
 */
export async function syncAuthAppMetadataRole(
  userId: string,
  roleLabel: string
): Promise<boolean> {
  const id = userId.trim();
  const label = roleLabel.trim();
  if (!id || !label) return false;

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(id, {
      app_metadata: { role: label },
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

/**
 * Keep Auth app_metadata.role aligned with the employee roster role.
 * Returns true when Auth metadata was written (caller should refreshSession).
 */
export async function syncEmployeeAuthRole(params: {
  supabaseUserId?: string | null;
  email?: string | null;
  roleLabel: string;
}): Promise<{ synced: boolean; userId: string | null }> {
  const roleLabel = roleDisplayName(normalizeRole(params.roleLabel));
  let userId = String(params.supabaseUserId || '').trim();
  if (!userId && params.email) {
    userId = (await findAuthUserIdByEmail(params.email)) || '';
  }
  if (!userId) return { synced: false, userId: null };

  const synced = await syncAuthAppMetadataRole(userId, roleLabel);
  return { synced, userId };
}

/**
 * Resolve the caller's role without trusting client-writable user_metadata.
 * 1) app_metadata.role (authoritative once set)
 * 2) employee sheet Role for legacy accounts missing app_metadata (then backfill Auth)
 *
 * Pass `reconcileWithSheet: true` (session cookie sync) to heal stale app_metadata
 * when the roster role was changed earlier without updating Auth.
 */
export async function resolveTrustedRole(
  user: User,
  options?: { reconcileWithSheet?: boolean }
): Promise<AppRole> {
  const email = (user.email || '').trim().toLowerCase();
  const reconcile = Boolean(options?.reconcileWithSheet);

  let sheetRole: AppRole | null = null;
  const needSheet = reconcile || !hasTrustedAppRole(user);

  if (needSheet && email) {
    try {
      const employees = await fetchEmployees();
      const match = employees.find((e) => e.email.trim().toLowerCase() === email);
      if (match?.role && isKnownRoleValue(match.role)) {
        sheetRole = normalizeRole(match.role);
      }
    } catch (err) {
      console.error('Failed to resolve role from employee sheet:', err);
    }
  }

  if (hasTrustedAppRole(user)) {
    const appRole = getTrustedRole(user);
    if (reconcile && sheetRole && sheetRole !== appRole) {
      await syncAuthAppMetadataRole(user.id, roleDisplayName(sheetRole));
      return sheetRole;
    }
    return appRole;
  }

  if (!sheetRole) return ROLES.EMPLOYEE;

  await syncAuthAppMetadataRole(user.id, roleDisplayName(sheetRole));
  return sheetRole;
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

  const role = await resolveTrustedRole(user);

  return { user, role };
}

/** Require a valid session (any role). */
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

/** Super Admin or HR Manager — employee data APIs. */
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

  const allowed =
    result.role &&
    (access === 'write' ? canWrite(result.role, resource) : canAccess(result.role, resource));

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
