import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SHEETS_WEBHOOKS } from '@/lib/sheets/config';
import { diffAuditValues, logAuditBestEffort } from '@/lib/sheets/audit';
import { AUDIT_ACTIONS, AUDIT_RECORD_TYPES } from '@/types/audit';
import {
  HOLIDAY_TYPES,
  isIsoDate,
  type Holiday,
  type HolidayInput,
  type HolidayType,
} from '@/types/holiday';

type HolidayDbRow = {
  holidaydate: string;
  holidayname: string;
  type: string;
};

const TABLE = 'holidaycalendar';

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function requireIsoDate(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (!isIsoDate(text)) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return text;
}

export function normalizeHolidayInput(raw: Record<string, unknown>): HolidayInput {
  const holidayDate = requireIsoDate(
    raw.holidayDate ?? raw.HolidayDate ?? raw.date,
    'HolidayDate'
  );
  const holidayName = requiredText(
    raw.holidayName ?? raw.HolidayName ?? raw.name,
    'HolidayName'
  );
  const type = requiredText(raw.type ?? raw.Type, 'Type') as HolidayType;
  const originalRaw = raw.originalHolidayDate ?? raw.OriginalHolidayDate;
  const originalHolidayDate =
    originalRaw === undefined || String(originalRaw).trim() === ''
      ? undefined
      : requireIsoDate(originalRaw, 'OriginalHolidayDate');

  return {
    holidayDate,
    holidayName,
    type,
    originalHolidayDate,
  };
}

export function mapHolidayRow(row: HolidayDbRow): Holiday {
  return {
    holidayDate: String(row.holidaydate).slice(0, 10),
    holidayName: row.holidayname || '',
    type: row.type || '',
  };
}

/** Sheet / webhook column names for Holiday Calendar. */
export function toWebhookHolidayRow(holiday: Holiday) {
  return {
    HolidayDate: holiday.holidayDate,
    HolidayName: holiday.holidayName,
    Type: holiday.type,
  };
}

export async function listHolidays(filters?: {
  year?: number;
  from?: string;
  to?: string;
}): Promise<Holiday[]> {
  let query = getSupabaseAdmin().from(TABLE).select('*').order('holidaydate', { ascending: true });

  if (filters?.year) {
    const year = filters.year;
    query = query
      .gte('holidaydate', `${year}-01-01`)
      .lte('holidaydate', `${year}-12-31`);
  }
  if (filters?.from) {
    query = query.gte('holidaydate', filters.from);
  }
  if (filters?.to) {
    query = query.lte('holidaydate', filters.to);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Supabase holiday calendar read failed: ${error.message}`);
  }

  return ((data as HolidayDbRow[]) || []).map(mapHolidayRow);
}

export async function getHoliday(holidayDate: string): Promise<Holiday | null> {
  const date = requireIsoDate(holidayDate, 'HolidayDate');
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('holidaydate', date)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase holiday calendar read failed: ${error.message}`);
  }
  return data ? mapHolidayRow(data as HolidayDbRow) : null;
}

type PostgrestErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * Postgres rejects the row for reasons the UI can act on (bad Type value,
 * duplicate date). Surface the constraint text instead of a bare 500.
 */
function holidayWriteError(error: PostgrestErrorLike, input: HolidayInput, action: string): Error {
  console.error(`Supabase holidaycalendar ${action} failed:`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  if (error.code === '23505') {
    return new Error(`A holiday already exists on ${input.holidayDate}.`);
  }

  if (error.code === '23514') {
    return new Error(
      `The database rejected Type "${input.type}". Allowed values are limited by a check constraint (${error.message}).`
    );
  }

  if (error.code === '22001') {
    return new Error('Holiday name or type is longer than the database column allows.');
  }

  const detail = [error.message, error.details, error.hint].filter(Boolean).join(' — ');
  return new Error(`Supabase holiday calendar ${action} failed: ${detail || 'unknown error'}`);
}

async function insertHolidayRow(input: HolidayInput): Promise<Holiday> {
  const payload = {
    holidaydate: input.holidayDate,
    holidayname: input.holidayName,
    type: input.type,
  };

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw holidayWriteError(error, input, 'insert');
  }

  return mapHolidayRow(data as HolidayDbRow);
}

async function updateHolidayRow(date: string, input: HolidayInput): Promise<Holiday> {
  const payload = {
    holidayname: input.holidayName,
    type: input.type,
  };

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('holidaydate', date)
    .select('*')
    .maybeSingle();

  if (error) {
    throw holidayWriteError(error, input, 'update');
  }
  if (!data) {
    throw new Error(`Holiday on ${date} was not found.`);
  }

  return mapHolidayRow(data as HolidayDbRow);
}

async function deleteHolidayRow(date: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('holidaydate', date);
  if (error) {
    throw new Error(`Supabase holiday calendar delete failed: ${error.message}`);
  }
}

async function postHolidayWebhook(holiday: Holiday, label: string) {
  const response = await fetch(SHEETS_WEBHOOKS.createHoliday, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(toWebhookHolidayRow(holiday)),
    cache: 'no-store',
  });
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `${label} webhook not registered (404) at ${SHEETS_WEBHOOKS.createHoliday}. ` +
          'Activate the n8n workflow to serve /webhook/, or set N8N_CREATE_HOLIDAY_WEBHOOK_URL ' +
          'to the /webhook-test/ URL while testing.'
      );
    }
    throw new Error(text || `${label} webhook returned status ${response.status}.`);
  }

  let message = '';
  try {
    const parsed = text.trim() ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      message = String(
        (parsed as Record<string, unknown>).message ||
          (parsed as Record<string, unknown>).status ||
          ''
      );
    }
  } catch {
    if (text.trim()) message = text.trim();
  }
  return message;
}

/**
 * Create or update a holiday in Supabase, then sync to the sheet via n8n.
 * Rolls back the DB write if the webhook fails.
 */
export async function saveHoliday(
  input: HolidayInput,
  options?: { actorEmail?: string }
): Promise<{
  holiday: Holiday;
  message: string;
  created: boolean;
}> {
  const originalDate = input.originalHolidayDate || input.holidayDate;
  const existingOnTarget = await getHoliday(input.holidayDate);
  const existingOnOriginal =
    originalDate !== input.holidayDate ? await getHoliday(originalDate) : existingOnTarget;

  const isCreate = !existingOnOriginal;
  const dateMoved = Boolean(existingOnOriginal) && originalDate !== input.holidayDate;

  if (dateMoved && existingOnTarget) {
    throw new Error(`A holiday already exists on ${input.holidayDate}.`);
  }

  const previous: Holiday | null = existingOnOriginal;
  let saved: Holiday;
  let deletedOld = false;

  if (isCreate) {
    saved = await insertHolidayRow(input);
  } else if (dateMoved) {
    await deleteHolidayRow(originalDate);
    deletedOld = true;
    saved = await insertHolidayRow(input);
  } else {
    saved = await updateHolidayRow(input.holidayDate, input);
  }

  try {
    const webhookMessage = await postHolidayWebhook(saved, 'create-holiday');

    const nextValue = {
      holidayDate: saved.holidayDate,
      holidayName: saved.holidayName,
      type: saved.type,
    };
    if (isCreate) {
      await logAuditBestEffort(
        options?.actorEmail,
        {
          action: AUDIT_ACTIONS.CREATE,
          recordType: AUDIT_RECORD_TYPES.HOLIDAY,
          recordId: saved.holidayDate,
          newValue: nextValue,
        },
        'Holiday audit'
      );
    } else {
      await logAuditBestEffort(
        options?.actorEmail,
        {
          action: AUDIT_ACTIONS.UPDATE,
          recordType: AUDIT_RECORD_TYPES.HOLIDAY,
          recordId: saved.holidayDate,
          ...diffAuditValues(
            {
              holidayDate: previous?.holidayDate || originalDate,
              holidayName: previous?.holidayName || '',
              type: previous?.type || '',
            },
            nextValue
          ),
        },
        'Holiday audit'
      );
    }

    return {
      holiday: saved,
      created: isCreate,
      message:
        webhookMessage ||
        (isCreate
          ? 'Holiday created.'
          : dateMoved
            ? 'Holiday moved and updated.'
            : 'Holiday updated.'),
    };
  } catch (sheetError) {
    try {
      if (isCreate) {
        await deleteHolidayRow(saved.holidayDate);
      } else if (dateMoved && previous) {
        await deleteHolidayRow(saved.holidayDate);
        await insertHolidayRow(previous);
      } else if (previous) {
        await updateHolidayRow(previous.holidayDate, previous);
      } else if (deletedOld) {
        // Best-effort; previous was required for dateMoved path.
      }
    } catch (rollbackError) {
      console.error('Failed to roll back holiday after webhook failure:', rollbackError);
    }
    throw sheetError;
  }
}

export function holidayTypeOptions() {
  return HOLIDAY_TYPES.map((type) => ({ label: type, value: type }));
}
