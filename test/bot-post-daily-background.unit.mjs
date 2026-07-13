/**
 * Unit tests for netlify/functions/bot-post-daily-background.js — run with
 * Node's built-in test runner as part of `npm test`. Every dependency is
 * injected, so nothing here touches real Netlify Blobs or the network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/bot-post-daily-background.js';
import { getBotState, putBotToken } from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

/**
 * @param {import('./fakes/blobsStore.mjs').BlobStoreLike} store
 * @param {object} overrides
 */
async function seedEvent(store, overrides) {
  const event = {
    id: 'ab12',
    status: 'approved',
    title: 'Threads-kahvit',
    date: '2026-08-01',
    city: 'helsinki',
    org: ['@submitter'],
    url: '',
    ...overrides,
  };
  await store.set(event.id, JSON.stringify(event));
}

/**
 * Fake fetch for `publish()`'s two-step create-then-publish call pair,
 * returning a distinct post id per pair so the reply chain's `reply_to_id`
 * can be asserted against the root's id.
 * @returns {{fetchImpl: typeof fetch, calls: Array<{url: string, opts: object}>}}
 */
function fakePublishFetch() {
  const calls = [];
  let postCounter = 0;
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith('/threads')) {
      return { ok: true, json: async () => ({ id: `creation-${++postCounter}` }) };
    }
    return { ok: true, json: async () => ({ id: `post-${postCounter}` }) };
  };
  return { fetchImpl, calls };
}

describe('bot-post-daily-background', () => {
  it('is a no-op when the bot is disabled', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({ eventsStore, botStateStore, botEnabled: false, fetchImpl });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('is a no-op when there is nothing new to announce', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({ eventsStore, botStateStore, botEnabled: true, fetchImpl });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('posts a root then one reply per new event, chained via reply_to_id', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', title: 'Ensimmäinen' });
    await seedEvent(eventsStore, { id: 'b', title: 'Toinen' });
    await putBotToken({ accessToken: 'tok', expiresAt: 1 }, botTokenStore);
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl,
    });

    await handler(new Request('https://example.com'));
    // root: create + publish, then 2 replies: create + publish each = 6 calls.
    assert.strictEqual(calls.length, 6);

    const rootPublishBody = new URLSearchParams(calls[1].opts.body);
    const rootId = rootPublishBody.get('creation_id');
    assert.ok(rootId);

    // Both reply *creation* calls should carry reply_to_id pointing at the root post.
    const reply1CreateBody = new URLSearchParams(calls[2].opts.body);
    const reply2CreateBody = new URLSearchParams(calls[4].opts.body);
    assert.ok(reply1CreateBody.get('reply_to_id'));
    assert.strictEqual(reply1CreateBody.get('reply_to_id'), reply2CreateBody.get('reply_to_id'));

    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.new.sort(), ['a', 'b']);
  });

  it('logs in dry-run mode without calling fetch', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.new, ['a']);
  });

  it('skips the run when enabled, not dry-run, and no token has been seeded', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.new, []);
  });
});
