export const SESSION_COOKIE = 'ems_session';
export const ROLE_COOKIE = 'ems_role';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function setSessionCookies(role: string) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearSessionCookies() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
