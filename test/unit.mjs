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

const { DH } = await import('../src/data.js');

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
