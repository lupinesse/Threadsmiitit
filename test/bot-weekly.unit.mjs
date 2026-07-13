/**
 * Unit tests for netlify/functions/bot-weekly.js — run with Node's built-in
 * test runner as part of `npm test`. Every dependency (including the clock)
 * is injected, so nothing here depends on the host machine's timezone or
 * the real current date.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../netlify/functions/bot-weekly.js';
import { getBotState, putBotToken } from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

/** A Sunday at 17:00 UTC = 20:00 EEST (Europe/Helsinki summer). 2026-06-14 is a Sunday. */
const SUMMER_SUNDAY_20_HELSINKI = Date.UTC(2026, 5, 14, 17);
/** Same Sunday, but the "other" candidate UTC hour — not the target. */
const SUMMER_SUNDAY_WRONG_HOUR = Date.UTC(2026, 5, 14, 18);

/**
 * @param {import('./fakes/blobsStore.mjs').BlobStoreLike} store
 * @param {object} overrides
 */
async function seedEvent(store, overrides) {
  const event = {
    id: 'ab12',
    status: 'approved',
    title: 'Threads-kahvit',
    date: '2026-06-16',
    city: 'helsinki',
    org: ['@submitter'],
    url: '',
    ...overrides,
  };
  await store.set(event.id, JSON.stringify(event));
}

/** @returns {{fetchImpl: typeof fetch, calls: Array<object>}} */
function fakePublishFetch() {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({ id: 'post-1' }) };
  };
  return { fetchImpl, calls };
}

describe('bot-weekly', () => {
  it('is a no-op when the bot is disabled', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: false,
      fetchImpl,
      now: () => SUMMER_SUNDAY_20_HELSINKI,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('is a no-op on the candidate tick that is not actually 20:00 Helsinki', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl,
      now: () => SUMMER_SUNDAY_WRONG_HOUR,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.strictEqual(state.lastWeeklyTargetSunday, null);
  });

  it('is a no-op if already posted for this Sunday (the other candidate tick already ran)', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await botStateStore.set(
      'state',
      JSON.stringify({
        lastSnapshot: {},
        announced: { new: [], cancelled: [] },
        lastDailyRunAtMs: 0,
        lastWeeklyTargetSunday: '2026-06-14',
      })
    );
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl,
      now: () => SUMMER_SUNDAY_20_HELSINKI,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
  });

  it('logs the intended post in dry-run mode and still records lastWeeklyTargetSunday', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', date: '2026-06-16' }); // within the coming week
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botEnabled: true,
      dryRun: true,
      fetchImpl,
      now: () => SUMMER_SUNDAY_20_HELSINKI,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.strictEqual(state.lastWeeklyTargetSunday, '2026-06-14');
  });

  it('publishes the weekly summary with only events inside the coming week', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'inside', title: 'Inside Meetup', date: '2026-06-16' }); // Tue, inside coming week
    await seedEvent(eventsStore, { id: 'today', title: 'Today Meetup', date: '2026-06-14' }); // today itself — excluded
    await seedEvent(eventsStore, { id: 'toofar', title: 'Toofar Meetup', date: '2026-06-25' }); // beyond the coming Sunday
    await seedEvent(eventsStore, {
      id: 'cancelled',
      title: 'Cancelled Meetup',
      date: '2026-06-17',
      status: 'cancelled',
    });
    await putBotToken({ accessToken: 'tok', expiresAt: 1 }, botTokenStore);
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl,
      now: () => SUMMER_SUNDAY_20_HELSINKI,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 2); // one publish() call = create + publish
    const createBody = new URLSearchParams(calls[0].opts.body);
    assert.match(createBody.get('plaintext'), /Inside Meetup/);
    assert.doesNotMatch(createBody.get('plaintext'), /Today Meetup|Toofar Meetup|Cancelled Meetup/);

    const state = await getBotState(botStateStore);
    assert.strictEqual(state.lastWeeklyTargetSunday, '2026-06-14');
  });

  it('skips the run when enabled, not dry-run, and no token has been seeded', async () => {
    const eventsStore = createFakeStore();
    const botStateStore = createFakeStore();
    const botTokenStore = createFakeStore();
    const { fetchImpl, calls } = fakePublishFetch();
    const handler = createHandler({
      eventsStore,
      botStateStore,
      botTokenStore,
      botEnabled: true,
      dryRun: false,
      fetchImpl,
      now: () => SUMMER_SUNDAY_20_HELSINKI,
    });

    await handler(new Request('https://example.com'));
    assert.strictEqual(calls.length, 0);
    const state = await getBotState(botStateStore);
    assert.strictEqual(state.lastWeeklyTargetSunday, null);
  });
});
