import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveTrustedAccess } from '@/lib/auth';
import { getTrustedAccess, hasTrustedAppRole, roleDisplayName } from '@/lib/rbac';
import {
  clearCookieOptions,
  createGateToken,
  GATE_COOKIE,
  gateCookieOptions,
  LEGACY_ROLE_COOKIE,
  LEGACY_SESSION_COOKIE,
  readJwtExpiry,
} from '@/lib/session-gate';

export const dynamic = 'force-dynamic';

function clearLegacyCookies(response: NextResponse) {
  const clear = clearCookieOptions();
  response.cookies.set(LEGACY_SESSION_COOKIE, '', { ...clear, httpOnly: false });
  response.cookies.set(LEGACY_ROLE_COOKIE, '', { ...clear, httpOnly: false });
}

/**
 * POST — verify Bearer JWT, resolve role (app_metadata or employee sheet),
 * set signed httpOnly gate cookie aligned to JWT exp.
 * DELETE — clear gate + legacy cookies.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: No token provided' },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token' },
        { status: 401 }
      );
    }

    const previous = hasTrustedAppRole(user) ? getTrustedAccess(user) : null;
    const access = await resolveTrustedAccess(user, { reconcileWithSheet: true });
    const role = access.role;
    const jwtExp = readJwtExpiry(token) ?? undefined;
    const signed = await createGateToken({
      uid: user.id,
      role,
      hasFinanceAccess: access.hasFinanceAccess,
      isDirector: access.isDirector,
      exp: jwtExp,
    });

    if (!signed) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Server misconfigured: set EMS_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY to sign session cookies.',
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      role,
      roleLabel: roleDisplayName(role),
      hasFinanceAccess: Boolean(access.hasFinanceAccess),
      isDirector: Boolean(access.isDirector),
      /** Client should refreshSession() so JWT picks up synced app_metadata */
      metadataUpdated:
        previous === null ||
        previous.role !== access.role ||
        Boolean(previous.hasFinanceAccess) !== Boolean(access.hasFinanceAccess) ||
        Boolean(previous.isDirector) !== Boolean(access.isDirector),
      exp: signed.exp,
    });

    response.cookies.set(GATE_COOKIE, signed.token, gateCookieOptions(signed.maxAge));
    clearLegacyCookies(response);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(GATE_COOKIE, '', clearCookieOptions());
  clearLegacyCookies(response);
  return response;
}
