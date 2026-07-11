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
});

describe('EventStore add / find / remove', () => {
  it('generates a 4-char id on add', () => {
    const ev = EventStore.add({
      title: 'Test miitti',
      date: '2026-08-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@test',
      url: 'https://www.threads.com/test',
    });
    assert.strictEqual(ev.id.length, 4);
  });

  it('find returns the event by id', () => {
    const ev = EventStore.add({
      title: 'FindMe',
      date: '2026-08-02',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@test',
      url: 'https://www.threads.com/findme',
    });
    const found = EventStore.find(ev.id);
    assert.ok(found, 'event should be found');
    assert.strictEqual(found.title, 'FindMe');
  });

  it('remove deletes the event', () => {
    const ev = EventStore.add({
      title: 'RemoveMe',
      date: '2026-08-03',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@test',
      url: 'https://www.threads.com/rm',
    });
    assert.strictEqual(EventStore.remove(ev.id), true);
    assert.strictEqual(EventStore.find(ev.id), null);
  });

  it('remove returns false for unknown id', () => {
    assert.strictEqual(EventStore.remove('zzzz'), false);
  });
});

describe('EventStore.normalize addedBy', () => {
  it('passes through addedBy when present', () => {
    const addedBy = {
      id: '123',
      username: 'testuser',
      avatarUrl: 'https://example.com/av.jpg',
      profileUrl: 'https://www.threads.com/@testuser',
    };
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: '',
      addedBy,
    });
    assert.deepStrictEqual(result.addedBy, addedBy);
  });

  it('omits addedBy when not supplied', () => {
    const result = EventStore.normalize({
      title: 'T',
      date: '2026-06-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: '',
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'addedBy'), false);
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

describe('EventStore.edit', () => {
  it('updates a field and returns the updated event', () => {
    const ev = EventStore.add({
      title: 'Alkuperäinen',
      date: '2026-09-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@org',
      url: 'https://www.threads.com/edit-test',
    });
    const updated = EventStore.edit(ev.id, { title: 'Päivitetty' });
    assert.ok(updated, 'should return the updated event');
    assert.strictEqual(updated.title, 'Päivitetty');
  });

  it('preserves the event id after edit', () => {
    const ev = EventStore.add({
      title: 'IdTesti',
      date: '2026-09-02',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@a',
      url: 'https://www.threads.com/id-testi',
    });
    const updated = EventStore.edit(ev.id, { title: 'IdTesti Muokattu' });
    assert.strictEqual(updated?.id, ev.id);
  });

  it('returns null for an unknown id', () => {
    assert.strictEqual(EventStore.edit('zzzz', { title: 'Aave' }), null);
  });

  it('edit preserves fields that are not in the patch', () => {
    const ev = EventStore.add({
      title: 'SäilyTesti',
      date: '2026-09-03',
      city: 'tampere',
      cat: 'karaoke',
      org: '@x',
      url: 'https://www.threads.com/sailytesti',
    });
    const updated = EventStore.edit(ev.id, { title: 'SäilyTesti Uusi' });
    assert.strictEqual(updated?.city, 'tampere');
    assert.strictEqual(updated?.cat, 'karaoke');
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

// ── base64DecodeJson ─────────────────────────────────────────────────────────

import { base64DecodeJson } from '../src/lib/base64.js';

describe('base64DecodeJson', () => {
  it('decodes ASCII-only JSON correctly', () => {
    const input = { id: '42', username: 'testuser' };
    const encoded = Buffer.from(JSON.stringify(input)).toString('base64');
    assert.deepStrictEqual(base64DecodeJson(encoded), input);
  });

  it('regression: decodes UTF-8 JSON with Finnish multibyte characters (ä, ö)', () => {
    // atob(encoded) alone would give a binary string; JSON.parse of that binary
    // string would either throw or produce garbled text for multibyte sequences.
    const input = { username: 'käyttäjä', name: 'Jönssi Äijä' };
    const encoded = Buffer.from(JSON.stringify(input)).toString('base64');
    assert.deepStrictEqual(base64DecodeJson(encoded), input);
  });

  it('throws SyntaxError for base64 that decodes to invalid JSON', () => {
    const encoded = Buffer.from('not-json-at-all').toString('base64');
    assert.throws(() => base64DecodeJson(encoded), SyntaxError);
  });
});
