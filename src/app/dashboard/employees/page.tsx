'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/ui/EmptyState';
import CustomDropdown from '@/components/ui/Dropdown';
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
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { canAccess, normalizeRole, ROLE_OPTIONS as ASSIGNABLE_ROLES } from '@/lib/rbac';

interface SheetUser {
  name: string;
  email: string;
  role: string;
  employeeId?: string;
  raw?: any;
}

type SortKey = 'name' | 'email' | 'role';
type SortDir = 'asc' | 'desc';

const ROLE_OPTIONS = [
  { label: 'All roles', value: 'all' },
  ...ASSIGNABLE_ROLES.map((r) => ({ label: r.label, value: r.value })),
];

const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

function getEmsStatus(user: SheetUser) {
  return String(user.raw?.EMSStatus || user.raw?.emsStatus || '').toLowerCase().trim();
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<SheetUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [canViewEmployees, setCanViewEmployees] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { openModal } = useModal();

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

      let rawUsers: any[] = [];
      if (Array.isArray(result.data)) {
        rawUsers = result.data;
      } else if (result.data && typeof result.data === 'object') {
        rawUsers = [result.data];
      }

      const mapped = rawUsers.map((u: any) => ({
        name: u.FullName || u.fullName || u.name || u.Name || '',
        email: u.Email || u.email || '',
        role: u.Role || u.role || 'Employee',
        employeeId: u.EmployeeID || u.employeeId || u.EmployeeId || '',
        raw: u,
      }));

      setUsers(mapped);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Failed to fetch users.');
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
    if (normalized === 'hr_manager' || normalized === 'finance_manager' || normalized === 'director') {
      return 'border-border bg-canvas text-ink';
    }
    return 'border-border bg-surface text-muted';
  };

  const hasActiveFilters =
    search.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const displayedUsers = useMemo(() => {
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

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const role = user.app_metadata?.role || user.user_metadata?.role || '';
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

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    }
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-ink" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-ink" />
    );
  };

  const SortableHeader = ({
    column,
    label,
  }: {
    column: SortKey;
    label: string;
  }) => (
    <th className="px-5 py-3.5 font-semibold">
      <button
        type="button"
        onClick={() => handleSort(column)}
        className={`inline-flex cursor-pointer items-center gap-1.5 transition-colors duration-150 hover:text-ink ${
          sortKey === column ? 'text-ink' : 'text-muted'
        }`}
      >
        {label}
        <SortIcon column={column} />
      </button>
    </th>
  );

  if (canViewEmployees === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <RefreshCw className="mb-3 h-5 w-5 animate-spin text-muted" />
        <span className="text-sm text-muted">Checking permissions…</span>
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
          Only Super Admin and HR Manager can view employee records.
        </p>
      </div>
    );
  }

  const recordLabel =
    loading && users.length === 0
      ? 'Syncing roster…'
      : hasActiveFilters
        ? `${displayedUsers.length} of ${users.length} record${users.length === 1 ? '' : 's'}`
        : `${users.length} record${users.length === 1 ? '' : 's'}`;

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
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-20">
          <RefreshCw className="mb-3 h-5 w-5 animate-spin text-muted" />
          <span className="text-sm text-muted">Fetching employees…</span>
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
                onChange={(e) => setSearch(e.target.value)}
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
                  onChange={setRoleFilter}
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
                  onChange={setStatusFilter}
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

          {displayedUsers.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matching employees"
              description="Try a different search or clear the filters to see the full roster."
              actionLabel="Clear filters"
              onAction={clearFilters}
              actionIcon={<X className="h-4 w-4" />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                      <SortableHeader column="name" label="Name" />
                      <SortableHeader column="email" label="Email" />
                      <SortableHeader column="role" label="Role" />
                      <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-ink">
                    {displayedUsers.map((user, idx) => {
                      const isActive = getEmsStatus(user) === 'active';
                      return (
                        <tr
                          key={user.email || idx}
                          onClick={() =>
                            openModal('employeeDetails', { user, onSuccess: fetchUsers })
                          }
                          className="cursor-pointer transition-colors duration-150 hover:bg-canvas/70"
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
                              {isActive ? (
                                <span className="inline-flex items-center rounded-md border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                                  Active
                                </span>
                              ) : (
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
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal('editEmployee', { user, onSuccess: fetchUsers });
                                }}
                                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors duration-150 hover:border-ink/30 hover:text-ink"
                                title="Edit employee"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
