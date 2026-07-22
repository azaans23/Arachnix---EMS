"use client";

import { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, FileText, Settings, Power, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside className={`bg-pure-white text-obsidian flex flex-col h-screen sticky top-0 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'} border-r border-subtle-stone relative z-20 shrink-0`}>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-3 top-6 bg-pure-white text-muted-clay p-1 rounded-full hover:bg-cream hover:text-obsidian transition-colors shadow-sm z-30 flex items-center justify-center border border-subtle-stone"
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      
      {/* Brand */}
      <div className={`h-16 flex items-center ${isOpen ? 'px-6' : 'justify-center'} border-b border-subtle-stone transition-all`}>
        <div className={`bg-terracotta rounded flex items-center justify-center shrink-0 shadow-sm transition-all ${isOpen ? 'w-8 h-8 mr-3' : 'w-10 h-10'}`}>
          <span className={`font-bold text-pure-white ${isOpen ? 'text-lg' : 'text-xl'}`}>A</span>
        </div>
        {isOpen && <span className="font-semibold text-lg tracking-wide whitespace-nowrap overflow-hidden text-obsidian">Arachnix EMS</span>}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-6 flex flex-col gap-2 ${isOpen ? 'px-4' : 'px-3 items-center'}`}>
        <NavItem href="/dashboard" icon={<LayoutDashboard className="w-5 h-5 shrink-0" />} label="Dashboard" isOpen={isOpen} active />
        <NavItem href="/dashboard/employees" icon={<Users className="w-5 h-5 shrink-0" />} label="Employees" isOpen={isOpen} />
        <NavItem href="/dashboard/payroll" icon={<FileText className="w-5 h-5 shrink-0" />} label="Payroll" isOpen={isOpen} />
        <NavItem href="/dashboard/settings" icon={<Settings className="w-5 h-5 shrink-0" />} label="Settings" isOpen={isOpen} />
      </nav>

      {/* Footer / Logout */}
      <div className={`p-4 border-t border-subtle-stone flex flex-col ${isOpen ? '' : 'items-center'} transition-all`}>
        <NavItem href="/login" icon={<Power className="w-5 h-5 shrink-0" />} label="Log out" isOpen={isOpen} isLogout />
      </div>
    </aside>
  );
}

function NavItem({ href, icon, label, isOpen, active = false, isLogout = false }: { href: string; icon: React.ReactNode; label: string; isOpen: boolean; active?: boolean; isLogout?: boolean; }) {
  const baseClasses = "group relative flex items-center rounded-md font-medium transition-colors w-full";
  const sizeClasses = isOpen ? "px-3 py-2.5 gap-3" : "justify-center w-10 h-10";
  
  let colorClasses = "";
  if (isLogout) {
    colorClasses = "text-muted-clay hover:text-terracotta hover:bg-cream";
  } else if (active) {
    colorClasses = "bg-cream text-terracotta";
  } else {
    colorClasses = "text-muted-clay hover:text-obsidian hover:bg-cream";
  }

  return (
    <Link href={href} className={`${baseClasses} ${sizeClasses} ${colorClasses}`}>
      {icon}
      {isOpen && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
      
      {/* Custom Tooltip - Dark mode tooltip on light theme */}
      {!isOpen && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-obsidian text-pure-white text-sm font-semibold rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap shadow-md z-50">
          <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 border-y-[6px] border-y-transparent border-r-[6px] border-r-obsidian"></div>
          {label}
        </div>
      )}
    </Link>
  );
}
