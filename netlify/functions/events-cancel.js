/**
 * Netlify Function: /api/events/cancel
 *
 * POST (?id=): cancels an approved event. Requires an authenticated caller
 * who is either the event's owner or an admin (unlike events-moderate.js,
 * which is admin-only) — a submitter cancelling their own meetup doesn't
 * need moderator status.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireUser, isAdmin } from './lib/session.mjs';
import { getEvent, cancelEvent } from './lib/eventsStore.mjs';
import { json } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/events/cancel handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const guard = requireUser(req);
    if (!guard.ok) return guard.response;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);

    const existing = await getEvent(id, store);
    if (!existing) return json({ error: 'not_found' }, 404);

    const isOwner = existing.addedBy?.username === guard.user.username;
    if (!isOwner && !isAdmin(guard.user.username)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const result = await cancelEvent(existing, guard.user.username, store);
    if (!result.ok) return json({ error: result.error }, 400);

    console.log(
      `[events-cancel] event ${id} cancelled by @${guard.user.username} (owner: ${isOwner})`
    );
    return json({ event: result.event });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events/cancel' };
