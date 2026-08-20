import {
  buildOfferLetterRunDetailId,
  createOfferLetterRun,
  offerLetterSubjectKey,
  updateOfferLetterRun,
  upsertOfferLetterRunDetail,
} from '@/lib/db/offer-letters';
import { formatAmountWithCommas, formatMonthName } from '@/lib/payroll/period';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import type {
  GenerateOfferLettersInput,
  OfferLetterInput,
  OfferLetterRun,
} from '@/types/offer-letter';

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return number;
}

function wholeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }
  return number;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(text)) return true;
  if (['false', '0', 'no', 'n'].includes(text)) return false;
  return fallback;
}

function displayDate(value: unknown, label: string) {
  const raw = requiredText(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(`${label} must be a valid date.`);

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`${label} must be a valid date.`);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function normalizeOffer(raw: OfferLetterInput): OfferLetterInput {
  const email = requiredText(raw.email, 'Email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Email must be valid.');
  }

  const hasPartTimeTenure = asBoolean(raw.hasPartTimeTenure, false);

  return {
    employeeId: String(raw.employeeId || '').trim() || undefined,
    fullName: requiredText(raw.fullName, 'Full name'),
    email,
    designation: requiredText(raw.designation, 'Designation'),
    joiningDate: requiredText(raw.joiningDate, 'Joining date'),
    hasPartTimeTenure,
    partTimeTenure: hasPartTimeTenure
      ? requiredText(raw.partTimeTenure, 'Part-time tenure')
      : '',
    fullTimeStart: hasPartTimeTenure
      ? requiredText(raw.fullTimeStart, 'Full-time start')
      : '',
    partTimeSalary: hasPartTimeTenure
      ? positiveNumber(raw.partTimeSalary, 'Part-time salary')
      : 0,
    fullTimeSalary: positiveNumber(raw.fullTimeSalary, 'Full-time salary'),
    numberOfLeaves: wholeNumber(raw.numberOfLeaves, 'Number of leaves'),
  };
}

export type PreparedOfferLetterRun = {
  run: OfferLetterRun;
  actorEmail: string;
  month: number;
  year: number;
  employeeKeys: string[];
  payload: Record<string, unknown>;
};

/** Dual-writes to Supabase + Sheets; never fails the offer letter run. */
async function logOfferLetterRunAudit(
  actorEmail: string,
  input: { action: string; runId: string; oldValue?: unknown; newValue: unknown }
): Promise<void> {
  await logAuditBestEffort(
    actorEmail,
    {
      action: input.action,
      recordType: AUDIT_RECORD_TYPES.OFFER_LETTER_RUN,
      recordId: input.runId,
      oldValue: input.oldValue,
      newValue: input.newValue,
    },
    'Offer letter run audit'
  );
}

/**
 * Creates an OfferLetterRun (Processing) with Pending detail rows and builds the
 * n8n payload. Does not wait for the workflow — call `dispatchOfferLetterWebhook`
 * from `after()` so the API can return immediately. n8n updates run/detail
 * status in Supabase when generation finishes.
 */
export async function startOfferLetterRun(
  actorEmail: string,
  input: GenerateOfferLettersInput
): Promise<{ prepared: PreparedOfferLetterRun; message: string }> {
  const month = Number(input.month);
  const year = Number(input.year);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12.');
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error('Year looks invalid.');
  }
  if (!Array.isArray(input.offers) || input.offers.length === 0) {
    throw new Error('At least one offer letter is required.');
  }

  const offers = input.offers.map(normalizeOffer);
  const employeeKeys = offers.map((offer) => offerLetterSubjectKey(offer.employeeId, offer.email));
  const keySet = new Set(employeeKeys.map((key) => key.toLowerCase()));
  if (keySet.size !== employeeKeys.length) {
    throw new Error('Each candidate needs a unique email (or employee ID).');
  }

  const run = await createOfferLetterRun({
    triggeredBy: actorEmail,
    month,
    year,
    employeeKeys,
  });

  await logOfferLetterRunAudit(actorEmail, {
    action: AUDIT_ACTIONS.GENERATE,
    runId: run.runId,
    newValue: {
      month,
      year,
      monthName: formatMonthName(month),
      status: 'Processing',
      offerLetterCount: offers.length,
      candidates: offers.map((offer) => offer.email),
      triggeredBy: actorEmail,
    },
  });

  const offerDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const payload = {
    runId: run.runId,
    month,
    year,
    monthName: formatMonthName(month),
    triggeredBy: actorEmail,
    offerLetterCount: offers.length,
    offers: offers.map((offer, index) => ({
      RunDetailID: buildOfferLetterRunDetailId(run.runId, employeeKeys[index]),
      EmployeeID: offer.employeeId || '',
      FullName: offer.fullName,
      Email: offer.email,
      Designation: offer.designation,
      OfferDate: offerDate,
      JoiningDate: displayDate(offer.joiningDate, 'Joining date'),
      HasPartTimeTenure: offer.hasPartTimeTenure,
      PartTimeTenure: offer.hasPartTimeTenure
        ? displayDate(offer.partTimeTenure, 'Part-time tenure')
        : '',
      FullTimeStart: offer.hasPartTimeTenure
        ? displayDate(offer.fullTimeStart, 'Full-time start')
        : '',
      PartTimeSalary: offer.hasPartTimeTenure
        ? formatAmountWithCommas(offer.partTimeSalary)
        : '',
      FullTimeSalary: formatAmountWithCommas(offer.fullTimeSalary),
      NumberOfLeaves: offer.numberOfLeaves,
    })),
  };

  return {
    prepared: {
      run,
      actorEmail,
      month,
      year,
      employeeKeys,
      payload,
    },
    message: 'Offer letter generation started. Status will update when the workflow finishes.',
  };
}

/**
 * Fires the n8n webhook. On trigger failure, marks the run Failed.
 * Success/Failed completion is owned by the workflow (Supabase updates).
 */
export async function dispatchOfferLetterWebhook(prepared: PreparedOfferLetterRun): Promise<void> {
  const { run, actorEmail, month, year, employeeKeys, payload } = prepared;

  try {
    const response = await fetch(SHEETS_WEBHOOKS.generateOfferLetter, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const webhookText = await response.text();
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'generate-offer-letter webhook not found (404). Activate the n8n workflow and check the webhook path.'
        );
      }
      throw new Error(
        webhookText || `generate-offer-letter webhook returned status ${response.status}.`
      );
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to call offer letter workflow.';
    await updateOfferLetterRun(run.runId, {
      status: 'Failed',
      successCount: 0,
      failCount: employeeKeys.length,
    });
    for (const employeeKey of employeeKeys) {
      await upsertOfferLetterRunDetail({
        runId: run.runId,
        employeeKey,
        status: 'Failed',
        pdfStatus: 'Failed',
        emailStatus: 'Failed',
        errorReason: message,
      });
    }
    await logOfferLetterRunAudit(actorEmail, {
      action: AUDIT_ACTIONS.UPDATE,
      runId: run.runId,
      oldValue: { status: 'Processing' },
      newValue: {
        month,
        year,
        status: 'Failed',
        successCount: 0,
        failCount: employeeKeys.length,
        error: message,
      },
    });
    throw new Error(message);
  }
}
