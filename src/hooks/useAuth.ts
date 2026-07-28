import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, LoginCredentials, SignupCredentials } from '@/api/auth.api';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import { loginValidationSchema } from '@/utils/validation';
import { clearSessionCookies } from '@/lib/session-cookies';

export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      if (typeof window !== 'undefined' && data.token) {
        localStorage.setItem('token', data.token);
      }
    },
    onError: () => {},
  });
};

export const useSignup = () => {
  return useMutation({
    mutationFn: (credentials: SignupCredentials) => authApi.signup(credentials),
    onError: () => {},
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: async () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        await clearSessionCookies();
      }
      queryClient.clear();
      window.location.href = '/login';
    },
  });
};

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
