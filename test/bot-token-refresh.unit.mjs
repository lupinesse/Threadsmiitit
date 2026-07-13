/**
 * Unit tests for netlify/functions/bot-token-refresh.js — run with Node's
 * built-in test runner as part of `npm test`. The Blobs store, clock,
 * bot-enabled flag, and fetch are all injected via `createHandler`, so
 * nothing here touches real Netlify Blobs, the system clock, or the network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/bot-token-refresh.js';
import { getBotToken, putBotToken } from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

/** @returns {typeof fetch} A fetch that must never be called. */
function unusedFetch() {
  return async () => {
    throw new Error('fetch should not have been called');
  };
}

describe('bot-token-refresh', () => {
  it('is a no-op when the bot is disabled', async () => {
    const store = createFakeStore();
    await putBotToken({ accessToken: 'tok', expiresAt: 1000 }, store);
    const handler = createHandler(store, () => 0, false, unusedFetch());

    const res = await handler(new Request('https://example.com'));
    assert.strictEqual(res.status, 204);
    assert.deepStrictEqual(await getBotToken(store), { accessToken: 'tok', expiresAt: 1000 });
  });

  it('is a no-op when no token has ever been seeded', async () => {
    const store = createFakeStore();
    const handler = createHandler(store, () => 0, true, unusedFetch());

    const res = await handler(new Request('https://example.com'));
    assert.strictEqual(res.status, 204);
  });

  it('does not refresh a token outside the refresh window', async () => {
    const store = createFakeStore();
    const farFuture = 30 * 24 * 60 * 60 * 1000; // 30 days from "now"
    await putBotToken({ accessToken: 'tok', expiresAt: farFuture }, store);
    const handler = createHandler(store, () => 0, true, unusedFetch());

    const res = await handler(new Request('https://example.com'));
    assert.strictEqual(res.status, 204);
    assert.deepStrictEqual(await getBotToken(store), { accessToken: 'tok', expiresAt: farFuture });
  });

  it('refreshes and persists a token inside the refresh window', async () => {
    const store = createFakeStore();
    const soon = 3 * 24 * 60 * 60 * 1000; // 3 days from "now" — inside the 7-day window
    await putBotToken({ accessToken: 'old-tok', expiresAt: soon }, store);

    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ access_token: 'new-tok', expires_in: 5184000 }),
    });
    const handler = createHandler(store, () => 0, true, fetchImpl);

    const res = await handler(new Request('https://example.com'));
    assert.strictEqual(res.status, 204);
    assert.deepStrictEqual(await getBotToken(store), {
      accessToken: 'new-tok',
      expiresAt: 5184000 * 1000,
    });
  });
});
