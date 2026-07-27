import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    try {
      const response = await fetch('https://n8n.arachnix.io/webhook-test/update-user', {
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
        } catch (e) {}

        let parsedError = errText;
        try {
          const jsonErr = JSON.parse(errText);
          if (jsonErr.message) {
            parsedError = jsonErr.message;
            if (jsonErr.hint) {
              parsedError += ` ${jsonErr.hint}`;
            }
          }
        } catch (e) {}

        return NextResponse.json({
          success: false,
          error: parsedError || `n8n update-user webhook returned status ${response.status}.`,
        });
      }

      return NextResponse.json({ success: true });
    } catch (fetchError: any) {
      return NextResponse.json({
        success: false,
        error: 'Failed to connect to the n8n server.',
      });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' });
  }
}
