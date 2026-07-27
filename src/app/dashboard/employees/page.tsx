'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/ui/EmptyState';
import { useModal } from '@/hooks/useModal';
import { Database, RefreshCw, UserPlus, Pencil, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SheetUser {
  name: string;
  email: string;
  role: string;
  employeeId?: string;
  raw?: any;
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<SheetUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
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
    const r = (role || '').toLowerCase().trim();
    if (r.includes('admin') || r === 'super admin') {
      return 'border-ink/15 bg-ink text-accent-fg';
    }
    if (r === 'hr' || r.includes('hr manager')) {
      return 'border-border bg-canvas text-ink';
    }
    return 'border-border bg-surface text-muted';
  };

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const role = user.app_metadata?.role || user.user_metadata?.role || '';
        const isUserAdmin = role.toLowerCase().trim() === 'admin';
        setIsAdmin(isUserAdmin);
        if (isUserAdmin) {
          fetchUsers();
        }
      } else {
        setIsAdmin(false);
      }
    };
    checkRole();
  }, []);

  if (isAdmin === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <RefreshCw className="mb-3 h-5 w-5 animate-spin text-muted" />
        <span className="text-sm text-muted">Checking permissions…</span>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center animate-scale-up">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Only administrators can view employee records.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Directory</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Employees
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {loading && users.length === 0
              ? 'Syncing roster…'
              : `${users.length} record${users.length === 1 ? '' : 's'}`}
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
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-canvas/80 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  <th className="px-5 py-3.5 font-semibold">Name</th>
                  <th className="px-5 py-3.5 font-semibold">Email</th>
                  <th className="px-5 py-3.5 font-semibold">Role</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm text-ink">
                {users.map((user, idx) => {
                  const isActive = (user.raw?.EMSStatus || '').toLowerCase() === 'active';
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
  );
}
