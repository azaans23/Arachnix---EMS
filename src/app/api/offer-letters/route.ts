import { NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { listOfferLetterRuns } from '@/lib/db/offer-letters';
import { startOfferLetterRun } from '@/lib/documents/generate-offer-letter';
import type { OfferLetterInput } from '@/types/offer-letter';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'generated_documents', 'read');
    if (errorResponse) return errorResponse;

    const runs = await listOfferLetterRuns();
    return NextResponse.json({ success: true, data: runs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load offer letter runs.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await verifyResourceAccess(
      request,
      'generated_documents',
      'write'
    );
    if (errorResponse) return errorResponse;

    const body = (await request.json()) as Record<string, unknown>;
    const month = Number(body.month);
    const year = Number(body.year);

    const offersRaw = Array.isArray(body.offers)
      ? body.offers
      : [
          {
            employeeId: body.EmployeeID ?? body.employeeId,
            fullName: body.FullName ?? body.fullName,
            email: body.Email ?? body.email,
            designation: body.Designation ?? body.designation,
            joiningDate: body.JoiningDate ?? body.joiningDate,
            partTimeTenure: body.PartTimeTenure ?? body.partTimeTenure,
            fullTimeTenure: body.FullTimeTenure ?? body.fullTimeTenure,
            partTimeSalary: body.PartTimeSalary ?? body.partTimeSalary,
            fullTimeSalary: body.FullTimeSalary ?? body.fullTimeSalary,
            numberOfLeaves: body.NumberOfLeaves ?? body.numberOfLeaves,
          },
        ];

    const offers: OfferLetterInput[] = offersRaw.map((row) => {
      const item = (row || {}) as Record<string, unknown>;
      return {
        employeeId: String(item.employeeId ?? item.EmployeeID ?? '').trim() || undefined,
        fullName: String(item.fullName ?? item.FullName ?? '').trim(),
        email: String(item.email ?? item.Email ?? '').trim(),
        designation: String(item.designation ?? item.Designation ?? '').trim(),
        joiningDate: String(item.joiningDate ?? item.JoiningDate ?? '').trim(),
        partTimeTenure: String(item.partTimeTenure ?? item.PartTimeTenure ?? '').trim(),
        fullTimeTenure: String(item.fullTimeTenure ?? item.FullTimeTenure ?? '').trim(),
        partTimeSalary: Number(item.partTimeSalary ?? item.PartTimeSalary),
        fullTimeSalary: Number(item.fullTimeSalary ?? item.FullTimeSalary),
        numberOfLeaves: Number(item.numberOfLeaves ?? item.NumberOfLeaves),
      };
    });

    const result = await startOfferLetterRun(user?.email || '', {
      month,
      year,
      offers,
    });

    return NextResponse.json({
      success: true,
      data: result.run,
      message: result.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate offer letter.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
