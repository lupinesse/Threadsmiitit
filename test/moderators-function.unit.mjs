/**
 * Unit tests for the /api/moderators Netlify Function handler — run with
 * Node's built-in test runner as part of `npm test`. `createHandler(store)`
 * is called with the in-memory fake store from test/fakes/blobsStore.mjs and
 * invoked directly with a real Request, so nothing here needs `netlify dev`
 * or real Netlify Blobs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { signSession } from '../netlify/functions/lib/session.mjs';
import { createHandler } from '../netlify/functions/moderators.js';
import { addModerator } from '../netlify/functions/lib/moderatorsStore.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

const SECRET = 'test-secret';
process.env.SESSION_SECRET = SECRET;

const root = {
  id: 'u1',
  username: 'lupinesse', // in ADMINS (as @lupinesse)
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@lupinesse',
};
const moderator = {
  id: 'u2',
  username: 'bob',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@bob',
};
const stranger = {
  id: 'u3',
  username: 'rando',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@rando',
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
 * Builds a Request against the handler under test.
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

describe('GET /api/moderators', () => {
  it('returns the roster for a self-service moderator', async () => {
    const store = createFakeStore();
    await addModerator('bob', 'lupinesse', store);
    const res = await createHandler(store)(req('/api/moderators', { user: moderator }));
    assert.strictEqual(res.status, 200);
    const { moderators } = await res.json();
    assert.strictEqual(moderators.length, 1);
    assert.strictEqual(moderators[0].username, 'bob');
  });

  it('returns the roster for a root admin too', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(req('/api/moderators', { user: root }));
    assert.strictEqual(res.status, 200);
  });

  it('returns 403 for an authenticated non-moderator', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(req('/api/moderators', { user: stranger }));
    assert.strictEqual(res.status, 403);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(req('/api/moderators'));
    assert.strictEqual(res.status, 401);
  });
});

describe('POST /api/moderators', () => {
  it('lets a root admin grant self-service moderator status, and fires the notify hook', async () => {
    const store = createFakeStore();
    const notified = [];
    const handler = createHandler(store, { notify: async (change) => notified.push(change) });
    const res = await handler(
      req('/api/moderators', { method: 'POST', user: root, body: { username: '@bob' } })
    );
    assert.strictEqual(res.status, 201);
    const { moderators } = await res.json();
    assert.strictEqual(moderators[0].username, 'bob');
    assert.deepStrictEqual(notified, [
      { action: 'added', username: '@bob', actorUsername: 'lupinesse' },
    ]);
  });

  it('returns 403 when a self-service moderator tries to grant another', async () => {
    const store = createFakeStore();
    await addModerator('bob', 'lupinesse', store);
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'POST', user: moderator, body: { username: 'alice' } })
    );
    assert.strictEqual(res.status, 403);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'POST', body: { username: 'bob' } })
    );
    assert.strictEqual(res.status, 401);
  });

  it('returns 400 when username is missing', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'POST', user: root, body: {} })
    );
    assert.strictEqual(res.status, 400);
  });

  it('returns 400 for a username already in ADMINS', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'POST', user: root, body: { username: '@nipatran' } })
    );
    assert.strictEqual(res.status, 400);
  });

  it('returns 400 for a duplicate self-service moderator', async () => {
    const store = createFakeStore();
    await addModerator('bob', 'lupinesse', store);
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'POST', user: root, body: { username: 'bob' } })
    );
    assert.strictEqual(res.status, 400);
  });

  it('still returns 201 when the notify hook rejects', async () => {
    const store = createFakeStore();
    const handler = createHandler(store, {
      notify: async () => {
        throw new Error('email provider down');
      },
    });
    const res = await handler(
      req('/api/moderators', { method: 'POST', user: root, body: { username: 'bob' } })
    );
    assert.strictEqual(res.status, 201);
  });
});

describe('DELETE /api/moderators', () => {
  it('lets a root admin revoke self-service moderator status, and fires the notify hook', async () => {
    const store = createFakeStore();
    await addModerator('bob', 'lupinesse', store);
    const notified = [];
    const handler = createHandler(store, { notify: async (change) => notified.push(change) });
    const res = await handler(
      req('/api/moderators?username=bob', { method: 'DELETE', user: root })
    );
    assert.strictEqual(res.status, 200);
    const { moderators } = await res.json();
    assert.strictEqual(moderators.length, 0);
    assert.deepStrictEqual(notified, [
      { action: 'removed', username: 'bob', actorUsername: 'lupinesse' },
    ]);
  });

  it('returns 403 when a self-service moderator tries to revoke another', async () => {
    const store = createFakeStore();
    await addModerator('bob', 'lupinesse', store);
    await addModerator('alice', 'lupinesse', store);
    const res = await createHandler(store)(
      req('/api/moderators?username=alice', { method: 'DELETE', user: moderator })
    );
    assert.strictEqual(res.status, 403);
  });

  it('returns 404 for a username never added (including a root admin handle)', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators?username=nipatran', { method: 'DELETE', user: root })
    );
    assert.strictEqual(res.status, 404);
  });

  it('returns 400 when username is missing', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators', { method: 'DELETE', user: root })
    );
    assert.strictEqual(res.status, 400);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(
      req('/api/moderators?username=bob', { method: 'DELETE' })
    );
    assert.strictEqual(res.status, 401);
  });
});

describe('unsupported method', () => {
  it('returns 405', async () => {
    const store = createFakeStore();
    const res = await createHandler(store)(req('/api/moderators', { method: 'PUT', user: root }));
    assert.strictEqual(res.status, 405);
  });
});
