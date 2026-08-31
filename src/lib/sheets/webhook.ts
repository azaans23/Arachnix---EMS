/**
 * n8n answers with these when the workflow did run but its final node emitted
 * no items (e.g. a Sheets append/update node), so they must not be treated as
 * failures even though n8n replies with HTTP 404.
 */
export function isWebhookAckBody(text: string): boolean {
  const body = text.toLowerCase();
  return body.includes('no item to return was found') || body.includes('workflow was started');
}

export function formatWebhookError(status: number, errText: string, fallback: string): string {
  try {
    const jsonErr = JSON.parse(errText);
    if (jsonErr.message) {
      const hint = jsonErr.hint ? ` ${jsonErr.hint}` : '';
      const message = String(jsonErr.message) + hint;
      if (status === 404) {
        return `${message} Ensure the n8n workflow is Active and using the production /webhook/ URL (not webhook-test).`;
      }
      return message;
    }
  } catch {
    /* keep text */
  }

  if (status === 404) {
    return (
      errText ||
      'n8n webhook not found (404). Activate the workflow and use /webhook/ (not /webhook-test/).'
    );
  }

  return errText || fallback;
}

/** POST a dual-write payload to n8n, tolerating the "ran but returned nothing" replies. */
export async function postSheetWebhook(options: {
  url: string;
  label: string;
  payload: unknown;
}): Promise<void> {
  const secret = process.env.N8N_WEBHOOK_SECRET?.trim();
  const response = await fetch(options.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(secret ? { 'X-Arachnix-Webhook-Secret': secret } : {}),
    },
    body: JSON.stringify(options.payload),
    cache: 'no-store',
  });

  const text = await response.text();
  if (response.ok || isWebhookAckBody(text)) return;

  throw new Error(
    formatWebhookError(
      response.status,
      text,
      `n8n ${options.label} webhook returned status ${response.status}.`
    )
  );
}
