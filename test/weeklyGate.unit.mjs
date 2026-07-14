/**
 * Unit tests for netlify/functions/lib/weeklyGate.mjs — run with Node's
 * built-in test runner as part of `npm test`. Pure functions only; no
 * network, no Blobs, no reliance on the host machine's local timezone.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWeeklyPostWindow,
  localDateStr,
  addDays,
  upcomingWeekRange,
} from '../netlify/functions/lib/weeklyGate.mjs';

/**
 * Finds the next Sunday on or after the given UTC calendar date, so tests
 * never depend on hand-verified calendar math.
 * @param {number} year
 * @param {number} month - 1-indexed.
 * @param {number} day
 * @returns {Date}
 */
function nextSundayUTC(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysUntilSunday = (7 - date.getUTCDay()) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilSunday);
  return date;
}

describe('isWeeklyPostWindow', () => {
  // Europe/Helsinki is EEST (UTC+3) in summer and EET (UTC+2) in winter, so
  // the same local target hour (20:00) lands on a different UTC hour
  // depending on the season — this is the whole reason bot-weekly.js fires
  // at two candidate UTC times.
  const summerSunday = nextSundayUTC(2026, 7, 1); // clearly inside EEST
  const winterSunday = nextSundayUTC(2026, 1, 1); // clearly inside EET

  const cases = [
    {
      label: 'summer Sunday at 17:00 UTC (20:00 EEST)',
      date: summerSunday,
      hour: 17,
      expected: true,
    },
    {
      label: 'summer Sunday at 18:00 UTC (21:00 EEST)',
      date: summerSunday,
      hour: 18,
      expected: false,
    },
    {
      label: 'winter Sunday at 18:00 UTC (20:00 EET)',
      date: winterSunday,
      hour: 18,
      expected: true,
    },
    {
      label: 'winter Sunday at 17:00 UTC (19:00 EET)',
      date: winterSunday,
      hour: 17,
      expected: false,
    },
  ];

  for (const { label, date, hour, expected } of cases) {
    it(`${label} → ${expected}`, () => {
      const nowMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour);
      assert.strictEqual(isWeeklyPostWindow(nowMs), expected);
    });
  }

  it('is false on a non-Sunday even at the right UTC hour', () => {
    const monday = new Date(summerSunday);
    monday.setUTCDate(monday.getUTCDate() + 1);
    const nowMs = Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 17);
    assert.strictEqual(isWeeklyPostWindow(nowMs), false);
  });

  it('respects a custom target hour and timezone', () => {
    const sunday = nextSundayUTC(2026, 6, 1);
    const noonUTC = Date.UTC(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth(),
      sunday.getUTCDate(),
      12
    );
    assert.strictEqual(isWeeklyPostWindow(noonUTC, { targetHour: 12, timezone: 'UTC' }), true);
    assert.strictEqual(isWeeklyPostWindow(noonUTC, { targetHour: 13, timezone: 'UTC' }), false);
  });
});

describe('localDateStr', () => {
  it('returns the Helsinki calendar date for a UTC instant late in the UTC day', () => {
    // 23:30 UTC on 2026-06-14 is already 2026-06-15 in EEST (UTC+3).
    const nowMs = Date.UTC(2026, 5, 14, 23, 30);
    assert.strictEqual(localDateStr(nowMs), '2026-06-15');
  });

  it('returns the Helsinki calendar date for a UTC instant early in the UTC day', () => {
    // 01:00 UTC on 2026-01-15 is still 2026-01-15 03:00 in EET (UTC+2).
    const nowMs = Date.UTC(2026, 0, 15, 1);
    assert.strictEqual(localDateStr(nowMs), '2026-01-15');
  });
});

describe('addDays', () => {
  it('adds days within a month', () => {
    assert.strictEqual(addDays('2026-06-10', 3), '2026-06-13');
  });

  it('rolls over a month boundary', () => {
    assert.strictEqual(addDays('2026-06-29', 3), '2026-07-02');
  });

  it('rolls over a year boundary', () => {
    assert.strictEqual(addDays('2026-12-30', 3), '2027-01-02');
  });

  it('subtracts days with a negative count', () => {
    assert.strictEqual(addDays('2026-06-10', -3), '2026-06-07');
  });
});

describe('upcomingWeekRange', () => {
  it('returns tomorrow through the following Sunday', () => {
    assert.deepStrictEqual(upcomingWeekRange('2026-06-14'), {
      start: '2026-06-15',
      end: '2026-06-21',
    });
  });

  it('rolls over a month boundary correctly', () => {
    assert.deepStrictEqual(upcomingWeekRange('2026-06-28'), {
      start: '2026-06-29',
      end: '2026-07-05',
    });
  });
});
