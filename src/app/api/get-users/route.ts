import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: No token provided' },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token' },
        { status: 401 }
      );
    }

    const role = user.app_metadata?.role || user.user_metadata?.role || '';
    if (role.toLowerCase().trim() !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin role required' },
        { status: 403 }
      );
    }

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
        error:
          parsedError ||
          `n8n webhook returned status ${response.status}. Make sure the webhook is active or 'Execute workflow' has been clicked.`,
      });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to connect to the n8n server.';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
