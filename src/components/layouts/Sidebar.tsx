import Link from 'next/link';
import { LayoutDashboard, Users, FileText, Settings, LogOut } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-obsidian text-pure-white flex flex-col h-screen fixed top-0 left-0 border-r border-obsidian">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <div className="w-8 h-8 bg-terracotta rounded flex items-center justify-center mr-3 shadow-sm">
          <span className="font-bold text-lg">A</span>
        </div>
        <span className="font-semibold text-lg tracking-wide">Arachnix EMS</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 flex flex-col gap-2">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 bg-terracotta/20 text-terracotta rounded-md font-medium transition-colors border border-terracotta/20">
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </Link>
        <Link href="/dashboard/employees" className="flex items-center gap-3 px-3 py-2.5 text-muted-clay hover:text-pure-white hover:bg-white/5 rounded-md font-medium transition-colors">
          <Users className="w-5 h-5" />
          Employees
        </Link>
        <Link href="/dashboard/payroll" className="flex items-center gap-3 px-3 py-2.5 text-muted-clay hover:text-pure-white hover:bg-white/5 rounded-md font-medium transition-colors">
          <FileText className="w-5 h-5" />
          Payroll
        </Link>
        <Link href="/dashboard/settings" className="flex items-center gap-3 px-3 py-2.5 text-muted-clay hover:text-pure-white hover:bg-white/5 rounded-md font-medium transition-colors">
          <Settings className="w-5 h-5" />
          Settings
        </Link>
      </nav>

      {/* Footer / User */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-3 mb-2">
          <div className="w-8 h-8 bg-muted-clay rounded-full overflow-hidden flex items-center justify-center">
            {/* Placeholder avatar */}
            <span className="text-sm font-medium text-pure-white">JD</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-pure-white">John Doe</span>
            <span className="text-xs text-muted-clay">Admin</span>
          </div>
        </div>
        <Link href="/login" className="flex items-center gap-3 px-3 py-2 text-muted-clay hover:text-terracotta hover:bg-terracotta/10 rounded-md font-medium transition-colors mt-2">
          <LogOut className="w-5 h-5" />
          Sign out
        </Link>
      </div>
    </aside>
  );
}
