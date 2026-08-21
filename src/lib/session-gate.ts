import type { AppRole } from '@/lib/rbac';
import { normalizeRole } from '@/lib/rbac';

/** Signed httpOnly UI gate cookie — not a data-auth boundary (APIs use Bearer JWT). */
export const GATE_COOKIE = 'ems_gate';

/** Legacy forgeable cookies — cleared on sync/logout. */
export const LEGACY_SESSION_COOKIE = 'ems_session';
export const LEGACY_ROLE_COOKIE = 'ems_role';

/** Kept as aliases for middleware / callers that still import old names. */
export const SESSION_COOKIE = GATE_COOKIE;
export const ROLE_COOKIE = LEGACY_ROLE_COOKIE;

export type GatePayload = {
  uid: string;
  role: AppRole;
  hasFinanceAccess: boolean;
  isDirector: boolean;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60; // 1h — typical Supabase access-token lifetime

function getSigningSecret(): string {
  return process.env.EMS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]!);
  }
  const b64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  const binary =
    typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signBody(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return base64UrlEncode(sig);
}

async function verifySig(body: string, signature: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  const sigBytes = base64UrlDecode(signature);
  const sigCopy = new Uint8Array(sigBytes);
  return crypto.subtle.verify('HMAC', key, sigCopy, new TextEncoder().encode(body));
}

/** Read JWT `exp` (unix seconds) without verifying — used only to align cookie TTL. */
export function readJwtExpiry(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2 || !parts[1]) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function cookieMaxAgeSeconds(expUnix: number): number {
  const remaining = expUnix - Math.floor(Date.now() / 1000);
  return Math.max(60, remaining);
}

export async function createGateToken(input: {
  uid: string;
  role: AppRole | string;
  hasFinanceAccess?: boolean;
  isDirector?: boolean;
  exp?: number;
}): Promise<{ token: string; exp: number; maxAge: number } | null> {
  const secret = getSigningSecret();
  if (!secret) {
    console.error(
      'EMS_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is required to sign session gate cookies.'
    );
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Math.max(input.exp ?? now + DEFAULT_TTL_SECONDS, now + 60);
  const payload: GatePayload = {
    uid: input.uid,
    role: normalizeRole(input.role),
    hasFinanceAccess: Boolean(input.hasFinanceAccess),
    isDirector: Boolean(input.isDirector),
    exp,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signBody(body, secret);
  return {
    token: `${body}.${signature}`,
    exp,
    maxAge: cookieMaxAgeSeconds(exp),
  };
}

export async function verifyGateToken(
  token: string | undefined | null
): Promise<GatePayload | null> {
  if (!token) return null;
  const secret = getSigningSecret();
  if (!secret) return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;

  try {
    const ok = await verifySig(body, signature, secret);
    if (!ok) return null;

    const json = new TextDecoder().decode(base64UrlDecode(body));
    const parsed = JSON.parse(json) as Partial<GatePayload>;
    if (!parsed.uid || typeof parsed.exp !== 'number' || !parsed.role) return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      uid: parsed.uid,
      role: normalizeRole(parsed.role),
      hasFinanceAccess: Boolean(parsed.hasFinanceAccess),
      isDirector: Boolean(parsed.isDirector),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function gateCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function clearCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
