/**
 * Netlify scheduled Function: daily new-meetups check.
 *
 * Runs once a day. Scheduled functions can't carry a payload and have only
 * a 30 s budget — posting a root + one reply per newly-approved event could
 * exceed that once several events land in a day, so this function only
 * decides *whether* there's anything new and, if so, triggers
 * `bot-post-daily-background.js` (a background function, ~15 min budget)
 * to do the actual posting. That background function re-derives what to
 * post from state itself, so this trigger carries no payload of its own.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { BOT_ENABLED, BOT_DRY_RUN, DAILY_DIGEST_HOUR_UTC } from './lib/botConfig.mjs';
import { listAllEvents } from './lib/eventsStore.mjs';
import { getBotState, putBotState, newlyApproved } from './lib/botState.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the bot-daily handler, with every dependency injectable for
 * tests: the events store, the bot-state store, the bot-enabled/dry-run
 * flags, `fetch`, the clock, and the site's own base URL (used to reach
 * the background function).
 * @param {object} [deps]
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [deps.eventsStore]
 * @param {import('./lib/botState.mjs').BlobStoreLike} [deps.botStateStore]
 * @param {boolean} [deps.botEnabled]
 * @param {boolean} [deps.dryRun]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now] - Injectable clock for tests.
 * @param {string} [deps.siteUrl] - Defaults to Netlify's own `URL` env var, falling back to the
 *   production domain if that's ever unset (mirrors `auth-callback.js`'s convention).
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler({
  eventsStore,
  botStateStore,
  botEnabled = BOT_ENABLED,
  dryRun = BOT_DRY_RUN,
  fetchImpl = fetch,
  now = Date.now,
  siteUrl = process.env.URL || 'https://threadsmiitit.netlify.app',
} = {}) {
  return async function handler(_req) {
    if (!botEnabled) {
      console.log('[bot-daily] BOT_ENABLED is false — skipping');
      return new Response(null, { status: 204 });
    }

    const events = await listAllEvents(eventsStore);
    const state = await getBotState(botStateStore);
    const pending = newlyApproved(events, state);

    if (pending.length === 0) {
      console.log('[bot-daily] nothing new to announce today');
    } else if (dryRun) {
      console.log(
        `[bot-daily] DRY RUN — would trigger the background poster for ${pending.length} new event(s)`
      );
    } else {
      await fetchImpl(`${siteUrl}/.netlify/functions/bot-post-daily-background`, {
        method: 'POST',
      });
      console.log(`[bot-daily] triggered the background poster for ${pending.length} new event(s)`);
    }

    await putBotState({ ...state, lastDailyRunAtMs: now() }, botStateStore);
    return new Response(null, { status: 204 });
  };
}

export default withSentry(createHandler());

export const config = { schedule: `0 ${DAILY_DIGEST_HOUR_UTC} * * *` };
