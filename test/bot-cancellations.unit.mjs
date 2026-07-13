/**
 * Unit tests for netlify/functions/bot-cancellations.js — run with Node's
 * built-in test runner as part of `npm test`. Every dependency (events
 * store, bot-state store, bot-token store, fetch) is injected via
 * `createHandler`, so nothing here touches real Netlify Blobs or the
 * network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/bot-cancellations.js';
import { getBotState, putBotToken } from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

/**
 * Seeds the fake events store with a minimal cancelled/approved event —
 * bot-cancellations.js only reads `id`/`status`/`title`/`date`/`city`, so
 * the fixture stays deliberately small rather than mirroring the full
 * StoredEvent shape.
 * @param {import('./fakes/blobsStore.mjs').BlobStoreLike} store
 * @param {object} overrides
 * @returns {Promise<void>}
 */
async function seedEvent(store, overrides) {
  const event = {
    id: 'ab12',
    status: 'cancelled',
    title: 'Threads-kahvit',
    date: '2026-08-01',
    city: 'helsinki',
    org: ['@submitter'],
    url: '',
    ...overrides,
  };
  await store.set(event.id, JSON.stringify(event));
}

/** @returns {typeof fetch} A fetch that records every call and always succeeds. */
function recordingFetch(calls) {
  return async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({ id: 'posted-1' }) };
  };
}

describe('bot-cancellations', () => {
  it('is a no-op when the bot is disabled', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const handler = createHandler({ eventsStore, botStateStore, botEnabled: false });

    await handler(new Request('https://example.com'));
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.cancelled, []);
  });

  it('logs the intended post in dry-run mode without calling fetch', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl: recordingFetch(calls),
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.cancelled, ['a']);
  });

  it('publishes and marks each newly-cancelled event announced', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    await seedEvent(eventsStore, { id: 'b', title: 'Toinen miitti' });
    await putBotToken({ accessToken: 'tok', expiresAt: 1 }, botTokenStore);
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl: recordingFetch(calls),
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 4); // 2 events × (container create + publish)
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.cancelled.sort(), ['a', 'b']);
  });

  it('does not re-announce an already-announced cancellation', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    await botStateStore.set(
      'state',
      JSON.stringify({
        lastSnapshot: {},
        announced: { new: [], cancelled: ['a'] },
        lastDailyRunAtMs: 0,
        lastWeeklyTargetSunday: null,
      })
    );
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl: recordingFetch(calls),
    });

    await handler(new Request('https://example.com'));
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.cancelled, ['a']);
  });

  it('caps the number announced per run and leaves the remainder for next tick', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    for (let i = 0; i < 8; i++) {
      await seedEvent(eventsStore, { id: `e${i}` });
    }
    const handler = createHandler({ eventsStore, botStateStore, botEnabled: true, dryRun: true });

    await handler(new Request('https://example.com'));
    const state = await getBotState(botStateStore);
    assert.strictEqual(state.announced.cancelled.length, 5); // CANCELLATION_BATCH_SIZE
  });

  it('skips the run when enabled, not dry-run, and no token has been seeded', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl: recordingFetch(calls),
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.announced.cancelled, []);
  });

  it('refreshes lastSnapshot even when there is nothing new to announce', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', status: 'approved' });
    const handler = createHandler({ eventsStore, botStateStore, botEnabled: true, dryRun: true });

    await handler(new Request('https://example.com'));
    const state = await getBotState(botStateStore);
    assert.deepStrictEqual(state.lastSnapshot, { a: 'approved' });
  });
});
