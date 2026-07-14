/**
 * Netlify background Function: posts the daily new-meetups comment thread.
 *
 * Triggered by `bot-daily.js`'s scheduled function — never called directly.
 * Background functions (the `-background` filename suffix is what Netlify
 * uses to recognise this) get roughly 15 minutes instead of a scheduled
 * function's 30 s, room enough for a root post plus one reply per event.
 *
 * Re-derives the newly-approved, not-yet-announced events from state
 * itself rather than trusting a payload — scheduled functions can't pass
 * one anyway — so this file is fully self-contained and safe to retry: a
 * re-run (or a retry after a partial failure) only ever posts events that
 * are still unmarked, since each reply is marked announced and persisted
 * immediately after it succeeds, not batched at the end.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { BOT_ENABLED, BOT_DRY_RUN, THREADS_BOT_USER_ID } from './lib/botConfig.mjs';
import { getBotState, getBotToken } from './lib/botState.mjs';
import { fetchAndFilterEvents, postBatch, persistAnnounced } from './lib/botHelpers.mjs';
import { renderDailyRoot, renderDailyReply } from '../../shared/postTemplates.mjs';
import { publish } from './lib/threadsClient.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the bot-post-daily-background handler, with every dependency
 * injectable for tests.
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
      console.log('[bot-post-daily-background] BOT_ENABLED is false — skipping');
      return new Response(null, { status: 204 });
    }

    let state = await getBotState(botStateStore);
    const { pending } = await fetchAndFilterEvents({ eventsStore, state, kind: 'new' });

    if (pending.length === 0) {
      console.log('[bot-post-daily-background] nothing new to announce — no-op');
      return new Response(null, { status: 204 });
    }

    const token = dryRun ? null : await getBotToken(botTokenStore);
    if (!dryRun && !token) {
      console.error(
        '[bot-post-daily-background] BOT_ENABLED but no token seeded — skipping this run'
      );
      return new Response(null, { status: 204 });
    }

    const rootText = renderDailyRoot(pending.length);
    let rootId = null;
    if (dryRun) {
      console.log(`[bot-post-daily-background] DRY RUN — would post root: ${rootText}`);
    } else {
      const result = await publish({
        accessToken: token.accessToken,
        threadsUserId: THREADS_BOT_USER_ID,
        text: rootText,
        fetchImpl,
      });
      rootId = result.id;
      console.log(`[bot-post-daily-background] posted daily root (id ${rootId})`);
    }

    await postBatch({
      items: pending,
      dryRun,
      logPrefix: '[bot-post-daily-background]',
      renderText: (event) => renderDailyReply(event),
      publishOne: (_event, text) =>
        publish({
          accessToken: token.accessToken,
          threadsUserId: THREADS_BOT_USER_ID,
          text,
          replyToId: rootId,
          fetchImpl,
        }),
      successLog: (event) => `announced new event ${event.id}`,
      onSuccess: async (event) => {
        state = await persistAnnounced({
          state,
          botStateStore,
          kind: 'new',
          eventId: event.id,
        });
      },
    });

    return new Response(null, { status: 204 });
  };
}

export default withSentry(createHandler());
