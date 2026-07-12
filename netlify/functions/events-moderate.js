/**
 * Netlify Function: /api/events/moderate
 *
 * POST (?id=): approve or reject a pending submission. Body:
 * { action: 'approve'|'reject', reason?: string }. Requires an admin
 * session (requireAdmin) — this is the real security boundary the old
 * client-only AdminInbox.jsx approve/reject calls were missing. Replaces
 * EventStore.approve()/EventStore.reject().
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { requireAdmin } from './lib/session.mjs';
import { moderateEvent } from './lib/eventsStore.mjs';
import { json, readJsonBody } from './lib/http.mjs';

/**
 * Builds the /api/events/moderate handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const guard = requireAdmin(req);
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

export default createHandler();

export const config = { path: '/api/events/moderate' };
