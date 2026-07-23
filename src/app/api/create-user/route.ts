import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    try {
      const response = await fetch('https://n8n.arachnix.io/webhook-test/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return NextResponse.json({ 
          success: false, 
          error: `n8n webhook returned status ${response.status}.` 
        });
      }

      return NextResponse.json({ success: true });
    } catch (fetchError: any) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to connect to n8n server.' 
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
