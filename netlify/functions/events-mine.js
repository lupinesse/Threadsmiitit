/**
 * Netlify Function: /api/events/mine
 *
 * GET: every submission by the caller, regardless of moderation status.
 * Requires auth. Replaces EventStore.ownedBy().
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireUser } from './lib/session.mjs';
import { listOwnedEvents } from './lib/eventsStore.mjs';
import { json } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/events/mine handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    if (req.method !== 'GET') return new Response(null, { status: 405 });

    const guard = requireUser(req);
    if (!guard.ok) return guard.response;

    const events = await listOwnedEvents(guard.user.username, store);
    return json({ events });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events/mine' };
