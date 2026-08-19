import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { getEmployeeById, SheetsError } from '@/lib/sheets/employees';
import { toSheetUser } from '@/types/employee';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'employees', 'read');
    if (errorResponse) return errorResponse;

    const { id } = await context.params;
    const employee = await getEmployeeById(id);

    if (!employee) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toSheetUser(employee), employee });
  } catch (error: unknown) {
    if (error instanceof SheetsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const errMsg = error instanceof Error ? error.message : 'Failed to load employee.';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
