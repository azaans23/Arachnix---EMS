import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-stone text-obsidian">
      <div className="w-16 h-16 bg-terracotta rounded-xl mb-8 flex items-center justify-center shadow-md">
        <span className="text-pure-white font-bold text-3xl">A</span>
      </div>
      <h1 className="text-4xl font-bold mb-4 text-obsidian">Welcome to Arachnix EMS</h1>
      <p className="text-muted-clay mb-8 text-lg max-w-lg text-center">
        The premium employee management system built for modern enterprise financial and data needs.
      </p>
      
      <Link href="/login" className="px-8 py-3 bg-terracotta text-pure-white font-medium rounded-lg hover:bg-terracotta-hover transition shadow-sm">
        Go to Login
      </Link>
    </main>
  );
}
