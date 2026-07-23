"use client";

import Link from "next/link";
import Image from "next/image";
import { useSignupForm } from "@/hooks/useAuth";

export default function SignupPage() {
  const { formik, isPending, isError, error } = useSignupForm();

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone">
      <div className="p-10 bg-pure-white rounded-xl border border-subtle-stone shadow-sm w-full max-w-md flex flex-col items-center">
        {/* Brand Icon */}
        <div className="relative w-16 h-16 mb-6">
          <Image src="/logo-small.png" alt="Arachnix Logo" fill className="object-contain" priority sizes="64px" />
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-obsidian">Create an Account</h1>
        <p className="text-muted-clay text-center mb-8">Join Arachnix Employee Management System.</p>

        {isError && (
          <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
            {(error as any).message || "Failed to sign up"}
          </div>
        )}

        <form className="w-full flex flex-col gap-4" onSubmit={formik.handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="name">Full Name</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Enter your name"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 transition-all bg-pure-white text-deep-ink placeholder:text-muted-clay/50 ${
                formik.touched.name && formik.errors.name 
                  ? "border-red-500 focus:border-red-500" 
                  : "border-subtle-stone focus:border-terracotta"
              }`}
            />
            {formik.touched.name && formik.errors.name && (
              <div className="text-red-500 text-xs mt-1">{formik.errors.name}</div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email"
              value={formik.values.email}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 transition-all bg-pure-white text-deep-ink placeholder:text-muted-clay/50 ${
                formik.touched.email && formik.errors.email 
                  ? "border-red-500 focus:border-red-500" 
                  : "border-subtle-stone focus:border-terracotta"
              }`}
            />
            {formik.touched.email && formik.errors.email && (
              <div className="text-red-500 text-xs mt-1">{formik.errors.email}</div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 transition-all bg-pure-white text-deep-ink placeholder:text-muted-clay/50 ${
                formik.touched.password && formik.errors.password 
                  ? "border-red-500 focus:border-red-500" 
                  : "border-subtle-stone focus:border-terracotta"
              }`}
            />
            {formik.touched.password && formik.errors.password && (
              <div className="text-red-500 text-xs mt-1">{formik.errors.password}</div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              value={formik.values.role}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 transition-all bg-pure-white text-deep-ink ${
                formik.touched.role && formik.errors.role 
                  ? "border-red-500 focus:border-red-500" 
                  : "border-subtle-stone focus:border-terracotta"
              }`}
            >
              <option value="" disabled>Select your role</option>
              <option value="admin">Admin</option>
              <option value="HR">HR</option>
              <option value="finance">Finance</option>
            </select>
            {formik.touched.role && formik.errors.role && (
              <div className="text-red-500 text-xs mt-1">{formik.errors.role}</div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={isPending}
            className="w-full bg-terracotta text-pure-white py-2.5 rounded-md font-medium hover:bg-[#A0350A] transition-colors mt-2 shadow-sm disabled:opacity-50 flex justify-center"
          >
            {isPending ? "Signing up..." : "Sign Up"}
          </button>
        </form>

        <div className="mt-6 text-sm text-muted-clay text-center">
          Already have an account? <Link href="/login" className="text-terracotta hover:underline font-medium">Log in</Link>
        </div>
      </div>
    </div>
  );
}
