/**
 * @fileoverview Verifies Meta's `signed_request` payload, sent as a POST
 * body param to the data-deletion (`auth-delete.js`) and uninstall
 * (`auth-uninstall.js`) callbacks. Format and verification algorithm per
 * https://developers.facebook.com/docs/reference/login/signed-request/ —
 * `${base64url(HMAC-SHA256 signature)}.${base64url(JSON payload)}`, signed
 * with the Meta app secret (the same `THREADS_CLIENT_SECRET` used for OAuth
 * token exchange in `threadsClient.mjs`).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * @typedef {object} SignedRequestPayload
 * @property {string} algorithm
 * @property {string} [user_id] - The Threads-scoped user id, present on
 *   data-deletion and deauthorize callbacks.
 */

/**
 * Decodes a base64url string to a UTF-8 string.
 * @param {string} value
 * @returns {string}
 */
function b64uDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/**
 * Verifies and decodes Meta's `signed_request` param. Never throws — any
 * failure (bad format, bad signature, wrong secret, unsupported algorithm)
 * returns null. Each failure path logs its specific reason (never just
 * "verification failed") so a rejected callback is debuggable from logs
 * alone — a malformed/forged request is expected, attacker-reachable input,
 * not just a misconfiguration, so these are worth distinguishing.
 * @param {string|null|undefined} signedRequest
 * @param {string} secret - The Meta app secret.
 * @returns {SignedRequestPayload|null}
 */
export function verifySignedRequest(signedRequest, secret) {
  if (typeof signedRequest !== 'string' || !signedRequest.includes('.')) {
    console.warn('[metaSignedRequest] malformed signed_request: not a "sig.payload" string');
    return null;
  }

  const [encodedSig, encodedPayload] = signedRequest.split('.');
  if (!encodedSig || !encodedPayload) {
    console.warn(
      '[metaSignedRequest] malformed signed_request: empty signature or payload segment'
    );
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(b64uDecode(encodedPayload));
  } catch {
    console.warn('[metaSignedRequest] payload segment is not valid base64url-encoded JSON');
    return null;
  }
  if (payload?.algorithm?.toUpperCase?.() !== 'HMAC-SHA256') {
    console.warn(`[metaSignedRequest] unsupported algorithm: ${payload?.algorithm}`);
    return null;
  }

  let expected;
  let got;
  try {
    expected = createHmac('sha256', secret).update(encodedPayload).digest();
    got = Buffer.from(encodedSig, 'base64url');
  } catch (err) {
    // Most commonly a missing/misconfigured THREADS_CLIENT_SECRET.
    console.error('[metaSignedRequest] failed to compute expected HMAC', err);
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    console.warn('[metaSignedRequest] signature does not match — rejecting');
    return null;
  }

  return payload;
}
