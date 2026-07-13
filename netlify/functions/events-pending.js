/**
 * Netlify Function: /api/events/pending
 *
 * GET: every pending submission across all users, oldest first — the admin
 * moderation queue. Requires an admin session (requireAdmin). Replaces
 * EventStore.pending().
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireAdmin } from './lib/session.mjs';
import { listPendingEvents } from './lib/eventsStore.mjs';
import { json } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/events/pending handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    if (req.method !== 'GET') return new Response(null, { status: 405 });

    const guard = requireAdmin(req);
    if (!guard.ok) return guard.response;

    const events = await listPendingEvents(store);
    return json({ events });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events/pending' };
