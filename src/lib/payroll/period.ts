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

export function formatMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || String(month);
}

/** Accepts `8`, `"8"` or `"August"` and returns the 1-based month number (0 when unknown). */
export function parseMonthValue(value: string | number | null | undefined): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return numeric;

  const index = MONTH_NAMES.findIndex((name) => name.toLowerCase() === raw.toLowerCase());
  return index >= 0 ? index + 1 : 0;
}

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
export function parseSalaryPeriod(period: string): { month: number; year: number } | null {
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

  // Stored salary profile uses base + allowance − tax. OT / bonus / others /
  // contributions are slip-only extras when callers pass them for a workflow run.
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

/** Formats amounts for n8n document payloads, e.g. `100000` → `100,000`. */
export function formatAmountWithCommas(value: string | number | null | undefined): string {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return String(value).trim();
  if (Number.isInteger(n)) {
    return n.toLocaleString('en-US');
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Totals for the persisted salary profile (no slip extras). */
export function computeStoredSalaryTotals(input: {
  salary?: string | number | null;
  allowance?: string | number | null;
  tax?: string | number | null;
}) {
  return computeSalaryTotals({
    salary: input.salary,
    allowance: input.allowance,
    tax: input.tax,
  });
}
