const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Canonical period key used with UNIQUE (EmployeeID, Period), e.g. `August-2026`. */
export function formatSalaryPeriod(month: number, year: number): string {
  const name = MONTH_NAMES[month - 1];
  if (!name || !Number.isInteger(year)) {
    throw new Error(`Invalid salary period month/year: ${month}/${year}`);
  }
  return `${name}-${year}`;
}

export function currentSalaryPeriod(date = new Date()): string {
  return formatSalaryPeriod(date.getMonth() + 1, date.getFullYear());
}

/** Parse `August-2026` or legacy `2026-08` into month/year. */
export function parseSalaryPeriod(
  period: string
): { month: number; year: number } | null {
  const value = period.trim();
  if (!value) return null;

  const monthYear = value.match(/^([A-Za-z]+)-(\d{4})$/);
  if (monthYear) {
    const monthIndex = MONTH_NAMES.findIndex(
      (name) => name.toLowerCase() === monthYear[1].toLowerCase()
    );
    const year = Number(monthYear[2]);
    if (monthIndex >= 0 && Number.isInteger(year)) {
      return { month: monthIndex + 1, year };
    }
  }

  const iso = value.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (Number.isInteger(year) && month >= 1 && month <= 12) {
      return { month, year };
    }
  }

  return null;
}

/** HTML `type="month"` value (`YYYY-MM`) ↔ salary period (`Month-Year`). */
export function periodToMonthInput(period: string): string {
  const parsed = parseSalaryPeriod(period);
  if (!parsed) return '';
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
}

export function monthInputToPeriod(value: string): string {
  const parsed = parseSalaryPeriod(value.trim());
  if (!parsed) return value.trim();
  return formatSalaryPeriod(parsed.month, parsed.year);
}

/** Matches Salaries.UniqueKey: `EmployeeID-Period` (e.g. `EMP-001-August-2026`). */
export function buildSalaryUniqueKey(employeeId: string, period: string): string {
  const id = employeeId.trim();
  const periodKey = monthInputToPeriod(period.trim());
  if (!id || !periodKey) return '';
  return `${id}-${periodKey}`;
}

export function computeSalaryTotals(input: {
  salary?: string | number | null;
  allowance?: string | number | null;
  overtimePay?: string | number | null;
  performanceBonus?: string | number | null;
  others?: string | number | null;
  tax?: string | number | null;
  contributions?: string | number | null;
}) {
  const toMoney = (value: string | number | null | undefined) => {
    if (value === undefined || value === null || String(value).trim() === '') return 0;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const basesalary = toMoney(input.salary);
  const allowance = toMoney(input.allowance);
  const overtimepay = toMoney(input.overtimePay);
  const performancebonus = toMoney(input.performanceBonus);
  const others = toMoney(input.others);
  const tax = toMoney(input.tax);
  const contributions = toMoney(input.contributions);

  const totalearning = basesalary + allowance + overtimepay + performancebonus + others;
  const totaldeduction = tax + contributions;
  const netsalary = Math.max(0, totalearning - totaldeduction);

  return {
    basesalary,
    allowance,
    overtimepay,
    performancebonus,
    others,
    tax,
    contributions,
    totalearning,
    totaldeduction,
    netsalary,
  };
}
