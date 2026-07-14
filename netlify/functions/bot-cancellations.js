/**
 * Netlify scheduled Function: cancellation announcer.
 *
 * Runs every 5 minutes. When enabled, finds every cancelled event not yet
 * announced, posts one immediate Threads post per event (capped per run —
 * see `CANCELLATION_BATCH_SIZE` — so a run stays well under the 30 s
 * scheduled-function budget; any remainder is simply picked up by the next
 * tick), and marks each announced as soon as its post succeeds. State is
 * persisted after every single event, not batched at the end, so a mid-run
 * failure (e.g. the Threads API going down partway through) never re-posts
 * the ones that already succeeded.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import {
  BOT_ENABLED,
  BOT_DRY_RUN,
  THREADS_BOT_USER_ID,
  CANCELLATION_BATCH_SIZE,
} from './lib/botConfig.mjs';
import { getBotState, putBotState, getBotToken, updateSnapshot } from './lib/botState.mjs';
import { fetchAndFilterEvents, postBatch, persistAnnounced } from './lib/botHelpers.mjs';
import { renderCancellation } from '../../shared/postTemplates.mjs';
import { publish } from './lib/threadsClient.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the bot-cancellations handler, with every dependency injectable
 * for tests: the events store, the bot-state store, the bot-token store,
 * the bot-enabled/dry-run flags (defaulting to the real env-derived
 * constants), and `fetch`.
 * @param {object} [deps]
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [deps.eventsStore]
 * @param {import('./lib/botState.mjs').BlobStoreLike} [deps.botStateStore]
 * @param {import('./lib/botState.mjs').BlobStoreLike} [deps.botTokenStore]
 * @param {boolean} [deps.botEnabled]
 * @param {boolean} [deps.dryRun]
 * @param {typeof fetch} [deps.fetchImpl]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler({
  eventsStore,
  botStateStore,
  botTokenStore,
  botEnabled = BOT_ENABLED,
  dryRun = BOT_DRY_RUN,
  fetchImpl = fetch,
} = {}) {
  return async function handler(_req) {
    if (!botEnabled) {
      console.log('[bot-cancellations] BOT_ENABLED is false — skipping');
      return new Response(null, { status: 204 });
    }

    let state = await getBotState(botStateStore);
    const { events, pending } = await fetchAndFilterEvents({
      eventsStore,
      state,
      kind: 'cancelled',
      cap: CANCELLATION_BATCH_SIZE,
    });

    if (pending.length === 0) {
      console.log('[bot-cancellations] nothing new to announce');
      await putBotState(updateSnapshot(state, events), botStateStore);
      return new Response(null, { status: 204 });
    }

    const token = dryRun ? null : await getBotToken(botTokenStore);
    if (!dryRun && !token) {
      console.error('[bot-cancellations] BOT_ENABLED but no token seeded — skipping this run');
      return new Response(null, { status: 204 });
    }

    await postBatch({
      items: pending,
      dryRun,
      logPrefix: '[bot-cancellations]',
      renderText: (event) => renderCancellation(event).text,
      publishOne: (_event, text) =>
        publish({
          accessToken: token.accessToken,
          threadsUserId: THREADS_BOT_USER_ID,
          text,
          fetchImpl,
        }),
      successLog: (event) => `announced cancellation of event ${event.id}`,
      errorLog: (event) => `failed to announce event ${event.id}`,
      onSuccess: async (event) => {
        state = await persistAnnounced({
          state,
          botStateStore,
          kind: 'cancelled',
          eventId: event.id,
        });
      },
    });

    await putBotState(updateSnapshot(state, events), botStateStore);
    return new Response(null, { status: 204 });
  };
}

export default withSentry(createHandler());

export const config = { schedule: '*/5 * * * *' };
