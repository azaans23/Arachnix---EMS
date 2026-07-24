"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSignupForm } from "@/hooks/useAuth";
import CustomDropdown from "@/components/ui/Dropdown";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  AlertCircle,
  ArrowRight
} from "lucide-react";

export default function SignupPage() {
  const { formik, isPending, isError, error } = useSignupForm();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone p-4 relative overflow-hidden select-none">
      {/* Ambient Moving Glow Bubbles in the background */}
      <div className="absolute top-[-15%] left-[-15%] w-[70%] h-[70%] rounded-full bg-terracotta/10 blur-[130px] animate-float-slow" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[70%] h-[70%] rounded-full bg-ochre/10 blur-[130px] animate-float-delayed" />

      {/* Interactive Signup Card Container */}
      <div className={`w-full max-w-md bg-pure-white rounded-2xl border border-subtle-stone shadow-xl shadow-stone-200/50 p-8 sm:p-10 relative z-10 animate-fade-in-up ${isError ? "animate-shake" : ""}`}>

        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 mb-4">
            <Image src="/logo-small.png" alt="Arachnix Logo" fill className="object-contain" priority sizes="64px" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-deep-ink text-center">Create an Account</h1>
          <p className="text-muted-clay/60 text-sm text-center mt-2">Get started with Arachnix EMS</p>
        </div>

        {isError && (
          <div className="w-full mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex gap-3 items-start animate-fade-in-up">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Registration Failed</span>
              <span className="text-xs text-red-600/90">{(error as any).message || "Could not register account."}</span>
            </div>
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={formik.handleSubmit}>
          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase" htmlFor="name">
              Full Name
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-muted-clay/40 pointer-events-none">
                <User className="w-5 h-5" />
              </div>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Muhammad Ahmed"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={`pl-11 pr-4 py-2.5 w-full bg-pure-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/20 text-sm text-deep-ink placeholder:text-muted-clay/35 transition-all duration-200 ${formik.submitCount > 0 && formik.errors.name
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/10"
                  : "border-subtle-stone focus:border-terracotta"
                  }`}
              />
            </div>
            {formik.submitCount > 0 && formik.errors.name && (
              <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1">
                <span>•</span> {formik.errors.name}
              </div>
            )}
          </div>

          {/* Email Address */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase" htmlFor="email">
              Email Address
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-muted-clay/40 pointer-events-none">
                <Mail className="w-5 h-5" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@company.com"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={`pl-11 pr-4 py-2.5 w-full bg-pure-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/20 text-sm text-deep-ink placeholder:text-muted-clay/35 transition-all duration-200 ${formik.submitCount > 0 && formik.errors.email
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/10"
                  : "border-subtle-stone focus:border-terracotta"
                  }`}
              />
            </div>
            {formik.submitCount > 0 && formik.errors.email && (
              <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1">
                <span>•</span> {formik.errors.email}
              </div>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase" htmlFor="password">
              Password
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-muted-clay/40 pointer-events-none">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={`pl-11 pr-12 py-2.5 w-full bg-pure-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/20 text-sm text-deep-ink placeholder:text-muted-clay/35 transition-all duration-200 ${formik.submitCount > 0 && formik.errors.password
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500/10"
                  : "border-subtle-stone focus:border-terracotta"
                  }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 text-muted-clay/40 hover:text-muted-clay/80 focus:outline-none cursor-pointer transition-colors p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {formik.submitCount > 0 && formik.errors.password && (
              <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1">
                <span>•</span> {formik.errors.password}
              </div>
            )}
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-obsidian tracking-wide uppercase" htmlFor="role">
              System Role
            </label>
            <CustomDropdown
              id="role"
              name="role"
              placeholder="Select your pathway"
              value={formik.values.role}
              onChange={(value) => formik.setFieldValue("role", value)}
              onBlur={() => formik.setFieldTouched("role", true)}
              error={formik.errors.role}
              touched={formik.submitCount > 0}
              icon={<Shield className="w-5 h-5 text-muted-clay/60" />}
              options={[
                { label: "Super Admin", value: "admin" },
                { label: "HR Manager", value: "HR" },
                { label: "Finance Manager", value: "finance" },
                { label: "Director", value: "director" },
              ]}
            />
            {formik.submitCount > 0 && formik.errors.role && (
              <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1">
                <span>•</span> {formik.errors.role}
              </div>
            )}
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-terracotta text-pure-white py-3 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 mt-3 shadow-md shadow-terracotta/10 hover:shadow-terracotta/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
