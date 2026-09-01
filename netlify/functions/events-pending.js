/**
 * Netlify Function: /api/events/pending
 *
 * GET: every pending submission across all users, oldest first — the admin
 * moderation queue. Requires a moderator session (requireModerator — root
 * admin or self-service). Replaces EventStore.pending().
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireModerator } from './lib/session.mjs';
import { listPendingEvents } from './lib/eventsStore.mjs';
import { json } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/events/pending handler, with the events and moderators
 * Blobs stores independently injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store] - The events store.
 * @param {object} [options]
 * @param {import('./lib/moderatorsStore.mjs').BlobStoreLike} [options.moderatorsStore]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store, { moderatorsStore } = {}) {
  return async function handler(req) {
    if (req.method !== 'GET') return new Response(null, { status: 405 });

    const guard = await requireModerator(req, moderatorsStore);
    if (!guard.ok) return guard.response;

    const events = await listPendingEvents(store);
    return json({ events });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events/pending' };
