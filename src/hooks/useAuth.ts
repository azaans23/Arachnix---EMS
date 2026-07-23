import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, LoginCredentials, SignupCredentials } from '@/api/auth.api';

// Hook for Login
export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', data.token);
      }

    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
  });
};

// Hook for Signup
export const useSignup = () => {
  return useMutation({
    mutationFn: (credentials: SignupCredentials) => authApi.signup(credentials),
    onSuccess: (data) => {
      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('token', data.token);
      }
    },
    onError: (error) => {
      console.error('Signup failed:', error);
    },
  });
};

// Hook for Logout
export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
      // Clear TanStack Query Cache so sensitive data is wiped
      queryClient.clear();
      window.location.href = '/login';
    },
  });
};
