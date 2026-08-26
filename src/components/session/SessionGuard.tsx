'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/api/auth.api';
import { completeSessionRenewal, sessionExpiryStore } from '@/lib/session-expiry';
import { syncSessionCookies } from '@/lib/session-cookies';
import { supabase } from '@/lib/supabase';

export default function SessionGuard() {
  const open = useSyncExternalStore(
    sessionExpiryStore.subscribe,
    sessionExpiryStore.isOpen,
    () => false
  );
  const [busy, setBusy] = useState<'extend' | 'logout' | null>(null);
  const [renewFailed, setRenewFailed] = useState(false);

  // Supabase refreshes its own stored session in the background, but the Bearer
  // token every page reads lives under a separate `token` key. Without this the
  // mirror goes stale and APIs reject a session that is actually still valid.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        localStorage.setItem('token', session.access_token);
      } else {
        localStorage.removeItem('token');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const extend = useCallback(async () => {
    setBusy('extend');
    setRenewFailed(false);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      const accessToken = data.session?.access_token;
      if (error || !accessToken) {
        throw error || new Error('Session could not be renewed.');
      }
      localStorage.setItem('token', accessToken);
      await syncSessionCookies(accessToken);
      setBusy(null);
      completeSessionRenewal(true);
      toast.success('Session extended.');
    } catch {
      setRenewFailed(true);
      setBusy(null);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy('logout');
    try {
      await authApi.logout();
    } catch {
      /* best-effort: the redirect below still ends the session locally */
    }
    localStorage.removeItem('token');
    completeSessionRenewal(false);
    window.location.href = '/login';
  }, []);

  // Stay mounted through sign-out so the dashboard is not exposed mid-redirect.
  if ((!open && busy !== 'logout') || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-panel animate-scale-up"
      >
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas">
              <ShieldAlert className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Session
              </p>
              <h2 id="session-expired-title" className="mt-1 text-lg font-semibold text-ink">
                Your session has expired
              </h2>
              <p className="mt-2 text-sm text-muted">
                {renewFailed
                  ? 'We could not extend your session. Please log in again to continue.'
                  : 'For your security you have been signed out of the server. Extend your session to pick up where you left off.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void logout()}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
          >
            {busy === 'logout' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Log out
          </button>
          {!renewFailed && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void extend()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {busy === 'extend' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Extend session
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
