import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { listHolidays, normalizeHolidayInput, saveHoliday } from '@/lib/db/holidays';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'holiday_calendar', 'read');
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const from = searchParams.get('from')?.trim() || undefined;
    const to = searchParams.get('to')?.trim() || undefined;
    const year = yearParam ? Number(yearParam) : undefined;

    if (yearParam && (!Number.isInteger(year) || !year)) {
      return NextResponse.json(
        { success: false, error: 'year must be an integer.' },
        { status: 400 }
      );
    }

    const holidays = await listHolidays({ year, from, to });
    return NextResponse.json({ success: true, data: holidays });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load holidays.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'holiday_calendar', 'write');
    if (errorResponse) return errorResponse;

    const body = (await request.json()) as Record<string, unknown>;
    const input = normalizeHolidayInput(body);
    const result = await saveHoliday(input);

    return NextResponse.json({
      success: true,
      data: result.holiday,
      created: result.created,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save holiday.';
    const status = /already exists|required|must be|rejected Type|longer than/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
