import { Banknote, CalendarRange, Calculator, TreePalm, Users } from 'lucide-react';
import { ROLES, type AppRole } from '@/lib/rbac';
import type { SearchSource } from '@/types/search-reports';

export const SOURCE_META: Record<
  SearchSource,
  { label: string; icon: React.ReactNode; tone: string }
> = {
  employee: {
    label: 'Employee',
    icon: <Users className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  accounting: {
    label: 'Accounting',
    icon: <Calculator className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  salary: {
    label: 'Payroll',
    icon: <Banknote className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  leave_request: {
    label: 'Leave request',
    icon: <TreePalm className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
  leave_balance: {
    label: 'Leave balance',
    icon: <CalendarRange className="h-3.5 w-3.5" />,
    tone: 'bg-canvas text-ink',
  },
};

export const SEARCH_GUIDANCE: Record<
  AppRole,
  { description: string; placeholder: string; noMatch: string }
> = {
  [ROLES.SUPER_ADMIN]: {
    description: 'Search employees, payroll, leave, and accounting records in one place.',
    placeholder: 'Search people, vendors, amounts, references, payroll, or leave…',
    noMatch: 'Try an employee, vendor, reference, amount, payroll period, or leave type.',
  },
  [ROLES.ADMIN]: {
    description: 'Search employees, payroll, leave, and accounting records in one place.',
    placeholder: 'Search people, vendors, amounts, references, payroll, or leave…',
    noMatch: 'Try an employee, vendor, reference, amount, payroll period, or leave type.',
  },
  [ROLES.HR_MANAGER]: {
    description: 'Search HR information only: employees, payroll, leave requests, and balances.',
    placeholder: 'Search employee, department, payroll period, or leave…',
    noMatch: 'Try an employee name or ID, department, payroll period, or leave type.',
  },
  [ROLES.FINANCE_MANAGER]: {
    description:
      'Search accounting information only: transactions, vendors, accounts, and references.',
    placeholder: 'Search vendor, account, amount, reference, invoice, or month…',
    noMatch: 'Try a vendor, account, reference, amount, invoice, or month.',
  },
  [ROLES.DIRECTOR]: {
    description: 'Search the financial and operational information available to Directors.',
    placeholder: 'Search people, accounting, payroll, or leave…',
    noMatch: 'Try an employee, vendor, reference, payroll period, or leave type.',
  },
  [ROLES.EMPLOYEE]: {
    description: 'Search is not available for this role.',
    placeholder: 'Search…',
    noMatch: 'Try another search.',
  },
};
