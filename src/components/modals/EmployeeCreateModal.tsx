'use client';

import { X } from 'lucide-react';
import EmployeeForm from '@/components/employees/EmployeeForm';
import type { SheetUser } from '@/types/employee';

interface EmployeeCreateModalProps {
  user?: SheetUser;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EmployeeCreateModal({
  user,
  onClose,
  onSuccess,
}: EmployeeCreateModalProps) {
  const isEditMode = !!user;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm transition-all duration-300 animate-fade-in">
      <div
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        className="relative mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-8 shadow-panel animate-scale-up [&::-webkit-scrollbar]:hidden"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 border-b border-border pb-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">
            {isEditMode ? 'Edit Employee Profile' : 'Create Employee Profile'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isEditMode
              ? 'Update the fields below to modify this employee profile.'
              : 'Add the profile, initial salary (base, tax, allowance), and bank details. Totals are calculated automatically.'}
          </p>
        </div>

        <EmployeeForm
          user={user}
          onCancel={onClose}
          onSuccess={() => {
            onSuccess?.();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
