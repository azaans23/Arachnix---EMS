'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  DollarSign,
  FileText,
  CalendarDays,
  CalendarRange,
  TreePalm,
  Calculator,
  Scale,
  BookOpen,
  Search,
  FileBarChart2,
  type LucideIcon,
} from 'lucide-react';
import { useLogout } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandLogo';
import ThemeToggle from '@/components/theme/ThemeToggle';
import {
  AppRole,
  getNavItemsForRole,
  getTrustedAccess,
  getTrustedRole,
  NavItemConfig,
  roleDisplayName,
  type AccessFlags,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { useSearchPalette } from '@/hooks/useSearchPalette';

const SEARCH_HREF = '/dashboard/search';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/search': Search,
  '/dashboard/employees': Users,
  '/dashboard/leave-requests': TreePalm,
  '/dashboard/leave-balances': CalendarRange,
  '/dashboard/holiday-calendar': CalendarDays,
  '/dashboard/salary': DollarSign,
  '/dashboard/salary-slip-runs': Banknote,
  '/dashboard/offer-letters': FileText,
  '/dashboard/accounting-records': Calculator,
  '/dashboard/accounting-balances': Scale,
  '/dashboard/financial-statements': BookOpen,
  '/dashboard/reports': FileBarChart2,
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

type TipState = { label: string; top: number; left: number } | null;

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [accessFlags, setAccessFlags] = useState<AccessFlags>({});
  const [tip, setTip] = useState<TipState>(null);
  const pathname = usePathname();
  const logoutMutation = useLogout();
  const { openSearch } = useSearchPalette();

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user && session.access_token) {
        localStorage.setItem('token', session.access_token);
        try {
          const synced = await syncSessionCookies(session.access_token);
          setRole(synced.role);
          setAccessFlags({
            hasFinanceAccess: synced.hasFinanceAccess,
            isDirector: synced.isDirector,
          });
        } catch {
          const access = getTrustedAccess(session.user);
          setRole(getTrustedRole(session.user));
          setAccessFlags({
            hasFinanceAccess: access.hasFinanceAccess,
            isDirector: access.isDirector,
          });
        }
      }
    };
    checkRole();
  }, []);

  const showTip = (label: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideTip = () => setTip(null);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    logoutMutation.mutate();
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    if (path === '/dashboard/salary-slip-runs') {
      return (
        pathname === path ||
        pathname.startsWith(`${path}/`) ||
        pathname.startsWith('/dashboard/salary-slip-run-details')
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const navItems = role ? getNavItemsForRole(role, accessFlags) : [];
  const sections = (['overview', 'hr', 'finance', 'system', 'workspace'] as const).filter(
    (section) => navItems.some((item) => item.section === section)
  );

  return (
    <aside
      className={`sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border bg-surface text-ink transition-[width] duration-250 ${
        isOpen ? 'w-64' : 'w-[72px]'
      }`}
    >
      <button
        onClick={() => {
          setIsOpen((current) => {
            const next = !current;
            if (next) {
              setTip(null);
            }
            return next;
          });
        }}
        className="absolute -right-3 top-6 z-40 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors duration-200 hover:text-ink"
        aria-label="Toggle sidebar"
      >
        {isOpen ? (
          <ChevronLeft className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      <div
        className={`flex h-16 shrink-0 items-center border-b border-border ${
          isOpen ? 'px-5' : 'justify-center px-2'
        }`}
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
        className={`sidebar-scroll flex flex-1 flex-col overflow-y-auto py-4 ${
          isOpen ? 'gap-4 px-3' : 'items-center gap-3 px-0'
        }`}
      >
        {sections.map((section) => {
          const items = navItems.filter((item) => item.section === section);
          return (
            <div
              key={section}
              className={`flex flex-col ${isOpen ? 'gap-1' : 'items-center gap-2.5'}`}
            >
              {isOpen && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                  {SECTION_LABELS[section]}
                </p>
              )}
              {items.map((item) => {
                const Icon = NAV_ICONS[item.href] || LayoutDashboard;
                const icon = <Icon className="h-4 w-4 shrink-0" />;

                // Search opens a floating palette over the current page instead of routing.
                if (item.href === SEARCH_HREF) {
                  return (
                    <NavItem
                      key={item.href}
                      icon={icon}
                      label={item.label}
                      isOpen={isOpen}
                      onClick={openSearch}
                      onShowTip={showTip}
                      onHideTip={hideTip}
                    />
                  );
                }

                return (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={icon}
                    label={item.label}
                    isOpen={isOpen}
                    active={isActive(item.href)}
                    onShowTip={showTip}
                    onHideTip={hideTip}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      <div
        className={`flex shrink-0 flex-col border-t border-border ${
          isOpen ? 'gap-2 p-3' : 'items-center gap-3 p-3'
        }`}
      >
        {isOpen && role && (
          <p className="px-1 text-[11px] text-muted">
            Signed in as <span className="font-medium text-ink">{roleDisplayName(role)}</span>
          </p>
        )}
        <div className={`flex ${isOpen ? 'justify-between px-1' : 'justify-center'}`}>
          {isOpen && <span className="self-center text-xs text-muted">Appearance</span>}
          <ThemeToggle className={isOpen ? '' : 'h-10 w-10 rounded-full'} />
        </div>
        <button
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          onMouseEnter={(e) => {
            if (!isOpen) showTip('Log out', e.currentTarget);
          }}
          onMouseLeave={hideTip}
          onFocus={(e) => {
            if (!isOpen) showTip('Log out', e.currentTarget);
          }}
          onBlur={hideTip}
          className={`group flex shrink-0 items-center text-sm font-medium transition-colors duration-200 text-muted hover:bg-canvas hover:text-ink disabled:opacity-50 ${
            isOpen ? 'w-full gap-3 rounded-md px-3 py-2.5' : 'h-10 w-10 justify-center rounded-full'
          }`}
        >
          <Power className="h-4 w-4 shrink-0" />
          {isOpen && <span>Log out</span>}
        </button>
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-accent-fg shadow-panel"
            style={{ top: tip.top, left: tip.left }}
          >
            {tip.label}
          </span>,
          document.body
        )}
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  isOpen,
  active = false,
  onClick,
  onShowTip,
  onHideTip,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  active?: boolean;
  onClick?: () => void;
  onShowTip: (label: string, el: HTMLElement) => void;
  onHideTip: () => void;
}) {
  const className = `flex shrink-0 cursor-pointer items-center text-sm font-medium transition-colors duration-200 ${
    isOpen ? 'w-full gap-3 rounded-md px-3 py-2.5' : 'h-10 w-10 justify-center rounded-full'
  } ${active ? 'bg-ink text-accent-fg' : 'text-muted hover:bg-canvas hover:text-ink'}`;

  const hoverProps = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!isOpen) onShowTip(label, e.currentTarget);
    },
    onMouseLeave: onHideTip,
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (!isOpen) onShowTip(label, e.currentTarget);
    },
    onBlur: onHideTip,
  };

  const content = (
    <>
      {icon}
      {isOpen && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
    </>
  );

  if (!href) {
    return (
      <button
        type="button"
        onClick={() => {
          onHideTip();
          onClick?.();
        }}
        {...hoverProps}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href} {...hoverProps} className={className}>
      {content}
    </Link>
  );
}
