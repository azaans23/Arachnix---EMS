import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessPath, normalizeRole } from '@/lib/rbac';
import { ROLE_COOKIE, SESSION_COOKIE } from '@/lib/session-cookies';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.get(SESSION_COOKIE)?.value === '1';
  const rawRole = request.cookies.get(ROLE_COOKIE)?.value || '';
  const role = normalizeRole(decodeURIComponent(rawRole));

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(role, pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
