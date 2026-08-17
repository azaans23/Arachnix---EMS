/** Mirrors the CHECK constraint on OfferLetterRun.Status. */
export const OFFER_LETTER_RUN_STATUSES = {
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
} as const;

/** Mirrors the CHECK constraints on OfferLetterRunDetail. */
export const OFFER_LETTER_DETAIL_STATUSES = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
} as const;

export type OfferLetterRunStatus =
  (typeof OFFER_LETTER_RUN_STATUSES)[keyof typeof OFFER_LETTER_RUN_STATUSES] | string;

export interface OfferLetterRun {
  runId: string;
  triggeredBy: string;
  runDate: string;
  month: number;
  year: number;
  status: OfferLetterRunStatus;
  successCount: number;
  failCount: number;
  offerLetterCount: number;
}

export interface OfferLetterRunDetail {
  runDetailId: string;
  runId: string;
  employeeId: string;
  status: string;
  pdfLink: string;
  pdfStatus: string;
  emailStatus: string;
  errorReason: string;
  candidateName?: string;
  candidateEmail?: string;
}

export interface OfferLetterInput {
  employeeId?: string;
  fullName: string;
  email: string;
  designation: string;
  joiningDate: string;
  /** When false, part-time tenure/salary and full-time start are omitted. */
  hasPartTimeTenure: boolean;
  partTimeTenure: string;
  /** Required when hasPartTimeTenure is true. */
  fullTimeStart: string;
  partTimeSalary: number;
  fullTimeSalary: number;
  numberOfLeaves: number;
}

export interface GenerateOfferLettersInput {
  month: number;
  year: number;
  offers: OfferLetterInput[];
}
