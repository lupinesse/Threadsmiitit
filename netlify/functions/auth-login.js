/**
 * Netlify Function: /api/auth/login
 *
 * Redirects the user to the Threads OAuth authorization page.
 * Generates a random CSRF state token and stores it in a short-lived
 * HttpOnly cookie so the callback can verify it.
 *
 * Required env vars: THREADS_CLIENT_ID, THREADS_REDIRECT_URI
 *
 * @param {Request} _req
 * @returns {Response}
 */
import { randomBytes } from 'node:crypto';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

function handler(_req) {
  const state = randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: process.env.THREADS_CLIENT_ID,
    redirect_uri: process.env.THREADS_REDIRECT_URI,
    scope: 'threads_basic',
    response_type: 'code',
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://threads.net/oauth/authorize?${params}`,
      'Set-Cookie': `threads_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}

export default withSentry(handler);

export const config = { path: '/api/auth/login' };
