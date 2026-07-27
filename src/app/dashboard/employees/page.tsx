'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/ui/EmptyState';
import { useModal } from '@/hooks/useModal';
import { Database, RefreshCw, UserPlus } from 'lucide-react';
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
        } catch { }
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
      return 'bg-terracotta/10 text-terracotta border-terracotta/20';
    }
    if (r === 'hr' || r.includes('hr manager')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (r.includes('finance')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    if (r.includes('director')) {
      return 'bg-purple-50 text-purple-800 border-purple-200';
    }
    if (r.includes('employee')) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    return 'bg-stone-50 text-stone-800 border-stone-200';
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
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-terracotta animate-spin mb-4" />
        <span className="text-muted-clay font-medium animate-pulse">Checking permissions...</span>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-scale-up">
        <div className="bg-red-50 text-red-500 p-4 rounded-full mb-4">
          <svg
            className="w-12 h-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-obsidian mb-2">Access Denied</h1>
        <p className="text-muted-clay max-w-md">
          You do not have permission to view this page. Only administrators are allowed to access
          employee records.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-4 animate-fade-in-up">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-deep-ink flex items-center gap-3">
            <Database className="w-8 h-8 text-terracotta" />
            Employees
          </h1>
        </div>

        <button

          className="flex items-center justify-center gap-2 bg-terracotta text-pure-white px-5 py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Creating...' : 'Create Employee'}
        </button>
      </div>

      {loading && users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-pure-white border border-subtle-stone rounded-xl shadow-sm">
          <RefreshCw className="w-10 h-10 text-terracotta animate-spin mb-4" />
          <span className="text-muted-clay font-medium">Fetching users...</span>
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Database className="w-8 h-8 text-muted-clay/60" />}
          title="No Users Found"
          description="No pending employee profiles were retrieved. Ensure your spreadsheet contains new records and trigger a synchronization."
          actionLabel="Retry Sync"
          onAction={fetchUsers}
          actionIcon={<RefreshCw className="w-4 h-4" />}
        />
      ) : (
        <div className="bg-pure-white border border-subtle-stone rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-subtle-stone bg-cream/50 text-xs font-semibold uppercase tracking-wider text-muted-clay/80">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Sheet Assigned Role</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle-stone text-sm text-deep-ink">
                {users.map((user, idx) => (
                  <tr
                    key={idx}
                    onClick={() => openModal('employeeDetails', { user, onSuccess: fetchUsers })}
                    className="hover:bg-cream/40 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-semibold">{user.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-muted-clay">{user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleBadgeClasses(user.role)}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(user.raw?.EMSStatus || '').toLowerCase() !== 'active' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal('registerEmployee', { user, onSuccess: fetchUsers });
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-terracotta hover:text-terracotta-hover border border-terracotta/20 hover:border-terracotta bg-pure-white px-3 py-1.5 rounded-md font-semibold transition-all shadow-sm cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Register Account
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                          Active Access
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
