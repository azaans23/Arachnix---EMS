'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Settings,
  Power,
  ChevronLeft,
  ChevronRight,
  Users,
  ScrollText,
  Banknote,
  FileStack,
  FolderOpen,
  CalendarDays,
  CalendarRange,
  TreePalm,
  Calculator,
  type LucideIcon,
} from 'lucide-react';
import { useLogout } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/theme/ThemeToggle';
import {
  AppRole,
  getNavItemsForRole,
  NavItemConfig,
  normalizeRole,
  roleDisplayName,
} from '@/lib/rbac';
import { setSessionCookies } from '@/lib/session-cookies';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/employees': Users,
  '/dashboard/leave-requests': TreePalm,
  '/dashboard/leave-balances': CalendarRange,
  '/dashboard/holiday-calendar': CalendarDays,
  '/dashboard/salary-slip-runs': Banknote,
  '/dashboard/salary-slip-run-details': FileStack,
  '/dashboard/generated-documents': FolderOpen,
  '/dashboard/accounting-records': Calculator,
  '/dashboard/audit-log': ScrollText,
  '/dashboard/settings': Settings,
};

const SECTION_LABELS: Record<NavItemConfig['section'], string> = {
  overview: 'Overview',
  hr: 'HR',
  finance: 'Finance',
  system: 'System',
  workspace: 'Workspace',
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const pathname = usePathname();
  const logoutMutation = useLogout();

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const raw = user.app_metadata?.role || user.user_metadata?.role || '';
        const normalized = normalizeRole(raw);
        setRole(normalized);
        setSessionCookies(roleDisplayName(normalized));
      }
    };
    checkRole();
  }, []);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    logoutMutation.mutate();
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const navItems = role ? getNavItemsForRole(role) : [];
  const sections = (['overview', 'hr', 'finance', 'system', 'workspace'] as const).filter(
    (section) => navItems.some((item) => item.section === section)
  );

  return (
    <aside
      className={`sticky top-0 z-20 flex h-screen shrink-0 flex-col border-r border-border bg-surface text-ink transition-[width] duration-250 ${isOpen ? 'w-64' : 'w-[72px]'}`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-3 top-6 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors duration-200 hover:text-ink"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>

      <div
        className={`flex h-16 items-center border-b border-border ${isOpen ? 'px-5' : 'justify-center px-2'}`}
      >
        {isOpen ? (
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <BrandWordmark className="h-5 w-[120px]" />
          </div>
        ) : (
          <BrandMark size={28} />
        )}
      </div>

      <nav
        className={`flex flex-1 flex-col gap-4 overflow-y-auto py-5 ${isOpen ? 'px-3' : 'items-center px-2'}`}
      >
        {sections.map((section) => {
          const items = navItems.filter((item) => item.section === section);
          return (
            <div key={section} className={`flex flex-col gap-1 ${isOpen ? '' : 'items-center'}`}>
              {isOpen && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                  {SECTION_LABELS[section]}
                </p>
              )}
              {items.map((item) => {
                const Icon = NAV_ICONS[item.href] || LayoutDashboard;
                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={<Icon className="h-4 w-4 shrink-0" />}
                    label={item.label}
                    isOpen={isOpen}
                    active={isActive(item.href)}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      <div
        className={`flex flex-col gap-2 border-t border-border p-3 ${isOpen ? '' : 'items-center'}`}
      >
        {isOpen && role && (
          <p className="px-1 text-[11px] text-muted">
            Signed in as <span className="font-medium text-ink">{roleDisplayName(role)}</span>
          </p>
        )}
        <div className={`flex ${isOpen ? 'justify-between px-1' : 'justify-center'}`}>
          {isOpen && <span className="self-center text-xs text-muted">Appearance</span>}
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className={`group relative flex w-full items-center rounded-md text-sm font-medium transition-colors duration-200 ${
            isOpen ? 'gap-3 px-3 py-2.5' : 'h-10 w-10 justify-center'
          } text-muted hover:bg-canvas hover:text-ink disabled:opacity-50`}
        >
          <Power className="h-4 w-4 shrink-0" />
          {isOpen && <span>Log out</span>}
          {!isOpen && (
            <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-accent-fg opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
              Log out
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  isOpen,
  active = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex w-full items-center rounded-md text-sm font-medium transition-colors duration-200 ${
        isOpen ? 'gap-3 px-3 py-2.5' : 'h-10 w-10 justify-center'
      } ${
        active ? 'bg-ink text-accent-fg' : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      {icon}
      {isOpen && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
      {!isOpen && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-accent-fg opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}
