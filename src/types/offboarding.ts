export const OFFBOARDING_STATUSES = {
  INITIATED: 'Initiated',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const;

export type OffboardingStatus =
  (typeof OFFBOARDING_STATUSES)[keyof typeof OFFBOARDING_STATUSES];

export const OFFBOARDING_CHECKLIST_ITEMS = [
  {
    id: 'revoke_access',
    label: 'Revoke EMS login',
    automatic: true,
  },
  {
    id: 'archive_documents',
    label: 'Archive generated documents',
    automatic: true,
  },
  {
    id: 'close_leave',
    label: 'Close pending leave requests',
    automatic: true,
  },
  {
    id: 'collect_assets',
    label: 'Collect laptop, ID card, and keys',
    automatic: false,
  },
  {
    id: 'review_settlement',
    label: 'Review final settlement figures',
    automatic: false,
  },
  {
    id: 'finance_payout',
    label: 'Finance notified for settlement payout',
    automatic: false,
  },
] as const;

export type OffboardingChecklistId = (typeof OFFBOARDING_CHECKLIST_ITEMS)[number]['id'];

export type OffboardingChecklistItem = {
  id: string;
  label: string;
  automatic: boolean;
  done: boolean;
  doneAt: string;
};

export type OffboardingSettlementInput = {
  lastWorkingDate: string;
  unpaidDays?: number;
  otherAdditions?: number;
  otherDeductions?: number;
};

export type OffboardingSettlement = {
  monthlySalary: number;
  unusedLeaveDays: number;
  dailyRate: number;
  leaveEncashment: number;
  daysInMonth: number;
  daysWorked: number;
  proratedSalary: number;
  unpaidDays: number;
  unpaidDeduction: number;
  otherAdditions: number;
  otherDeductions: number;
  netSettlement: number;
};

export type OffboardingRecord = OffboardingSettlement & {
  offboardingId: string;
  employeeId: string;
  fullName: string;
  email: string;
  department: string;
  status: OffboardingStatus | string;
  lastWorkingDate: string;
  reason: string;
  notes: string;
  initiatedBy: string;
  initiatedAt: string;
  completedBy: string;
  completedAt: string;
  checklist: OffboardingChecklistItem[];
};
