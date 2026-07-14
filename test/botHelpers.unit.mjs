/**
 * Unit tests for netlify/functions/lib/botHelpers.mjs — the three
 * single-purpose helpers extracted from the bot-* trigger functions in #90.
 * Every dependency is injected, so nothing here touches real Netlify Blobs
 * or the network.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAndFilterEvents,
  postBatch,
  persistAnnounced,
} from '../netlify/functions/lib/botHelpers.mjs';
import { getBotState } from '../netlify/functions/lib/botState.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

/**
 * Seeds the fake events store with a minimal event — botHelpers only reads
 * `id` and `status`, so the fixture stays deliberately small.
 * @param {import('./fakes/blobsStore.mjs').BlobStoreLike} store
 * @param {object} overrides
 */
async function seedEvent(store, overrides) {
  const event = { id: 'e1', status: 'approved', ...overrides };
  await store.set(event.id, JSON.stringify(event));
}

describe('fetchAndFilterEvents', () => {
  it('returns approved-but-unannounced events for kind "new"', async () => {
    const eventsStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', status: 'approved' });
    await seedEvent(eventsStore, { id: 'b', status: 'pending' });
    await seedEvent(eventsStore, { id: 'c', status: 'approved' });

    const state = {
      lastSnapshot: {},
      announced: { new: ['c'], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };
    const { pending } = await fetchAndFilterEvents({ eventsStore, state, kind: 'new' });

    assert.deepStrictEqual(pending.map((e) => e.id).sort(), ['a']);
  });

  it('returns cancelled-but-unannounced events for kind "cancelled"', async () => {
    const eventsStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', status: 'cancelled' });
    await seedEvent(eventsStore, { id: 'b', status: 'approved' });
    await seedEvent(eventsStore, { id: 'c', status: 'cancelled' });

    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: ['c'] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };
    const { pending } = await fetchAndFilterEvents({ eventsStore, state, kind: 'cancelled' });

    assert.deepStrictEqual(pending.map((e) => e.id).sort(), ['a']);
  });

  it('honours the cap and leaves the remainder for the next tick', async () => {
    const eventsStore = createFakeStore();
    for (let i = 0; i < 7; i++) {
      await seedEvent(eventsStore, { id: `e${i}`, status: 'cancelled' });
    }
    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };

    const { pending } = await fetchAndFilterEvents({
      eventsStore,
      state,
      kind: 'cancelled',
      cap: 3,
    });

    assert.strictEqual(pending.length, 3);
  });

  it('also returns the full unfiltered events list, so callers can updateSnapshot', async () => {
    const eventsStore = createFakeStore();
    await seedEvent(eventsStore, { id: 'a', status: 'approved' });
    await seedEvent(eventsStore, { id: 'b', status: 'pending' });
    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };

    const { events } = await fetchAndFilterEvents({ eventsStore, state, kind: 'new' });

    assert.deepStrictEqual(events.map((e) => e.id).sort(), ['a', 'b']);
  });
});

describe('postBatch', () => {
  it('calls publishOne and onSuccess for every item on the happy path', async () => {
    const publishedIds = [];
    const successIds = [];
    const items = [{ id: 'a' }, { id: 'b' }];

    const successes = await postBatch({
      items,
      dryRun: false,
      logPrefix: '[test]',
      renderText: (item) => `text-for-${item.id}`,
      publishOne: async (item, text) => {
        publishedIds.push({ id: item.id, text });
      },
      onSuccess: async (item) => {
        successIds.push(item.id);
      },
    });

    assert.strictEqual(successes, 2);
    assert.deepStrictEqual(publishedIds, [
      { id: 'a', text: 'text-for-a' },
      { id: 'b', text: 'text-for-b' },
    ]);
    assert.deepStrictEqual(successIds, ['a', 'b']);
  });

  it('skips only the item whose publish fails and continues the batch', async () => {
    const successIds = [];
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const successes = await postBatch({
      items,
      dryRun: false,
      logPrefix: '[test]',
      renderText: (item) => item.id,
      publishOne: async (item) => {
        if (item.id === 'b') throw new Error('network blip');
      },
      onSuccess: async (item) => {
        successIds.push(item.id);
      },
    });

    assert.strictEqual(successes, 2);
    assert.deepStrictEqual(successIds, ['a', 'c']);
  });

  it('does not call publishOne in dry-run mode but still calls onSuccess', async () => {
    let publishCalls = 0;
    const successIds = [];
    const items = [{ id: 'a' }, { id: 'b' }];

    const successes = await postBatch({
      items,
      dryRun: true,
      logPrefix: '[test]',
      renderText: (item) => item.id,
      publishOne: async () => {
        publishCalls += 1;
      },
      onSuccess: async (item) => {
        successIds.push(item.id);
      },
    });

    assert.strictEqual(publishCalls, 0);
    assert.strictEqual(successes, 2);
    assert.deepStrictEqual(successIds, ['a', 'b']);
  });

  it('returns 0 successes when items is empty (no publishOne or onSuccess calls)', async () => {
    let publishCalls = 0;
    let successCalls = 0;
    const successes = await postBatch({
      items: [],
      dryRun: false,
      logPrefix: '[test]',
      renderText: () => '',
      publishOne: async () => {
        publishCalls += 1;
      },
      onSuccess: async () => {
        successCalls += 1;
      },
    });

    assert.strictEqual(successes, 0);
    assert.strictEqual(publishCalls, 0);
    assert.strictEqual(successCalls, 0);
  });

  it('uses a custom errorLog when publish fails, so callers preserve their original wording', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    try {
      await postBatch({
        items: [{ id: 'a' }],
        dryRun: false,
        logPrefix: '[bot-x]',
        renderText: (item) => item.id,
        publishOne: async () => {
          throw new Error('boom');
        },
        onSuccess: async () => {},
        errorLog: (item) => `failed to announce event ${item.id}`,
      });
      assert.strictEqual(errorMock.mock.callCount(), 1);
      assert.strictEqual(
        errorMock.mock.calls[0].arguments[0],
        '[bot-x] failed to announce event a'
      );
    } finally {
      errorMock.mock.restore();
    }
  });

  it('falls back to the default error wording when errorLog is not provided', async () => {
    const errorMock = mock.method(console, 'error', () => {});
    try {
      await postBatch({
        items: [{ id: 'a' }],
        dryRun: false,
        logPrefix: '[bot-x]',
        renderText: (item) => item.id,
        publishOne: async () => {
          throw new Error('boom');
        },
        onSuccess: async () => {},
      });
      assert.strictEqual(errorMock.mock.calls[0].arguments[0], '[bot-x] failed to post for item a');
    } finally {
      errorMock.mock.restore();
    }
  });

  it('uses a custom dryRunVerb in the dry-run log, so callers preserve their original wording', async () => {
    const logMock = mock.method(console, 'log', () => {});
    try {
      await postBatch({
        items: [{ id: 'a' }],
        dryRun: true,
        logPrefix: '[bot-x]',
        renderText: (item) => `text-${item.id}`,
        publishOne: async () => {},
        onSuccess: async () => {},
        dryRunVerb: 'reply',
      });
      assert.strictEqual(
        logMock.mock.calls[0].arguments[0],
        '[bot-x] DRY RUN — would reply: text-a'
      );
    } finally {
      logMock.mock.restore();
    }
  });

  it('defaults dryRunVerb to "post" when not provided', async () => {
    const logMock = mock.method(console, 'log', () => {});
    try {
      await postBatch({
        items: [{ id: 'a' }],
        dryRun: true,
        logPrefix: '[bot-x]',
        renderText: (item) => `text-${item.id}`,
        publishOne: async () => {},
        onSuccess: async () => {},
      });
      assert.strictEqual(
        logMock.mock.calls[0].arguments[0],
        '[bot-x] DRY RUN — would post: text-a'
      );
    } finally {
      logMock.mock.restore();
    }
  });
});

describe('persistAnnounced', () => {
  it('appends the id to the correct kind and persists the result', async () => {
    const botStateStore = createFakeStore();
    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };

    const updated = await persistAnnounced({
      state,
      botStateStore,
      kind: 'new',
      eventId: 'x',
    });

    assert.deepStrictEqual(updated.announced.new, ['x']);
    assert.deepStrictEqual(updated.announced.cancelled, []);
    const persisted = await getBotState(botStateStore);
    assert.deepStrictEqual(persisted.announced.new, ['x']);
  });

  it('is idempotent — a second call with the same id does not double-append', async () => {
    const botStateStore = createFakeStore();
    let state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };

    state = await persistAnnounced({ state, botStateStore, kind: 'cancelled', eventId: 'y' });
    state = await persistAnnounced({ state, botStateStore, kind: 'cancelled', eventId: 'y' });

    assert.deepStrictEqual(state.announced.cancelled, ['y']);
  });

  it('does not mutate the input state', async () => {
    const botStateStore = createFakeStore();
    const state = {
      lastSnapshot: {},
      announced: { new: [], cancelled: [] },
      lastDailyRunAtMs: 0,
      lastWeeklyTargetSunday: null,
    };

    await persistAnnounced({ state, botStateStore, kind: 'new', eventId: 'x' });

    assert.deepStrictEqual(state.announced.new, []);
  });
});
