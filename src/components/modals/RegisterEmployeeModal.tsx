'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { signupValidationSchema } from '@/utils/validation';
import { useSignup } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { User, Mail, Lock, Eye, EyeOff, Shield, X, UserCheck, AlertCircle } from 'lucide-react';

interface SheetUser {
  name: string;
  email: string;
  role: string;
  employeeId?: string;
}

interface RegisterEmployeeModalProps {
  user: SheetUser;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RegisterEmployeeModal({
  user,
  onClose,
  onSuccess,
}: RegisterEmployeeModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const signupMutation = useSignup();

  // Wait, let's use import { useFormik } from 'formik';
  const formik = useFormik({
    initialValues: {
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'Employee',
      password: '',
    },
    validationSchema: signupValidationSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      signupMutation.mutate(
        {
          ...values,
          employeeId: user.employeeId,
        },
        {
          onSuccess: () => {
            toast.success('User account created successfully in Supabase!');
            onSuccess();
            onClose();
          },
          onError: (err: any) => {
            toast.error(err.message || 'Failed to register user.');
          },
        }
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/45 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
      <div className="relative w-full max-w-md bg-pure-white border border-subtle-stone shadow-2xl rounded-2xl p-8 mx-auto animate-scale-up">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 text-muted-clay/55 hover:text-obsidian transition-colors rounded-full hover:bg-cream cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center mb-3">
            <UserCheck className="w-6 h-6 text-terracotta" />
          </div>
          <h2 className="text-xl font-bold text-deep-ink">Register Credentials</h2>
          <p className="text-xs text-muted-clay/70 mt-1">
            Complete registration to give access to EMS
          </p>
        </div>

        <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
          {/* Name (ReadOnly) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
              Name
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-clay/40">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={formik.values.name}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          {/* Email (ReadOnly) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
              Email Address
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-clay/40">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={formik.values.email}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          {/* Role (ReadOnly) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
              Role
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-clay/40">
                <Shield className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={user.role}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          {/* Password (Input Needed!) */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold text-obsidian tracking-wide uppercase"
              htmlFor="password"
            >
              Input Password
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-muted-clay/40">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                autoFocus
                className={`pl-10 pr-10 py-2 w-full bg-pure-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/20 text-sm text-deep-ink placeholder:text-muted-clay/35 transition-all duration-200 ${
                  formik.touched.password && formik.errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10'
                    : 'border-subtle-stone focus:border-terracotta'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-muted-clay/40 hover:text-muted-clay/80 focus:outline-none cursor-pointer transition-colors p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {formik.touched.password && formik.errors.password && (
              <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1 animate-fade-in">
                <span>•</span> {formik.errors.password}
              </div>
            )}
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={signupMutation.isPending}
            className="w-full bg-terracotta text-pure-white py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 mt-4 shadow-md shadow-terracotta/10 hover:shadow-terracotta/20 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            {signupMutation.isPending ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Creating credentials...</span>
              </>
            ) : (
              <>
                <span>Create Credentials</span>
                <UserCheck className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
