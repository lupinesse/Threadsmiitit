/**
 * @fileoverview Distributed sliding-window rate limiter, backed by Netlify Blobs.
 *
 * Used as a backstop for /api/chat when the Netlify edge rate limit
 * (netlify.toml `[[edge_rules]]`, Pro plan or higher) isn't active — on
 * lower plans that rule silently doesn't apply, so without this the
 * endpoint would have no rate limiting at all. Hit timestamps are persisted
 * in a shared `rate-limit` Blobs store (the same mechanism `eventsStore.mjs`
 * uses), keyed by client id, so the limit holds across every warm function
 * instance and cold start rather than resetting per instance as the
 * previous in-memory `Map` implementation did (#77).
 *
 * This still accepts a check-then-act race for concurrent requests hitting
 * the same key at the same instant: two requests can both read the same
 * hit list before either writes back, so a client right at the boundary
 * could occasionally slip one request over the limit. That's an accepted
 * tradeoff for a backstop layer — the primary limit is the Netlify edge
 * rule — and it only ever under-limits by a small margin, never
 * over-limits a legitimate client.
 *
 * If the Blobs store itself errors (outage, cold-start misconfiguration),
 * this fails open (allows the request) rather than throwing: a backstop
 * layer's own storage hiccup must not take down the primary feature it's
 * merely defending, so an unlimited request is preferable to a 500.
 */

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'rate-limit';

/** Rate-limit window, in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum requests allowed per key within the window. */
export const RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * A minimal key-value store interface — the subset of `@netlify/blobs`'s
 * `Store` this module relies on. Real Blobs stores and the in-memory test
 * fake (`test/fakes/blobsStore.mjs`) both satisfy it.
 * @typedef {object} BlobStoreLike
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<unknown>} set
 */

/**
 * Resolves the Blobs store to use, defaulting to a real `rate-limit` store
 * with strict consistency — the limiter must see its own most recent write
 * immediately, or a client could burst past the limit between reads.
 * @param {BlobStoreLike} [store] - Injectable for tests.
 * @returns {BlobStoreLike}
 */
function resolveStore(store) {
  return store ?? getStore({ name: STORE_NAME, consistency: 'strict' });
}

/**
 * Filters `hits` down to those still inside the window and decides whether
 * one more is allowed, recording it if so. Pure — no I/O — so the sliding
 * window logic itself stays unit-testable without a store. Order of `hits`
 * doesn't matter — each element is filtered independently by its own age,
 * not by position — so callers don't need to keep the array sorted.
 * @param {number[]} hits - Prior hit timestamps (ms), any order.
 * @param {number} now - Current time (ms).
 * @param {number} windowMs - Window size (ms).
 * @param {number} max - Maximum hits allowed within the window.
 * @returns {{allowed: boolean, hits: number[]}} Whether this hit is allowed,
 *   and the pruned (plus this hit, if allowed) hit list to persist.
 */
export function recordHit(hits, now, windowMs, max) {
  const recentHits = hits.filter((hitTime) => now - hitTime < windowMs);
  const allowed = recentHits.length < max;
  if (allowed) {
    recentHits.push(now);
  }
  return { allowed, hits: recentHits };
}

/**
 * Checks whether `key` is currently under its rate limit, recording this
 * call as a hit when it is. Hits older than the window are pruned on every
 * call, so the persisted list never grows unbounded for a given key.
 *
 * @param {string} key - Client identifier (e.g. IP address).
 * @param {object} [options]
 * @param {number} [options.now] - Injectable current time (ms), for testing.
 * @param {number} [options.windowMs] - Injectable window size, for testing.
 * @param {number} [options.max] - Injectable request cap, for testing.
 * @param {BlobStoreLike} [options.store] - Injectable store, for testing.
 * @returns {Promise<boolean>} True if the request is allowed under the
 *   limit — also true (fails open) if the store itself errors.
 */
export async function isWithinRateLimit(
  key,
  { now = Date.now(), windowMs = RATE_LIMIT_WINDOW_MS, max = RATE_LIMIT_MAX_REQUESTS, store } = {}
) {
  const blobStore = resolveStore(store);
  try {
    const raw = await blobStore.get(key);
    const existingHits = raw ? JSON.parse(raw) : [];
    const { allowed, hits } = recordHit(existingHits, now, windowMs, max);
    await blobStore.set(key, JSON.stringify(hits));
    return allowed;
  } catch (error) {
    console.error('[rate-limit] Blobs store error — failing open for this request', {
      key,
      error,
    });
    return true;
  }
}
