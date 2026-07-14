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
 * returns null.
 * @param {string|null|undefined} signedRequest
 * @param {string} secret - The Meta app secret.
 * @returns {SignedRequestPayload|null}
 */
export function verifySignedRequest(signedRequest, secret) {
  if (typeof signedRequest !== 'string' || !signedRequest.includes('.')) return null;

  const [encodedSig, encodedPayload] = signedRequest.split('.');
  if (!encodedSig || !encodedPayload) return null;

  let payload;
  try {
    payload = JSON.parse(b64uDecode(encodedPayload));
  } catch {
    return null;
  }
  if (payload?.algorithm?.toUpperCase?.() !== 'HMAC-SHA256') return null;

  let expected;
  let got;
  try {
    expected = createHmac('sha256', secret).update(encodedPayload).digest();
    got = Buffer.from(encodedSig, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;

  return payload;
}
