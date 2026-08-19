import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessPath, defaultDashboardPathForRole } from '@/lib/rbac';
import {
  GATE_COOKIE,
  LEGACY_ROLE_COOKIE,
  LEGACY_SESSION_COOKIE,
  verifyGateToken,
} from '@/lib/session-gate';

/**
 * UI-shell gate only. Forges of legacy ems_session/ems_role cookies no longer work —
 * this verifies an HMAC-signed httpOnly ems_gate cookie issued by /api/auth/session.
 * Data APIs independently validate the Supabase Bearer token and are unaffected.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const gate = await verifyGateToken(request.cookies.get(GATE_COOKIE)?.value);
  const response = gate
    ? NextResponse.next()
    : (() => {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
      })();

  // Drop legacy forgeable cookies if still present
  if (request.cookies.has(LEGACY_SESSION_COOKIE) || request.cookies.has(LEGACY_ROLE_COOKIE)) {
    response.cookies.set(LEGACY_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    response.cookies.set(LEGACY_ROLE_COOKIE, '', { path: '/', maxAge: 0 });
  }

  if (!gate) return response;

  if (!canAccessPath(gate.role, pathname)) {
    return NextResponse.redirect(new URL(defaultDashboardPathForRole(gate.role), request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
