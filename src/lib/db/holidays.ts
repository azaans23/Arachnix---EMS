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
  id: number;
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
  const idRaw = raw.id ?? raw.ID ?? raw.Id;
  const id =
    idRaw === undefined || idRaw === null || String(idRaw).trim() === ''
      ? undefined
      : String(idRaw).trim();

  return {
    id,
    holidayDate,
    holidayName,
    type,
  };
}

export function mapHolidayRow(row: HolidayDbRow): Holiday {
  return {
    id: String(row.id),
    holidayDate: String(row.holidaydate).slice(0, 10),
    holidayName: row.holidayname || '',
    type: row.type || '',
  };
}

/** Sheet / webhook column names for Holiday Calendar. */
export function toWebhookHolidayRow(holiday: Holiday) {
  return {
    ID: holiday.id,
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
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .order('holidaydate', { ascending: true })
    .order('id', { ascending: true });

  if (filters?.year) {
    const year = filters.year;
    query = query.gte('holidaydate', `${year}-01-01`).lte('holidaydate', `${year}-12-31`);
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

export async function getHolidayById(id: string): Promise<Holiday | null> {
  const numericId = Number(String(id).trim());
  if (!Number.isFinite(numericId)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('id', numericId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase holiday calendar read failed: ${error.message}`);
  }
  return data ? mapHolidayRow(data as HolidayDbRow) : null;
}

export async function listHolidaysOnDate(holidayDate: string): Promise<Holiday[]> {
  const date = requireIsoDate(holidayDate, 'HolidayDate');
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('holidaydate', date)
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Supabase holiday calendar read failed: ${error.message}`);
  }
  return ((data as HolidayDbRow[]) || []).map(mapHolidayRow);
}

type PostgrestErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function holidayWriteError(error: PostgrestErrorLike, input: HolidayInput, action: string): Error {
  console.error(`Supabase holidaycalendar ${action} failed:`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

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

async function updateHolidayRow(id: string, input: HolidayInput): Promise<Holiday> {
  const numericId = Number(String(id).trim());
  if (!Number.isFinite(numericId)) {
    throw new Error('Holiday ID is required to update.');
  }

  const payload = {
    holidaydate: input.holidayDate,
    holidayname: input.holidayName,
    type: input.type,
  };

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('id', numericId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw holidayWriteError(error, input, 'update');
  }
  if (!data) {
    throw new Error(`Holiday ${id} was not found.`);
  }

  return mapHolidayRow(data as HolidayDbRow);
}

async function deleteHolidayRow(id: string): Promise<void> {
  const numericId = Number(String(id).trim());
  if (!Number.isFinite(numericId)) {
    throw new Error('Holiday ID is required to delete.');
  }

  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq('id', numericId);
  if (error) {
    throw new Error(`Supabase holiday calendar delete failed: ${error.message}`);
  }
}

async function postHolidayWebhook(
  holiday: Holiday,
  label: string,
  action: 'UPSERT' | 'DELETE' = 'UPSERT'
) {
  const url = SHEETS_WEBHOOKS.createHoliday;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      ...toWebhookHolidayRow(holiday),
      Action: action,
    }),
    cache: 'no-store',
  });
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `${label} webhook not registered (404) at ${url}. Activate the n8n workflow.`
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
  const isCreate = !input.id;
  const previous = input.id ? await getHolidayById(input.id) : null;

  if (!isCreate && !previous) {
    throw new Error(`Holiday ${input.id} was not found.`);
  }

  const saved = isCreate
    ? await insertHolidayRow(input)
    : await updateHolidayRow(input.id!, input);

  try {
    await postHolidayWebhook(saved, 'create-holiday', 'UPSERT');

    const nextValue = {
      id: saved.id,
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
          recordId: saved.id,
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
          recordId: saved.id,
          ...diffAuditValues(
            {
              id: previous?.id || input.id,
              holidayDate: previous?.holidayDate || '',
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
      message: isCreate ? 'Holiday created.' : 'Holiday updated.',
    };
  } catch (sheetError) {
    try {
      if (isCreate) {
        await deleteHolidayRow(saved.id);
      } else if (previous) {
        await updateHolidayRow(previous.id, previous);
      }
    } catch (rollbackError) {
      console.error('Failed to roll back holiday after webhook failure:', rollbackError);
    }
    throw sheetError;
  }
}

/**
 * Delete a holiday in Supabase, then sync the delete to the sheet via n8n.
 * Restores the row if the webhook fails.
 */
export async function deleteHoliday(
  id: string,
  options?: { actorEmail?: string }
): Promise<{ holiday: Holiday; message: string }> {
  const existing = await getHolidayById(id);
  if (!existing) {
    throw new Error(`Holiday ${id} was not found.`);
  }

  await deleteHolidayRow(existing.id);

  try {
    await postHolidayWebhook(existing, 'delete-holiday', 'DELETE');

    await logAuditBestEffort(
      options?.actorEmail,
      {
        action: AUDIT_ACTIONS.DELETE,
        recordType: AUDIT_RECORD_TYPES.HOLIDAY,
        recordId: existing.id,
        oldValue: {
          id: existing.id,
          holidayDate: existing.holidayDate,
          holidayName: existing.holidayName,
          type: existing.type,
        },
      },
      'Holiday audit'
    );

    return {
      holiday: existing,
      message: 'Holiday deleted.',
    };
  } catch (sheetError) {
    try {
      // Restore with the same id when possible.
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .insert({
          id: Number(existing.id),
          holidaydate: existing.holidayDate,
          holidayname: existing.holidayName,
          type: existing.type,
        });
      if (error) {
        // Fallback without forcing id.
        await insertHolidayRow(existing);
      }
    } catch (rollbackError) {
      console.error('Failed to roll back holiday delete after webhook failure:', rollbackError);
    }
    throw sheetError;
  }
}

export function holidayTypeOptions() {
  return HOLIDAY_TYPES.map((type) => ({ label: type, value: type }));
}
