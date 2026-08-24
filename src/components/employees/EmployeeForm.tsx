'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormik } from 'formik';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Shield,
  MapPin,
  Database,
  Calendar,
  Clock,
  Hash,
  ShieldAlert,
  DollarSign,
  CreditCard,
  Landmark,
} from 'lucide-react';
import CustomDropdown from '@/components/ui/Dropdown';
import DatePicker, { toIsoDate } from '@/components/ui/DatePicker';
import type { EmployeeWriteInput, SheetUser } from '@/types/employee';
import {
  DEPARTMENT_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  hasEmsLogin,
  supabaseUserIdOf,
} from '@/types/employee';
import { getNextEmployeeId, mapRawToEmployee, employeeToFormValues } from '@/lib/sheets/employees';
import { buildEmployeeUniquenessContext, employeeValidationSchema } from '@/utils/validation';
import { computeSalaryTotals } from '@/lib/payroll/period';
import { withholdingTaxFromSalaryFields } from '@/lib/payroll/withholding-tax';
import {
  assignableRoleOptions,
  canAssignHrFinanceAccess,
  canAssignDirectorFlag,
  canEditEmployeeRecord,
  getTrustedRole,
  normalizeRole,
  ROLE_OPTIONS,
  ROLES,
} from '@/lib/rbac';
import { syncSessionCookies } from '@/lib/session-cookies';
import { supabase } from '@/lib/supabase';
import { FormSkeleton } from '@/components/ui/Skeleton';

const emsStatusOptions = [
  { label: 'Active', value: 'Active' },
  { label: 'Revoke access', value: 'Inactive' },
];

const departmentOptions = DEPARTMENT_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));

const employmentTypeOptions = EMPLOYMENT_TYPE_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));

type EmployeeFormProps = {
  user?: SheetUser;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  embedded?: boolean;
};

function emptyValues(employeeId: string): EmployeeWriteInput {
  return {
    employeeId,
    name: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
    department: '',
    designation: '',
    employmentType: '',
    joiningDate: '',
    role: 'Employee',
    emsStatus: 'Active',
    supabaseUserId: '',
    isDirector: false,
    hasFinanceAccess: false,
    salary: '',
    tax: '0',
    allowance: '0',
    accountNumber: '',
    accountName: '',
    bankName: '',
  };
}

function valuesFromUser(user: SheetUser): EmployeeWriteInput {
  return employeeToFormValues(mapRawToEmployee(user.raw || {}));
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
  const [rosterLoading, setRosterLoading] = useState(true);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const isEditMode = !!user;

  useEffect(() => {
    const loadActor = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) return;
      setActorEmail(session.user.email || null);
      setActorUserId(session.user.id || null);
      try {
        const synced = await syncSessionCookies(session.access_token);
        setActorRole(synced.role);
      } catch {
        setActorRole(getTrustedRole(session.user));
      }
    };
    loadActor();
  }, []);

  const roleOptions = useMemo(() => {
    const assignable = actorRole
      ? assignableRoleOptions(actorRole).map((r) => ({ label: r.label, value: r.value }))
      : ROLE_OPTIONS.filter((r) => r.value !== 'Super Admin' && r.value !== 'Admin').map((r) => ({
          label: r.label,
          value: r.value,
        }));
    const current = user?.role || '';
    if (current && !assignable.some((o) => o.value === current)) {
      return [{ label: current, value: current }, ...assignable];
    }
    return assignable;
  }, [actorRole, user?.role]);

  const departmentFieldOptions = useMemo(() => {
    const current = String(
      (user?.raw?.Department as string | undefined) ||
        (user?.raw?.department as string | undefined) ||
        ''
    ).trim();
    if (current && !departmentOptions.some((option) => option.value === current)) {
      return [{ label: current, value: current }, ...departmentOptions];
    }
    return departmentOptions;
  }, [user]);

  const employmentTypeFieldOptions = useMemo(() => {
    const current = String(
      (user?.raw?.EmployeeType as string | undefined) ||
        (user?.raw?.employeeType as string | undefined) ||
        (user?.raw?.EmploymentType as string | undefined) ||
        ''
    ).trim();
    if (current && !employmentTypeOptions.some((option) => option.value === current)) {
      return [{ label: current, value: current }, ...employmentTypeOptions];
    }
    return employmentTypeOptions;
  }, [user]);

  const editBlockedReason = useMemo(() => {
    if (!isEditMode || !actorRole || !user) return null;
    if (
      !canEditEmployeeRecord({
        actorRole,
        actorEmail,
        actorUserId,
        targetRole: user.role,
        targetEmail: user.email,
        targetSupabaseUserId: supabaseUserIdOf(user),
      })
    ) {
      return `You cannot edit employees with role ${user.role}.`;
    }
    return null;
  }, [actorEmail, actorRole, actorUserId, isEditMode, user]);

  /** EMS status can only be Active once login credentials exist. */
  const hasLogin = user ? hasEmsLogin(user) : false;

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

        const loadedRoster = rawUsers.map((row) => {
          const employee = mapRawToEmployee(row);
          return { employeeId: employee.employeeId, email: employee.email };
        });
        setRoster(loadedRoster);
      } catch {
        /* uniqueness still enforced server-side */
      } finally {
        setRosterLoading(false);
      }
    };
    loadRoster();
  }, []);

  const nextEmployeeId = useMemo(() => getNextEmployeeId(roster), [roster]);

  const initialValues = useMemo(() => {
    if (!user) return emptyValues(nextEmployeeId);
    const values = valuesFromUser(user);
    return {
      ...values,
      employeeId: values.employeeId || nextEmployeeId,
    };
  }, [user, nextEmployeeId]);

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
    validateOnBlur: false,
    validateOnChange: false,
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
      if (editBlockedReason) {
        toast.error(editBlockedReason);
        return;
      }
      setSubmitting(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const payload: EmployeeWriteInput = {
          ...values,
          emsStatus: hasLogin ? values.emsStatus : 'Inactive',
          originalEmployeeId: user?.employeeId || values.originalEmployeeId || '',
          originalEmail: user?.email || values.originalEmail || '',
        };
        if (!isEditMode && !String(payload.accountName || '').trim()) {
          payload.accountName = payload.name.trim();
        }

        const res = await fetch('/api/update-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
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
          result.emsAccessRevoked
            ? 'EMS access revoked. You can register this employee again.'
            : isEditMode
              ? 'Employee profile updated successfully'
              : 'Employee created with salary profile'
        );
        if (result.warning) {
          toast.warning(String(result.warning));
        }
        onSuccess?.();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to save employee profile.';
        toast.error(errMsg);
      } finally {
        setSubmitting(false);
      }
    },
  });

  const salaryPreview = useMemo(() => {
    if (isEditMode) return null;
    return computeSalaryTotals({
      salary: formik.values.salary || '',
      allowance: formik.values.allowance || '',
      tax: withholdingTaxFromSalaryFields(formik.values.salary),
    });
  }, [formik.values.allowance, formik.values.salary, isEditMode]);

  const showError = (name: keyof EmployeeWriteInput) =>
    formik.submitCount > 0 && formik.errors[name] ? String(formik.errors[name]) : null;

  const handleDateFieldChange = (name: 'dob' | 'joiningDate', value: string) => {
    void formik.setFieldValue(name, value, false);
  };

  const today = toIsoDate(new Date());

  const fieldClass = (name: keyof EmployeeWriteInput) =>
    `pl-10 pr-4 py-2 w-full bg-surface border rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] transition-all duration-200 ${
      showError(name) ? 'border-danger focus:border-danger' : 'border-border focus:border-ink/40'
    }`;

  if (rosterLoading) {
    return <FormSkeleton fields={isEditMode ? 10 : 16} />;
  }

  return (
    <form onSubmit={formik.handleSubmit} className="flex flex-col gap-6">
      {editBlockedReason ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{editBlockedReason}</p>
        </div>
      ) : null}

      <fieldset disabled={Boolean(editBlockedReason)} className="contents">
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          <Field
            label="Employee ID (Auto-generated)"
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
              readOnly
              aria-readonly="true"
              className={`${fieldClass('employeeId')} cursor-not-allowed bg-canvas text-muted`}
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

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-ink"
              htmlFor="department"
            >
              Department
            </label>
            <CustomDropdown
              id="department"
              name="department"
              placeholder="Select department"
              value={formik.values.department}
              onChange={(val) => void formik.setFieldValue('department', val)}
              onBlur={() => void formik.setFieldTouched('department', true)}
              options={departmentFieldOptions}
              icon={<Briefcase className="h-4 w-4" />}
              error={showError('department') || undefined}
              touched={!!formik.touched.department}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-ink"
              htmlFor="employmentType"
            >
              Employment Type
            </label>
            <CustomDropdown
              id="employmentType"
              name="employmentType"
              placeholder="Select employment type"
              value={formik.values.employmentType}
              onChange={(val) => void formik.setFieldValue('employmentType', val)}
              onBlur={() => void formik.setFieldTouched('employmentType', true)}
              options={employmentTypeFieldOptions}
              icon={<Clock className="h-4 w-4" />}
              error={showError('employmentType') || undefined}
              touched={!!formik.touched.employmentType}
            />
          </div>

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
            <DatePicker
              id="dob"
              name="dob"
              ariaLabel="Date of birth"
              hideIcon
              max={today}
              value={String(formik.values.dob || '')}
              onChange={(next) => {
                handleDateFieldChange('dob', next);
              }}
              onBlur={() => {
                void formik.setFieldTouched('dob', true, false);
              }}
              invalid={!!showError('dob')}
              className="pl-10"
            />
          </Field>

          <Field
            label="Joining Date"
            htmlFor="joiningDate"
            error={showError('joiningDate')}
            icon={<Calendar className="h-4 w-4" />}
          >
            <DatePicker
              id="joiningDate"
              name="joiningDate"
              ariaLabel="Joining date"
              hideIcon
              value={String(formik.values.joiningDate || '')}
              onChange={(next) => {
                handleDateFieldChange('joiningDate', next);
              }}
              onBlur={() => {
                void formik.setFieldTouched('joiningDate', true, false);
              }}
              invalid={!!showError('joiningDate')}
              className="pl-10"
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
              onChange={(val) => {
                formik.setFieldValue('role', val);
                if (normalizeRole(val) !== ROLES.HR_MANAGER) {
                  formik.setFieldValue('hasFinanceAccess', false);
                }
              }}
              onBlur={() => formik.setFieldTouched('role', true)}
              options={roleOptions}
              icon={<Shield className="h-4 w-4" />}
              error={showError('role') || undefined}
              touched={!!formik.touched.role}
            />
            {showError('role') && <p className="text-xs text-danger">{showError('role')}</p>}
          </div>

          {Boolean(actorRole && canAssignDirectorFlag(actorRole)) && (
            <label className="flex items-start gap-3 rounded-lg border border-border bg-canvas/50 px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                checked={Boolean(formik.values.isDirector)}
                onChange={(event) => formik.setFieldValue('isDirector', event.target.checked)}
              />
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-ink">
                  Director
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Marks this person as a company director for accounting accounts. This is not a
                  login role. Only Super Admin can change this.
                </span>
              </span>
            </label>
          )}

          {normalizeRole(formik.values.role) === ROLES.HR_MANAGER &&
            Boolean(actorRole && canAssignHrFinanceAccess(actorRole)) && (
              <label className="flex items-start gap-3 rounded-lg border border-border bg-canvas/50 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={Boolean(formik.values.hasFinanceAccess)}
                  onChange={(event) =>
                    formik.setFieldValue('hasFinanceAccess', event.target.checked)
                  }
                />
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-ink">
                    Assign finance access
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    HR also receives Finance Manager permissions (salary slips and accounting).
                    Only Super Admin and Admin can grant this.
                  </span>
                </span>
              </label>
            )}

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-ink"
              htmlFor="emsStatus"
            >
              EMS Status
            </label>
            {hasLogin ? (
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
            ) : (
              <div className="relative">
                <Database className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="emsStatus"
                  name="emsStatus"
                  type="text"
                  value="Register"
                  readOnly
                  aria-readonly="true"
                  className="w-full cursor-not-allowed rounded-lg border border-border bg-canvas py-2 pl-10 pr-4 text-sm text-muted"
                />
              </div>
            )}
            {!hasLogin && isEditMode && (
              <p className="text-xs text-muted">
                No login yet. Use Register on the employees list or profile to grant EMS access.
              </p>
            )}
            {hasLogin && formik.values.emsStatus === 'Inactive' && (
              <p className="text-xs text-muted">
                Saving with revoke access deletes their login so they can be registered again.
              </p>
            )}
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

          {!isEditMode && (
            <>
              <div className="md:col-span-2 rounded-lg border border-border bg-canvas/50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Salary profile
                </p>
                <p className="mt-1 text-xs text-muted">
                  Saved only on the Salary sheet and salaries table. Withholding tax is calculated
                  from base salary using FBR salaried slabs (FY 2026–27). You can update the
                  profile later on the Salary page.
                </p>
                {salaryPreview && (
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted">Total earning</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-ink">
                        PKR {salaryPreview.totalearning.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Total deduction</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-ink">
                        PKR {salaryPreview.totaldeduction.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Net salary</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-ink">
                        PKR {salaryPreview.netsalary.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Field
                label="Base Salary (PKR)"
                htmlFor="salary"
                error={showError('salary')}
                icon={<DollarSign className="h-4 w-4" />}
              >
                <input
                  id="salary"
                  name="salary"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="85000"
                  value={formik.values.salary || ''}
                  onChange={(event) => {
                    formik.handleChange(event);
                    void formik.setFieldValue(
                      'tax',
                      withholdingTaxFromSalaryFields(event.target.value),
                      false
                    );
                  }}
                  onBlur={formik.handleBlur}
                  className={fieldClass('salary')}
                />
              </Field>

              <Field
                label="Allowance (PKR)"
                htmlFor="allowance"
                error={showError('allowance')}
                icon={<DollarSign className="h-4 w-4" />}
              >
                <input
                  id="allowance"
                  name="allowance"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={formik.values.allowance || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={fieldClass('allowance')}
                />
              </Field>

              <Field
                label="Withholding tax (PKR)"
                htmlFor="tax"
                error={showError('tax')}
                icon={<DollarSign className="h-4 w-4" />}
              >
                <input
                  id="tax"
                  name="tax"
                  type="number"
                  min="0"
                  step="1"
                  readOnly
                  tabIndex={-1}
                  value={formik.values.tax || '0'}
                  className={`${fieldClass('tax')} cursor-not-allowed text-muted shadow-none focus:ring-0 [background:color-mix(in_oklab,var(--muted)_14%,var(--surface))] dark:[background:color-mix(in_oklab,var(--muted)_22%,var(--surface))]`}
                  aria-readonly="true"
                  title="Calculated from base salary using FBR salaried withholding tax slabs"
                />
              </Field>

              <Field
                label="Bank Name"
                htmlFor="bankName"
                error={showError('bankName')}
                icon={<Landmark className="h-4 w-4" />}
              >
                <input
                  id="bankName"
                  name="bankName"
                  type="text"
                  placeholder="Bank Alfalah"
                  value={formik.values.bankName || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={fieldClass('bankName')}
                />
              </Field>

              <Field
                label="Account Name"
                htmlFor="accountName"
                error={showError('accountName')}
                icon={<User className="h-4 w-4" />}
              >
                <input
                  id="accountName"
                  name="accountName"
                  type="text"
                  placeholder={formik.values.name || 'Account holder name'}
                  value={formik.values.accountName || ''}
                  onChange={formik.handleChange}
                  onBlur={(event) => {
                    formik.handleBlur(event);
                    if (!formik.values.accountName?.trim() && formik.values.name.trim()) {
                      formik.setFieldValue('accountName', formik.values.name.trim());
                    }
                  }}
                  className={fieldClass('accountName')}
                />
              </Field>

              <Field
                label="Account Number"
                htmlFor="accountNumber"
                error={showError('accountNumber')}
                icon={<CreditCard className="h-4 w-4" />}
              >
                <input
                  id="accountNumber"
                  name="accountNumber"
                  type="text"
                  placeholder="1234-56789-001"
                  value={formik.values.accountNumber || ''}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={fieldClass('accountNumber')}
                />
              </Field>
            </>
          )}
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
            disabled={submitting || Boolean(editBlockedReason)}
            className="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition-all duration-200 hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting
              ? isEditMode
                ? 'Saving…'
                : 'Creating…'
              : submitLabel || (isEditMode ? 'Save' : 'Create Profile')}
          </button>
        </div>
      </fieldset>
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
