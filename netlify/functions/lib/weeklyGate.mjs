/**
 * @fileoverview Pure date/timezone helpers for the weekly-summary trigger
 * (`bot-weekly.js`). Netlify's scheduled functions run on UTC-only cron —
 * there is no timezone-aware scheduling — so `bot-weekly.js` fires at two
 * candidate UTC times (17:00 and 18:00 on Sundays) and this module decides
 * which one, if either, actually corresponds to 20:00 in `Europe/Helsinki`.
 * One of the two always does, regardless of whether Helsinki is currently
 * on EEST (UTC+3, summer) or EET (UTC+2, winter) — that's what makes this
 * DST-safe without a date-library dependency: `Intl.DateTimeFormat` already
 * knows the IANA timezone database.
 */

/**
 * Extracts the Europe/Helsinki-local hour, weekday, and calendar date for a
 * given instant.
 * @param {number} nowMs - Epoch ms.
 * @param {string} timezone - IANA timezone name.
 * @returns {{hour: number, weekday: string, dateStr: string}} `weekday` is a
 *   3-letter English abbreviation ('Sun', 'Mon', ...); `dateStr` is `YYYY-MM-DD`.
 */
function localParts(nowMs, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value])
  );
  // Some locales format midnight as hour '24' rather than '00'.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return { hour, weekday: parts.weekday, dateStr: `${parts.year}-${parts.month}-${parts.day}` };
}

/**
 * Whether `nowMs` falls in the weekly-summary posting window: Sunday, at
 * the target local hour, in the target timezone. Import `WEEKLY_TIMEZONE`/
 * `WEEKLY_TARGET_HOUR` from `botConfig.mjs` for the real values — the
 * defaults here exist only so this stays a pure, standalone module.
 * @param {number} nowMs - Epoch ms.
 * @param {object} [opts]
 * @param {number} [opts.targetHour=20]
 * @param {string} [opts.timezone='Europe/Helsinki']
 * @returns {boolean}
 */
export function isWeeklyPostWindow(nowMs, { targetHour = 20, timezone = 'Europe/Helsinki' } = {}) {
  const { hour, weekday } = localParts(nowMs, timezone);
  return weekday === 'Sun' && hour === targetHour;
}

/**
 * The `YYYY-MM-DD` calendar date in the given timezone for a given instant
 * — used as the idempotency key recorded in `lastWeeklyTargetSunday`, since
 * the two candidate UTC cron ticks on the same Sunday must not both post.
 * @param {number} nowMs - Epoch ms.
 * @param {string} [timezone='Europe/Helsinki']
 * @returns {string}
 */
export function localDateStr(nowMs, timezone = 'Europe/Helsinki') {
  return localParts(nowMs, timezone).dateStr;
}

/**
 * Adds (or subtracts, if negative) whole days to a `YYYY-MM-DD` date
 * string, returning a new `YYYY-MM-DD` string. Pure UTC arithmetic — safe
 * regardless of the host's local timezone, since only the calendar date
 * (not a specific instant) matters here.
 * @param {string} dateStr - `YYYY-MM-DD`.
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The coming Monday–Sunday date range for the weekly summary, given
 * today's (a Sunday's) date — i.e. tomorrow through the following Sunday.
 * @param {string} todayDateStr - `YYYY-MM-DD`, expected to be a Sunday.
 * @returns {{start: string, end: string}} Both `YYYY-MM-DD`, inclusive.
 */
export function upcomingWeekRange(todayDateStr) {
  return { start: addDays(todayDateStr, 1), end: addDays(todayDateStr, 7) };
}
