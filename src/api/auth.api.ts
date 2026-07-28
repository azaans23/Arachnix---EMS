import { supabase } from '@/lib/supabase';
import { clearSessionCookies, syncSessionCookies } from '@/lib/session-cookies';

export interface LoginCredentials {
  email: string;
  password?: string;
}

export interface SignupCredentials extends LoginCredentials {
  name: string;
  role: string;
  employeeId?: string;
}

export interface AuthResponse {
  token?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role?: string;
  };
  emailVerificationRequired?: boolean;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password || '',
    });

    if (error) throw error;
    if (!data.session) throw new Error('No session generated');

    // Server resolves role from app_metadata or employee sheet (never user_metadata).
    const synced = await syncSessionCookies(data.session.access_token);
    const token =
      (typeof window !== 'undefined' ? localStorage.getItem('token') : null) ||
      data.session.access_token;

    return {
      token,
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.name || '',
        email: data.user.email || '',
        role: synced.roleLabel,
      },
    };
  },

  signup: async (credentials: SignupCredentials): Promise<AuthResponse> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(credentials),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to complete signup.');
    }

    return {
      user: result.user,
    };
  },

  logout: async (): Promise<void> => {
    await clearSessionCookies();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
