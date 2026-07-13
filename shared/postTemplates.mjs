/**
 * @fileoverview Pure render functions for every Threads broadcast-bot post.
 * Consumed by the bot-* Netlify Functions (Phase 3) and unit tested here in
 * isolation — no network, no Blobs, no Threads API calls. Pure
 * functions/globals only (`TextEncoder`, no `Buffer`/`process`) — no
 * browser or Node-specific globals — same portability constraint as
 * `eventFields.mjs`, even though in practice only server code imports this
 * module today.
 *
 * Every human-facing string lives in the `STRINGS` constant below so the
 * copy can be tweaked without touching the render logic. All output is
 * capped to the Threads platform limits (main post/reply 500 chars, text
 * attachment 10 000 chars — emoji count as UTF-8 bytes, see `byteLength`)
 * and truncated with an ellipsis rather than rejected outright, since a bot
 * post that's slightly shortened is far better than a bot that silently
 * skips announcing an event.
 *
 * City display names: the full `CITIES` lookup table (src/data.js) is a
 * client-side dataset not worth bundling into a Netlify Function just for a
 * label — `cityLabel()` below falls back to title-casing the slug (e.g.
 * `'helsinki'` → `'Helsinki'`), which is a reasonable approximation for a
 * bot post even though it won't match every city's exact display form.
 */

/** Threads main post/reply hard limit, in UTF-8 bytes. */
export const MAIN_POST_MAX_BYTES = 500;

/** Threads text-attachment hard limit, in UTF-8 bytes. */
export const ATTACHMENT_MAX_BYTES = 10000;

/**
 * Fallback link shown when an event has no Threads post URL of its own.
 * A fixed literal (rather than reading `process.env.URL`, as
 * `netlify/functions/chat.js` does) since this module must stay portable —
 * see the fileoverview above.
 */
const CALENDAR_URL = 'https://threadsmiitit.netlify.app';

/** Every human-facing string the bot posts, in one place for easy editing. */
export const STRINGS = {
  cancelledPrefix: '🚫 Miitti peruttu:',
  dailyRootSingular: '📅 Tänään hyväksyttiin uusi miitti!',
  dailyRootPlural: (count) => `📅 Tänään hyväksyttiin ${count} uutta miittiä!`,
  weeklyHeaderSingular: '🗓️ Tulevan viikon miitti:',
  weeklyHeaderPlural: (count) => `🗓️ Tulevan viikon miitit (${count} kpl):`,
  weeklyEmpty: '🗓️ Ensi viikolle ei ole vielä ilmoitettu yhtään miittiä.',
  noOrganizer: 'Järjestäjä ei tiedossa',
};

/** Shared encoder for `byteLength` — constructing one per call would be wasteful. */
const utf8Encoder = new TextEncoder();

/**
 * Counts the UTF-8 byte length of a string — Threads' character limits are
 * measured in bytes, not JS string length, so an emoji-heavy post can hit
 * the cap well before `str.length` would suggest. Uses `TextEncoder`
 * (available in both browsers and Node) rather than Node's `Buffer`, so
 * this module stays usable from a Vite client build too.
 * @param {string} str
 * @returns {number}
 */
function byteLength(str) {
  return utf8Encoder.encode(str).length;
}

/**
 * Truncates a string to at most `maxBytes` UTF-8 bytes, appending an
 * ellipsis when truncation actually happens. Truncates by JS character
 * (not byte) steps to avoid splitting a multi-byte character in half.
 * @param {string} str
 * @param {number} maxBytes
 * @returns {string}
 */
export function truncateToBytes(str, maxBytes) {
  if (byteLength(str) <= maxBytes) return str;
  const ellipsis = '…';
  const budget = maxBytes - byteLength(ellipsis);
  let result = '';
  for (const char of str) {
    if (byteLength(result + char) > budget) break;
    result += char;
  }
  return result + ellipsis;
}

/**
 * Title-cases a city slug as a display-name fallback (e.g. `'helsinki'` →
 * `'Helsinki'`, `'iso-britannia'` → `'Iso-Britannia'`).
 * @param {string} slug
 * @returns {string}
 */
function cityLabel(slug) {
  return String(slug ?? '')
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('-');
}

/**
 * The link to show for an event: its own Threads post if it has one,
 * otherwise the app's calendar as a generic fallback (no link preview in
 * that case, since it's a bare app URL rather than a Threads post).
 * @param {{url?: string}} event
 * @returns {string}
 */
function eventLink(event) {
  return event.url || CALENDAR_URL;
}

/**
 * One-line summary of an event: title, date, city, organiser(s).
 * @param {{title:string, date:string, city:string, org?:string[]}} event
 * @returns {string}
 */
function eventSummary(event) {
  const org = event.org?.length ? event.org.join(', ') : STRINGS.noOrganizer;
  return `${event.title} — ${event.date} · ${cityLabel(event.city)}\n${org}`;
}

/**
 * Renders the immediate cancellation announcement for a newly-cancelled
 * event.
 * @param {{title:string, date:string, city:string, org?:string[], url?:string}} event
 * @returns {{text: string}}
 */
export function renderCancellation(event) {
  const text = `${STRINGS.cancelledPrefix} ${eventSummary(event)}\n${eventLink(event)}`;
  return { text: truncateToBytes(text, MAIN_POST_MAX_BYTES) };
}

/**
 * Renders the root post of the daily new-meetups comment thread.
 * @param {number} count - Number of newly-approved events being announced today.
 * @returns {string}
 */
export function renderDailyRoot(count) {
  const text = count === 1 ? STRINGS.dailyRootSingular : STRINGS.dailyRootPlural(count);
  return truncateToBytes(text, MAIN_POST_MAX_BYTES);
}

/**
 * Renders one reply in the daily comment thread, for a single newly-approved event.
 * @param {{title:string, date:string, city:string, org?:string[], url?:string}} event
 * @returns {string}
 */
export function renderDailyReply(event) {
  const text = `${eventSummary(event)}\n${eventLink(event)}`;
  return truncateToBytes(text, MAIN_POST_MAX_BYTES);
}

/**
 * Renders the weekly summary: a short hook post plus a text attachment
 * listing every approved, non-cancelled event in the coming week.
 * @param {Array<{title:string, date:string, city:string, org?:string[], url?:string}>} events
 * @returns {{text: string, attachmentText: string}}
 */
export function renderWeekly(events) {
  const text = truncateToBytes(
    events.length === 1 ? STRINGS.weeklyHeaderSingular : STRINGS.weeklyHeaderPlural(events.length),
    MAIN_POST_MAX_BYTES
  );

  if (events.length === 0) {
    return { text: truncateToBytes(STRINGS.weeklyEmpty, MAIN_POST_MAX_BYTES), attachmentText: '' };
  }

  const attachmentText = truncateToBytes(
    events.map((event) => `${eventSummary(event)}\n${eventLink(event)}`).join('\n\n'),
    ATTACHMENT_MAX_BYTES
  );
  return { text, attachmentText };
}
