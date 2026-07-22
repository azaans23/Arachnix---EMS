import Link from "next/link";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone">
      <div className="p-10 bg-pure-white rounded-xl border border-subtle-stone shadow-sm w-full max-w-md flex flex-col items-center">
        {/* Brand Icon */}
        <div className="w-12 h-12 bg-terracotta rounded-lg mb-6 flex items-center justify-center shadow-sm">
          <span className="text-pure-white font-bold text-xl">A</span>
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-obsidian">Create an Account</h1>
        <p className="text-muted-clay text-center mb-8">Join Arachnix Employee Management System.</p>

        <form className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              placeholder="Enter your name"
              className="px-3 py-2 border border-subtle-stone rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 focus:border-terracotta bg-pure-white text-deep-ink placeholder:text-muted-clay/50 transition-all"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              className="px-3 py-2 border border-subtle-stone rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 focus:border-terracotta bg-pure-white text-deep-ink placeholder:text-muted-clay/50 transition-all"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-obsidian" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="px-3 py-2 border border-subtle-stone rounded-md focus:outline-none focus:ring-2 focus:ring-terracotta/50 focus:border-terracotta bg-pure-white text-deep-ink placeholder:text-muted-clay/50 transition-all"
              required
            />
          </div>
          <button type="submit" className="w-full bg-terracotta text-pure-white py-2.5 rounded-md font-medium hover:bg-[#A0350A] transition-colors mt-2 shadow-sm">
            Sign Up
          </button>
        </form>

        <div className="mt-6 text-sm text-muted-clay text-center">
          Already have an account? <Link href="/login" className="text-terracotta hover:underline font-medium">Log in</Link>
        </div>
      </div>
    </div>
  );
}
