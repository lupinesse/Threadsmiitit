/**
 * Netlify scheduled Function: bot token refresh.
 *
 * Runs weekly (Monday 03:00 UTC) and refreshes the broadcast bot's Threads
 * access token if it's within 7 days of expiring — comfortably inside the
 * ~60-day expiry window even if a run is missed once. Refreshing every week
 * regardless would work too, but only actually refreshing near expiry keeps
 * the token's `expiresAt` history meaningful for debugging and avoids
 * needless calls to a third-party API.
 *
 * No-ops (logging why) when the bot is disabled or no token has been seeded
 * yet — this function never mints a token from scratch; that's
 * `scripts/seed-bot-token.mjs`'s job, run once by hand.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { BOT_ENABLED } from './lib/botConfig.mjs';
import { getBotToken, putBotToken } from './lib/botState.mjs';
import { refreshToken } from './lib/threadsClient.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/** Refresh once the token is within this many ms of expiring. */
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Builds the bot-token-refresh handler, with the Blobs store, clock, fetch,
 * and the bot-enabled flag all injectable for tests — `botEnabled` defaults
 * to the real `BOT_ENABLED` env-derived constant, read once at module load,
 * same as the rest of this codebase's env-var conventions; tests override it
 * directly rather than mutating `process.env` after import.
 * @param {import('./lib/botState.mjs').BlobStoreLike} [store]
 * @param {() => number} [now] - Injectable clock for tests.
 * @param {boolean} [botEnabled]
 * @param {typeof fetch} [fetchImpl] - Injectable for tests.
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store, now = Date.now, botEnabled = BOT_ENABLED, fetchImpl = fetch) {
  return async function handler(_req) {
    if (!botEnabled) {
      console.log('[bot-token-refresh] BOT_ENABLED is false — bot disabled, skipping');
      return new Response(null, { status: 204 });
    }

    const token = await getBotToken(store);
    if (!token) {
      console.log(
        '[bot-token-refresh] no token seeded yet — run scripts/seed-bot-token.mjs first, skipping'
      );
      return new Response(null, { status: 204 });
    }

    if (token.expiresAt - now() > REFRESH_WINDOW_MS) {
      console.log('[bot-token-refresh] token still valid, outside the refresh window — no action');
      return new Response(null, { status: 204 });
    }

    const refreshed = await refreshToken({ accessToken: token.accessToken, now, fetchImpl });
    await putBotToken(refreshed, store);
    console.log(
      `[bot-token-refresh] refreshed — new expiry ${new Date(refreshed.expiresAt).toISOString()}`
    );
    return new Response(null, { status: 204 });
  };
}

export default withSentry(createHandler());

export const config = { schedule: '0 3 * * 1' };
