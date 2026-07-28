import { NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
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
 * Resolve the caller's role without trusting client-writable user_metadata.
 * 1) app_metadata.role (authoritative once set)
 * 2) employee sheet Role for this email (HR source of truth for legacy accounts)
 * 3) backfill app_metadata when sheet has a known role so subsequent requests are fast
 */
export async function resolveTrustedRole(user: User): Promise<AppRole> {
  if (hasTrustedAppRole(user)) {
    return getTrustedRole(user);
  }

  const email = (user.email || '').trim().toLowerCase();
  if (!email) return ROLES.EMPLOYEE;

  let sheetRole: AppRole | null = null;
  try {
    const employees = await fetchEmployees();
    const match = employees.find((e) => e.email.trim().toLowerCase() === email);
    if (match?.role && isKnownRoleValue(match.role)) {
      sheetRole = normalizeRole(match.role);
    }
  } catch (err) {
    console.error('Failed to resolve role from employee sheet:', err);
  }

  if (!sheetRole) return ROLES.EMPLOYEE;

  // Persist into app_metadata so JWT + future checks match the sheet
  await backfillAppMetadataRole(user.id, roleDisplayName(sheetRole));
  return sheetRole;
}

async function backfillAppMetadataRole(userId: string, roleLabel: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.warn(
      'Cannot backfill app_metadata.role — SUPABASE_SERVICE_ROLE_KEY is not configured.'
    );
    return;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: roleLabel },
    });
    if (error) {
      console.error('Failed to backfill app_metadata.role:', error.message);
    }
  } catch (err) {
    console.error('Failed to backfill app_metadata.role:', err);
  }
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
