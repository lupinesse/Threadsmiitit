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
