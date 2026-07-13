/**
 * Unit tests for the /api/events* Netlify Function handlers — run with
 * Node's built-in test runner as part of `npm test`. Each handler's
 * `createHandler(store)` factory is called with the in-memory fake store
 * from test/fakes/blobsStore.mjs and invoked directly with a real Request,
 * so nothing here needs `netlify dev` or real Netlify Blobs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { signSession } from '../netlify/functions/lib/session.mjs';
import { createHandler as createEventsHandler } from '../netlify/functions/events.js';
import { createHandler as createMineHandler } from '../netlify/functions/events-mine.js';
import { createHandler as createPendingHandler } from '../netlify/functions/events-pending.js';
import { createHandler as createModerateHandler } from '../netlify/functions/events-moderate.js';
import { createHandler as createCancelHandler } from '../netlify/functions/events-cancel.js';
import { createFakeStore } from './fakes/blobsStore.mjs';

const SECRET = 'test-secret';
process.env.SESSION_SECRET = SECRET;

const submitter = {
  id: 'u1',
  username: 'submitter',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@submitter',
};
const admin = {
  id: 'u2',
  username: 'lupinesse', // in ADMINS (as @lupinesse)
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@lupinesse',
};

/**
 * Builds a Cookie header value carrying a signed session for the given user.
 * @param {object} user
 * @returns {string}
 */
function cookieFor(user) {
  const token = signSession(user, { secret: SECRET });
  return `tm_session=${token}`;
}

/**
 * Builds a Request against a handler under test.
 * @param {string} url
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {object} [opts.user] - If set, attaches a signed session cookie.
 * @param {object} [opts.body]
 * @returns {Request}
 */
function req(url, { method = 'GET', user, body } = {}) {
  const headers = new Headers();
  if (user) headers.set('cookie', cookieFor(user));
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://example.com${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const validPartial = {
  title: 'Threads-kahvit',
  date: '2026-08-01',
  city: 'helsinki',
  cat: 'yleinen',
  org: '@submitter',
  url: 'https://www.threads.com/@submitter/post/abc',
};

describe('GET /api/events', () => {
  it('returns approved events to an anonymous caller', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const created = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();
    await createModerateHandler(store)(
      req(`/api/events/moderate?id=${event.id}`, {
        method: 'POST',
        user: admin,
        body: { action: 'approve' },
      })
    );

    const res = await handler(req('/api/events'));
    assert.strictEqual(res.status, 200);
    const { events } = await res.json();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].status, 'approved');
  });
});

describe('POST /api/events', () => {
  it('creates a pending event for the signed-in caller', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const res = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    assert.strictEqual(res.status, 201);
    const { event } = await res.json();
    assert.strictEqual(event.status, 'pending');
    assert.strictEqual(event.addedBy.username, 'submitter');
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const res = await handler(req('/api/events', { method: 'POST', body: validPartial }));
    assert.strictEqual(res.status, 401);
  });

  it('returns 400 for an invalid payload', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const res = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: { ...validPartial, title: '' } })
    );
    assert.strictEqual(res.status, 400);
  });
});

describe('PATCH /api/events', () => {
  it('lets the owner edit their own event', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const created = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await handler(
      req(`/api/events?id=${event.id}`, {
        method: 'PATCH',
        user: submitter,
        body: { title: 'Uusi' },
      })
    );
    assert.strictEqual(res.status, 200);
    const { event: updated } = await res.json();
    assert.strictEqual(updated.title, 'Uusi');
  });

  it('returns 403 when a non-owner tries to edit', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const created = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await handler(
      req(`/api/events?id=${event.id}`, {
        method: 'PATCH',
        user: admin,
        body: { title: 'Kaappaus' },
      })
    );
    assert.strictEqual(res.status, 403);
  });

  it('returns 404 for an unknown id', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const res = await handler(
      req('/api/events?id=zzzz', { method: 'PATCH', user: submitter, body: { title: 'x' } })
    );
    assert.strictEqual(res.status, 404);
  });
});

describe('DELETE /api/events', () => {
  it('lets the owner delete their own event', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const created = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await handler(
      req(`/api/events?id=${event.id}`, { method: 'DELETE', user: submitter })
    );
    assert.strictEqual(res.status, 200);

    const mineRes = await createMineHandler(store)(req('/api/events/mine', { user: submitter }));
    const { events } = await mineRes.json();
    assert.strictEqual(events.length, 0);
  });

  it('returns 403 when a non-owner tries to delete', async () => {
    const store = createFakeStore();
    const handler = createEventsHandler(store);
    const created = await handler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await handler(req(`/api/events?id=${event.id}`, { method: 'DELETE', user: admin }));
    assert.strictEqual(res.status, 403);
  });
});

describe('GET /api/events/mine', () => {
  it('returns every submission by the caller regardless of status', async () => {
    const store = createFakeStore();
    const eventsHandler = createEventsHandler(store);
    const created = await eventsHandler(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();
    await createModerateHandler(store)(
      req(`/api/events/moderate?id=${event.id}`, {
        method: 'POST',
        user: admin,
        body: { action: 'reject' },
      })
    );

    const res = await createMineHandler(store)(req('/api/events/mine', { user: submitter }));
    assert.strictEqual(res.status, 200);
    const { events } = await res.json();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].status, 'rejected');
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const res = await createMineHandler(store)(req('/api/events/mine'));
    assert.strictEqual(res.status, 401);
  });
});

describe('GET /api/events/pending', () => {
  it('returns pending events for an admin', async () => {
    const store = createFakeStore();
    await createEventsHandler(store)(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );

    const res = await createPendingHandler(store)(req('/api/events/pending', { user: admin }));
    assert.strictEqual(res.status, 200);
    const { events } = await res.json();
    assert.strictEqual(events.length, 1);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const store = createFakeStore();
    const res = await createPendingHandler(store)(req('/api/events/pending', { user: submitter }));
    assert.strictEqual(res.status, 403);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const res = await createPendingHandler(store)(req('/api/events/pending'));
    assert.strictEqual(res.status, 401);
  });
});

describe('POST /api/events/moderate', () => {
  it('approves a pending event for an admin', async () => {
    const store = createFakeStore();
    const created = await createEventsHandler(store)(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await createModerateHandler(store)(
      req(`/api/events/moderate?id=${event.id}`, {
        method: 'POST',
        user: admin,
        body: { action: 'approve' },
      })
    );
    assert.strictEqual(res.status, 200);
    const { event: moderated } = await res.json();
    assert.strictEqual(moderated.status, 'approved');
  });

  it('returns 403 for an authenticated non-admin', async () => {
    const store = createFakeStore();
    const created = await createEventsHandler(store)(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await createModerateHandler(store)(
      req(`/api/events/moderate?id=${event.id}`, {
        method: 'POST',
        user: submitter,
        body: { action: 'approve' },
      })
    );
    assert.strictEqual(res.status, 403);
  });

  it('returns 404 for an unknown id', async () => {
    const store = createFakeStore();
    const res = await createModerateHandler(store)(
      req('/api/events/moderate?id=zzzz', {
        method: 'POST',
        user: admin,
        body: { action: 'approve' },
      })
    );
    assert.strictEqual(res.status, 404);
  });

  it('returns 400 for an invalid action', async () => {
    const store = createFakeStore();
    const created = await createEventsHandler(store)(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await createModerateHandler(store)(
      req(`/api/events/moderate?id=${event.id}`, {
        method: 'POST',
        user: admin,
        body: { action: 'delete' },
      })
    );
    assert.strictEqual(res.status, 400);
  });
});

const other = {
  id: 'u3',
  username: 'other',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@other',
};

/**
 * Submits and approves an event, returning the approved event body.
 * @param {import('../netlify/functions/lib/eventsStore.mjs').BlobStoreLike} store
 * @returns {Promise<object>}
 */
async function createApprovedEvent(store) {
  const created = await createEventsHandler(store)(
    req('/api/events', { method: 'POST', user: submitter, body: validPartial })
  );
  const { event } = await created.json();
  const approved = await createModerateHandler(store)(
    req(`/api/events/moderate?id=${event.id}`, {
      method: 'POST',
      user: admin,
      body: { action: 'approve' },
    })
  );
  return (await approved.json()).event;
}

describe('POST /api/events/cancel', () => {
  it('lets the owner cancel their own approved event', async () => {
    const store = createFakeStore();
    const event = await createApprovedEvent(store);

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'POST', user: submitter })
    );
    assert.strictEqual(res.status, 200);
    const { event: cancelled } = await res.json();
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.cancelledBy, 'submitter');
  });

  it("lets an admin cancel someone else's approved event", async () => {
    const store = createFakeStore();
    const event = await createApprovedEvent(store);

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'POST', user: admin })
    );
    assert.strictEqual(res.status, 200);
    const { event: cancelled } = await res.json();
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.cancelledBy, 'lupinesse');
  });

  it('returns 403 for a non-owner, non-admin caller', async () => {
    const store = createFakeStore();
    const event = await createApprovedEvent(store);

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'POST', user: other })
    );
    assert.strictEqual(res.status, 403);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const event = await createApprovedEvent(store);

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'POST' })
    );
    assert.strictEqual(res.status, 401);
  });

  it('returns 400 when id is missing', async () => {
    const store = createFakeStore();
    const res = await createCancelHandler(store)(
      req('/api/events/cancel', { method: 'POST', user: submitter })
    );
    assert.strictEqual(res.status, 400);
  });

  it('returns 404 for an unknown id', async () => {
    const store = createFakeStore();
    const res = await createCancelHandler(store)(
      req('/api/events/cancel?id=zzzz', { method: 'POST', user: submitter })
    );
    assert.strictEqual(res.status, 404);
  });

  it('returns 400 when the event is not currently approved', async () => {
    const store = createFakeStore();
    const created = await createEventsHandler(store)(
      req('/api/events', { method: 'POST', user: submitter, body: validPartial })
    );
    const { event } = await created.json();

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'POST', user: submitter })
    );
    assert.strictEqual(res.status, 400);
  });

  it('returns 405 for a non-POST method', async () => {
    const store = createFakeStore();
    const event = await createApprovedEvent(store);

    const res = await createCancelHandler(store)(
      req(`/api/events/cancel?id=${event.id}`, { method: 'GET', user: submitter })
    );
    assert.strictEqual(res.status, 405);
  });
});
