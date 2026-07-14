/**
 * Unit tests for the /api/auth/delete Netlify Function handler — run with
 * Node's built-in test runner as part of `npm test`. Uses `createHandler`
 * with the in-memory fake store, mirroring test/events-functions.unit.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { createHandler } from '../netlify/functions/auth-delete.js';
import { createEvent, getEvent } from '../netlify/functions/lib/eventsStore.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

const APP_SECRET = 'test-threads-client-secret';
process.env.THREADS_CLIENT_SECRET = APP_SECRET;

const addedBy = {
  id: 'meta-user-1',
  username: 'submitter',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@submitter',
};

const validPartial = {
  title: 'Threads-kahvit',
  date: '2026-08-01',
  city: 'helsinki',
  cat: 'yleinen',
  org: '@submitter',
  url: 'https://www.threads.com/@submitter/post/abc',
};

/**
 * Builds a valid Meta signed_request string for the given payload, signed
 * with APP_SECRET (matching THREADS_CLIENT_SECRET above).
 * @param {object} payload
 * @param {string} [secret]
 * @returns {string}
 */
function buildSignedRequest(payload, secret = APP_SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${sig}.${encodedPayload}`;
}

/**
 * Builds a POST Request against the handler under test with a
 * form-urlencoded signed_request body, matching how Meta calls this endpoint.
 * @param {string|null} signedRequest - Pass null to omit the param entirely.
 * @returns {Request}
 */
function deleteRequest(signedRequest) {
  const body = signedRequest ? new URLSearchParams({ signed_request: signedRequest }) : '';
  return new Request('https://example.com/api/auth/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('POST /api/auth/delete', () => {
  it('anonymises every event submitted by the requesting user and returns a confirmation', async () => {
    // Regression: this endpoint used to be a no-op that never parsed
    // signed_request or touched the events store at all.
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);

    const signedRequest = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: addedBy.id });
    const response = await createHandler(store)(deleteRequest(signedRequest));

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.match(body.confirmation_code, /^del_\d+$/);
    assert.match(body.url, /\/api\/auth\/delete\/status\?code=del_\d+$/);

    const stored = await getEvent(created.event.id, store);
    assert.deepStrictEqual(stored.addedBy, { deleted: true });
  });

  it("leaves other users' events untouched", async () => {
    const store = createFakeStore();
    const other = await createEvent(
      validPartial,
      { ...addedBy, id: 'someone-else', username: 'someone-else' },
      store
    );

    const signedRequest = buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: addedBy.id });
    await createHandler(store)(deleteRequest(signedRequest));

    const stored = await getEvent(other.event.id, store);
    assert.strictEqual(stored.addedBy.username, 'someone-else');
  });

  it('rejects a request with a bad signature instead of deleting anything', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);

    const forged = buildSignedRequest(
      { algorithm: 'HMAC-SHA256', user_id: addedBy.id },
      'wrong-secret'
    );
    const response = await createHandler(store)(deleteRequest(forged));

    assert.strictEqual(response.status, 400);
    const stored = await getEvent(created.event.id, store);
    assert.deepStrictEqual(stored.addedBy, addedBy);
  });

  it('rejects a request missing signed_request entirely', async () => {
    const store = createFakeStore();
    const response = await createHandler(store)(deleteRequest(null));
    assert.strictEqual(response.status, 400);
  });

  it('rejects non-POST methods', async () => {
    const store = createFakeStore();
    const response = await createHandler(store)(
      new Request('https://example.com/api/auth/delete', { method: 'GET' })
    );
    assert.strictEqual(response.status, 405);
  });
});
