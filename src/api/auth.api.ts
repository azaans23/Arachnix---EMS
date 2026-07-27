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
        role: data.user.user_metadata?.role || '',
      },
    };
  },

  // Signup Endpoint
  signup: async (credentials: SignupCredentials): Promise<AuthResponse> => {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to complete signup.');
    }

    // Set the session on the client-side Supabase client
    if (result.session) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (sessionError) {
        throw new Error(
          `User was registered, but session creation failed: ${sessionError.message}`
        );
      }
    }

    return {
      token: result.session?.access_token,
      user: result.user,
    };
  },

  // Logout Endpoint
  logout: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
