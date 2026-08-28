import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { listDueEmployeeExpiryAlerts } from '@/lib/employees/expiry-alerts';

export const dynamic = 'force-dynamic';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/**
 * n8n calls this once daily from a Schedule Trigger. Keep the secret in a
 * request header; query-string secrets leak into logs and browser history.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'N8N_WEBHOOK_SECRET is not configured.' },
      { status: 503 }
    );
  }

  const actualSecret = request.headers.get('X-Arachnix-Webhook-Secret')?.trim() || '';
  if (!actualSecret || !secretsMatch(actualSecret, expectedSecret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const data = await listDueEmployeeExpiryAlerts();
    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      count: data.length,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load expiry alerts.';
    console.error('[GET /api/expiry-alerts]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
