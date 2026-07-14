/**
 * @fileoverview Small, single-purpose helpers shared by the broadcast bot's
 * trigger functions (`bot-cancellations.js`, `bot-post-daily-background.js`,
 * `bot-daily.js`). Extracted per #90 so each `createHandler` reads as a
 * short sequence of named steps rather than one long, everything-inline
 * function.
 *
 * `bot-weekly.js` intentionally does not use `postBatch`/`persistAnnounced`
 * — it publishes a single summary rather than iterating a batch, and tracks
 * `lastWeeklyTargetSunday` instead of an announced-id ledger, so its shape
 * is genuinely different from the per-event triggers.
 */

import { listAllEvents } from './eventsStore.mjs';
import { putBotState, markAnnounced, newlyApproved, newlyCancelled } from './botState.mjs';

/**
 * Loads every event from the events store and returns both the full list
 * and the pending subset for a given trigger kind (approved-but-unannounced
 * for `'new'`, cancelled-but-unannounced for `'cancelled'`), optionally
 * capping the pending batch so a run stays within its function budget.
 *
 * The full `events` list is returned alongside `pending` because
 * `bot-cancellations.js` needs it for the final `updateSnapshot` call —
 * splitting that into a second `listAllEvents` call would double the
 * blob-store round-trips for no benefit.
 *
 * @param {object} params
 * @param {import('./eventsStore.mjs').BlobStoreLike} [params.eventsStore]
 * @param {import('./botState.mjs').BotState} params.state
 * @param {'new'|'cancelled'} params.kind
 * @param {number} [params.cap] - Max pending items to return. Omit for no cap.
 * @returns {Promise<{events: Array<{id: string, status: string}>, pending: Array<{id: string, status: string}>}>}
 */
export async function fetchAndFilterEvents({ eventsStore, state, kind, cap }) {
  const events = await listAllEvents(eventsStore);
  const filter = kind === 'new' ? newlyApproved : newlyCancelled;
  const filtered = filter(events, state);
  const pending = typeof cap === 'number' ? filtered.slice(0, cap) : filtered;
  return { events, pending };
}

/**
 * Iterates a batch of items, calling `publishOne(item, text)` for each in
 * turn, then `onSuccess(item)` after every success. A failure of
 * `publishOne` is caught and logged with `logPrefix`, and the loop
 * continues with the next item — a single bad post never aborts the whole
 * batch, mirroring the skip-and-continue pattern the trigger functions used
 * inline before this extraction.
 *
 * In dry-run mode, `publishOne` is not called; only the "would post" line
 * is logged, and `onSuccess` still fires so callers can persist the
 * mark-announced state exactly as they do in the real branch.
 *
 * @param {object} params
 * @param {ReadonlyArray<{id: string}>} params.items
 * @param {boolean} params.dryRun
 * @param {string} params.logPrefix - e.g. `'[bot-cancellations]'`.
 * @param {(item: {id: string}) => string} params.renderText - Returns the text that would be posted.
 * @param {(item: {id: string}, text: string) => Promise<unknown>} params.publishOne -
 *   The real publish call. Not invoked in dry-run.
 * @param {(item: {id: string}) => Promise<void>} params.onSuccess -
 *   Called after every successful post (or dry-run log). Callers persist mark-announced state here.
 * @param {(item: {id: string}) => string} [params.successLog] -
 *   If provided, the returned string is logged as `${logPrefix} ${successLog(item)}` after each real
 *   post. Not logged in dry-run — the "would post" line already covers that path.
 * @returns {Promise<number>} Number of items successfully posted or dry-run-logged.
 */
export async function postBatch({
  items,
  dryRun,
  logPrefix,
  renderText,
  publishOne,
  onSuccess,
  successLog,
}) {
  let successes = 0;
  for (const item of items) {
    const text = renderText(item);
    if (dryRun) {
      console.log(`${logPrefix} DRY RUN — would post: ${text}`);
    } else {
      try {
        await publishOne(item, text);
      } catch (err) {
        // Skip only this item — leaving it unmarked means the next tick
        // retries it — rather than aborting the whole batch on one
        // failure and leaving every other pending item unattempted too.
        console.error(`${logPrefix} failed to post for item ${item.id}`, err);
        continue;
      }
      if (successLog) console.log(`${logPrefix} ${successLog(item)}`);
    }
    await onSuccess(item);
    successes += 1;
  }
  return successes;
}

/**
 * Marks an event announced for a given trigger kind and immediately
 * persists the updated state, so a mid-batch failure never re-announces
 * events that already succeeded on a later retry. Returns the new state so
 * the caller can keep threading it through subsequent iterations without
 * losing the mark.
 *
 * @param {object} params
 * @param {import('./botState.mjs').BotState} params.state
 * @param {import('./botState.mjs').BlobStoreLike} [params.botStateStore]
 * @param {'new'|'cancelled'} params.kind
 * @param {string} params.eventId
 * @returns {Promise<import('./botState.mjs').BotState>} The updated state.
 */
export async function persistAnnounced({ state, botStateStore, kind, eventId }) {
  const updated = markAnnounced(state, kind, eventId);
  await putBotState(updated, botStateStore);
  return updated;
}
