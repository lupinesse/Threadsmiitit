/**
 * Netlify Function: /api/auth/delete
 *
 * Meta's required data-deletion callback. Called by Meta when a user
 * requests deletion of their data from this app.
 *
 * This app stores no user data server-side — profile data lives only in the
 * user's own browser localStorage and is cleared on logout. This endpoint
 * acknowledges the request as required by Meta's platform policy.
 *
 * Meta sends a signed_request POST parameter; we return the confirmation
 * URL and a confirmation code as specified in the Threads API docs.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const origin = process.env.URL || 'https://threadsmiitit.netlify.app';

  // Meta expects a JSON response with a url (status page) and confirmation_code.
  const confirmationCode = `del_${Date.now()}`;
  const statusUrl = `${origin}/api/auth/delete/status?code=${confirmationCode}`;

  return new Response(JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default withSentry(handler);

export const config = { path: '/api/auth/delete' };
