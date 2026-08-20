'use client';

import { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import { signupValidationSchema } from '@/utils/validation';
import { useSignup } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { User, Mail, Lock, Eye, EyeOff, Shield, X, UserCheck } from 'lucide-react';
import { canAssignRole, getTrustedRole } from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { supabase } from '@/lib/supabase';

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
  const [canGrant, setCanGrant] = useState<boolean | null>(null);
  const signupMutation = useSignup();

  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) {
        setCanGrant(false);
        return;
      }
      let actorRole = getTrustedRole(session.user);
      try {
        const synced = await syncSessionCookies(session.access_token);
        actorRole = synced.role;
      } catch {
        /* keep JWT fallback */
      }
      setCanGrant(canAssignRole(actorRole, user.role || 'Employee'));
    };
    check();
  }, [user.role]);

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
      if (!canGrant) {
        toast.error('You cannot grant EMS access for this role.');
        return;
      }
      signupMutation.mutate(
        {
          ...values,
          employeeId: user.employeeId,
        },
        {
          onSuccess: () => {
            toast.success('User account created successfully');
            onSuccess();
            onClose();
          },
          onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : 'Failed to register user.';
            toast.error(message);
          },
        }
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
      <div className="relative w-full max-w-md bg-surface border border-border shadow-panel rounded-xl p-8 mx-auto animate-scale-up">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 text-muted hover:text-ink transition-colors rounded-full hover:bg-canvas cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 bg-canvas rounded-full flex items-center justify-center mb-3">
            <UserCheck className="w-6 h-6 text-ink" />
          </div>
          <h2 className="text-xl font-bold text-ink">Register Credentials</h2>
          <p className="text-xs text-muted mt-1">Complete registration to give access to EMS</p>
        </div>

        {canGrant === false && (
          <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger">
            You cannot grant EMS access for the role &ldquo;{user.role}&rdquo;. Ask a Super Admin.
          </div>
        )}

        <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink tracking-wide uppercase">Name</label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-muted/50">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={formik.values.name}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-canvas border border-border rounded-lg text-sm text-muted cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink tracking-wide uppercase">
              Email Address
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-muted/50">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={formik.values.email}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-canvas border border-border rounded-lg text-sm text-muted cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink tracking-wide uppercase">Role</label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-muted/50">
                <Shield className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={user.role}
                disabled
                className="pl-10 pr-4 py-2 w-full bg-canvas border border-border rounded-lg text-sm text-muted cursor-not-allowed opacity-80"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold text-ink tracking-wide uppercase"
              htmlFor="password"
            >
              Input Password
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-muted">
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
                disabled={canGrant === false}
                className={`pl-10 pr-10 py-2 w-full bg-surface border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] text-sm text-ink placeholder:text-muted transition-all duration-200 ${
                  formik.touched.password && formik.errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10'
                    : 'border-border focus:border-ink/40'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-muted hover:text-muted focus:outline-none cursor-pointer transition-colors p-1"
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

          <button
            type="submit"
            disabled={signupMutation.isPending || canGrant === false}
            className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
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
