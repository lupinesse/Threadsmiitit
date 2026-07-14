/**
 * Netlify Function: /api/auth/uninstall
 *
 * Meta's required uninstall callback. Called by Meta when a user
 * deauthorizes this app from their Threads account.
 *
 * Deauthorizing the app doesn't imply a data-deletion request — that's a
 * separate callback (`auth-delete.js`), which does scrub the requesting
 * user's data. This endpoint just acknowledges the webhook, as required by
 * Meta's platform policy.
 *
 * @param {Request} req
 * @returns {Response}
 */
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  return new Response(null, { status: 200 });
}

export default withSentry(handler);

export const config = { path: '/api/auth/uninstall' };
