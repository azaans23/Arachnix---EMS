import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, LoginCredentials, SignupCredentials } from '@/api/auth.api';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { loginValidationSchema, signupValidationSchema } from '@/utils/validation';

// Hook for Login
export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      if (typeof window !== 'undefined' && data.token) {
        localStorage.setItem('token', data.token);
      }
    },
    onError: (error) => {},
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
    onError: (error) => {},
  });
};

// Hook for Signup Direct (bypasses n8n webhook)
export const useSignupDirect = () => {
  return useMutation({
    mutationFn: (credentials: SignupCredentials) => authApi.signupDirect(credentials),
    onSuccess: (data) => {
      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('token', data.token);
      }
    },
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
          toast.success("Welcome back! Logging you in...");
          router.push("/dashboard");
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

// Hook wrapping Formik + Signup Mutation
export const useSignupForm = () => {
  const router = useRouter();
  const signupMutation = useSignup();

  const formik = useFormik({
    initialValues: {
      name: '',
      email: '',
      password: '',
      role: '' as 'admin' | 'HR' | 'finance' | 'director',
    },
    validationSchema: signupValidationSchema,
    onSubmit: (values) => {
      signupMutation.mutate(values, {
        onSuccess: (data) => {
          if (data.emailVerificationRequired) {
            toast.success("Signup successful! Please check your email to verify your account.", {
              duration: 6000,
            });
            router.push("/login");
          } else {
            toast.success("Welcome! Account created successfully.");
            router.push("/dashboard");
          }
        },
      });
    },
  });

  return {
    formik,
    isPending: signupMutation.isPending,
    isError: signupMutation.isError,
    error: signupMutation.error,
  };
};
