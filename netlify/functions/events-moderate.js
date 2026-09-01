/**
 * Netlify Function: /api/events/moderate
 *
 * POST (?id=): approve or reject a pending submission. Body:
 * { action: 'approve'|'reject', reason?: string }. Requires a moderator
 * session (requireModerator — root admin or self-service) — this is the
 * real security boundary the old client-only AdminInbox.jsx approve/reject
 * calls were missing. Replaces EventStore.approve()/EventStore.reject().
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireModerator } from './lib/session.mjs';
import { moderateEvent } from './lib/eventsStore.mjs';
import { json, readJsonBody } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/events/moderate handler, with the events and moderators
 * Blobs stores independently injectable for tests (two separate named
 * Blobs stores in production, so two separate fakes in tests).
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store] - The events store.
 * @param {object} [options]
 * @param {import('./lib/moderatorsStore.mjs').BlobStoreLike} [options.moderatorsStore]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store, { moderatorsStore } = {}) {
  return async function handler(req) {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const guard = await requireModerator(req, moderatorsStore);
    if (!guard.ok) return guard.response;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);

    const body = await readJsonBody(req);
    if (!body) return json({ error: 'Invalid JSON body' }, 400);

    const result = await moderateEvent(id, body.action, body.reason, store);
    if (!result.ok) {
      return json({ error: result.error }, result.error === 'not_found' ? 404 : 400);
    }
    return json({ event: result.event });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events/moderate' };
