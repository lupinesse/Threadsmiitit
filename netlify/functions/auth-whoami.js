/**
 * Netlify Function: /api/auth/whoami
 *
 * Resolves the caller's session cookie into their Threads profile. The
 * client's AuthContext calls this on mount to hydrate auth state — the
 * cookie itself is httpOnly, so this is the only way the browser learns who
 * is signed in. `isAdmin` covers both moderator tiers (root or self-service)
 * and gates ordinary moderation UI; `isRootAdmin` covers only the hardcoded
 * `ADMINS` tier and gates the moderator-management UI — a self-service
 * moderator can moderate but must never see the "manage moderators" screen.
 *
 * @param {Request} req
 * @returns {Response}
 */
import { getUser, isAdmin, isModerator } from './lib/session.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/auth/whoami handler, with the moderators Blobs store
 * injectable for tests.
 * @param {import('./lib/moderatorsStore.mjs').BlobStoreLike} [moderatorsStore]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(moderatorsStore) {
  return async function handler(req) {
    const user = getUser(req);
    if (!user) {
      return new Response('null', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = {
      ...user,
      isAdmin: await isModerator(user.username, moderatorsStore),
      isRootAdmin: isAdmin(user.username),
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/auth/whoami' };
