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

/** Shared `addedBy` fixture for tests that don't care who submitted the event. */
const TEST_USER = { id: 't1', username: 'testaaja', avatarUrl: '', profileUrl: '' };

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
      addedBy: TEST_USER,
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
      addedBy: TEST_USER,
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
      addedBy: TEST_USER,
    });
    assert.strictEqual(EventStore.remove(ev.id), true);
    assert.strictEqual(EventStore.find(ev.id), null);
  });

  it('rejects an anonymous submission with no addedBy', () => {
    assert.throws(
      () =>
        EventStore.add({
          title: 'Anonyymi',
          date: '2026-08-04',
          city: 'helsinki',
          cat: 'yleinen',
          org: '@test',
          url: 'https://www.threads.com/anon',
        }),
      /anonymous submission/
    );
  });

  it('rejects a submission whose addedBy has no username', () => {
    assert.throws(
      () =>
        EventStore.add({
          title: 'Puolittainen',
          date: '2026-08-05',
          city: 'helsinki',
          cat: 'yleinen',
          org: '@test',
          url: 'https://www.threads.com/half',
          addedBy: { id: 'x', avatarUrl: '', profileUrl: '' },
        }),
      /anonymous submission/
    );
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
      addedBy: TEST_USER,
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
      addedBy: TEST_USER,
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
      addedBy: TEST_USER,
    });
    const updated = EventStore.edit(ev.id, { title: 'SäilyTesti Uusi' });
    assert.strictEqual(updated?.city, 'tampere');
    assert.strictEqual(updated?.cat, 'karaoke');
  });
});

describe('EventStore moderation — add / edit status', () => {
  it('add() sets status to pending and records a submitted timestamp', () => {
    const ev = EventStore.add({
      title: 'Uusi miitti',
      date: '2026-10-01',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-add',
      addedBy: TEST_USER,
    });
    assert.strictEqual(ev.status, 'pending');
    assert.strictEqual(typeof ev.submitted, 'number');
  });

  it('edit() keeps status pending when it was already pending', () => {
    const ev = EventStore.add({
      title: 'Muokkaustesti',
      date: '2026-10-02',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-edit-pending',
      addedBy: TEST_USER,
    });
    const updated = EventStore.edit(ev.id, { title: 'Muokattu' });
    assert.strictEqual(updated.status, 'pending');
  });

  it('edit() preserves approved status', () => {
    const ev = EventStore.add({
      title: 'Hyväksytty',
      date: '2026-10-03',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-edit-approved',
      addedBy: TEST_USER,
    });
    EventStore.approve(ev.id);
    const updated = EventStore.edit(ev.id, { title: 'Hyväksytty muokattu' });
    assert.strictEqual(updated.status, 'approved');
  });

  it('edit() resets a rejected event back to pending for re-review', () => {
    const ev = EventStore.add({
      title: 'Hylätty',
      date: '2026-10-04',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-edit-rejected',
      addedBy: TEST_USER,
    });
    EventStore.reject(ev.id, 'Ei sovi');
    const updated = EventStore.edit(ev.id, { title: 'Hylätty uudelleen' });
    assert.strictEqual(updated.status, 'pending');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(updated, 'rejectReason'), false);
  });

  it('edit() preserves the original submitted timestamp', () => {
    const ev = EventStore.add({
      title: 'Aikaleimatesti',
      date: '2026-10-05',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/mod-timestamp',
      addedBy: TEST_USER,
    });
    const updated = EventStore.edit(ev.id, { title: 'Aikaleimatesti Uusi' });
    assert.strictEqual(updated.submitted, ev.submitted);
  });
});

describe('EventStore.approve / reject / pending', () => {
  it('approve() sets status to approved', () => {
    const ev = EventStore.add({
      title: 'Hyväksy minut',
      date: '2026-10-06',
      city: 'turku',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/approve-me',
      addedBy: TEST_USER,
    });
    const approved = EventStore.approve(ev.id);
    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(typeof approved.reviewedAt, 'number');
  });

  it('reject() sets status to rejected and stores an optional reason', () => {
    const ev = EventStore.add({
      title: 'Hylkää minut',
      date: '2026-10-07',
      city: 'turku',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/reject-me',
      addedBy: TEST_USER,
    });
    const rejected = EventStore.reject(ev.id, 'Ei täytä ehtoja');
    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual(rejected.rejectReason, 'Ei täytä ehtoja');
  });

  it('approve() and reject() return null for an unknown id', () => {
    assert.strictEqual(EventStore.approve('zzzz'), null);
    assert.strictEqual(EventStore.reject('zzzz'), null);
  });

  it('pending() lists only pending events, oldest submitted first', () => {
    EventStore.save([]); // isolate from events added by earlier tests in this file
    const first = EventStore.add({
      title: 'Ensimmäinen',
      date: '2026-11-01',
      city: 'oulu',
      cat: 'yleinen',
      org: '@a',
      url: 'https://www.threads.com/first',
      addedBy: TEST_USER,
    });
    const second = EventStore.add({
      title: 'Toinen',
      date: '2026-11-02',
      city: 'oulu',
      cat: 'yleinen',
      org: '@b',
      url: 'https://www.threads.com/second',
      addedBy: TEST_USER,
    });
    const approved = EventStore.add({
      title: 'Kolmas — hyväksytty',
      date: '2026-11-03',
      city: 'oulu',
      cat: 'yleinen',
      org: '@c',
      url: 'https://www.threads.com/third',
      addedBy: TEST_USER,
    });
    EventStore.approve(approved.id);

    const list = EventStore.pending();
    assert.deepStrictEqual(
      list.map((e) => e.id),
      [first.id, second.id]
    );
  });
});

describe('EventStore.ownedBy', () => {
  it('returns every submission by a handle regardless of status', () => {
    EventStore.save([]);
    const addedBy = { id: '1', username: 'omistaja', avatarUrl: '', profileUrl: '' };
    const approvedEv = EventStore.add({
      title: 'Omani hyväksytty',
      date: '2026-11-10',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/owned-approved',
      addedBy,
    });
    EventStore.approve(approvedEv.id);
    const rejectedEv = EventStore.add({
      title: 'Omani hylätty',
      date: '2026-11-11',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/owned-rejected',
      addedBy,
    });
    EventStore.reject(rejectedEv.id);
    EventStore.add({
      title: 'Muiden miitti',
      date: '2026-11-12',
      city: 'helsinki',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/not-owned',
      addedBy: { id: '2', username: 'muu', avatarUrl: '', profileUrl: '' },
    });

    const mine = EventStore.ownedBy('omistaja');
    assert.deepStrictEqual(mine.map((e) => e.id).sort(), [approvedEv.id, rejectedEv.id].sort());
  });

  it('returns an empty array when no username is given', () => {
    assert.deepStrictEqual(EventStore.ownedBy(''), []);
    assert.deepStrictEqual(EventStore.ownedBy(undefined), []);
  });
});

describe('EventStore.all — moderation visibility', () => {
  it('includes approved user events for any caller', () => {
    EventStore.save([]);
    const ev = EventStore.add({
      title: 'Näkyvä kaikille',
      date: '2026-12-01',
      city: 'lahti',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/visible-all',
      addedBy: TEST_USER,
    });
    EventStore.approve(ev.id);
    const list = EventStore.all('joku-muu');
    assert.ok(list.some((e) => e.id === ev.id));
  });

  it("shows a user's own pending event to themself but hides it from others", () => {
    EventStore.save([]);
    const ev = EventStore.add({
      title: 'Oma odottava',
      date: '2026-12-02',
      city: 'lahti',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/own-pending',
      addedBy: { id: '9', username: 'lahtelainen', avatarUrl: '', profileUrl: '' },
    });
    assert.ok(EventStore.all('lahtelainen').some((e) => e.id === ev.id));
    assert.ok(!EventStore.all('joku-muu').some((e) => e.id === ev.id));
    assert.ok(!EventStore.all().some((e) => e.id === ev.id));
  });

  it('never includes a rejected event, even for its own submitter', () => {
    EventStore.save([]);
    const ev = EventStore.add({
      title: 'Hylätty piiloon',
      date: '2026-12-03',
      city: 'lahti',
      cat: 'yleinen',
      org: '@x',
      url: 'https://www.threads.com/rejected-hidden',
      addedBy: { id: '9', username: 'lahtelainen', avatarUrl: '', profileUrl: '' },
    });
    EventStore.reject(ev.id);
    assert.ok(!EventStore.all('lahtelainen').some((e) => e.id === ev.id));
  });
});

describe('EventStore load() migration — legacy records without status', () => {
  it('treats a persisted event with no status field as approved', () => {
    localStorage.setItem(
      'threadsmiitit_user_events_v1',
      JSON.stringify([
        {
          id: 'lgcy',
          user: true,
          title: 'Vanha tallennus',
          date: '2026-06-01',
          city: 'helsinki',
          cat: 'yleinen',
          org: ['@x'],
          url: 'https://www.threads.com/legacy',
        },
      ])
    );
    const loaded = EventStore.load();
    assert.strictEqual(loaded[0].status, 'approved');
    EventStore.save([]); // clean up for subsequent tests
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
