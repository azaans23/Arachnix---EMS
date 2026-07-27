'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormik } from 'formik';
import toast from 'react-hot-toast';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  DollarSign,
  Shield,
  MapPin,
  CreditCard,
  Database,
  Calendar,
  Clock,
  Hash,
} from 'lucide-react';
import CustomDropdown from '@/components/ui/Dropdown';
import type { EmployeeWriteInput, SheetUser } from '@/types/employee';
import { mapRawToEmployee } from '@/lib/sheets/employees';
import {
  buildEmployeeUniquenessContext,
  employeeValidationSchema,
} from '@/utils/validation';
import { ROLE_OPTIONS } from '@/lib/rbac';

const emsStatusOptions = [
  { label: 'Active', value: 'Active' },
  { label: 'Inactive', value: 'Inactive' },
];

const roleOptions = ROLE_OPTIONS.map((r) => ({ label: r.label, value: r.value }));

type EmployeeFormProps = {
  user?: SheetUser;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  embedded?: boolean;
};

function emptyValues(): EmployeeWriteInput {
  return {
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
    department: '',
    designation: '',
    employmentType: '',
    joiningDate: '',
    baseSalary: '',
    bankAccountDetails: '',
    role: 'Employee',
    emsStatus: 'Active',
  };
}

function valuesFromUser(user: SheetUser): EmployeeWriteInput {
  const employee = mapRawToEmployee(user.raw || {});
  return {
    employeeId: user.employeeId || employee.employeeId,
    name: user.name || employee.fullName,
    email: user.email || employee.email,
    phone: employee.phone,
    dob: employee.dob,
    address: employee.address,
    department: employee.department,
    designation: employee.designation,
    employmentType: employee.employeeType,
    joiningDate: employee.joiningDate,
    baseSalary: employee.baseSalary,
    bankAccountDetails: employee.bankAccountDetails,
    role: user.role || employee.role || 'Employee',
    emsStatus: employee.emsStatus || 'Active',
    originalEmployeeId: user.employeeId || employee.employeeId,
    originalEmail: user.email || employee.email,
  };
}

export default function EmployeeForm({
  user,
  onSuccess,
  onCancel,
  submitLabel,
  embedded = false,
}: EmployeeFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [roster, setRoster] = useState<{ employeeId: string; email: string }[]>([]);
  const isEditMode = !!user;

  useEffect(() => {
    const loadRoster = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/get-users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json();
        if (!res.ok || !result.success) return;

        let rawUsers: unknown[] = [];
        if (Array.isArray(result.data)) rawUsers = result.data;
        else if (result.data && typeof result.data === 'object') rawUsers = [result.data];

        setRoster(
          rawUsers.map((row) => {
            const employee = mapRawToEmployee(row);
            return { employeeId: employee.employeeId, email: employee.email };
          })
        );
      } catch {
        /* uniqueness still enforced server-side */
      }
    };
    loadRoster();
  }, []);

  const initialValues = useMemo(
    () => (user ? valuesFromUser(user) : emptyValues()),
    [user]
  );

  const uniquenessContext = useMemo(
    () =>
      buildEmployeeUniquenessContext(roster, {
        employeeId: user?.employeeId,
        email: user?.email,
      }),
    [roster, user?.employeeId, user?.email]
  );

  const formik = useFormik<EmployeeWriteInput>({
    initialValues,
    enableReinitialize: true,
    validate: async (values) => {
      try {
        await employeeValidationSchema.validate(values, {
          abortEarly: false,
          context: uniquenessContext,
        });
        return {};
      } catch (err: unknown) {
        const fieldErrors: Record<string, string> = {};
        if (err && typeof err === 'object' && 'inner' in err) {
          const yupErr = err as { inner: { path?: string; message: string }[] };
          for (const issue of yupErr.inner || []) {
            if (issue.path && !fieldErrors[issue.path]) {
              fieldErrors[issue.path] = issue.message;
            }
          }
        }
        return fieldErrors;
      }
    },
    onSubmit: async (values) => {
      setSubmitting(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const res = await fetch('/api/update-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...values,
            originalEmployeeId: user?.employeeId || values.originalEmployeeId || '',
            originalEmail: user?.email || values.originalEmail || '',
          }),
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
          if (result.fieldErrors && typeof result.fieldErrors === 'object') {
            Object.entries(result.fieldErrors).forEach(([field, message]) => {
              formik.setFieldError(field, String(message));
            });
          }
          throw new Error(result.error || 'Failed to update user.');
        }

        toast.success(
          isEditMode ? 'Employee profile updated successfully' : 'Employee profile created successfully'
        );
        onSuccess?.();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to save employee profile.';
        toast.error(errMsg);
      } finally {
        setSubmitting(false);
      }
    },
  });

  const showError = (name: keyof EmployeeWriteInput) =>
    formik.touched[name] && formik.errors[name] ? String(formik.errors[name]) : null;

  const fieldClass = (name: keyof EmployeeWriteInput) =>
    `pl-10 pr-4 py-2 w-full bg-surface border rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] transition-all duration-200 ${
      showError(name)
        ? 'border-danger focus:border-danger'
        : 'border-border focus:border-ink/40'
    }`;

  return (
    <form onSubmit={formik.handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <Field
          label="Employee ID"
          htmlFor="employeeId"
          error={showError('employeeId')}
          icon={<Hash className="h-4 w-4" />}
        >
          <input
            id="employeeId"
            name="employeeId"
            type="text"
            placeholder="EMP-001"
            value={formik.values.employeeId}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('employeeId')}
          />
        </Field>

        <Field
          label="Full Name"
          htmlFor="name"
          error={showError('name')}
          icon={<User className="h-4 w-4" />}
        >
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Muhammad Ahmed"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('name')}
          />
        </Field>

        <Field
          label="Email Address"
          htmlFor="email"
          error={showError('email')}
          icon={<Mail className="h-4 w-4" />}
        >
          <input
            id="email"
            name="email"
            type="email"
            placeholder="name@company.com"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('email')}
          />
        </Field>

        <Field
          label="Designation"
          htmlFor="designation"
          error={showError('designation')}
          icon={<Briefcase className="h-4 w-4" />}
        >
          <input
            id="designation"
            name="designation"
            type="text"
            placeholder="Software Engineer"
            value={formik.values.designation}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('designation')}
          />
        </Field>

        <Field
          label="Department"
          htmlFor="department"
          error={showError('department')}
          icon={<Briefcase className="h-4 w-4" />}
        >
          <input
            id="department"
            name="department"
            type="text"
            placeholder="Engineering"
            value={formik.values.department}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('department')}
          />
        </Field>

        <Field
          label="Employment Type"
          htmlFor="employmentType"
          error={showError('employmentType')}
          icon={<Clock className="h-4 w-4" />}
        >
          <input
            id="employmentType"
            name="employmentType"
            type="text"
            placeholder="Full-time / Contract"
            value={formik.values.employmentType}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('employmentType')}
          />
        </Field>

        <Field
          label="Phone Number"
          htmlFor="phone"
          error={showError('phone')}
          icon={<Phone className="h-4 w-4" />}
        >
          <input
            id="phone"
            name="phone"
            type="text"
            placeholder="+92 300 1234567"
            value={formik.values.phone}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('phone')}
          />
        </Field>

        <Field
          label="Date of Birth"
          htmlFor="dob"
          error={showError('dob')}
          icon={<Calendar className="h-4 w-4" />}
        >
          <input
            id="dob"
            name="dob"
            type="date"
            value={formik.values.dob}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('dob')}
          />
        </Field>

        <Field
          label="Joining Date"
          htmlFor="joiningDate"
          error={showError('joiningDate')}
          icon={<Calendar className="h-4 w-4" />}
        >
          <input
            id="joiningDate"
            name="joiningDate"
            type="date"
            value={formik.values.joiningDate}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('joiningDate')}
          />
        </Field>

        <Field
          label="Base Salary (PKR)"
          htmlFor="baseSalary"
          error={showError('baseSalary')}
          icon={<DollarSign className="h-4 w-4" />}
        >
          <input
            id="baseSalary"
            name="baseSalary"
            type="number"
            placeholder="85000"
            value={formik.values.baseSalary}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={fieldClass('baseSalary')}
          />
        </Field>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide text-ink"
            htmlFor="role"
          >
            System Assigned Role
          </label>
          <CustomDropdown
            id="role"
            name="role"
            value={formik.values.role}
            onChange={(val) => formik.setFieldValue('role', val)}
            onBlur={() => formik.setFieldTouched('role', true)}
            options={roleOptions}
            icon={<Shield className="h-4 w-4" />}
            error={showError('role') || undefined}
            touched={!!formik.touched.role}
          />
          {showError('role') && <p className="text-xs text-danger">{showError('role')}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide text-ink"
            htmlFor="emsStatus"
          >
            EMS Status
          </label>
          <CustomDropdown
            id="emsStatus"
            name="emsStatus"
            value={formik.values.emsStatus}
            onChange={(val) => formik.setFieldValue('emsStatus', val)}
            onBlur={() => formik.setFieldTouched('emsStatus', true)}
            options={emsStatusOptions}
            icon={<Database className="h-4 w-4" />}
            error={showError('emsStatus') || undefined}
            touched={!!formik.touched.emsStatus}
          />
          {showError('emsStatus') && (
            <p className="text-xs text-danger">{showError('emsStatus')}</p>
          )}
        </div>

        <Field
          label="Residential Address"
          htmlFor="address"
          error={showError('address')}
          icon={<MapPin className="h-4 w-4" />}
          className="md:col-span-2"
          iconTop
        >
          <textarea
            id="address"
            name="address"
            rows={2}
            placeholder="123 Main Street, Sector G-11, Islamabad"
            value={formik.values.address}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={`${fieldClass('address')} resize-none`}
          />
        </Field>

        <Field
          label="Bank Account Details"
          htmlFor="bankAccountDetails"
          error={showError('bankAccountDetails')}
          icon={<CreditCard className="h-4 w-4" />}
          className="md:col-span-2"
          iconTop
        >
          <textarea
            id="bankAccountDetails"
            name="bankAccountDetails"
            rows={2}
            placeholder="Alfalah Bank, Account No: 1234-56789-001, IBAN: PK00ALFA..."
            value={formik.values.bankAccountDetails}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={`${fieldClass('bankAccountDetails')} resize-none`}
          />
        </Field>
      </div>

      <div
        className={`flex justify-end gap-4 ${embedded ? 'pt-2' : 'border-t border-border pt-6'}`}
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="cursor-pointer rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-canvas/40 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition-all duration-200 hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting
            ? isEditMode
              ? 'Saving…'
              : 'Creating…'
            : submitLabel || (isEditMode ? 'Save Changes' : 'Create Profile')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  icon,
  children,
  className = '',
  iconTop = false,
}: {
  label: string;
  htmlFor: string;
  error: string | null;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  iconTop?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-ink" htmlFor={htmlFor}>
        {label}
      </label>
      <div className={`relative flex ${iconTop ? 'items-start' : 'items-center'}`}>
        <div className={`absolute left-3 text-muted ${iconTop ? 'top-3' : ''}`}>{icon}</div>
        {children}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
