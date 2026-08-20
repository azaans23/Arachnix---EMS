/** Must match the holidaycalendar_type_check constraint in Supabase. */
export const HOLIDAY_TYPES = ['Public Holiday', 'Company Holiday', 'Optional Holiday'] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number] | string;

export type HolidayInput = {
  holidayDate: string;
  holidayName: string;
  type: HolidayType;
  /** When updating an existing holiday. */
  id?: string;
};

export type Holiday = {
  id: string;
  holidayDate: string;
  holidayName: string;
  type: HolidayType;
};

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
