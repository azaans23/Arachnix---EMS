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
    if (!data.session) throw new Error("No session generated");

    return {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.name || '',
        email: data.user.email || '',
        role: data.user.user_metadata?.role || '',
      }
    };
  },

  // Signup Endpoint
  signup: async (credentials: SignupCredentials): Promise<AuthResponse> => {
    console.log("authApi.signup credentials received:", credentials);
    // 1. Authenticate the user in Supabase first
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password || '',
      options: {
        data: {
          name: credentials.name,
          role: credentials.role,
        }
      }
    });

    if (error) throw error;

    const supabaseUserId = data.user?.id;
    if (!supabaseUserId) {
      throw new Error("Failed to retrieve user ID from Supabase.");
    }

    // 2. Update the record in the sheet via n8n update-user webhook
    try {
      const webhookRes = await fetch('/api/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: credentials.name,
          email: credentials.email,
          role: credentials.role,
          supabaseUserId: supabaseUserId,
          status: 'Active',
          employeeId: credentials.employeeId,
          created_at: new Date().toISOString(),
        }),
      });

      const webhookData = await webhookRes.json();
      if (!webhookRes.ok || !webhookData.success) {
        throw new Error(webhookData.error || "Failed to sync status update with sheet.");
      }
    } catch (err: any) {
      throw new Error(err.message || "Failed to update employee status in spreadsheet.");
    }
    
    if (!data.session) {
      return {
        emailVerificationRequired: true,
      };
    }

    return {
      token: data.session.access_token,
      user: {
        id: data.user!.id,
        name: data.user!.user_metadata?.name || credentials.name,
        email: data.user!.email || '',
        role: data.user!.user_metadata?.role || credentials.role,
      }
    };
  },

  // Logout Endpoint
  logout: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
