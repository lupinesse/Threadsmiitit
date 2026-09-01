/**
 * @fileoverview Emails every configured admin about moderation-relevant
 * events — a new meetup submission pending review, or a change to the
 * self-service moderator roster — so neither depends on an admin
 * remembering to check the app. Reads its own env vars (`RESEND_API_KEY`,
 * `EMAIL_FROM`, `ADMIN_NOTIFY_EMAILS`) rather than taking them as
 * parameters, matching `botConfig.mjs`'s convention for a feature that's
 * fully inert until every required var is set.
 *
 * A send failure is logged, never thrown — this is a best-effort side
 * effect of an already-successful action, and must not turn a working
 * request into a 500 just because the notification failed.
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
 * Collapses embedded CR/LF into spaces. Callers may pass through
 * submitter-controlled free text (e.g. an event title) into a subject line,
 * so this keeps a value like `"Kahvit\nBcc: x@y"` from being interpreted as
 * more than one line by whatever eventually renders the subject.
 * @param {string} value
 * @returns {string}
 */
export function collapseNewlines(value) {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * Sends one notification email to every address in `ADMIN_NOTIFY_EMAILS`.
 * No-ops (and logs why) when `RESEND_API_KEY`, `EMAIL_FROM`, or
 * `ADMIN_NOTIFY_EMAILS` isn't set, so the feature stays off by default
 * without any code change — the same "unset env var = inert" convention as
 * the Threads broadcast bot. Shared by every `notifyAdminsOf*` export below.
 * @param {object} params
 * @param {string} params.logLabel - Short label for the console log lines (e.g. `'pending-submission'`).
 * @param {string} params.subject
 * @param {string} params.text
 * @param {string} [params.correlationId] - Included in the log line for tracing (e.g. an event id).
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Injectable for tests, forwarded to `sendEmail`.
 * @returns {Promise<void>}
 */
async function sendAdminNotification(
  { logLabel, subject, text, correlationId },
  { fetchImpl } = {}
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = parseRecipients(process.env.ADMIN_NOTIFY_EMAILS);

  if (!apiKey || !from || recipients.length === 0) {
    console.log(
      `[notifyAdmins] ${logLabel} skipped — RESEND_API_KEY/EMAIL_FROM/ADMIN_NOTIFY_EMAILS not fully configured`
    );
    return;
  }

  try {
    await sendEmail({ apiKey, from, to: recipients, subject, text, fetchImpl });
    console.log(`[notifyAdmins] sent ${logLabel} email`, {
      correlationId,
      recipientCount: recipients.length,
    });
  } catch (error) {
    console.error(`[notifyAdmins] failed to send ${logLabel} email`, { correlationId, error });
  }
}

/**
 * Notifies admins that a new event is pending review.
 * @param {import('./eventsStore.mjs').StoredEvent} event - The newly created pending event.
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Injectable for tests, forwarded to `sendEmail`.
 * @returns {Promise<void>}
 */
export async function notifyAdminsOfPendingEvent(event, options) {
  return sendAdminNotification(
    {
      logLabel: 'pending-submission',
      correlationId: event.id,
      subject: `Uusi miitti odottaa hyväksyntää: ${collapseNewlines(event.title)}`,
      text: [
        `${event.title} — ${event.city}, ${event.date}`,
        `Lisäsi: ${event.addedBy?.username ?? 'tuntematon'}`,
        '',
        `Tarkista: ${SITE_URL}`,
      ].join('\n'),
    },
    options
  );
}

/**
 * Notifies admins that the self-service moderator roster changed — the
 * in-app equivalent of the visibility the CODEOWNERS review used to
 * guarantee for changes to the hardcoded `ADMINS` list (issue #79).
 * @param {object} change
 * @param {'added'|'removed'} change.action
 * @param {string} change.username - The affected moderator's handle (no `@`).
 * @param {string} change.actorUsername - The root admin who made the change.
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Injectable for tests, forwarded to `sendEmail`.
 * @returns {Promise<void>}
 */
export async function notifyAdminsOfModeratorChange({ action, username, actorUsername }, options) {
  const verb = action === 'added' ? 'lisätty' : 'poistettu';
  return sendAdminNotification(
    {
      logLabel: 'moderator-change',
      correlationId: username,
      subject: `Moderaattori ${verb}: @${collapseNewlines(username)}`,
      text: `@${actorUsername} ${action === 'added' ? 'lisäsi' : 'poisti'} moderaattorin @${username}.`,
    },
    options
  );
}
