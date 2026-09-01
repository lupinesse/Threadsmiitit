/**
 * Netlify Function: /api/moderators
 *
 * GET: the current self-service moderator roster. Requires a moderator
 * session (requireModerator) — any moderator, root or self-service, can see
 * who else has access.
 * POST: grants self-service moderator status. Body: { username }. Requires
 * a root admin session (requireAdmin) — only the hardcoded ADMINS tier can
 * delegate, so a self-service moderator can never grant rights to anyone
 * else. Refuses a username already in ADMINS (redundant, confusing in the
 * roster).
 * DELETE (?username=): revokes self-service moderator status. Requires a
 * root admin session. Never affects ADMINS — that tier isn't stored here,
 * so it's simply not-found.
 *
 * Every successful POST/DELETE emails the configured admin addresses (see
 * notifyAdmins.mjs) so a moderator-list change stays as visible as the
 * CODEOWNERS review it replaces for this self-service tier (issue #79).
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireAdmin, requireModerator, isAdmin } from './lib/session.mjs';
import {
  listModerators,
  addModerator,
  removeModerator,
  normalize,
} from './lib/moderatorsStore.mjs';
import { notifyAdminsOfModeratorChange } from './lib/notifyAdmins.mjs';
import { json, readJsonBody } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/moderators handler, with the Blobs store and the notify
 * hook independently injectable for tests.
 * @param {import('./lib/moderatorsStore.mjs').BlobStoreLike} [store]
 * @param {object} [options]
 * @param {(change: {action: 'added'|'removed', username: string, actorUsername: string}) => Promise<void>} [options.notify] -
 *   Defaults to `notifyAdminsOfModeratorChange`.
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store, { notify = notifyAdminsOfModeratorChange } = {}) {
  return async function handler(req) {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const guard = await requireModerator(req, store);
      if (!guard.ok) return guard.response;

      const moderators = await listModerators(store);
      return json({ moderators });
    }

    if (req.method === 'POST') {
      const guard = requireAdmin(req);
      if (!guard.ok) return guard.response;

      const body = await readJsonBody(req);
      if (!body?.username) return json({ error: 'username is required' }, 400);
      // Normalised once, here, and reused for the store write and the
      // notification below — an unnormalised "@Bob" must never leak into
      // the notification email while the roster itself stores "bob".
      const username = normalize(body.username);
      if (isAdmin(username)) {
        return json({ error: `@${username} is already a root admin` }, 400);
      }

      const result = await addModerator(username, guard.user.username, store);
      if (!result.ok) return json({ error: result.error }, 400);

      await notifyModeratorChange(notify, 'added', username, guard.user.username);
      return json({ moderators: result.moderators }, 201);
    }

    if (req.method === 'DELETE') {
      const guard = requireAdmin(req);
      if (!guard.ok) return guard.response;

      const rawUsername = url.searchParams.get('username');
      if (!rawUsername) return json({ error: 'username is required' }, 400);
      const username = normalize(rawUsername);

      const result = await removeModerator(username, store);
      if (!result.ok) return json({ error: result.error }, 404);

      await notifyModeratorChange(notify, 'removed', username, guard.user.username);
      return json({ moderators: result.moderators });
    }

    return new Response(null, { status: 405 });
  };
}

/**
 * Fires the moderator-change notification without letting a failure turn an
 * already-successful grant/revoke into a failed response — same pattern as
 * `events.js`'s notify hook around `notifyAdminsOfPendingEvent`.
 * @param {(change: object) => Promise<void>} notify
 * @param {'added'|'removed'} action
 * @param {string} username
 * @param {string} actorUsername
 * @returns {Promise<void>}
 */
async function notifyModeratorChange(notify, action, username, actorUsername) {
  try {
    await notify({ action, username, actorUsername });
  } catch (error) {
    console.error('[moderators] notify hook failed for a moderator change', {
      action,
      username,
      error,
    });
  }
}

export default withSentry(createHandler());

export const config = { path: '/api/moderators' };
