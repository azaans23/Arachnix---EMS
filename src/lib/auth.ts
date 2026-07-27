import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import {
  AppRole,
  canAccess,
  canWrite,
  EMPLOYEE_API_ROLES,
  normalizeRole,
  ResourceKey,
  roleDisplayName,
} from '@/lib/rbac';

export type AuthResult = {
  user?: User;
  role?: AppRole;
  errorResponse?: NextResponse;
};

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

  const rawRole = user.app_metadata?.role || user.user_metadata?.role || '';
  const role = normalizeRole(rawRole);

  return { user, role };
}

/** Require a valid session (any role). */
export async function verifyAuth(request: Request): Promise<AuthResult> {
  return getAuthenticatedUser(request);
}

/** Require one of the allowed roles (API-level RBAC). */
export async function verifyRole(
  request: Request,
  allowedRoles: AppRole[]
): Promise<AuthResult> {
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
    (access === 'write'
      ? canWrite(result.role, resource)
      : canAccess(result.role, resource));

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

/**
 * @deprecated Prefer verifyEmployeeAccess / verifyRole.
 * Kept for compatibility: Super Admin only.
 */
export async function verifyAdmin(request: Request): Promise<AuthResult> {
  return verifyRole(request, [normalizeRole('Super Admin')]);
}
