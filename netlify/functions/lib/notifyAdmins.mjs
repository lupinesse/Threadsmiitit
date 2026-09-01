/**
 * @fileoverview Emails every configured admin when a new meetup submission
 * needs review, so moderation doesn't depend on an admin remembering to
 * open `AdminInbox`. Reads its own env vars (`RESEND_API_KEY`, `EMAIL_FROM`,
 * `ADMIN_NOTIFY_EMAILS`) rather than taking them as parameters, matching
 * `botConfig.mjs`'s convention for a feature that's fully inert until every
 * required var is set.
 *
 * A send failure is logged, never thrown — this is a best-effort side
 * effect of a successful submission, and must not turn a working `/api/events`
 * POST into a 500 just because the notification failed.
 */

import { sendEmail } from './emailClient.mjs';

const SITE_URL = 'https://threadsmiitit.netlify.app/';

/**
 * Parses the comma-separated `ADMIN_NOTIFY_EMAILS` env var into a clean list
 * of addresses, dropping blank entries left by stray commas or trailing
 * whitespace.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseRecipients(raw) {
  return (raw ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
}

/**
 * Collapses embedded CR/LF into spaces. `event.title` is submitter-controlled
 * free text — `eventNormalize.mjs` caps its length but doesn't strip
 * newlines, and it flows straight into the email subject line, so this
 * keeps a title like `"Kahvit\nBcc: x@y"` from being interpreted as more
 * than one line by whatever eventually renders the subject.
 * @param {string} value
 * @returns {string}
 */
function collapseNewlines(value) {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * Notifies admins that a new event is pending review. No-ops (and logs why)
 * when `RESEND_API_KEY`, `EMAIL_FROM`, or `ADMIN_NOTIFY_EMAILS` isn't set,
 * so the feature stays off by default without any code change — the same
 * "unset env var = inert" convention as the Threads broadcast bot.
 * @param {import('./eventsStore.mjs').StoredEvent} event - The newly created pending event.
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Injectable for tests, forwarded to `sendEmail`.
 * @returns {Promise<void>}
 */
export async function notifyAdminsOfPendingEvent(event, { fetchImpl } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = parseRecipients(process.env.ADMIN_NOTIFY_EMAILS);

  if (!apiKey || !from || recipients.length === 0) {
    console.log(
      '[notifyAdmins] skipped — RESEND_API_KEY/EMAIL_FROM/ADMIN_NOTIFY_EMAILS not fully configured'
    );
    return;
  }

  try {
    await sendEmail({
      apiKey,
      from,
      to: recipients,
      subject: `Uusi miitti odottaa hyväksyntää: ${collapseNewlines(event.title)}`,
      text: [
        `${event.title} — ${event.city}, ${event.date}`,
        `Lisäsi: ${event.addedBy?.username ?? 'tuntematon'}`,
        '',
        `Tarkista: ${SITE_URL}`,
      ].join('\n'),
      fetchImpl,
    });
    console.log('[notifyAdmins] sent pending-submission email', {
      eventId: event.id,
      recipientCount: recipients.length,
    });
  } catch (error) {
    console.error('[notifyAdmins] failed to send pending-submission email', {
      eventId: event.id,
      error,
    });
  }
}
