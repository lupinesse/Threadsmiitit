/**
 * Unit tests for netlify/functions/lib/eventsStore.mjs — run with Node's
 * built-in test runner as part of `npm test`. Every test injects the
 * in-memory fake store from test/fakes/blobsStore.mjs, so nothing here
 * touches real Netlify Blobs or requires `netlify dev`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEvent,
  updateEvent,
  moderateEvent,
  cancelEvent,
  getEvent,
  listAllEvents,
  listVisibleEvents,
  listPendingEvents,
  listOwnedEvents,
} from '../netlify/functions/lib/eventsStore.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

const addedBy = {
  id: '1',
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

describe('createEvent', () => {
  it('creates a pending event with a generated id, round-trippable via getEvent', async () => {
    const store = createFakeStore();
    const result = await createEvent(validPartial, addedBy, store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.status, 'pending');
    assert.strictEqual(result.event.title, 'Threads-kahvit');
    assert.strictEqual(result.event.addedBy.username, 'submitter');
    assert.strictEqual(result.event.id.length, 4);

    const fetched = await getEvent(result.event.id, store);
    // JSON round-tripping through Blobs drops explicit `undefined` keys (e.g. area),
    // so compare against a JSON-normalised copy rather than the raw in-memory object.
    assert.deepStrictEqual(fetched, JSON.parse(JSON.stringify(result.event)));
  });

  it('rejects a payload missing a title', async () => {
    const store = createFakeStore();
    const result = await createEvent({ ...validPartial, title: '' }, addedBy, store);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /title/);
  });

  it('rejects an invalid date shape', async () => {
    const store = createFakeStore();
    const result = await createEvent({ ...validPartial, date: '1.8.2026' }, addedBy, store);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /date/);
  });

  it('rejects a url that is not a Threads link', async () => {
    const store = createFakeStore();
    const result = await createEvent(
      { ...validPartial, url: 'https://evil.example/x' },
      addedBy,
      store
    );
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /url/);
  });

  it('stores a trimmed, length-capped catSuggestion alongside the resolved cat', async () => {
    const store = createFakeStore();
    const longSuggestion = '  ' + 'a'.repeat(60) + '  ';
    const result = await createEvent(
      { ...validPartial, catSuggestion: longSuggestion },
      addedBy,
      store
    );
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.cat, 'yleinen');
    assert.strictEqual(result.event.catSuggestion, 'a'.repeat(40));
  });

  it('omits catSuggestion entirely when not supplied', async () => {
    const store = createFakeStore();
    const result = await createEvent(validPartial, addedBy, store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual('catSuggestion' in result.event, false);
  });

  it('omits catSuggestion when it is only whitespace', async () => {
    const store = createFakeStore();
    const result = await createEvent({ ...validPartial, catSuggestion: '   ' }, addedBy, store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual('catSuggestion' in result.event, false);
  });

  it('coerces a non-string catSuggestion instead of rejecting the submission', async () => {
    const store = createFakeStore();
    const result = await createEvent({ ...validPartial, catSuggestion: 42 }, addedBy, store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.catSuggestion, '42');
  });

  it('generates unique ids across repeated calls', async () => {
    const store = createFakeStore();
    const a = await createEvent(validPartial, addedBy, store);
    const b = await createEvent({ ...validPartial, title: 'Toinen' }, addedBy, store);
    assert.notStrictEqual(a.event.id, b.event.id);
  });

  it('retries with a fresh id instead of overwriting on a write collision', async () => {
    // Regression: createEvent used to check-then-act (list ids, then plain
    // set()) with no protection against two writers racing for the same id.
    // Simulates a real Blobs onlyIfNew conflict on the first attempt only —
    // the real fake store's own collision path is exercised separately below.
    let attempts = 0;
    const collidingStore = {
      async get(key) {
        return this._map?.get(key) ?? null;
      },
      async set(key, value, opts) {
        attempts++;
        if (attempts === 1 && opts?.onlyIfNew) return {}; // first attempt "loses" the race
        (this._map ??= new Map()).set(key, value);
        return { etag: 'fake-etag' };
      },
      async delete() {},
      async list() {
        return { blobs: [] };
      },
    };

    const result = await createEvent(validPartial, addedBy, collidingStore);
    assert.strictEqual(result.ok, true);
    assert.ok(attempts >= 2, 'should have retried after the first write was rejected');
  });

  it('does not let a second submission silently overwrite the first on an id collision', async () => {
    const store = createFakeStore();
    const first = await createEvent(validPartial, addedBy, store);

    // Force a collision on the very next write attempt regardless of id.
    const realSet = store.set.bind(store);
    let forcedCollision = false;
    store.set = async (key, value, opts) => {
      if (!forcedCollision && opts?.onlyIfNew) {
        forcedCollision = true;
        return {}; // simulate another writer claiming this id first
      }
      return realSet(key, value, opts);
    };

    const second = await createEvent({ ...validPartial, title: 'Toinen' }, addedBy, store);
    assert.strictEqual(second.ok, true);
    assert.notStrictEqual(second.event.id, first.event.id);

    // The first event must still be intact — not overwritten.
    const stillThere = await getEvent(first.event.id, store);
    assert.strictEqual(stillThere.title, 'Threads-kahvit');
  });
});

describe('updateEvent', () => {
  it('preserves id, submitted, and addedBy while applying the patch', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const updated = await updateEvent(created.event, { title: 'Uusi otsikko' }, store);
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.event.id, created.event.id);
    assert.strictEqual(updated.event.submitted, created.event.submitted);
    assert.deepStrictEqual(updated.event.addedBy, addedBy);
    assert.strictEqual(updated.event.title, 'Uusi otsikko');
  });

  it('resets a rejected event to pending and clears the review fields', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const rejected = await moderateEvent(created.event.id, 'reject', 'Ei linkkiä', store);

    const edited = await updateEvent(rejected.event, { title: 'Korjattu' }, store);
    assert.strictEqual(edited.ok, true);
    assert.strictEqual(edited.event.status, 'pending');
    assert.strictEqual(edited.event.reviewedAt, undefined);
    assert.strictEqual(edited.event.rejectReason, undefined);
  });

  it('keeps an approved event approved when merely edited', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const approved = await moderateEvent(created.event.id, 'approve', undefined, store);

    const edited = await updateEvent(approved.event, { title: 'Korjattu' }, store);
    assert.strictEqual(edited.event.status, 'approved');
  });

  it('refuses to edit a cancelled event — cancellation is terminal', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const approved = await moderateEvent(created.event.id, 'approve', undefined, store);
    const cancelled = await cancelEvent(approved.event, 'submitter', store);

    const edited = await updateEvent(cancelled.event, { title: 'Yritys elvyttää' }, store);
    assert.strictEqual(edited.ok, false);

    const stillCancelled = await getEvent(created.event.id, store);
    assert.strictEqual(stillCancelled.status, 'cancelled');
    assert.strictEqual(stillCancelled.title, 'Threads-kahvit');
  });
});

describe('cancelEvent', () => {
  it('cancels an approved event, recording who and when', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const approved = await moderateEvent(created.event.id, 'approve', undefined, store);

    const result = await cancelEvent(approved.event, 'submitter', store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.status, 'cancelled');
    assert.strictEqual(result.event.cancelledBy, 'submitter');
    assert.strictEqual(typeof result.event.cancelledAt, 'number');
  });

  // Table-driven: every non-approved status must refuse cancellation.
  for (const status of ['pending', 'rejected']) {
    it(`refuses to cancel a "${status}" event`, async () => {
      const store = createFakeStore();
      const created = await createEvent(validPartial, addedBy, store);
      const existing =
        status === 'pending'
          ? created.event
          : (await moderateEvent(created.event.id, 'reject', undefined, store)).event;

      const result = await cancelEvent(existing, 'submitter', store);
      assert.strictEqual(result.ok, false);
    });
  }

  it('refuses to cancel an already-cancelled event — cancelling is terminal', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const approved = await moderateEvent(created.event.id, 'approve', undefined, store);
    const cancelled = await cancelEvent(approved.event, 'submitter', store);

    const result = await cancelEvent(cancelled.event, 'submitter', store);
    assert.strictEqual(result.ok, false);
  });
});

describe('moderateEvent', () => {
  it('approves a pending event and records reviewedAt', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const result = await moderateEvent(created.event.id, 'approve', undefined, store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.status, 'approved');
    assert.strictEqual(typeof result.event.reviewedAt, 'number');
  });

  it('rejects a pending event and caps the reason at 120 chars', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const longReason = 'x'.repeat(200);
    const result = await moderateEvent(created.event.id, 'reject', longReason, store);
    assert.strictEqual(result.event.status, 'rejected');
    assert.strictEqual(result.event.rejectReason.length, 120);
  });

  it('rejects an invalid action', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const result = await moderateEvent(created.event.id, 'delete', undefined, store);
    assert.strictEqual(result.ok, false);
  });

  it('returns not_found for an unknown id', async () => {
    const store = createFakeStore();
    const result = await moderateEvent('zzzz', 'approve', undefined, store);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'not_found');
  });
});

describe('listVisibleEvents', () => {
  it('includes every approved event regardless of owner', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    await moderateEvent(created.event.id, 'approve', undefined, store);

    const visible = await listVisibleEvents({ username: 'someone-else' }, store);
    assert.strictEqual(visible.length, 1);
    assert.strictEqual(visible[0].status, 'approved');
  });

  it("includes the caller's own pending submission but hides others' pending submissions", async () => {
    const store = createFakeStore();
    const mine = await createEvent(validPartial, addedBy, store);
    await createEvent({ ...validPartial, title: 'Muun' }, { ...addedBy, username: 'other' }, store);

    const visible = await listVisibleEvents({ username: 'submitter' }, store);
    assert.strictEqual(visible.length, 1);
    assert.strictEqual(visible[0].id, mine.event.id);
  });

  it('always hides rejected events from the public feed', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    await moderateEvent(created.event.id, 'reject', undefined, store);

    const visible = await listVisibleEvents({ username: 'submitter' }, store);
    assert.strictEqual(visible.length, 0);
  });

  it('keeps a cancelled event visible (flagged) rather than hiding it', async () => {
    const store = createFakeStore();
    const created = await createEvent(validPartial, addedBy, store);
    const approved = await moderateEvent(created.event.id, 'approve', undefined, store);
    await cancelEvent(approved.event, 'submitter', store);

    const visible = await listVisibleEvents({ username: 'someone-else' }, store);
    assert.strictEqual(visible.length, 1);
    assert.strictEqual(visible[0].status, 'cancelled');
  });
});

describe('listPendingEvents', () => {
  it('returns only pending events, sorted oldest first', async () => {
    const store = createFakeStore();
    const first = await createEvent(validPartial, addedBy, store);
    const second = await createEvent({ ...validPartial, title: 'Toinen' }, addedBy, store);
    await moderateEvent(second.event.id, 'approve', undefined, store);
    const third = await createEvent({ ...validPartial, title: 'Kolmas' }, addedBy, store);

    const pending = await listPendingEvents(store);
    assert.deepStrictEqual(
      pending.map((e) => e.id),
      [first.event.id, third.event.id]
    );
  });
});

describe('listOwnedEvents', () => {
  it('returns every submission by a user regardless of status', async () => {
    const store = createFakeStore();
    const approved = await createEvent(validPartial, addedBy, store);
    await moderateEvent(approved.event.id, 'approve', undefined, store);
    const rejected = await createEvent({ ...validPartial, title: 'Toinen' }, addedBy, store);
    await moderateEvent(rejected.event.id, 'reject', undefined, store);
    await createEvent({ ...validPartial, title: 'Muun' }, { ...addedBy, username: 'other' }, store);

    const owned = await listOwnedEvents('submitter', store);
    assert.strictEqual(owned.length, 2);
    assert.deepStrictEqual(
      owned.map((e) => e.id).sort(),
      [approved.event.id, rejected.event.id].sort()
    );
  });
});

describe('listAllEvents', () => {
  it('returns every stored event across all statuses', async () => {
    const store = createFakeStore();
    await createEvent(validPartial, addedBy, store);
    await createEvent({ ...validPartial, title: 'Toinen' }, addedBy, store);
    const all = await listAllEvents(store);
    assert.strictEqual(all.length, 2);
  });
});
