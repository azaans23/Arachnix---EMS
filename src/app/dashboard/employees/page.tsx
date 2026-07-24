"use client";

import { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import { signupValidationSchema } from '@/utils/validation';
import { useSignup } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import {
  Database,
  RefreshCw,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  AlertCircle,
  X,
  UserCheck,
  UserPlus
} from 'lucide-react';

interface SheetUser {
  name: string;
  email: string;
  role: 'admin' | 'HR' | 'finance' | 'director';
  employeeId?: string;
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<SheetUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<SheetUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const signupMutation = useSignup();

  // Helper to map and normalize roles from sheet to system values
  const normalizeRole = (role: string): 'admin' | 'HR' | 'finance' | 'director' => {
    const r = (role || '').toLowerCase().trim();
    if (r.includes('super') || r === 'admin') return 'admin';
    if (r.includes('hr') || r === 'hr') return 'HR';
    if (r.includes('finance')) return 'finance';
    if (r.includes('director')) return 'director';
    return 'admin';
  };

  const fetchUsers = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await fetch('/api/get-users');
      const result = await response.json();
      console.log("Frontend received get-users result:", result);

      if (!response.ok || !result.success) {
        let cleanErr = result.error || `Server returned status ${response.status}`;
        try {
          const parsed = JSON.parse(cleanErr);
          if (parsed.message) {
            cleanErr = parsed.message + (parsed.hint ? ` ${parsed.hint}` : '');
          }
        } catch (e) { }
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
        role: normalizeRole(u.Role || u.role || ''),
        employeeId: u.EmployeeID || u.employeeId || u.EmployeeId || '',
      }));
      console.log("Mapped users:", mapped);

      setUsers(mapped);
      toast.success(`Successfully fetched ${mapped.length} users!`);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Failed to fetch users.');
      toast.error('Failed to sync sheet users.');
    } finally {
      setLoading(false);
    }
  };



  // Formik configuration for the direct signup modal
  const formik = useFormik({
    initialValues: {
      name: selectedUser?.name || '',
      email: selectedUser?.email || '',
      role: selectedUser?.role || 'admin',
      password: '',
    },
    validationSchema: signupValidationSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      console.log("Formik onSubmit values:", values, "selectedUser:", selectedUser);
      signupMutation.mutate({
        ...values,
        employeeId: selectedUser?.employeeId,
      }, {
        onSuccess: () => {
          toast.success("User account created successfully in Supabase!");
          setSelectedUser(null);
          formik.resetForm();
          fetchUsers(); // Refresh the list from the sheet
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to register user.");
        }
      });
    }
  });

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-terracotta/10 text-terracotta border-terracotta/20';
      case 'HR':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'finance':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'director':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      default:
        return 'bg-stone text-muted-clay border-subtle-stone';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Super Admin';
      case 'HR': return 'HR Manager';
      case 'finance': return 'Finance Manager';
      case 'director': return 'Director';
      default: return role;
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-4 animate-fade-in-up">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-deep-ink flex items-center gap-3">
            <Database className="w-8 h-8 text-terracotta" />
            Employees Sync
          </h1>
          <p className="text-muted-clay/70 text-sm mt-2">
            Fetch external user rows from Google Sheets, verify details, and create system credentials.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-terracotta text-pure-white px-5 py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing...' : 'Sync from Sheet'}
        </button>
      </div>

      {/* Main Content Layout */}
      {errorText && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-850 rounded-lg text-sm flex gap-3 items-start animate-fade-in-up">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">External Synchronization Alert</span>
            <span className="text-xs text-amber-700 block mt-1">{errorText}</span>
            <span className="text-xs text-stone-500 block mt-2">
              If using a local test workflow, please ensure n8n has the <strong>'Execute workflow'</strong> active state.
            </span>
          </div>
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-pure-white border border-subtle-stone rounded-xl shadow-sm">
          <RefreshCw className="w-10 h-10 text-terracotta animate-spin mb-4" />
          <span className="text-muted-clay font-medium">Fetching users from external sheet...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-pure-white border border-subtle-stone rounded-xl shadow-sm text-center px-4">
          <div className="w-16 h-16 rounded-full bg-cream flex items-center justify-center mb-4">
            <Database className="w-8 h-8 text-muted-clay/60" />
          </div>
          <h3 className="text-lg font-bold text-deep-ink">No Sheet Users Found</h3>
          <p className="text-muted-clay/60 text-sm max-w-sm mt-2">
            No pending user rows were retrieved. Trigger your n8n integration workflow or add users in the spreadsheet.
          </p>
          <button
            onClick={fetchUsers}
            className="mt-6 text-sm text-terracotta font-semibold hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Retry Sync
          </button>
        </div>
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
                  <tr key={idx} className="hover:bg-cream/40 transition-colors">
                    <td className="px-6 py-4 font-semibold">{user.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-muted-clay">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleBadgeClasses(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowPassword(false);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs text-terracotta hover:text-terracotta-hover border border-terracotta/20 hover:border-terracotta bg-pure-white px-3 py-1.5 rounded-md font-semibold transition-all shadow-sm cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Register Account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Direct Registration Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/45 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
          <div className="relative w-full max-w-md bg-pure-white border border-subtle-stone shadow-2xl rounded-2xl p-8 mx-auto animate-scale-up">

            {/* Close Button */}
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute right-4 top-4 p-1 text-muted-clay/55 hover:text-obsidian transition-colors rounded-full hover:bg-cream cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center mb-3">
                <UserCheck className="w-6 h-6 text-terracotta" />
              </div>
              <h2 className="text-xl font-bold text-deep-ink">Register Credentials</h2>
              <p className="text-xs text-muted-clay/70 mt-1">
                Complete registration for sheet-imported profile
              </p>
            </div>

            {signupMutation.isError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{(signupMutation.error as any)?.message || "Credentials setup failed."}</span>
              </div>
            )}

            <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
              {/* Name (ReadOnly) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
                  Name
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-muted-clay/40">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={formik.values.name}
                    disabled
                    className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              {/* Email (ReadOnly) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-muted-clay/40">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={formik.values.email}
                    disabled
                    className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              {/* Role (ReadOnly) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-obsidian tracking-wide uppercase">
                  Assigned System Role
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-muted-clay/40">
                    <Shield className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={getRoleLabel(formik.values.role)}
                    disabled
                    className="pl-10 pr-4 py-2 w-full bg-cream border border-subtle-stone rounded-lg text-sm text-muted-clay cursor-not-allowed opacity-80"
                  />
                </div>
              </div>

              {/* Password (Input Needed!) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-obsidian tracking-wide uppercase" htmlFor="password">
                  Input Password
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-muted-clay/40">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    autoFocus
                    className={`pl-10 pr-10 py-2 w-full bg-pure-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/20 text-sm text-deep-ink placeholder:text-muted-clay/35 transition-all duration-200 ${formik.touched.password && formik.errors.password
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500/10"
                        : "border-subtle-stone focus:border-terracotta"
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-muted-clay/40 hover:text-muted-clay/80 focus:outline-none cursor-pointer transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formik.touched.password && formik.errors.password && (
                  <div className="text-red-500 text-xs font-medium mt-1 pl-1 flex items-center gap-1 animate-fade-in">
                    <span>•</span> {formik.errors.password}
                  </div>
                )}
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={signupMutation.isPending}
                className="w-full bg-terracotta text-pure-white py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 mt-4 shadow-md shadow-terracotta/10 hover:shadow-terracotta/20 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {signupMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Creating credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Create Credentials</span>
                    <UserCheck className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
