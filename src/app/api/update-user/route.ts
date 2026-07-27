import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { errorResponse } = await verifyAdmin(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();

    try {
      const response = await fetch('https://n8n.arachnix.io/webhook/update-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errText = '';
        try {
          errText = await response.text();
        } catch {}

        let parsedError = errText;
        try {
          const jsonErr = JSON.parse(errText);
          if (jsonErr.message) {
            parsedError = jsonErr.message;
            if (jsonErr.hint) {
              parsedError += ` ${jsonErr.hint}`;
            }
          }
        } catch {}

        return NextResponse.json({
          success: false,
          error: parsedError || `n8n update-user webhook returned status ${response.status}.`,
        });
      }

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Failed to connect to the n8n server.',
      });
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
