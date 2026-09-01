/**
 * @fileoverview Thin wrapper over the Resend email API — the only module
 * that knows its URL shape and field names. Every other module that needs
 * to send an email talks to this one, never to `fetch` directly, mirroring
 * `threadsClient.mjs`'s role for the Threads Graph API.
 *
 * `fetch` is injectable (`fetchImpl`) so unit tests never make a real
 * network call. Never logs `apiKey` — it's a live credential.
 *
 * Field names are as documented at https://resend.com/docs/api-reference/emails/send-email
 * (checked 2026-09; re-verify against Resend's docs if this call starts
 * failing, since this is a third-party API this repo doesn't control).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Reads an error response body as text without letting a non-JSON or empty
 * body throw a second, more confusing error.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeErrorText(response) {
  try {
    return await response.text();
  } catch {
    return '(could not read response body)';
  }
}

/**
 * Sends a single plain-text email via the Resend API.
 * @param {object} params
 * @param {string} params.apiKey - Live Resend API key. Never logged.
 * @param {string} params.from - Verified sender address.
 * @param {string|string[]} params.to - One or more recipient addresses.
 * @param {string} params.subject
 * @param {string} params.text - Plain-text body.
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @returns {Promise<{id: string}>} The id of the sent email.
 * @throws {Error} If the send request fails.
 */
export async function sendEmail({ apiKey, from, to, subject, text, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
  } catch (err) {
    throw new Error(`Resend send request failed: ${err.message}`, { cause: err });
  }
  if (!response.ok) {
    throw new Error(`Resend send failed (${response.status}): ${await safeErrorText(response)}`);
  }
  return response.json();
}
