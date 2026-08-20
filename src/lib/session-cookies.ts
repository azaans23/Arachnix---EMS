/**
 * Client helpers for the signed httpOnly UI gate cookie.
 * Role/session cookies are never written from document.cookie — only via /api/auth/session.
 */

import type { AppRole } from '@/lib/rbac';
import { supabase } from '@/lib/supabase';

export {
  GATE_COOKIE,
  LEGACY_ROLE_COOKIE,
  LEGACY_SESSION_COOKIE,
  ROLE_COOKIE,
  SESSION_COOKIE,
} from '@/lib/session-gate';

export type SessionSyncResult = {
  role: AppRole;
  roleLabel: string;
  metadataUpdated?: boolean;
};

/** Establish or refresh the signed httpOnly gate cookie from a Supabase access token. */
export async function syncSessionCookies(accessToken: string): Promise<SessionSyncResult> {
  if (!accessToken) {
    throw new Error('No access token provided');
  }

  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    role?: AppRole;
    roleLabel?: string;
    metadataUpdated?: boolean;
  };

  if (!res.ok || !body.success) {
    throw new Error(body.error || 'Failed to establish session gate cookie');
  }

  // If server backfilled app_metadata from the sheet, refresh so JWT matches.
  if (body.metadataUpdated) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.access_token && typeof window !== 'undefined') {
      localStorage.setItem('token', data.session.access_token);
    }
  }

  return {
    role: body.role || 'employee',
    roleLabel: body.roleLabel || 'Employee',
    metadataUpdated: body.metadataUpdated,
  };
}

/** @deprecated Prefer syncSessionCookies(accessToken). */
export async function setSessionCookies(): Promise<SessionSyncResult | void> {
  if (typeof window === 'undefined') return;
  const token = localStorage.getItem('token');
  if (token) return syncSessionCookies(token);
}

/** Clear the signed gate cookie (and any legacy forgeable cookies). */
export async function clearSessionCookies(): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch {
    /* best-effort */
  }
}
