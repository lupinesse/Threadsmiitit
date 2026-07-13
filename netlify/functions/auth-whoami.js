/**
 * Netlify Function: /api/auth/whoami
 *
 * Resolves the caller's session cookie into their Threads profile. The
 * client's AuthContext calls this on mount to hydrate auth state — the
 * cookie itself is httpOnly, so this is the only way the browser learns who
 * is signed in.
 *
 * @param {Request} req
 * @returns {Response}
 */
import { getUser, isAdmin } from './lib/session.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

function handler(req) {
  const user = getUser(req);
  if (!user) {
    return new Response('null', { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ...user, isAdmin: isAdmin(user.username) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default withSentry(handler);

export const config = { path: '/api/auth/whoami' };
