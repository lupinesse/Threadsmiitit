/**
 * Netlify scheduled Function: weekly summary.
 *
 * Fires at two candidate UTC times every Sunday (17:00 and 18:00 — one
 * cron field, `0 17,18 * * 0`) since Netlify cron has no timezone
 * awareness and Europe/Helsinki's 20:00 lands on a different UTC hour in
 * summer (EEST, UTC+3) than in winter (EET, UTC+2). `lib/weeklyGate.mjs`
 * decides which tick, if either, is the real one — the other is a no-op —
 * and `lastWeeklyTargetSunday` guards against both ticks posting on the
 * (rare) day both happen to pass the hour check.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { BOT_ENABLED, BOT_DRY_RUN, THREADS_BOT_USER_ID } from './lib/botConfig.mjs';
import { isWeeklyPostWindow, localDateStr, upcomingWeekRange } from './lib/weeklyGate.mjs';
import { listAllEvents } from './lib/eventsStore.mjs';
import { getBotState, putBotState, getBotToken } from './lib/botState.mjs';
import { renderWeekly } from '../../shared/postTemplates.mjs';
import { publish } from './lib/threadsClient.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the bot-weekly handler, with every dependency injectable for tests.
 * @param {object} [deps]
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [deps.eventsStore]
 * @param {import('./lib/botState.mjs').BlobStoreLike} [deps.botStateStore]
 * @param {import('./lib/botState.mjs').BlobStoreLike} [deps.botTokenStore]
 * @param {boolean} [deps.botEnabled]
 * @param {boolean} [deps.dryRun]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => number} [deps.now] - Injectable clock for tests.
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler({
  eventsStore,
  botStateStore,
  botTokenStore,
  botEnabled = BOT_ENABLED,
  dryRun = BOT_DRY_RUN,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  return async function handler(_req) {
    if (!botEnabled) {
      console.log('[bot-weekly] BOT_ENABLED is false — skipping');
      return new Response(null, { status: 204 });
    }

    const nowMs = now();
    if (!isWeeklyPostWindow(nowMs)) {
      console.log('[bot-weekly] not the target Helsinki hour — skipping this tick');
      return new Response(null, { status: 204 });
    }

    const today = localDateStr(nowMs);
    const state = await getBotState(botStateStore);
    if (state.lastWeeklyTargetSunday === today) {
      console.log(
        `[bot-weekly] already posted for ${today} — skipping (the other candidate tick ran)`
      );
      return new Response(null, { status: 204 });
    }

    const { start, end } = upcomingWeekRange(today);
    const events = await listAllEvents(eventsStore);
    const upcoming = events
      .filter((e) => e.status === 'approved' && e.date >= start && e.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));

    const { text, attachmentText } = renderWeekly(upcoming);

    if (dryRun) {
      console.log(`[bot-weekly] DRY RUN — would post: ${text}\n---\n${attachmentText}`);
    } else {
      const token = await getBotToken(botTokenStore);
      if (!token) {
        console.error('[bot-weekly] BOT_ENABLED but no token seeded — skipping this run');
        return new Response(null, { status: 204 });
      }
      await publish({
        accessToken: token.accessToken,
        threadsUserId: THREADS_BOT_USER_ID,
        text,
        attachmentText,
        fetchImpl,
      });
      console.log(
        `[bot-weekly] posted weekly summary for ${start}..${end} (${upcoming.length} events)`
      );
    }

    await putBotState({ ...state, lastWeeklyTargetSunday: today }, botStateStore);
    return new Response(null, { status: 204 });
  };
}

export default withSentry(createHandler());

export const config = { schedule: '0 17,18 * * 0' };
