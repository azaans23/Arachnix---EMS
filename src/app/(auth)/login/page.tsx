"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { loginValidationSchema } from "@/utils/validation";
import { useLogin } from "@/hooks/useAuth";
import { toast } from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const loginMutation = useLogin();

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: loginValidationSchema,
    onSubmit: (values) => {
      loginMutation.mutate(values, {
        onSuccess: () => {
          toast.success("Welcome back! Logging you in...");
          router.push("/dashboard");
        }
      });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone">
      <div className="p-10 bg-pure-white rounded-xl border border-subtle-stone shadow-sm w-full max-w-md flex flex-col items-center">
        {/* Brand Icon */}
        <div className="relative w-16 h-16 mb-6">
          <Image src="/logo-small.png" alt="Arachnix Logo" fill className="object-contain" priority sizes="64px" />
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-obsidian">Welcome to Arachnix</h1>
        <p className="text-muted-clay text-center mb-8">Sign in to access the Employee Management System.</p>

        {loginMutation.isError && (
          <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm">
            {(loginMutation.error as any).message || "Failed to sign in"}
          </div>
        )}

        <form className="w-full flex flex-col gap-4" onSubmit={formik.handleSubmit}>
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
          <button 
            type="submit" 
            disabled={loginMutation.isPending}
            className="w-full bg-terracotta text-pure-white py-2.5 rounded-md font-medium hover:bg-[#A0350A] transition-colors mt-2 shadow-sm disabled:opacity-50 flex justify-center"
          >
            {loginMutation.isPending ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-sm text-muted-clay text-center">
          Don't have an account? <Link href="/signup" className="text-terracotta hover:underline font-medium">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
