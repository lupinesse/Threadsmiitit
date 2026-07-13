/**
 * Unit tests for netlify/functions/lib/botState.mjs — run with Node's
 * built-in test runner as part of `npm test`. Uses the same in-memory fake
 * Blobs store as eventsStore.mjs's tests, so nothing here touches real
 * Netlify Blobs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getBotState,
  putBotState,
  hasAnnounced,
  markAnnounced,
  newlyApproved,
  newlyCancelled,
  updateSnapshot,
  getBotToken,
  putBotToken,
} from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

describe('getBotState / putBotState', () => {
  it('returns a fresh empty state before anything has ever been written', async () => {
    const store = createFakeStore();
    const state = await getBotState(store);
    assert.deepStrictEqual(state, {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    });
  });

  it('round-trips a written state', async () => {
    const store = createFakeStore();
    const written = {
      lastSnapshot: { ab12: 'approved' },
      announced: { new: ['ab12'], cancelled: [] },
      lastDailyRunAtMs: 12345,
      lastWeeklyTargetSunday: '2026-08-02',
    };
    await putBotState(written, store);
    assert.deepStrictEqual(await getBotState(store), written);
  });
});

describe('hasAnnounced / markAnnounced', () => {
  const emptyState = () => ({
    lastSnapshot: {},
    announced: { new: [], cancelled: [] },
    lastDailyRunAtMs: 0,
    lastWeeklyTargetSunday: null,
  });

  it('is false for an event that has not been marked', () => {
    assert.strictEqual(hasAnnounced(emptyState(), 'new', 'ab12'), false);
  });

  it('marks an event announced and reports it as such afterwards', () => {
    const state = markAnnounced(emptyState(), 'new', 'ab12');
    assert.strictEqual(hasAnnounced(state, 'new', 'ab12'), true);
    assert.strictEqual(hasAnnounced(state, 'cancelled', 'ab12'), false);
  });

  it('is idempotent — marking an already-announced event returns an equal state', () => {
    const once = markAnnounced(emptyState(), 'new', 'ab12');
    const twice = markAnnounced(once, 'new', 'ab12');
    assert.deepStrictEqual(twice, once);
    assert.strictEqual(twice.announced.new.length, 1);
  });

  it('does not mutate the input state', () => {
    const state = emptyState();
    markAnnounced(state, 'new', 'ab12');
    assert.deepStrictEqual(state.announced.new, []);
  });
});

describe('newlyApproved / newlyCancelled', () => {
  const stateWithAnnounced = (kind, ids) => ({
    lastSnapshot: {},
    announced: { new: kind === 'new' ? ids : [], cancelled: kind === 'cancelled' ? ids : [] },
    lastDailyRunAtMs: 0,
    lastWeeklyTargetSunday: null,
  });

  it('newlyApproved returns approved events not yet announced', () => {
    const events = [
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'approved' },
      { id: 'c', status: 'pending' },
    ];
    const state = stateWithAnnounced('new', ['a']);
    assert.deepStrictEqual(
      newlyApproved(events, state).map((e) => e.id),
      ['b']
    );
  });

  it('newlyCancelled returns cancelled events not yet announced', () => {
    const events = [
      { id: 'a', status: 'cancelled' },
      { id: 'b', status: 'cancelled' },
      { id: 'c', status: 'approved' },
    ];
    const state = stateWithAnnounced('cancelled', ['a']);
    assert.deepStrictEqual(
      newlyCancelled(events, state).map((e) => e.id),
      ['b']
    );
  });

  it('returns an empty array when everything has already been announced', () => {
    const events = [{ id: 'a', status: 'approved' }];
    const state = stateWithAnnounced('new', ['a']);
    assert.deepStrictEqual(newlyApproved(events, state), []);
  });
});

describe('updateSnapshot', () => {
  it('rebuilds lastSnapshot from the given events, replacing whatever was there', () => {
    const state = {
      lastSnapshot: { stale: 'pending' },
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };
    const events = [
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'cancelled' },
    ];
    const updated = updateSnapshot(state, events);
    assert.deepStrictEqual(updated.lastSnapshot, { a: 'approved', b: 'cancelled' });
    assert.strictEqual('stale' in updated.lastSnapshot, false);
  });

  it('does not mutate the input state', () => {
    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };
    updateSnapshot(state, [{ id: 'a', status: 'approved' }]);
    assert.deepStrictEqual(state.lastSnapshot, {});
  });
});

describe('getBotToken / putBotToken', () => {
  it('returns null before a token has ever been seeded', async () => {
    const store = createFakeStore();
    assert.strictEqual(await getBotToken(store), null);
  });

  it('warns when no token has been seeded, pointing at the seed script', async (t) => {
    const warned = t.mock.method(console, 'warn', () => {});
    const store = createFakeStore();
    await getBotToken(store);
    assert.strictEqual(warned.mock.calls.length, 1);
    assert.match(warned.mock.calls[0].arguments[0], /seed-bot-token\.mjs/);
  });

  it('does not warn once a token has been seeded', async (t) => {
    const warned = t.mock.method(console, 'warn', () => {});
    const store = createFakeStore();
    await putBotToken({ accessToken: 'tok', expiresAt: 1 }, store);
    await getBotToken(store);
    assert.strictEqual(warned.mock.calls.length, 0);
  });

  it('round-trips a stored token', async () => {
    const store = createFakeStore();
    const token = { accessToken: 'tok-123', expiresAt: 1234567890 };
    await putBotToken(token, store);
    assert.deepStrictEqual(await getBotToken(store), token);
  });

  it('uses a store separate from bot state — writing state never touches the token', async () => {
    const stateStore = createFakeStore();
    const tokenStore = createFakeStore();
    await putBotToken({ accessToken: 'tok', expiresAt: 1 }, tokenStore);
    await putBotState(
      {
        lastSnapshot: {},
        announced: { new: [], cancelled: [] },
        lastDailyRunAtMs: 0,
        lastWeeklyTargetSunday: null,
      },
      stateStore
    );
    assert.strictEqual(await getBotToken(stateStore), null);
  });
});
