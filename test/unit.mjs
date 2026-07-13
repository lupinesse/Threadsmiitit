/**
 * Unit tests — run with Node's built-in test runner: `npm test`
 *
 * Tests cover pure-function helpers from src/data.js and the normalisation
 * logic in src/store/EventStore.js. No DOM or localStorage required here
 * because we test only the stateless helpers; the store's persistence layer
 * is exercised via integration tests.
 *
 * NOTE: We stub out localStorage before importing EventStore because Node.js
 * does not provide it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── localStorage stub ───────────────────────────────────────────────────────
// EventStore reads/writes localStorage on module load and in every call.
// Provide a minimal in-memory implementation so the import succeeds.
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null),
  setItem: (k, v) => {
    _store[k] = String(v);
  },
  removeItem: (k) => {
    delete _store[k];
  },
  clear: () => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  },
};

// ── DH helpers ──────────────────────────────────────────────────────────────

const { DH, CITIES, CATEGORIES, MEETUPS } = await import('../src/data.js');
const { normCatSuggestion, CAT_SUGGESTION_MAX_LEN } = await import('../shared/eventFields.mjs');

describe('DH.parse', () => {
  it('parses YYYY-MM-DD to a local Date', () => {
    const d = DH.parse('2026-06-24');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 5); // 0-indexed
    assert.strictEqual(d.getDate(), 24);
  });
});

describe('DH.todayStr', () => {
  it('returns a string matching YYYY-MM-DD', () => {
    assert.match(DH.todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('DH.daysBetween', () => {
  it('returns 0 for the same date', () => {
    assert.strictEqual(DH.daysBetween('2026-04-01', '2026-04-01'), 0);
  });

  it('returns positive for a future date', () => {
    assert.strictEqual(DH.daysBetween('2026-04-01', '2026-04-04'), 3);
  });

  it('returns negative for a past date', () => {
    assert.strictEqual(DH.daysBetween('2026-04-04', '2026-04-01'), -3);
  });
});

describe('DH.weekdayFi', () => {
  it('returns MA for Monday 2026-06-22', () => {
    assert.strictEqual(DH.weekdayFi('2026-06-22'), 'MA');
  });

  it('returns SU for Sunday 2026-06-28', () => {
    assert.strictEqual(DH.weekdayFi('2026-06-28'), 'SU');
  });

  it('returns PE for Friday 2026-04-03', () => {
    assert.strictEqual(DH.weekdayFi('2026-04-03'), 'PE');
  });
});

describe('DH.fmtShort', () => {
  it('formats as D.M.', () => {
    assert.strictEqual(DH.fmtShort('2026-03-05'), '5.3.');
  });

  it('does not zero-pad day or month', () => {
    assert.strictEqual(DH.fmtShort('2026-01-07'), '7.1.');
  });
});

describe('DH.fmtLong', () => {
  it('produces a Finnish weekday + date string', () => {
    const result = DH.fmtLong('2026-06-22');
    assert.ok(result.startsWith('maanantai'), `expected maanantai, got: ${result}`);
    assert.ok(result.includes('22.'), `expected day 22, got: ${result}`);
    assert.ok(result.includes('kesäkuuta'), `expected kesäkuuta, got: ${result}`);
  });
});

describe('DH.monthKey', () => {
  it('returns year-month index string', () => {
    assert.strictEqual(DH.monthKey('2026-03-15'), '2026-2'); // March = index 2
  });
});

describe('DH.monthLabel', () => {
  it('returns Finnish month name and year', () => {
    assert.strictEqual(DH.monthLabel('2026-01-01'), 'tammikuu 2026');
    assert.strictEqual(DH.monthLabel('2026-12-31'), 'joulukuu 2026');
  });
});

describe('DH.isThisWeek', () => {
  it('returns false for a date 8 days away', () => {
    const future = DH.parse(DH.todayStr());
    future.setDate(future.getDate() + 8);
    // Format as local date (not UTC) to avoid timezone drift.
    const y = future.getFullYear();
    const mo = String(future.getMonth() + 1).padStart(2, '0');
    const d = String(future.getDate()).padStart(2, '0');
    const iso = `${y}-${mo}-${d}`;
    assert.strictEqual(DH.isThisWeek(iso), false);
  });
});

// ── Seed data integrity ─────────────────────────────────────────────────────
// The MEETUPS seed list is hand-maintained (synced from the Threadsmiitit
// website), so these invariants guard against typos: a meetup that references
// a non-existent city key or category key would render with a broken lookup.

describe('MEETUPS seed integrity', () => {
  const cityKeys = new Set(CITIES.map((c) => c.key));
  const catKeys = new Set(Object.keys(CATEGORIES));

  it('every meetup references a known city key', () => {
    const unknown = MEETUPS.filter((m) => !cityKeys.has(m.city)).map((m) => m.title);
    assert.deepStrictEqual(unknown, [], `meetups with unknown city: ${unknown.join(', ')}`);
  });

  it('every meetup references a known category key', () => {
    const unknown = MEETUPS.filter((m) => !catKeys.has(m.cat)).map((m) => m.title);
    assert.deepStrictEqual(unknown, [], `meetups with unknown category: ${unknown.join(', ')}`);
  });

  it('every meetup date is a valid YYYY-MM-DD string', () => {
    const bad = MEETUPS.filter((m) => !/^\d{4}-\d{2}-\d{2}$/.test(m.date)).map((m) => m.title);
    assert.deepStrictEqual(bad, [], `meetups with malformed date: ${bad.join(', ')}`);
  });

  it('every meetup has at least one @-prefixed organiser handle', () => {
    const bad = MEETUPS.filter(
      (m) => !Array.isArray(m.org) || m.org.length === 0 || m.org.some((h) => !h.startsWith('@'))
    ).map((m) => m.title);
    assert.deepStrictEqual(bad, [], `meetups with invalid org: ${bad.join(', ')}`);
  });

  it('every meetup url is empty or a threads.com/threads.net link', () => {
    const bad = MEETUPS.filter(
      (m) => m.url !== '' && !/^https?:\/\/(www\.)?threads\.(com|net)\//i.test(m.url)
    ).map((m) => m.title);
    assert.deepStrictEqual(bad, [], `meetups with non-Threads url: ${bad.join(', ')}`);
  });

  it('every city key is unique', () => {
    assert.strictEqual(new Set(CITIES.map((c) => c.key)).size, CITIES.length);
  });
});

// ── useDragScroll helpers ────────────────────────────────────────────────────

const { dragScrollLeft, isDrag, DRAG_THRESHOLD_PX } = await import('../src/hooks/useDragScroll.js');

describe('dragScrollLeft', () => {
  it('scrolls content left when the pointer is dragged right', () => {
    // Dragging right by 30px from scrollLeft 100 → 70.
    assert.strictEqual(dragScrollLeft(100, 200, 230), 70);
  });

  it('scrolls content right when the pointer is dragged left', () => {
    assert.strictEqual(dragScrollLeft(100, 200, 170), 130);
  });

  it('returns the start position when the pointer has not moved', () => {
    assert.strictEqual(dragScrollLeft(100, 200, 200), 100);
  });
});

describe('isDrag', () => {
  it('is false below the threshold', () => {
    assert.strictEqual(isDrag(DRAG_THRESHOLD_PX - 1), false);
  });

  it('is true at the threshold', () => {
    assert.strictEqual(isDrag(DRAG_THRESHOLD_PX), true);
  });

  it('treats negative movement by magnitude', () => {
    assert.strictEqual(isDrag(-(DRAG_THRESHOLD_PX + 5)), true);
  });

  it('respects a custom threshold', () => {
    assert.strictEqual(isDrag(10, 20), false);
    assert.strictEqual(isDrag(20, 20), true);
  });
});

// ── EventStore normalisation ────────────────────────────────────────────────

const EventStore = (await import('../src/store/EventStore.js')).default;

describe('EventStore.normalize', () => {
  it('normalises a DD.MM.YYYY date to YYYY-MM-DD', () => {
    const result = EventStore.normalize({
      title: 'Test',
      date: '05.06.2026',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@foo',
      url: 'https://www.threads.com/foo',
    });
    assert.strictEqual(result.date, '2026-06-05');
  });

  it('resolves city name to city key', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'Tampere',
      cat: 'yleinen',
      org: '@foo',
      url: 'https://www.threads.com/foo',
    });
    assert.strictEqual(result.city, 'tampere');
  });

  it('falls back to yleinen for unknown category', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'doesnotexist',
      org: '@foo',
      url: 'https://www.threads.com/foo',
    });
    assert.strictEqual(result.cat, 'yleinen');
  });

  it('resolves karaoke category key', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'karaoke',
      org: '@foo',
      url: '',
    });
    assert.strictEqual(result.cat, 'karaoke');
  });

  it('prepends @ to org handle if missing', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: 'noat',
      url: '',
    });
    assert.ok(result.org[0].startsWith('@'), `expected @ prefix, got: ${result.org[0]}`);
  });

  it('accepts array of org handles', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: ['@foo', '@bar'],
      url: '',
    });
    assert.strictEqual(result.org.length, 2);
  });

  it('truncates title to 80 chars', () => {
    const long = 'a'.repeat(100);
    const result = EventStore.normalize({
      title: long,
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: '',
    });
    assert.strictEqual(result.title.length, 80);
  });

  it('rejects invalid urls', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://notthreads.com/foo',
    });
    assert.strictEqual(result.url, '');
  });

  it('passes through a trimmed catSuggestion without resolving it against CATEGORIES', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      catSuggestion: '  Lautapelit  ',
      org: '@x',
      url: '',
    });
    assert.strictEqual(result.catSuggestion, 'Lautapelit');
    assert.strictEqual(result.cat, 'yleinen');
  });

  it('omits catSuggestion when not supplied', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: '',
    });
    assert.strictEqual('catSuggestion' in result, false);
  });
});

describe('normCatSuggestion', () => {
  it('trims surrounding whitespace', () => {
    assert.strictEqual(normCatSuggestion('  Lautapelit  '), 'Lautapelit');
  });

  it('caps length at CAT_SUGGESTION_MAX_LEN', () => {
    const long = 'a'.repeat(60);
    assert.strictEqual(normCatSuggestion(long).length, CAT_SUGGESTION_MAX_LEN);
  });

  it('returns empty string for missing input', () => {
    assert.strictEqual(normCatSuggestion(undefined), '');
    assert.strictEqual(normCatSuggestion(''), '');
    assert.strictEqual(normCatSuggestion('   '), '');
  });
});

// ── EventStore's server-backed async methods ────────────────────────────────
// EventStore.js is now a thin fetch client — the actual store/visibility
// logic these tests used to exercise directly now lives server-side and is
// covered by test/events-store.unit.mjs and test/events-functions.unit.mjs.
// These tests only need to confirm EventStore calls the right endpoint with
// the right method/body, and translates fetch responses into the
// {ok, ...}/{ok:false, error} shape correctly — using mocked fetch, the same
// pattern already used for callAnthropic below. Anonymous submission is
// rejected server-side (401 from requireUser) rather than by a client-side
// throw, so there's no client-side "anonymous submission" test here anymore
// — see test/events-functions.unit.mjs's 401 cases for that guard.

/**
 * Mocks globalThis.fetch to return a canned JSON response for this test only
 * (Node's test runner auto-restores the mock after the test completes) and
 * captures the request it was called with.
 * @param {import('node:test').TestContext} t
 * @param {object} body
 * @param {number} [status=200]
 * @returns {{calls: Array<{url:string, opts:object}>}}
 */
function mockFetchOnce(t, body, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  return calls;
}

describe('EventStore.add', () => {
  it('POSTs the normalised payload to /api/events', async (t) => {
    const event = { id: 'ab12', status: 'pending' };
    const calls = mockFetchOnce(t, { event }, 201);
    const result = await EventStore.add({
      title: 'Uusi miitti',
      date: '05.06.2026',
      city: 'Helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-add',
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.event, event);
    assert.strictEqual(calls[0].url, '/api/events');
    assert.strictEqual(calls[0].opts.method, 'POST');
    const sentBody = JSON.parse(calls[0].opts.body);
    assert.strictEqual(sentBody.date, '2026-06-05'); // normalised before send
    assert.strictEqual(sentBody.city, 'helsinki');
  });

  it('surfaces a server-provided error message on failure', async (t) => {
    mockFetchOnce(t, { error: 'title is required' }, 400);
    const result = await EventStore.add({ title: '', date: '2026-06-01', city: 'helsinki' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'title is required');
  });

  it('returns a generic error on a network failure', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline');
    });
    const result = await EventStore.add({ title: 'x', date: '2026-06-01', city: 'helsinki' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /Verkkovirhe/);
  });

  it('returns ok:false for an unauthenticated caller', async (t) => {
    mockFetchOnce(t, { error: 'Unauthorized' }, 401);
    const result = await EventStore.add({ title: 'x', date: '2026-06-01', city: 'helsinki' });
    assert.strictEqual(result.ok, false);
  });
});

describe('EventStore.edit', () => {
  it('PATCHes /api/events with the id as a query param', async (t) => {
    const calls = mockFetchOnce(t, { event: { id: 'ab12', title: 'Päivitetty' } });
    const result = await EventStore.edit('ab12', { title: 'Päivitetty' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls[0].url, '/api/events?id=ab12');
    assert.strictEqual(calls[0].opts.method, 'PATCH');
  });

  it('returns ok:false for an unknown id', async (t) => {
    mockFetchOnce(t, { error: 'not_found' }, 404);
    const result = await EventStore.edit('zzzz', { title: 'x' });
    assert.strictEqual(result.ok, false);
  });
});

describe('EventStore.remove', () => {
  it('DELETEs /api/events with the id as a query param', async (t) => {
    const calls = mockFetchOnce(t, { ok: true });
    const result = await EventStore.remove('ab12');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(calls[0].url, '/api/events?id=ab12');
    assert.strictEqual(calls[0].opts.method, 'DELETE');
  });
});

describe('EventStore.approve / reject', () => {
  it('approve() POSTs {action: "approve"} to /api/events/moderate', async (t) => {
    const calls = mockFetchOnce(t, { event: { id: 'ab12', status: 'approved' } });
    const result = await EventStore.approve('ab12');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.event.status, 'approved');
    assert.strictEqual(calls[0].url, '/api/events/moderate?id=ab12');
    assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { action: 'approve' });
  });

  it('reject() POSTs {action: "reject", reason} to /api/events/moderate', async (t) => {
    const calls = mockFetchOnce(t, { event: { id: 'ab12', status: 'rejected' } });
    const result = await EventStore.reject('ab12', 'Ei sovi');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { action: 'reject', reason: 'Ei sovi' });
  });

  it('returns ok:false for an unauthorised caller', async (t) => {
    mockFetchOnce(t, { error: 'Forbidden' }, 403);
    const result = await EventStore.approve('ab12');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'Forbidden');
  });
});

describe('EventStore.pending', () => {
  it('GETs /api/events/pending', async (t) => {
    const events = [{ id: 'a' }, { id: 'b' }];
    const calls = mockFetchOnce(t, { events });
    const result = await EventStore.pending();
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.events, events);
    assert.strictEqual(calls[0].url, '/api/events/pending');
  });
});

describe('EventStore.ownedBy', () => {
  it('returns an empty list without a network call when no username is given', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('should not be called');
    });
    assert.deepStrictEqual(await EventStore.ownedBy(''), { ok: true, events: [] });
    assert.deepStrictEqual(await EventStore.ownedBy(undefined), { ok: true, events: [] });
  });

  it('GETs /api/events/mine when a username is given', async (t) => {
    const events = [{ id: 'a', status: 'rejected' }];
    const calls = mockFetchOnce(t, { events });
    const result = await EventStore.ownedBy('omistaja');
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.events, events);
    assert.strictEqual(calls[0].url, '/api/events/mine');
  });
});

describe('EventStore.all', () => {
  it('merges the server response with the local seed MEETUPS', async (t) => {
    const serverEvents = [{ id: 'a', status: 'approved' }];
    mockFetchOnce(t, { events: serverEvents });
    const result = await EventStore.all();
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.events, MEETUPS.concat(serverEvents));
  });

  it('returns ok:false on failure without touching MEETUPS', async (t) => {
    mockFetchOnce(t, { error: 'boom' }, 500);
    const result = await EventStore.all();
    assert.strictEqual(result.ok, false);
  });
});

describe('EventStore.favKey', () => {
  it('returns id for user-added meetups', () => {
    assert.strictEqual(EventStore.favKey({ id: 'ab12', title: 'T', date: '2026-06-01' }), 'ab12');
  });

  it('returns title|date composite for seed meetups without id', () => {
    assert.strictEqual(
      EventStore.favKey({ title: 'Miitti', date: '2026-06-01' }),
      'Miitti|2026-06-01'
    );
  });

  it('gives distinct keys for two seed meetups on the same date', () => {
    const k1 = EventStore.favKey({ title: 'Miitti A', date: '2026-06-01' });
    const k2 = EventStore.favKey({ title: 'Miitti B', date: '2026-06-01' });
    assert.notStrictEqual(k1, k2);
  });

  it('gives distinct keys for two seed meetups with empty url', () => {
    const k1 = EventStore.favKey({ title: 'Foo', date: '2026-06-01', url: '' });
    const k2 = EventStore.favKey({ title: 'Bar', date: '2026-06-01', url: '' });
    assert.notStrictEqual(k1, k2);
  });
});

// ── "Tällä viikolla" (this-week) rail React keys ────────────────────────────
// Regression for a bug where WeekCard in ScreenMiitit was keyed with raw
// `m.id`. Seed meetups (from MEETUPS in src/data.js) have no `id`, so every
// seed meetup in the this-week rail produced `key={undefined}`, causing React
// "duplicate key" warnings — and stale DOM reuse — whenever two or more seed
// meetups fell in the current week at once. The fix keys WeekCard with
// EventStore.favKey(m), the same stable-key convention used for favourites.

describe('this-week rail keys (regression: undefined keys for seed meetups)', () => {
  /** Fixture: several seed meetups (no `id`) that would all land in the same
   * this-week rail — some sharing a date, mirroring real seed data. */
  const weekMeetups = [
    { title: 'Miitti A', date: '2026-06-22', city: 'helsinki', cat: 'yleinen' },
    { title: 'Miitti B', date: '2026-06-24', city: 'helsinki', cat: 'karaoke' },
    { title: 'Miitti C', date: '2026-06-24', city: 'tampere', cat: 'sauna' },
  ];

  it('raw m.id would collide as undefined for every seed meetup (the bug)', () => {
    const rawKeys = weekMeetups.map((m) => m.id);
    assert.deepStrictEqual(rawKeys, [undefined, undefined, undefined]);
  });

  it('EventStore.favKey gives every seed meetup a defined key (the fix)', () => {
    const keys = weekMeetups.map((m) => EventStore.favKey(m));
    assert.ok(
      keys.every((k) => k !== undefined),
      `expected no undefined keys, got: ${keys}`
    );
  });

  it('EventStore.favKey gives distinct keys even when meetups share a date', () => {
    const keys = weekMeetups.map((m) => EventStore.favKey(m));
    assert.strictEqual(new Set(keys).size, keys.length, `expected unique keys, got: ${keys}`);
  });
});

// ── Regression: MeetupCard/list-item React keys ─────────────────────────────
// Seed meetups (from MEETUPS) have no `id` field, so any list that keyed its
// items with `m.id` produced `key={undefined}` for every seed meetup, and a
// duplicate-key warning as soon as more than one seed meetup appeared in the
// same list. ScreenMiitit's "Tällä viikolla" rail was fixed to key on
// EventStore.favKey(m) instead; these tests guard the same fix in the other
// four lists that render seed meetups: SubMenneet (ScreenInfo), SubKaraoke
// (ScreenInfo), the calendar day-detail list (ScreenKalenteri), and the main
// grouped meetup list (ScreenMiitit).

describe('regression: list keys for seed-only meetups (no id field)', () => {
  /** Formats today +/- `offsetDays` as a local YYYY-MM-DD string (avoids timezone drift). */
  function isoOffsetFromToday(offsetDays) {
    const d = DH.parse(DH.todayStr());
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  const pastDate = isoOffsetFromToday(-30);
  const futureDate = isoOffsetFromToday(30);

  /** A stand-in for two-or-more MEETUPS entries — no `id`, like real seed data. */
  const seedFixture = [
    { title: 'Karaokeklubi', date: pastDate, city: 'helsinki', cat: 'karaoke', url: '' },
    { title: 'Yleismiitti Tampereella', date: pastDate, city: 'tampere', cat: 'yleinen', url: '' },
    { title: 'Toinen karaokeklubi', date: futureDate, city: 'oulu', cat: 'karaoke', url: '' },
    { title: 'Kolmas karaokeklubi', date: futureDate, city: 'turku', cat: 'karaoke', url: '' },
  ];

  /** Asserts that mapping `EventStore.favKey` over `list` yields unique, defined React keys. */
  function assertUniqueDefinedKeys(list) {
    const keys = list.map((m) => EventStore.favKey(m));
    assert.ok(
      keys.every((k) => k !== undefined),
      `expected no undefined keys, got: ${JSON.stringify(keys)}`
    );
    assert.strictEqual(
      new Set(keys).size,
      keys.length,
      `expected all keys unique, got: ${JSON.stringify(keys)}`
    );
  }

  it('SubMenneet (ScreenInfo) past-events list: same past date, two seed meetups', () => {
    // Mirrors ScreenInfo's SubMenneet: filter to past dates, sort desc by date.
    const past = seedFixture
      .filter((m) => !DH.isUpcoming(m.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    assert.strictEqual(past.length, 2, 'fixture should contain two past seed meetups');
    assertUniqueDefinedKeys(past);
  });

  it('SubKaraoke (ScreenInfo) list: same future date, two seed karaoke meetups', () => {
    // Mirrors ScreenInfo's SubKaraoke: filter to karaoke + upcoming, sort asc by date.
    const upcoming = seedFixture
      .filter((m) => m.cat === 'karaoke' && DH.isUpcoming(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    assert.strictEqual(upcoming.length, 2, 'fixture should contain two upcoming karaoke meetups');
    assertUniqueDefinedKeys(upcoming);
  });

  it('calendar day-detail list (ScreenKalenteri): two seed meetups on the same day', () => {
    // Mirrors ScreenKalenteri's byDay grouping: all meetups falling on one calendar day.
    const selMeetups = seedFixture.filter((m) => m.date === pastDate);
    assert.strictEqual(selMeetups.length, 2, 'fixture should contain two meetups on the same day');
    assertUniqueDefinedKeys(selMeetups);
  });

  it('main grouped meetup list (ScreenMiitit): a date group with two seed meetups', () => {
    // Mirrors ScreenMiitit's byMonth/byCity grouping: items within a single group.
    const byMonth = {};
    seedFixture.forEach((m) => {
      (byMonth[DH.monthKey(m.date)] ||= []).push(m);
    });
    const group = byMonth[DH.monthKey(pastDate)];
    assert.strictEqual(group.length, 2, 'fixture should contain two meetups in the same group');
    assertUniqueDefinedKeys(group);
  });
});

describe('EventStore canonicalKunta', () => {
  it('finds Helsinki (case insensitive)', () => {
    assert.strictEqual(EventStore.canonicalKunta('HELSINKI'), 'Helsinki');
  });

  it('returns null for a made-up kunta', () => {
    assert.strictEqual(EventStore.canonicalKunta('Fakeoopsi'), null);
  });

  it('prefix-matches Tampere', () => {
    assert.strictEqual(EventStore.canonicalKunta('tamper'), 'Tampere');
  });
});

// ── ChatAssistant.applyAction ────────────────────────────────────────────────
// applyAction is now async (it goes through EventStore's server-backed API),
// and no longer constructs `addedBy` itself — the server derives ownership
// from the session (see netlify/functions/events.js), so there's nothing left
// for the client to attribute. These tests mock fetch instead of asserting on
// a client-built addedBy shape.

const { applyAction } = await import('../src/lib/chatActions.js');

describe('ChatAssistant.applyAction — add', () => {
  const USER = {
    id: 'u1',
    username: 'kirjoittaja',
    avatarUrl: 'https://example.com/av.jpg',
    profileUrl: 'https://www.threads.com/@kirjoittaja',
  };

  it('POSTs to /api/events via EventStore.add when a user is signed in', async (t) => {
    const calls = mockFetchOnce(t, { event: { id: 'ab12', status: 'pending' } }, 201);
    const result = await applyAction(
      {
        op: 'add',
        title: 'Chat-miitti',
        date: '2026-08-10',
        city: 'helsinki',
        cat: 'yleinen',
        org: '@test',
        url: 'https://www.threads.com/chat-test',
      },
      null,
      USER
    );
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.event.id, 'ab12');
    assert.strictEqual(calls[0].url, '/api/events');
    assert.strictEqual(calls[0].opts.method, 'POST');
  });

  it('rejects add with no user logged in — anonymous submission is not allowed', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('should not be called for an anonymous caller');
    });
    const result = await applyAction(
      {
        op: 'add',
        title: 'Anon-miitti',
        date: '2026-08-11',
        city: 'helsinki',
        cat: 'yleinen',
        org: '@test',
        url: 'https://www.threads.com/anon-test',
      },
      null,
      null
    );
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.kind, 'error');
  });

  it('rejects add without a valid Threads url regardless of user', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('should not be called — url is invalid before any network call');
    });
    const result = await applyAction(
      { op: 'add', title: 'Ei linkkiä', date: '2026-08-13' },
      null,
      USER
    );
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.kind, 'error');
  });

  it('surfaces the server error when the add request fails', async (t) => {
    mockFetchOnce(t, { error: 'title is required' }, 400);
    const result = await applyAction(
      {
        op: 'add',
        title: '',
        date: '2026-08-14',
        city: 'helsinki',
        cat: 'yleinen',
        org: '@test',
        url: 'https://www.threads.com/x',
      },
      null,
      USER
    );
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.kind, 'error');
  });
});

describe('ChatAssistant.applyAction — remove', () => {
  const USER = {
    id: 'u1',
    username: 'kirjoittaja',
    avatarUrl: null,
    profileUrl: 'https://www.threads.com/@kirjoittaja',
  };

  // Regression: the result for a successful remove has no `event` field
  // (there's nothing left to describe), but the caller (ChatAssistant.jsx)
  // still needs `changed: true` and a `label` to show a confirmation.
  it('DELETEs /api/events and reports success without an event field', async (t) => {
    const calls = mockFetchOnce(t, { ok: true });
    const result = await applyAction({ op: 'remove', id: '#ab12' }, null, USER);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.kind, 'remove');
    assert.strictEqual(result.label, 'Poistettu #ab12');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'event'), false);
    assert.strictEqual(calls[0].url, '/api/events?id=ab12');
    assert.strictEqual(calls[0].opts.method, 'DELETE');
  });

  it('reports an error for an id the server rejects', async (t) => {
    mockFetchOnce(t, { error: 'not_found' }, 404);
    const result = await applyAction({ op: 'remove', id: 'zzzz' }, null, USER);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.kind, 'error');
  });
});

// ── NotificationStore ────────────────────────────────────────────────────────

const NotificationStore = (await import('../src/store/NotificationStore.js')).default;

/** Seed events fixture for notification tests. */
const NOTIF_SEED = [
  { city: 'helsinki', title: 'Miitti A', date: '2026-08-01', url: '' },
  { city: 'helsinki', title: 'Miitti B', date: '2026-08-05', url: '' },
  { city: 'tampere', title: 'Tampere-miitti', date: '2026-08-10', url: '' },
];

describe('NotificationStore.getNewMeetups', () => {
  it('returns empty array when pref is null', () => {
    const result = NotificationStore.getNewMeetups(NOTIF_SEED, null);
    assert.deepStrictEqual(result, []);
  });

  it('returns all city meetups when seenKeys is empty', () => {
    const pref = { cityKey: 'helsinki', seenKeys: [] };
    const result = NotificationStore.getNewMeetups(NOTIF_SEED, pref);
    assert.strictEqual(result.length, 2);
  });

  it('returns only unseen meetups', () => {
    const seenKey = EventStore.favKey(NOTIF_SEED[0]);
    const pref = { cityKey: 'helsinki', seenKeys: [seenKey] };
    const result = NotificationStore.getNewMeetups(NOTIF_SEED, pref);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Miitti B');
  });

  it('returns empty array when all city meetups are seen', () => {
    const seenKeys = NOTIF_SEED.filter((m) => m.city === 'helsinki').map((m) =>
      EventStore.favKey(m)
    );
    const pref = { cityKey: 'helsinki', seenKeys };
    const result = NotificationStore.getNewMeetups(NOTIF_SEED, pref);
    assert.deepStrictEqual(result, []);
  });

  it('ignores meetups from other cities', () => {
    const pref = { cityKey: 'oulu', seenKeys: [] };
    const result = NotificationStore.getNewMeetups(NOTIF_SEED, pref);
    assert.deepStrictEqual(result, []);
  });
});

describe('NotificationStore.setPreference', () => {
  it('marks all current city meetups as seen on subscribe', () => {
    // Clear any prior state.
    NotificationStore.clearPreference();
    NotificationStore.setPreference('helsinki', NOTIF_SEED);
    const pref = NotificationStore.getPreference();
    assert.ok(pref, 'preference should be set');
    assert.strictEqual(pref.cityKey, 'helsinki');
    // Both helsinki meetups should be in seenKeys.
    const newMeetups = NotificationStore.getNewMeetups(NOTIF_SEED, pref);
    assert.deepStrictEqual(newMeetups, []);
  });

  it('returns new meetups added after subscribe', () => {
    NotificationStore.clearPreference();
    NotificationStore.setPreference('helsinki', NOTIF_SEED);
    const pref = NotificationStore.getPreference();
    // A new meetup that was not in NOTIF_SEED at subscribe time.
    const extendedEvents = [
      ...NOTIF_SEED,
      { city: 'helsinki', title: 'Uusi miitti', date: '2026-09-01', url: '' },
    ];
    const newMeetups = NotificationStore.getNewMeetups(extendedEvents, pref);
    assert.strictEqual(newMeetups.length, 1);
    assert.strictEqual(newMeetups[0].title, 'Uusi miitti');
  });
});

describe('NotificationStore.markSeen', () => {
  it('clears new meetups after markSeen', () => {
    NotificationStore.clearPreference();
    NotificationStore.setPreference('helsinki', []);
    const extended = [...NOTIF_SEED];
    // Before markSeen: two unseen helsinki meetups.
    const prefBefore = NotificationStore.getPreference();
    assert.strictEqual(NotificationStore.getNewMeetups(extended, prefBefore).length, 2);
    // After markSeen: no unseen meetups.
    NotificationStore.markSeen(extended);
    const prefAfter = NotificationStore.getPreference();
    assert.strictEqual(NotificationStore.getNewMeetups(extended, prefAfter).length, 0);
  });
});

describe('NotificationStore.clearPreference', () => {
  it('returns null after clear', () => {
    NotificationStore.setPreference('tampere', NOTIF_SEED);
    NotificationStore.clearPreference();
    assert.strictEqual(NotificationStore.getPreference(), null);
  });
});

// ── validate-chat-request ────────────────────────────────────────────────────

import {
  normaliseOrigin,
  isOriginAllowed,
  validatePrompt,
  MAX_PROMPT_LENGTH,
} from '../netlify/functions/lib/validate-chat-request.mjs';

describe('normaliseOrigin', () => {
  it('returns bare origin from a plain origin header', () => {
    assert.strictEqual(normaliseOrigin('https://example.com'), 'https://example.com');
  });

  it('strips trailing slash', () => {
    assert.strictEqual(normaliseOrigin('https://example.com/'), 'https://example.com');
  });

  it('strips path from a Referer header', () => {
    assert.strictEqual(normaliseOrigin('https://example.com/some/page'), 'https://example.com');
  });

  it('returns empty string for null', () => {
    assert.strictEqual(normaliseOrigin(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.strictEqual(normaliseOrigin(undefined), '');
  });
});

describe('isOriginAllowed', () => {
  const ALLOWED = 'https://threadsmiitit.netlify.app';

  it('allows a matching Origin header', () => {
    assert.strictEqual(isOriginAllowed(ALLOWED, null, ALLOWED), true);
  });

  it('allows a matching Referer header when Origin is absent', () => {
    assert.strictEqual(isOriginAllowed(null, `${ALLOWED}/`, ALLOWED), true);
  });

  it('denies a different origin', () => {
    assert.strictEqual(isOriginAllowed('https://attacker.example', null, ALLOWED), false);
  });

  it('denies when both headers are absent', () => {
    assert.strictEqual(isOriginAllowed(null, null, ALLOWED), false);
  });

  it('bypasses check when isNetlifyDev is true', () => {
    assert.strictEqual(isOriginAllowed(null, null, ALLOWED, true), true);
  });
});

describe('validatePrompt', () => {
  it('accepts a normal string', () => {
    assert.deepStrictEqual(validatePrompt('Hello'), { ok: true });
  });

  it('rejects undefined', () => {
    const result = validatePrompt(undefined);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  it('rejects a number', () => {
    const result = validatePrompt(42);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  it('rejects an empty string', () => {
    const result = validatePrompt('');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  it('rejects a whitespace-only string', () => {
    const result = validatePrompt('   ');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  it('accepts a string exactly at the limit', () => {
    assert.deepStrictEqual(validatePrompt('a'.repeat(MAX_PROMPT_LENGTH)), { ok: true });
  });

  it('rejects a string one character over the limit', () => {
    const result = validatePrompt('a'.repeat(MAX_PROMPT_LENGTH + 1));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 413);
  });
});

// ── anthropic-proxy ──────────────────────────────────────────────────────────

import { callAnthropic } from '../netlify/functions/lib/anthropic-proxy.mjs';

describe('callAnthropic — upstream error propagation', () => {
  it('returns ok:false with the upstream status on a 429 response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limit exceeded' } }),
    }));
    const result = await callAnthropic('hello', 'fake-key');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 429);
    assert.ok(result.error.includes('429'), `expected 429 in error, got: ${result.error}`);
  });

  it('returns ok:false with the upstream status on a 400 response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'invalid request' } }),
    }));
    const result = await callAnthropic('hello', 'fake-key');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 400);
  });

  it('returns ok:false with 502 when fetch rejects (network error)', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await callAnthropic('hello', 'fake-key');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 502);
  });

  it('returns ok:true with text on a successful response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Moi!' }] }),
    }));
    const result = await callAnthropic('hello', 'fake-key');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.text, 'Moi!');
  });

  it('returns empty text when content array is missing', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({ content: [] }),
    }));
    const result = await callAnthropic('hello', 'fake-key');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.text, '');
  });
});

// ── session.mjs ──────────────────────────────────────────────────────────────
// Server-verifiable session token: sign/verify/cookie helpers used by the
// Netlify Functions auth flow. See netlify/functions/lib/session.mjs.

import {
  signSession,
  verifySession,
  readSessionCookie,
  sessionCookie,
  clearSessionCookie,
  isAdmin,
  requireUser,
  requireAdmin,
} from '../netlify/functions/lib/session.mjs';

const sessionUser = {
  id: 'u1',
  username: 'lupinesse',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@lupinesse',
};

describe('signSession / verifySession', () => {
  it('round-trips a valid token', () => {
    const token = signSession(sessionUser, { secret: 'k' });
    assert.deepStrictEqual(verifySession(token, { secret: 'k' }), sessionUser);
  });

  it('rejects a token verified with the wrong secret', () => {
    const token = signSession(sessionUser, { secret: 'k1' });
    assert.strictEqual(verifySession(token, { secret: 'k2' }), null);
  });

  it('rejects a token with a tampered payload segment', () => {
    const token = signSession(sessionUser, { secret: 'k' });
    const [payloadB64, sigB64] = token.split('.');
    const tampered = `${payloadB64.slice(0, -1)}${payloadB64.at(-1) === 'a' ? 'b' : 'a'}.${sigB64}`;
    assert.strictEqual(verifySession(tampered, { secret: 'k' }), null);
  });

  it('rejects a token with a tampered signature segment', () => {
    const token = signSession(sessionUser, { secret: 'k' });
    const [payloadB64, sigB64] = token.split('.');
    const tampered = `${payloadB64}.${sigB64.slice(0, -1)}${sigB64.at(-1) === 'a' ? 'b' : 'a'}`;
    assert.strictEqual(verifySession(tampered, { secret: 'k' }), null);
  });

  it('does not throw on a wrong-length signature', () => {
    const token = signSession(sessionUser, { secret: 'k' });
    const [payloadB64] = token.split('.');
    assert.doesNotThrow(() => verifySession(`${payloadB64}.YWJj`, { secret: 'k' }));
    assert.strictEqual(verifySession(`${payloadB64}.YWJj`, { secret: 'k' }), null);
  });

  it('rejects an expired token and accepts one still within its ttl', () => {
    const token = signSession(sessionUser, { secret: 'k', ttlSeconds: 100, nowMs: 1_000_000 });
    assert.strictEqual(verifySession(token, { secret: 'k', nowMs: 1_000_000 + 101_000 }), null);
    assert.ok(verifySession(token, { secret: 'k', nowMs: 1_000_000 + 50_000 }));
  });

  it('returns null (never throws) for malformed input', () => {
    for (const bad of ['', null, undefined, 'garbage', 'a.b.c', 'onlyonesegment']) {
      assert.doesNotThrow(() => verifySession(bad, { secret: 'k' }));
      assert.strictEqual(verifySession(bad, { secret: 'k' }), null);
    }
  });
});

describe('readSessionCookie', () => {
  it('extracts the named cookie', () => {
    assert.strictEqual(readSessionCookie('tm_session=abc; other=1'), 'abc');
  });

  it('extracts the named cookie when it is not first', () => {
    assert.strictEqual(readSessionCookie('x=1; tm_session=abc'), 'abc');
  });

  it('returns null when the cookie is absent', () => {
    assert.strictEqual(readSessionCookie('other=1'), null);
  });

  it('returns null for a null header', () => {
    assert.strictEqual(readSessionCookie(null), null);
  });

  it('matches the cookie name exactly, not as a suffix', () => {
    assert.strictEqual(readSessionCookie('xtm_session=abc'), null);
  });

  it('tolerates surrounding whitespace around name and value', () => {
    assert.strictEqual(readSessionCookie(' tm_session = abc '), 'abc');
  });
});

describe('isAdmin', () => {
  it('matches a bare username against the default admin list', () => {
    assert.strictEqual(isAdmin('lupinesse'), true);
  });

  it('matches an @-prefixed username', () => {
    assert.strictEqual(isAdmin('@lupinesse'), true);
  });

  it('is case-insensitive', () => {
    assert.strictEqual(isAdmin('LupinEsse'), true);
  });

  it('returns false for a non-admin username', () => {
    assert.strictEqual(isAdmin('rando'), false);
  });

  it('returns false (never throws) for a falsy username', () => {
    for (const bad of ['', null, undefined]) {
      assert.doesNotThrow(() => isAdmin(bad));
      assert.strictEqual(isAdmin(bad), false);
    }
  });

  it('uses an injected admin list when provided', () => {
    assert.strictEqual(isAdmin('bob', ['@bob']), true);
    assert.strictEqual(isAdmin('bob', ['@alice']), false);
  });
});

describe('sessionCookie / clearSessionCookie', () => {
  it('builds a Set-Cookie value with the expected attributes', () => {
    const value = sessionCookie('t');
    assert.match(value, /tm_session=t/);
    assert.match(value, /HttpOnly/);
    assert.match(value, /SameSite=Lax/);
    assert.match(value, /Path=\//);
    assert.match(value, /Max-Age=/);
    assert.match(value, /Secure/);
  });

  it('omits Secure when secure: false', () => {
    const value = sessionCookie('t', { secure: false });
    assert.doesNotMatch(value, /Secure/);
  });

  it('clearSessionCookie targets tm_session with Max-Age=0', () => {
    const value = clearSessionCookie();
    assert.match(value, /tm_session=/);
    assert.match(value, /Max-Age=0/);
  });
});

describe('requireUser / requireAdmin', () => {
  const secret = 'k';
  process.env.SESSION_SECRET = secret;

  function requestWithUser(username) {
    const token = signSession({ ...sessionUser, username }, { secret });
    return { headers: new Headers({ cookie: `tm_session=${token}` }) };
  }

  it('requireUser returns ok with the session user when the cookie is valid', () => {
    const result = requireUser(requestWithUser('lupinesse'));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.user.username, 'lupinesse');
  });

  it('requireUser returns a 401 response when unauthenticated', () => {
    const result = requireUser({ headers: new Headers() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.response.status, 401);
  });

  it('requireAdmin returns ok for an admin session', () => {
    const result = requireAdmin(requestWithUser('lupinesse'));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.user.username, 'lupinesse');
  });

  it('requireAdmin returns a 403 response for an authenticated non-admin', () => {
    const result = requireAdmin(requestWithUser('rando'));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.response.status, 403);
  });

  it('requireAdmin returns a 401 response when unauthenticated', () => {
    const result = requireAdmin({ headers: new Headers() });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.response.status, 401);
  });
});
