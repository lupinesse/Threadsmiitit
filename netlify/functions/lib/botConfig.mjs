/**
 * @fileoverview Centralised broadcast-bot configuration — safety switches and
 * timing constants shared by every bot-* Netlify Function. Read once at
 * module load, same as the rest of this codebase's env-var conventions
 * (see e.g. `netlify/functions/chat.js`'s `ALLOWED_ORIGIN`).
 */

/**
 * Master switch. Must be exactly `'true'` to allow any real posting —
 * every other value (including unset) keeps the bot fully inert. Defaults
 * off so the bot can be deployed and validated (see `BOT_DRY_RUN`) well
 * before it's allowed to post anything.
 * @type {boolean}
 */
export const BOT_ENABLED = process.env.BOT_ENABLED === 'true';

/**
 * When true, bot-* functions log the post they would have made instead of
 * calling the Threads API. Defaults on — must be explicitly set to
 * `'false'` to post for real, so a missing/misconfigured env var fails safe.
 * @type {boolean}
 */
export const BOT_DRY_RUN = process.env.BOT_DRY_RUN !== 'false';

/**
 * The bot's own Threads user id (numeric), used as the `{threads-user-id}`
 * path segment in every `threadsClient.mjs` call. Empty string if unset —
 * callers should treat that as "not configured yet" rather than a valid id.
 * @type {string}
 */
export const THREADS_BOT_USER_ID = process.env.THREADS_BOT_USER_ID ?? '';

/** IANA timezone the weekly-summary post's target time is computed against. */
export const WEEKLY_TIMEZONE = 'Europe/Helsinki';

/** Local hour (0–23) in `WEEKLY_TIMEZONE` the weekly summary should post at. */
export const WEEKLY_TARGET_HOUR = 20;

/**
 * UTC hour (0–23) the daily new-meetups digest is scheduled to run at.
 * Unlike the weekly post, DST drift shifting this by an hour twice a year
 * is harmless for a once-a-day digest, so no timezone gate is needed here.
 */
export const DAILY_DIGEST_HOUR_UTC = 8;
