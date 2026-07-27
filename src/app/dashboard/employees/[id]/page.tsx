'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Briefcase,
  DollarSign,
  CreditCard,
  ShieldAlert,
  CheckCircle,
  Database,
  UserCheck,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { canAccess } from '@/lib/rbac';
import { useModal } from '@/hooks/useModal';
import EmployeeForm from '@/components/employees/EmployeeForm';
import type { SheetUser } from '@/types/employee';

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatCurrency(value: unknown) {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value || 'N/A');
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 0,
  }).format(num);
}

export default function EmployeeProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openModal } = useModal();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [user, setUser] = useState<SheetUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');

  const loadEmployee = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/get-users/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to load employee.');
      }
      setUser(result.data as SheetUser);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load employee.';
      setError(message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const check = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setAllowed(false);
        return;
      }
      const role = authUser.app_metadata?.role || authUser.user_metadata?.role || '';
      const ok = canAccess(role, 'employees');
      setAllowed(ok);
      if (ok) loadEmployee();
      else setLoading(false);
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setEditing(searchParams.get('edit') === '1');
  }, [searchParams]);

  if (allowed === null || (allowed && loading && !user)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <RefreshCw className="mb-3 h-5 w-5 animate-spin text-muted" />
        <span className="text-sm text-muted">Loading profile…</span>
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Access denied</h1>
        <p className="mt-2 text-sm text-muted">
          Only Super Admin and HR Manager can view employee profiles.
        </p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-lg animate-fade-in-up">
        <Link
          href="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        <div className="mt-6 rounded-lg border border-border bg-surface px-5 py-8">
          <h1 className="text-lg font-semibold text-ink">Employee not found</h1>
          <p className="mt-2 text-sm text-muted">{error || 'No profile matches this ID.'}</p>
          <button
            type="button"
            onClick={loadEmployee}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const raw = user.raw || {};
  const status = String(raw.EMSStatus || raw.emsStatus || 'Inactive');
  const isActive = status.toLowerCase() === 'active';

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to employees
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                router.replace(`/dashboard/employees/${encodeURIComponent(id)}?edit=1`);
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {!isActive && (
            <button
              type="button"
              onClick={() =>
                openModal('registerEmployee', {
                  user,
                  onSuccess: () => {
                    loadEmployee();
                    toast.success('EMS access granted');
                  },
                })
              }
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <UserCheck className="h-3.5 w-3.5" /> Give EMS Access
            </button>
          )}
        </div>
      </div>

      <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-canvas">
            <User className="h-8 w-8 text-muted" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
              Employee profile
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {user.name || 'N/A'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {String(raw.Designation || raw.designation || 'Staff Member')}
              {user.employeeId ? ` · ${user.employeeId}` : ''}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold ${
            isActive
              ? 'border-border bg-canvas text-ink'
              : 'border-border bg-surface text-muted'
          }`}
        >
          {isActive ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          {isActive ? 'EMS Active' : 'EMS Inactive'}
        </span>
      </header>

      {editing ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-panel">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Edit profile</h2>
              <p className="mt-1 text-sm text-muted">Changes are validated before writing to the sheet.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                router.replace(`/dashboard/employees/${encodeURIComponent(id)}`);
              }}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border text-muted hover:text-ink"
              aria-label="Cancel edit"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <EmployeeForm
            user={user}
            embedded
            onCancel={() => {
              setEditing(false);
              router.replace(`/dashboard/employees/${encodeURIComponent(id)}`);
            }}
            onSuccess={async () => {
              setEditing(false);
              router.replace(
                `/dashboard/employees/${encodeURIComponent(user.employeeId || user.email || id)}`
              );
              await loadEmployee();
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          <Info icon={<Database className="h-5 w-5" />} label="Employee ID" value={user.employeeId} />
          <Info icon={<Mail className="h-5 w-5" />} label="Email Address" value={user.email} />
          <Info
            icon={<Phone className="h-5 w-5" />}
            label="Phone Number"
            value={String(raw.Phone || raw.phone || '')}
          />
          <Info
            icon={<Calendar className="h-5 w-5" />}
            label="Date of Birth"
            value={String(raw.DOB || raw.dob || '')}
          />
          <Info
            icon={<Briefcase className="h-5 w-5" />}
            label="Department"
            value={String(raw.Department || raw.department || '')}
          />
          <Info
            icon={<Briefcase className="h-5 w-5" />}
            label="Employment Type"
            value={String(raw.EmployeeType || raw.employeeType || '')}
          />
          <Info
            icon={<Calendar className="h-5 w-5" />}
            label="Joining Date"
            value={String(raw.JoiningDate || raw.joiningDate || '')}
          />
          <Info
            icon={<DollarSign className="h-5 w-5" />}
            label="Base Salary"
            value={formatCurrency(raw.BaseSalary || raw.baseSalary)}
          />
          <Info
            icon={<CreditCard className="h-5 w-5" />}
            label="Bank Details"
            value={String(raw.BankAccountDetails || raw.bankAccountDetails || '')}
          />
          <Info icon={<ShieldAlert className="h-5 w-5" />} label="System Role" value={user.role} />
          <Info
            icon={<MapPin className="h-5 w-5" />}
            label="Residential Address"
            value={String(raw.Address || raw.address || '')}
            wide
          />
        </div>
      )}
    </div>
  );
}

function Info({
  icon,
  label,
  value,
  wide = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="mt-0.5 shrink-0 text-muted">{icon}</div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span className="mt-0.5 block break-all text-sm font-semibold text-ink">
          {value || 'N/A'}
        </span>
      </div>
    </div>
  );
}
