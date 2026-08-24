/**
 * FBR salaried withholding tax (FY 2026–27), matching
 * https://www.mytaxcalculator.pk/
 *
 * Annual tax is taken from the slab table, then divided by 12 for the
 * monthly deduction stored on the salary profile.
 */

export const WITHHOLDING_TAX_FY_LABEL = 'FY 2026–27';

type TaxSlab = {
  /** Inclusive upper bound of this slab. Use Infinity for the top band. */
  upTo: number;
  fixed: number;
  rate: number;
  excessOver: number;
};

const SALARIED_SLABS: readonly TaxSlab[] = [
  { upTo: 600_000, fixed: 0, rate: 0, excessOver: 0 },
  { upTo: 1_200_000, fixed: 0, rate: 0.01, excessOver: 600_000 },
  { upTo: 2_200_000, fixed: 6_000, rate: 0.11, excessOver: 1_200_000 },
  { upTo: 3_200_000, fixed: 116_000, rate: 0.2, excessOver: 2_200_000 },
  { upTo: 4_100_000, fixed: 316_000, rate: 0.25, excessOver: 3_200_000 },
  { upTo: 5_600_000, fixed: 541_000, rate: 0.29, excessOver: 4_100_000 },
  { upTo: 7_000_000, fixed: 976_000, rate: 0.32, excessOver: 5_600_000 },
  { upTo: Infinity, fixed: 1_424_000, rate: 0.35, excessOver: 7_000_000 },
];

export function parseMoneyAmount(value: string | number | null | undefined): number {
  if (value === undefined || value === null || String(value).trim() === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Annual income tax on taxable salary (PKR). */
export function annualWithholdingTax(annualIncome: number): number {
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) return 0;

  for (const slab of SALARIED_SLABS) {
    if (annualIncome <= slab.upTo) {
      return slab.fixed + slab.rate * Math.max(0, annualIncome - slab.excessOver);
    }
  }

  return 0;
}

/** Monthly withholding tax on monthly base salary. */
export function monthlyWithholdingTax(monthlySalary: number): number {
  const salary = Number.isFinite(monthlySalary) && monthlySalary > 0 ? monthlySalary : 0;
  return Math.round(annualWithholdingTax(salary * 12) / 12);
}

export function withholdingTaxFromSalaryFields(
  salary: string | number | null | undefined
): string {
  return String(monthlyWithholdingTax(parseMoneyAmount(salary)));
}
