'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import CustomDropdown from '@/components/ui/Dropdown';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { useModal } from '@/hooks/useModal';
import {
  Database,
  RefreshCw,
  UserPlus,
  Pencil,
  ShieldAlert,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  canAccess,
  canAssignRole,
  getTrustedRole,
  isSuperAdminSelfEdit,
  normalizeRole,
  ROLE_OPTIONS as ALL_ROLES,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import type { SheetUser } from '@/types/employee';
import { toSheetUser } from '@/types/employee';

type SortKey = 'name' | 'email' | 'role';
type SortDir = 'asc' | 'desc';

const ROLE_OPTIONS = [
  { label: 'All roles', value: 'all' },
  ...ALL_ROLES.map((r) => ({ label: r.label, value: r.value })),
];

const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const PAGE_SIZE_OPTIONS = [
  { label: '5 / page', value: '5' },
  { label: '10 / page', value: '10' },
  { label: '20 / page', value: '20' },
  { label: '50 / page', value: '50' },
  { label: '100 / page', value: '100' },
];

function getEmsStatus(user: SheetUser) {
  return String(user.raw?.EMSStatus || user.raw?.emsStatus || '')
    .toLowerCase()
    .trim();
}

interface SortIconProps {
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}

const SortIcon = ({ column, sortKey, sortDir }: SortIconProps) => {
  if (sortKey !== column) {
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  }
  return sortDir === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5 text-ink" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-ink" />
  );
};

interface SortableHeaderProps {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: SortKey) => void;
}

const SortableHeader = ({
  column,
  label,
  sortKey,
  sortDir,
  onSort,
}: SortableHeaderProps) => (
  <th className="px-5 py-3.5 font-semibold">
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex cursor-pointer items-center gap-1.5 transition-colors duration-150 hover:text-ink ${
        sortKey === column ? 'text-ink' : 'text-muted'
      }`}
    >
      {label}
      <SortIcon column={column} sortKey={sortKey} sortDir={sortDir} />
    </button>
  </th>
);

export default function EmployeesPage() {
  const [users, setUsers] = useState<SheetUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [canViewEmployees, setCanViewEmployees] = useState<boolean | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const { openModal } = useModal();
  const router = useRouter();

  const profilePath = (user: SheetUser) =>
    `/dashboard/employees/${encodeURIComponent(user.employeeId || user.email)}`;

  const fetchUsers = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/get-users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        let cleanErr = result.error || `Server returned status ${response.status}`;
        try {
          const parsed = JSON.parse(cleanErr);
          if (parsed.message) {
            cleanErr = parsed.message + (parsed.hint ? ` ${parsed.hint}` : '');
          }
        } catch {
          /* keep cleanErr */
        }
        throw new Error(cleanErr);
      }

      let rawUsers: unknown[] = [];
      if (Array.isArray(result.data)) {
        rawUsers = result.data;
      } else if (result.data && typeof result.data === 'object') {
        rawUsers = [result.data];
      }

      setUsers(rawUsers.map((row) => toSheetUser(mapRawToEmployee(row))));
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to fetch users.';
      setErrorText(message);
      toast.error('Failed to sync sheet users.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeClasses = (role: string) => {
    const normalized = normalizeRole(role);
    if (normalized === 'super_admin') {
      return 'border-ink/15 bg-ink text-accent-fg';
    }
    if (normalized === 'admin') {
      return 'border-ink/20 bg-ink/90 text-accent-fg';
    }
    if (
      normalized === 'hr_manager' ||
      normalized === 'finance_manager' ||
      normalized === 'director'
    ) {
      return 'border-border bg-canvas text-ink';
    }
    return 'border-border bg-surface text-muted';
  };

  const hasActiveFilters = search.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter((u) => {
        const haystack = [
          u.name,
          u.email,
          u.role,
          u.employeeId,
          u.raw?.Department,
          u.raw?.department,
          u.raw?.Designation,
          u.raw?.designation,
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        return haystack.some((v) => v.includes(q));
      });
    }

    if (roleFilter !== 'all') {
      list = list.filter((u) => normalizeRole(u.role) === normalizeRole(roleFilter));
    }

    if (statusFilter === 'active') {
      list = list.filter((u) => getEmsStatus(u) === 'active');
    } else if (statusFilter === 'inactive') {
      list = list.filter((u) => getEmsStatus(u) !== 'active');
    }

    list.sort((a, b) => {
      const av = String(a[sortKey] || '').toLowerCase();
      const bv = String(b[sortKey] || '').toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [users, search, roleFilter, statusFilter, sortKey, sortDir]);

  const pageSizeNum = Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSizeNum));
  const currentPage = Math.min(page, totalPages);

  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return filteredUsers.slice(start, start + pageSizeNum);
  }, [filteredUsers, currentPage, pageSizeNum]);

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user && session.access_token) {
        localStorage.setItem('token', session.access_token);
        setActorEmail(session.user.email || null);
        setActorUserId(session.user.id || null);
        let role = getTrustedRole(session.user);
        try {
          const synced = await syncSessionCookies(session.access_token);
          role = synced.role;
        } catch {
          /* keep JWT fallback */
        }
        setActorRole(role);
        const allowed = canAccess(role, 'employees');
        setCanViewEmployees(allowed);
        if (allowed) {
          fetchUsers();
        }
      } else {
        setCanViewEmployees(false);
      }
    };
    checkRole();
  }, []);

  if (canViewEmployees === null) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <div className="mb-8 space-y-2 border-b border-border pb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <TableSkeleton columns={4} rows={8} />
      </div>
    );
  }

  if (canViewEmployees === false) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center animate-scale-up">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Only Super Admin, Admin, and HR Manager can view employee records.
        </p>
      </div>
    );
  }

  const recordLabel =
    loading && users.length === 0
      ? 'Syncing roster…'
      : hasActiveFilters
        ? `${filteredUsers.length} of ${users.length} record${users.length === 1 ? '' : 's'}`
        : `${users.length} record${users.length === 1 ? '' : 's'}`;

  const rangeStart = filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, filteredUsers.length);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Directory</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Employees
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {recordLabel}
            {errorText ? ` · Sync issue` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => openModal('createEmployee', { onSuccess: fetchUsers })}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-200 hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Create employee
          </button>
        </div>
      </div>

      {loading && users.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full sm:w-40" />
            <Skeleton className="h-10 w-full sm:w-40" />
          </div>
          <TableSkeleton columns={4} rows={8} />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title="No employees found"
          description="No profiles were retrieved. Confirm the sheet has records, then sync again."
          actionLabel="Retry sync"
          onAction={fetchUsers}
          actionIcon={<RefreshCw className="h-4 w-4" />}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email, ID, department…"
                className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-muted/50 transition-colors focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:w-auto sm:shrink-0 sm:gap-3">
              <div className="sm:w-40">
                <CustomDropdown
                  id="role-filter"
                  name="roleFilter"
                  options={ROLE_OPTIONS}
                  value={roleFilter}
                  onChange={(val) => {
                    setRoleFilter(val);
                    setPage(1);
                  }}
                  onBlur={() => {}}
                  placeholder="All roles"
                />
              </div>
              <div className="sm:w-40">
                <CustomDropdown
                  id="status-filter"
                  name="statusFilter"
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                  onBlur={() => {}}
                  placeholder="All statuses"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors duration-200 hover:border-ink/25 hover:text-ink sm:shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching employees"
              description="Try a different search or clear the filters to see the full roster."
              actionLabel="Clear filters"
              onAction={clearFilters}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <SortableHeader column="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader column="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                        <SortableHeader column="role" label="Role" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                        <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm text-ink">
                      {pagedUsers.map((user, idx) => {
                        const isActive = getEmsStatus(user) === 'active';
                        const isSelfSuperAdmin = isSuperAdminSelfEdit({
                          actorRole: actorRole || '',
                          actorEmail,
                          actorUserId,
                          targetEmail: user.email,
                          targetSupabaseUserId: String(
                            user.raw?.SupabaseUserId || user.raw?.supabaseUserId || ''
                          ),
                        });
                        return (
                          <tr
                            key={user.employeeId || user.email || idx}
                            onClick={() => {
                              if (!isSelfSuperAdmin) router.push(profilePath(user));
                            }}
                            className={`transition-colors duration-150 ${
                              isSelfSuperAdmin
                                ? 'bg-canvas/40'
                                : 'cursor-pointer hover:bg-canvas/70'
                            }`}
                          >
                            <td className="px-5 py-3.5 font-medium">{user.name || 'N/A'}</td>
                            <td className="px-5 py-3.5 text-muted">{user.email}</td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getRoleBadgeClasses(user.role)}`}
                              >
                                {user.role}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isSelfSuperAdmin ? (
                                  <span
                                    className="inline-flex items-center rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-muted"
                                    title="Super Admin cannot edit their own account"
                                  >
                                    You
                                  </span>
                                ) : isActive ? (
                                  <span className="inline-flex items-center rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                                    Active
                                  </span>
                                ) : actorRole && canAssignRole(actorRole, user.role) ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openModal('registerEmployee', {
                                        user,
                                        onSuccess: fetchUsers,
                                      });
                                    }}
                                    className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition-colors duration-150 hover:border-ink/30 hover:bg-canvas"
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    Register
                                  </button>
                                ) : (
                                  <span
                                    className="inline-flex items-center rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-muted"
                                    title="You cannot grant EMS access for this role"
                                  >
                                    Restricted
                                  </span>
                                )}

                                {!isSelfSuperAdmin ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(profilePath(user));
                                    }}
                                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors duration-150 hover:border-ink/30 hover:text-ink"
                                    title="Open profile"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">
                  Showing {rangeStart}–{rangeEnd} of {filteredUsers.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-[7.5rem]">
                    <CustomDropdown
                      id="page-size"
                      name="pageSize"
                      options={PAGE_SIZE_OPTIONS}
                      value={pageSize}
                      onChange={(val) => {
                        setPageSize(val);
                        setPage(1);
                      }}
                      onBlur={() => {}}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <span className="min-w-[4.5rem] text-center text-xs font-medium text-muted">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
