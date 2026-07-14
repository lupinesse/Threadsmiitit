/**
 * @fileoverview Resolves the identifier used to key rate-limit buckets for
 * an incoming request's client.
 *
 * Netlify reliably sets `x-nf-client-connection-ip`, but if it's ever
 * absent, falling straight back to a single shared `'unknown'` bucket would
 * let multiple distinct clients rate-limit each other (#78). This tries the
 * standard `x-forwarded-for` header as a secondary signal first — it's set
 * by most proxies/CDNs a request passes through — before giving up.
 *
 * Caveat: unlike `x-nf-client-connection-ip` (set by Netlify from the
 * actual TCP connection, not attacker-controlled), `x-forwarded-for` is a
 * plain request header a client can set to any value it likes. A client
 * that already lacks the Netlify header could rotate a fake
 * `x-forwarded-for` value per request to evade this backstop entirely.
 * Acceptable here because this is a defense-in-depth backstop behind the
 * primary Netlify edge rate limit, not the sole rate limit — see
 * `rate-limit.mjs`'s module doc comment.
 */

/** Shared bucket key used when no client-identifying header is present. */
export const UNKNOWN_CLIENT_ID = 'unknown';

/**
 * Resolves a per-client rate-limit key from request headers.
 * @param {Headers} headers - The incoming request's headers.
 * @returns {{id: string, identified: boolean}} `id` is the header value to
 *   key the rate limit on; `identified` is false only when neither header
 *   yielded anything, i.e. `id` is the shared `'unknown'` bucket.
 */
export function resolveClientId(headers) {
  const nfConnectionIp = headers.get('x-nf-client-connection-ip');
  if (nfConnectionIp) {
    return { id: nfConnectionIp, identified: true };
  }

  // X-Forwarded-For is a comma-separated chain of proxies; the left-most
  // entry is the original client.
  const forwardedFor = headers.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();
  if (firstForwardedIp) {
    return { id: firstForwardedIp, identified: true };
  }

  return { id: UNKNOWN_CLIENT_ID, identified: false };
}
