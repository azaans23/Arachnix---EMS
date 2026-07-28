import { supabase } from '@/lib/supabase';

// Interfaces for Auth Requests and Responses
export interface LoginCredentials {
  email: string;
  password?: string; // Optional if using OAuth in other areas, but required for standard login
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
  // Login Endpoint
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password || '',
    });

    if (error) throw error;
    if (!data.session) throw new Error('No session generated');

    return {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.name || '',
        email: data.user.email || '',
        role: data.user.app_metadata?.role || data.user.user_metadata?.role || '',
      },
    };
  },

  // Signup Endpoint — registers an employee account without switching the admin session
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

    // Intentionally do NOT call setSession / overwrite localStorage token.
    // The admin who granted access must remain signed in.
    return {
      user: result.user,
    };
  },

  // Logout Endpoint
  logout: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
