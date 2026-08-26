/**
 * Global 401 handling for the ~20 pages that call protected APIs with a Bearer
 * token straight from `fetch`. Server routes answer 401 only for a missing or
 * expired token (RBAC denials are 403), so a 401 always means the session needs
 * attention rather than an error worth showing as a toast.
 */

import { requestSessionRenewal } from '@/lib/session-expiry';

type FetchInput = Parameters<typeof fetch>[0];

let installed = false;

function resolveUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isRenewableApiCall(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin !== window.location.origin) return false;
    if (!target.pathname.startsWith('/api/')) return false;
    // /api/auth/* issues the very session the prompt would renew.
    return !target.pathname.startsWith('/api/auth/');
  } catch {
    return false;
  }
}

function readAuthHeader(input: FetchInput, init?: RequestInit): string | null {
  const fromInit = new Headers(init?.headers).get('Authorization');
  if (fromInit) return fromInit;
  return input instanceof Request ? input.headers.get('Authorization') : null;
}

export function installSessionFetchInterceptor(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const retrySource = input instanceof Request ? input.clone() : input;
    const response = await nativeFetch(input, init);

    if (response.status !== 401) return response;
    if (!isRenewableApiCall(resolveUrl(input))) return response;
    if (!readAuthHeader(input, init)) return response;

    const renewed = await requestSessionRenewal();
    if (!renewed) {
      // Signing out is already replacing the document. Resolving would only let
      // the caller flash "Unauthorized: Invalid token" behind the redirect.
      return new Promise<Response>(() => {});
    }

    const headers = new Headers(
      init?.headers ?? (retrySource instanceof Request ? retrySource.headers : undefined)
    );
    headers.set('Authorization', `Bearer ${window.localStorage.getItem('token') ?? ''}`);

    return retrySource instanceof Request
      ? nativeFetch(new Request(retrySource, { headers }))
      : nativeFetch(retrySource, { ...init, headers });
  };
}
