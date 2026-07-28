'use client';

import {
  X,
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
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import type { SheetUser } from '@/types/employee';

interface EmployeeDetailsModalProps {
  user: SheetUser;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmployeeDetailsModal({
  user,
  onClose,
  onSuccess,
}: EmployeeDetailsModalProps) {
  const { openModal } = useModal();
  const raw = user?.raw || {};
  const rawStr = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value);
      }
    }
    return '';
  };

  // Formatter helper for currency
  const formatCurrency = (value: unknown) => {
    const num = Number(value);
    if (Number.isNaN(num)) return String(value || 'N/A');
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const status = rawStr('EMSStatus', 'emsStatus') || 'Inactive';
  const isActive = status.toLowerCase() === 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
      <div className="relative w-full max-w-2xl bg-surface border border-border shadow-panel rounded-xl p-8 mx-auto animate-scale-up overflow-y-auto max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 text-muted hover:text-ink transition-colors rounded-full hover:bg-canvas cursor-pointer"
          aria-label="Close details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-6 mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-canvas rounded-full flex items-center justify-center border border-border">
              <User className="w-8 h-8 text-muted" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                {user?.name || 'N/A'}
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {rawStr('Designation', 'designation') || 'Staff Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {isActive ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5" />
              )}
              {isActive ? 'EMS Active' : 'EMS Inactive'}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {/* Employee ID */}
          <div className="flex gap-3">
            <Database className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Employee ID
              </span>
              <span className="text-sm font-bold text-ink mt-0.5 block">
                {user?.employeeId || 'N/A'}
              </span>
            </div>
          </div>

          {/* Email */}
          <div className="flex gap-3">
            <Mail className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Email Address
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block break-all">
                {user?.email || 'N/A'}
              </span>
            </div>
          </div>

          {/* Phone */}
          <div className="flex gap-3">
            <Phone className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Phone Number
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('Phone', 'phone') || 'N/A'}
              </span>
            </div>
          </div>

          {/* Date of Birth */}
          <div className="flex gap-3">
            <Calendar className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Date of Birth
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('DOB', 'dob') || 'N/A'}
              </span>
            </div>
          </div>

          {/* Department */}
          <div className="flex gap-3">
            <Briefcase className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Department
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('Department', 'department') || 'N/A'}
              </span>
            </div>
          </div>

          {/* Employee Type */}
          <div className="flex gap-3">
            <Briefcase className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Employment Type
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('EmployeeType', 'employeeType') || 'N/A'}
              </span>
            </div>
          </div>

          {/* Joining Date */}
          <div className="flex gap-3">
            <Calendar className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Joining Date
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('JoiningDate', 'joiningDate') || 'N/A'}
              </span>
            </div>
          </div>

          {/* Base Salary */}
          <div className="flex gap-3">
            <DollarSign className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Base Salary
              </span>
              <span className="text-sm font-bold text-ink mt-0.5 block">
                {formatCurrency(rawStr('BaseSalary', 'baseSalary'))}
              </span>
            </div>
          </div>

          {/* Bank Account */}
          <div className="flex gap-3">
            <CreditCard className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Bank Details
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('BankAccountDetails', 'bankAccountDetails') || 'N/A'}
              </span>
            </div>
          </div>

          {/* System Role */}
          <div className="flex gap-3">
            <ShieldAlert className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                System Assigned Role
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {user?.role || 'N/A'}
              </span>
            </div>
          </div>

          {/* Address (Full Width) */}
          <div className="flex gap-3 md:col-span-2">
            <MapPin className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted font-semibold uppercase tracking-wider block">
                Residential Address
              </span>
              <span className="text-sm font-semibold text-ink mt-0.5 block">
                {rawStr('Address', 'address') || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="border-t border-border mt-8 pt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted hover:bg-canvas/40 transition-colors cursor-pointer"
          >
            Close Details
          </button>

          <Link
            href={`/dashboard/employees/${encodeURIComponent(user.employeeId || user.email)}`}
            onClick={onClose}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
          >
            <ExternalLink className="w-4 h-4" /> Open profile
          </Link>

          <button
            onClick={() => {
              onClose();
              openModal('editEmployee', { user, onSuccess });
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
          >
            <Pencil className="w-4 h-4" /> Edit Profile
          </button>

          {!isActive && (
            <button
              onClick={() => {
                onClose();
                openModal('registerEmployee', { user, onSuccess });
              }}
              className="flex items-center gap-2 bg-accent text-accent-fg px-5 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition-all duration-200 shadow-sm cursor-pointer text-sm"
            >
              <UserCheck className="w-4 h-4" /> Give EMS Access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
