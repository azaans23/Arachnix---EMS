import axiosInstance from '@/lib/axios';

// Interfaces for Auth Requests and Responses
export interface LoginCredentials {
  email: string;
  password?: string; // Optional if using OAuth in other areas, but required for standard login
}

export interface SignupCredentials extends LoginCredentials {
  name: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export const authApi = {
  // Login Endpoint
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  // Signup Endpoint
  signup: async (credentials: SignupCredentials): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>('/auth/signup', credentials);
    return response.data;
  },

  // Logout Endpoint
  logout: async (): Promise<void> => {
    await axiosInstance.post('/auth/logout');
  },
};
