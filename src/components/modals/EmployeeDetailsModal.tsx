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
} from 'lucide-react';
import { useModal } from '@/hooks/useModal';

interface EmployeeDetailsModalProps {
  user: {
    name: string;
    email: string;
    role: string;
    employeeId?: string;
    raw: any;
  };
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

  // Formatter helper for currency
  const formatCurrency = (value: any) => {
    const num = Number(value);
    if (isNaN(num)) return value || 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const status = raw.EMSStatus || raw.emsStatus || 'Inactive';
  const isActive = status.toLowerCase() === 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/45 backdrop-blur-sm transition-all duration-300 animate-fade-in p-4">
      <div className="relative w-full max-w-2xl bg-pure-white border border-subtle-stone shadow-2xl rounded-2xl p-8 mx-auto animate-scale-up overflow-y-auto max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 text-muted-clay/55 hover:text-obsidian transition-colors rounded-full hover:bg-cream cursor-pointer"
          aria-label="Close details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-subtle-stone pb-6 mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-cream rounded-full flex items-center justify-center border border-subtle-stone">
              <User className="w-8 h-8 text-muted-clay/70" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-deep-ink tracking-tight">
                {user?.name || 'N/A'}
              </h2>
              <p className="text-sm text-muted-clay mt-0.5">
                {raw.Designation || raw.designation || 'Staff Member'}
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
            <Database className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Employee ID
              </span>
              <span className="text-sm font-bold text-deep-ink mt-0.5 block">
                {user?.employeeId || 'N/A'}
              </span>
            </div>
          </div>

          {/* Email */}
          <div className="flex gap-3">
            <Mail className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Email Address
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block break-all">
                {user?.email || 'N/A'}
              </span>
            </div>
          </div>

          {/* Phone */}
          <div className="flex gap-3">
            <Phone className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Phone Number
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.Phone || raw.phone || 'N/A'}
              </span>
            </div>
          </div>

          {/* Date of Birth */}
          <div className="flex gap-3">
            <Calendar className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Date of Birth
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.DOB || raw.dob || 'N/A'}
              </span>
            </div>
          </div>

          {/* Department */}
          <div className="flex gap-3">
            <Briefcase className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Department
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.Department || raw.department || 'N/A'}
              </span>
            </div>
          </div>

          {/* Employee Type */}
          <div className="flex gap-3">
            <Briefcase className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Employment Type
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.EmployeeType || raw.employeeType || 'N/A'}
              </span>
            </div>
          </div>

          {/* Joining Date */}
          <div className="flex gap-3">
            <Calendar className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Joining Date
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.JoiningDate || raw.joiningDate || 'N/A'}
              </span>
            </div>
          </div>

          {/* Base Salary */}
          <div className="flex gap-3">
            <DollarSign className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Base Salary
              </span>
              <span className="text-sm font-bold text-deep-ink mt-0.5 block">
                {formatCurrency(raw.BaseSalary || raw.baseSalary)}
              </span>
            </div>
          </div>

          {/* Bank Account */}
          <div className="flex gap-3">
            <CreditCard className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Bank Details
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.BankAccountDetails || raw.bankAccountDetails || 'N/A'}
              </span>
            </div>
          </div>

          {/* System Role */}
          <div className="flex gap-3">
            <ShieldAlert className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                System Assigned Role
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {user?.role || 'N/A'}
              </span>
            </div>
          </div>

          {/* Address (Full Width) */}
          <div className="flex gap-3 md:col-span-2">
            <MapPin className="w-5 h-5 text-muted-clay/40 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-muted-clay/60 font-semibold uppercase tracking-wider block">
                Residential Address
              </span>
              <span className="text-sm font-semibold text-deep-ink mt-0.5 block">
                {raw.Address || raw.address || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="border-t border-subtle-stone mt-8 pt-6 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-subtle-stone text-sm font-semibold text-muted-clay hover:bg-cream/40 transition-colors cursor-pointer"
          >
            Close Details
          </button>

          {!isActive && (
            <button
              onClick={() => {
                onClose();
                openModal('registerEmployee', { user, onSuccess });
              }}
              className="flex items-center gap-2 bg-terracotta text-pure-white px-5 py-2.5 rounded-lg font-semibold hover:bg-terracotta-hover transition-all duration-200 shadow-sm cursor-pointer text-sm"
            >
              <UserCheck className="w-4 h-4" /> Give EMS Access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
