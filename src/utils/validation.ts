import * as Yup from 'yup';
import { KNOWN_ROLE_VALUES } from '@/lib/rbac';

export const loginValidationSchema = Yup.object({
  email: Yup.string().email('Invalid email address').required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});

export const signupValidationSchema = Yup.object({
  name: Yup.string().min(2, 'Name must be at least 2 characters').required('Full Name is required'),
  email: Yup.string().email('Invalid email address').required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  role: Yup.string()
    .required('Role is required')
    .oneOf([...KNOWN_ROLE_VALUES], 'Invalid role'),
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmployeeUniquenessContext = {
  existingIds: string[];
  existingEmails: string[];
  excludeEmployeeId?: string;
  excludeEmail?: string;
};

const moneyOptional = Yup.string()
  .trim()
  .test('is-number', 'Must be a valid number', (value) => {
    if (value === undefined || value === null || value === '') return true;
    return !Number.isNaN(Number(value)) && Number(value) >= 0;
  });

/** Required fields + email format. Uniqueness is enforced via context when provided. */
export const employeeValidationSchema = Yup.object({
  employeeId: Yup.string()
    .trim()
    .required('Employee ID is required')
    .matches(/^EMP-\d{3,}$/i, 'Employee ID must use the format EMP-001')
    .test('unique-employee-id', 'Employee ID already exists', function (value) {
      const ctx = this.options.context as EmployeeUniquenessContext | undefined;
      if (!value || !ctx?.existingIds?.length) return true;
      const needle = value.trim().toLowerCase();
      const exclude = (ctx.excludeEmployeeId || '').trim().toLowerCase();
      return !ctx.existingIds.some(
        (id) => id.trim().toLowerCase() === needle && id.trim().toLowerCase() !== exclude
      );
    }),
  name: Yup.string()
    .trim()
    .required('Full name is required')
    .min(2, 'Name must be at least 2 characters'),
  email: Yup.string()
    .trim()
    .required('Email is required')
    .matches(EMAIL_REGEX, 'Invalid email address')
    .test('unique-email', 'Email already exists', function (value) {
      const ctx = this.options.context as EmployeeUniquenessContext | undefined;
      if (!value || !ctx?.existingEmails?.length) return true;
      const needle = value.trim().toLowerCase();
      const exclude = (ctx.excludeEmail || '').trim().toLowerCase();
      return !ctx.existingEmails.some(
        (email) => email.trim().toLowerCase() === needle && email.trim().toLowerCase() !== exclude
      );
    }),
  phone: Yup.string().trim().required('Phone number is required'),
  dob: Yup.string().trim().required('Date of birth is required'),
  address: Yup.string().trim().required('Address is required'),
  department: Yup.string().trim().required('Department is required'),
  designation: Yup.string().trim().required('Designation is required'),
  employmentType: Yup.string().trim().required('Employment type is required'),
  joiningDate: Yup.string().trim().required('Joining date is required'),
  role: Yup.string()
    .trim()
    .required('Role is required')
    .oneOf([...KNOWN_ROLE_VALUES], 'Invalid role'),
  emsStatus: Yup.string().trim().required('EMS status is required'),
  isDirector: Yup.boolean().optional(),
  hasFinanceAccess: Yup.boolean().optional(),
  originalEmployeeId: Yup.string().trim().optional(),
  originalEmail: Yup.string().trim().optional(),
  salary: moneyOptional.when('originalEmployeeId', {
    is: (value: string | undefined) => !String(value || '').trim(),
    then: (schema) =>
      schema.required('Base salary is required').test('is-positive', 'Base salary must be greater than 0', (value) => {
        if (!value) return false;
        return Number(value) > 0;
      }),
    otherwise: (schema) => schema.optional(),
  }),
  tax: moneyOptional,
  allowance: moneyOptional.when('originalEmployeeId', {
    is: (value: string | undefined) => !String(value || '').trim(),
    then: (schema) => schema.required('Allowance is required'),
    otherwise: (schema) => schema.optional(),
  }),
  accountNumber: Yup.string()
    .trim()
    .when('originalEmployeeId', {
      is: (value: string | undefined) => !String(value || '').trim(),
      then: (schema) => schema.required('Account number is required'),
      otherwise: (schema) => schema.optional(),
    }),
  accountName: Yup.string()
    .trim()
    .when('originalEmployeeId', {
      is: (value: string | undefined) => !String(value || '').trim(),
      then: (schema) => schema.required('Account name is required'),
      otherwise: (schema) => schema.optional(),
    }),
  bankName: Yup.string()
    .trim()
    .when('originalEmployeeId', {
      is: (value: string | undefined) => !String(value || '').trim(),
      then: (schema) => schema.required('Bank name is required'),
      otherwise: (schema) => schema.optional(),
    }),
});

export function buildEmployeeUniquenessContext(
  existing: { employeeId: string; email: string }[],
  exclude?: { employeeId?: string; email?: string }
): EmployeeUniquenessContext {
  return {
    existingIds: existing.map((e) => e.employeeId).filter(Boolean),
    existingEmails: existing.map((e) => e.email).filter(Boolean),
    excludeEmployeeId: exclude?.employeeId,
    excludeEmail: exclude?.email,
  };
}
