/**
 * @fileoverview In-memory sliding-window rate limiter.
 *
 * Used as a backstop for /api/chat when the Netlify edge rate limit
 * (netlify.toml `[[edge_rules]]`, Pro plan or higher) isn't active — on
 * lower plans that rule silently doesn't apply, so without this the
 * endpoint would have no rate limiting at all. This is per-instance only:
 * each warm function instance keeps its own in-memory store, so a client
 * routed to different instances (cold starts, multiple concurrent
 * instances) gets a separate budget on each. It's a backstop against a
 * single client hammering one warm instance, not a substitute for a real
 * distributed limiter.
 */

/** Rate-limit window, in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum requests allowed per key within the window. */
export const RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * Checks whether `key` is currently under its rate limit, recording this
 * call as a hit when it is. Hits older than the window are pruned from the
 * store on every call, so the store never grows unbounded for a given key.
 *
 * @param {Map<string, number[]>} store - Hit-timestamp store, keyed by client id.
 * @param {string} key - Client identifier (e.g. IP address).
 * @param {object} [options]
 * @param {number} [options.now] - Injectable current time (ms), for testing.
 * @param {number} [options.windowMs] - Injectable window size, for testing.
 * @param {number} [options.max] - Injectable request cap, for testing.
 * @returns {boolean} True if the request is allowed under the limit.
 */
export function isWithinRateLimit(
  store,
  key,
  { now = Date.now(), windowMs = RATE_LIMIT_WINDOW_MS, max = RATE_LIMIT_MAX_REQUESTS } = {}
) {
  const recentHits = (store.get(key) ?? []).filter((hitTime) => now - hitTime < windowMs);
  const allowed = recentHits.length < max;
  if (allowed) {
    recentHits.push(now);
  }
  store.set(key, recentHits);
  return allowed;
}
