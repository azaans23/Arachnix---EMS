import { listEmployeeDbRows, type EmployeeDbRow } from '@/lib/db/employees';

export const EXPIRY_ALERT_THRESHOLDS = [30, 7] as const;

export type EmployeeExpiryAlert = {
  alertKey: string;
  alertType: 'probation' | 'contract';
  thresholdDays: (typeof EXPIRY_ALERT_THRESHOLDS)[number];
  expiryDate: string;
  employeeId: string;
  fullName: string;
  email: string;
  department: string;
  designation: string;
  employeeType: string;
};

function isoDatePlusDays(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function expiryAlert(
  employee: EmployeeDbRow,
  alertType: EmployeeExpiryAlert['alertType'],
  expiryDate: string | null,
  thresholdDays: EmployeeExpiryAlert['thresholdDays']
): EmployeeExpiryAlert | null {
  if (!expiryDate) return null;
  const date = String(expiryDate).slice(0, 10);
  return {
    alertKey: `${employee.employeeid}:${alertType}:${date}:${thresholdDays}`,
    alertType,
    thresholdDays,
    expiryDate: date,
    employeeId: employee.employeeid,
    fullName: employee.fullname,
    email: employee.email,
    department: employee.department,
    designation: employee.designation,
    employeeType: employee.employeetype,
  };
}

/** Build the exact 30-day and 7-day reminders for one UTC calendar day. */
export function buildEmployeeExpiryAlerts(
  employees: EmployeeDbRow[],
  now = new Date()
): EmployeeExpiryAlert[] {
  const active = employees.filter(
    (employee) => String(employee.emsstatus || '').trim().toLowerCase() === 'active'
  );
  const alerts: EmployeeExpiryAlert[] = [];

  for (const thresholdDays of EXPIRY_ALERT_THRESHOLDS) {
    const targetDate = isoDatePlusDays(now, thresholdDays);
    for (const employee of active) {
      if (String(employee.probationenddate || '').slice(0, 10) === targetDate) {
        const alert = expiryAlert(
          employee,
          'probation',
          employee.probationenddate,
          thresholdDays
        );
        if (alert) alerts.push(alert);
      }

      if (
        String(employee.employeetype || '').trim().toLowerCase() === 'contract' &&
        String(employee.contractenddate || '').slice(0, 10) === targetDate
      ) {
        const alert = expiryAlert(
          employee,
          'contract',
          employee.contractenddate,
          thresholdDays
        );
        if (alert) alerts.push(alert);
      }
    }
  }

  return alerts.sort(
    (left, right) =>
      left.thresholdDays - right.thresholdDays ||
      left.expiryDate.localeCompare(right.expiryDate) ||
      left.fullName.localeCompare(right.fullName)
  );
}

export async function listDueEmployeeExpiryAlerts(
  now = new Date()
): Promise<EmployeeExpiryAlert[]> {
  return buildEmployeeExpiryAlerts(await listEmployeeDbRows(), now);
}
