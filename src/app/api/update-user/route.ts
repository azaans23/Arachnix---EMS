import { NextResponse } from 'next/server';
import { verifyEmployeeAccess } from '@/lib/auth';
import {
  SheetsError,
  upsertEmployee,
  validateEmployeeWrite,
} from '@/lib/sheets/employees';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyEmployeeAccess(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const validation = await validateEmployeeWrite(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    await upsertEmployee(validation.value);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof SheetsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
