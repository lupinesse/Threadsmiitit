/**
 * Netlify Function: /api/events
 *
 * GET: events visible to the caller — every approved event, plus the
 *   caller's own pending submissions if signed in. Replaces the old
 *   client-side EventStore.all().
 * POST: submit a new event. Requires auth (requireUser) — the server
 *   derives `addedBy` from the session and always starts the event as
 *   `pending`. Replaces EventStore.add().
 * PATCH: edit an existing event (?id=). Requires auth and ownership.
 *   Replaces EventStore.edit().
 * DELETE: remove an existing event (?id=). Requires auth and ownership.
 *   Replaces EventStore.remove().
 *
 * All four methods share one path because Netlify Functions route by exact
 * path, not by method + path — id is passed as a query string rather than a
 * dynamic path segment for the same reason.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { getUser, requireUser } from './lib/session.mjs';
import {
  listVisibleEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
} from './lib/eventsStore.mjs';
import { json, readJsonBody } from './lib/http.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Loads an event and checks the caller owns it — the shared guard for the
 * PATCH and DELETE branches below. Fetches the record once so the existence
 * check, the ownership check, and (for PATCH) the update itself all see the
 * same snapshot, instead of each doing its own separate Blobs read.
 * @param {string} id
 * @param {string} username - The caller's verified Threads handle.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {Promise<{ok:true, event:object}|{ok:false, response:Response}>}
 */
async function loadOwnedEvent(id, username, store) {
  const existing = await getEvent(id, store);
  if (!existing) return { ok: false, response: json({ error: 'not_found' }, 404) };
  if (existing.addedBy?.username !== username) {
    return { ok: false, response: json({ error: 'Forbidden' }, 403) };
  }
  return { ok: true, event: existing };
}

/**
 * Builds the /api/events handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const user = getUser(req);
      const events = await listVisibleEvents({ username: user?.username }, store);
      return json({ events });
    }

    if (req.method === 'POST') {
      const guard = requireUser(req);
      if (!guard.ok) return guard.response;

      const body = await readJsonBody(req);
      if (!body) return json({ error: 'Invalid JSON body' }, 400);

      const result = await createEvent(body, guard.user, store);
      if (!result.ok) return json({ error: result.error }, 400);
      return json({ event: result.event }, 201);
    }

    if (req.method === 'PATCH') {
      const guard = requireUser(req);
      if (!guard.ok) return guard.response;

      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const owned = await loadOwnedEvent(id, guard.user.username, store);
      if (!owned.ok) return owned.response;

      const body = await readJsonBody(req);
      if (!body) return json({ error: 'Invalid JSON body' }, 400);

      const result = await updateEvent(owned.event, body, store);
      if (!result.ok) return json({ error: result.error }, 400);
      return json({ event: result.event });
    }

    if (req.method === 'DELETE') {
      const guard = requireUser(req);
      if (!guard.ok) return guard.response;

      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, 400);

      const owned = await loadOwnedEvent(id, guard.user.username, store);
      if (!owned.ok) return owned.response;

      await deleteEvent(id, store);
      return json({ ok: true });
    }

    return new Response(null, { status: 405 });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/events' };
