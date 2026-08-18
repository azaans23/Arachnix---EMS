import { after, NextResponse } from 'next/server';
import { verifyResourceAccess } from '@/lib/auth';
import { reconcileOfferLetterRunAudits } from '@/lib/audit/run-completion';
import { getOfferLetterRun, listOfferLetterRunDetails } from '@/lib/db/offer-letters';
import { fetchEmployees } from '@/lib/sheets/employees';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { errorResponse } = await verifyResourceAccess(request, 'generated_documents', 'read');
    if (errorResponse) return errorResponse;

    const { runId } = await context.params;
    const run = await getOfferLetterRun(runId);
    if (!run) {
      return NextResponse.json({ success: false, error: 'Run not found.' }, { status: 404 });
    }

    const [details, employees] = await Promise.all([
      listOfferLetterRunDetails(runId),
      fetchEmployees().catch(() => []),
    ]);

    // Detail rows key on EmployeeID, or the candidate email when there is no employee record yet.
    const byKey = new Map<string, { fullName: string; email: string }>();
    for (const employee of employees) {
      const record = { fullName: employee.fullName, email: employee.email };
      if (employee.employeeId) byKey.set(employee.employeeId.trim().toLowerCase(), record);
      if (employee.email) byKey.set(employee.email.trim().toLowerCase(), record);
    }

    const enriched = details.map((detail) => {
      const match = byKey.get(detail.employeeId.trim().toLowerCase());
      const looksLikeEmail = detail.employeeId.includes('@');
      return {
        ...detail,
        candidateName: match?.fullName || '',
        candidateEmail: match?.email || (looksLikeEmail ? detail.employeeId : ''),
      };
    });

    after(async () => {
      try {
        await reconcileOfferLetterRunAudits([run]);
      } catch (error) {
        console.error('Offer letter run audit reconciliation failed:', error);
      }
    });

    return NextResponse.json({ success: true, data: { run, details: enriched } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load run details.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
