import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Transactional email through Brevo's REST API (v3 /smtp/email).
 *
 * Stays inert until BREVO_API_KEY and BREVO_SENDER_EMAIL are configured: the
 * caller still gets a result, and the message is logged server-side instead,
 * so the flows that depend on it (password-reset codes) remain testable
 * before the account exists. Nothing is ever faked as "sent".
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export function isEmailConfigured(): boolean {
  return !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

export async function sendEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    logger.warn(`[Email] Brevo not configured — not sending "${opts.subject}" to ${opts.to}.`);
    return { sent: false };
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY as string,
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME ?? 'Yatrenzo' },
        to: [{ email: opts.to, ...(opts.toName ? { name: opts.toName } : {}) }],
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('[Email] Brevo rejected the message', { status: res.status, body: body.slice(0, 300) });
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    logger.error('[Email] Brevo request failed:', err);
    return { sent: false };
  }
}
