/**
 * Netlify Function: /api/auth/logout
 *
 * Clears the session cookie. Does not revoke the underlying Threads token.
 *
 * @param {Request} req
 * @returns {Response}
 */
import { clearSessionCookie } from './lib/session.mjs';

export default function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}

export const config = { path: '/api/auth/logout' };
