import { NextResponse } from 'next/server';
import { verifyEmployeeAccess } from '@/lib/auth';
import { fetchEmployees, SheetsError } from '@/lib/sheets/employees';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyEmployeeAccess(request);
    if (errorResponse) return errorResponse;

    const employees = await fetchEmployees();
    return NextResponse.json({ success: true, data: employees.map((e) => e.raw) });
  } catch (error: unknown) {
    if (error instanceof SheetsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const errMsg = error instanceof Error ? error.message : 'Failed to connect to the n8n server.';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
