import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const response = await fetch('https://n8n.arachnix.io/webhook/get-users', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store', // Disable caching so we always get fresh webhook responses
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
        error:
          parsedError ||
          `n8n webhook returned status ${response.status}. Make sure the webhook is active or 'Execute workflow' has been clicked.`,
      });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to connect to the n8n server.' },
      { status: 500 }
    );
  }
}
