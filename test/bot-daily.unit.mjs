/**
 * Unit tests for netlify/functions/bot-daily.js — run with Node's built-in
 * test runner as part of `npm test`. Every dependency is injected, so
 * nothing here touches real Netlify Blobs, the network, or the system clock.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/bot-daily.js';
import { getBotState } from '../netlify/functions/lib/botState.mjs';
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

describe('bot-daily', () => {
  it('is a no-op when the bot is disabled', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: false,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true };
      },
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('does not trigger the background poster when there is nothing new', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true };
      },
      now: () => 1000,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual((await getBotState(botStateStore)).lastDailyRunAtMs, 1000);
  });

  it('triggers the background poster at the expected URL when there is something new', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl: async (url, opts) => {
        calls.push({ url, opts });
        return { ok: true };
      },
      siteUrl: 'https://threadsmiitit.netlify.app',
      now: () => 2000,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(
      calls[0].url,
      'https://threadsmiitit.netlify.app/.netlify/functions/bot-post-daily-background'
    );
    assert.strictEqual(calls[0].opts.method, 'POST');
    assert.strictEqual((await getBotState(botStateStore)).lastDailyRunAtMs, 2000);
  });

  it('logs instead of triggering the poster in dry-run mode', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true };
      },
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('does not trigger for an event that is already announced', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a' });
    await botStateStore.set(
      'state',
      JSON.stringify({
        lastSnapshot: {},
        announced: { new: ['a'], cancelled: [] },
        lastDailyRunAtMs: 0,
        lastWeeklyTargetSunday: null,
      })
    );
    const calls = [];
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true };
      },
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });
});
