import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, LoginCredentials, SignupCredentials } from '@/api/auth.api';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { loginValidationSchema, signupValidationSchema } from '@/utils/validation';
import { clearSessionCookies, setSessionCookies } from '@/lib/session-cookies';

// Hook for Login
export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      if (typeof window !== 'undefined' && data.token) {
        localStorage.setItem('token', data.token);
        setSessionCookies(data.user?.role || 'Employee');
      }
    },
    onError: (error) => {},
  });
};

// Hook for Signup
export const useSignup = () => {
  return useMutation({
    mutationFn: (credentials: SignupCredentials) => authApi.signup(credentials),
    onError: (error) => {},
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
        clearSessionCookies();
      }
      // Clear TanStack Query Cache so sensitive data is wiped
      queryClient.clear();
      window.location.href = '/login';
    },
  });
};

// Hook wrapping Formik + Login Mutation
export const useLoginForm = () => {
  const router = useRouter();
  const loginMutation = useLogin();

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: loginValidationSchema,
    onSubmit: (values) => {
      loginMutation.mutate(values, {
        onSuccess: () => {
          router.push('/dashboard');
        },
      });
    },
  });

  return {
    formik,
    isPending: loginMutation.isPending,
    isError: loginMutation.isError,
    error: loginMutation.error,
  };
};
