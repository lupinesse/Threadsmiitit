/**
 * Netlify Function: /api/auth/logout
 *
 * Clears the session cookie. Does not revoke the underlying Threads token.
 *
 * @param {Request} req
 * @returns {Response}
 */
import { clearSessionCookie } from './lib/session.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}

export default withSentry(handler);

export const config = { path: '/api/auth/logout' };
