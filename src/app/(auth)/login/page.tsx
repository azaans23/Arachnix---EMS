'use client';

import { useState } from 'react';
import { useLoginForm } from '@/hooks/useAuth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const { formik, isPending, isError, error } = useLoginForm();
  const [showPassword, setShowPassword] = useState(false);

  const fieldError = (name: 'email' | 'password') =>
    formik.submitCount > 0 && formik.errors[name] ? formik.errors[name] : null;

  return (
    <div className="relative flex min-h-screen bg-canvas text-ink">
      {/* Left brand panel */}
      <aside className="relative hidden w-[46%] overflow-hidden border-r border-white/10 bg-[#0a0a0a] lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative z-10 flex flex-1 flex-col justify-between px-12 py-10 xl:px-16 xl:py-14">
          <div className="flex items-center gap-3 animate-fade-in">
            <BrandMark size={28} onDark />
            <BrandWordmark onDark className="h-6 w-[132px]" />
          </div>

          <div className="w-full max-w-3xl animate-fade-in-up">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/45">
              Employee Management
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white xl:text-[3.35rem] xl:leading-[1.12]">
              Operate with clarity.
            </h1>
            <p className="mt-5 w-full max-w-[34rem] text-base leading-relaxed text-white/60 xl:text-[17px]">
              Sign in to manage people, roles, and access across Arachnix. Built for HR and ops
              workflows that need precision, not noise.
            </p>
          </div>

          <p className="text-xs tracking-[0.18em] text-white/35 uppercase animate-fade-in">
            Agile minds, powerful tech
          </p>
        </div>
      </aside>

      {/* Form column */}
      <main className="relative flex flex-1 flex-col">
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-16 sm:px-8">
          <div
            className={`w-full max-w-[400px] animate-fade-in-up ${isError ? 'animate-shake' : ''}`}
          >
            <div className="mb-10 flex flex-col items-start gap-4 lg:hidden">
              <div className="flex items-center gap-3">
                <BrandMark size={36} />
                <BrandWordmark />
              </div>
              <p className="text-sm text-muted">Employee Management System</p>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
              <p className="mt-2 text-sm text-muted">
                Use your Arachnix work email to continue.
              </p>
            </div>

            {isError && (
              <div
                role="alert"
                className="mb-6 flex gap-3 rounded-lg border border-danger-border bg-danger-bg p-3.5 text-sm text-danger animate-fade-in"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Could not sign in</p>
                  <p className="mt-0.5 text-danger/90">
                    {(error as Error)?.message || 'Check your email and password, then try again.'}
                  </p>
                </div>
              </div>
            )}

            <form className="flex flex-col gap-5" onSubmit={formik.handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[13px] font-medium text-ink">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/70" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@arachnix.com"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={`h-11 w-full rounded-lg border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/50 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] ${
                      fieldError('email')
                        ? 'border-danger focus:border-danger'
                        : 'border-border focus:border-ink/40'
                    }`}
                  />
                </div>
                {fieldError('email') && (
                  <p className="text-xs text-danger">{fieldError('email')}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[13px] font-medium text-ink">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/70" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={`h-11 w-full rounded-lg border bg-surface pl-10 pr-11 text-sm text-ink placeholder:text-muted/50 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] ${
                      fieldError('password')
                        ? 'border-danger focus:border-danger'
                        : 'border-border focus:border-ink/40'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-muted transition-colors duration-200 hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldError('password') && (
                  <p className="text-xs text-danger">{fieldError('password')}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="group mt-1 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg transition-[background-color,transform,box-shadow] duration-200 hover:bg-accent-hover hover:shadow-panel active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg"
                      aria-hidden
                    />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-muted">
              Access is provisioned by your Arachnix administrator.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
