/**
 * Unit tests for netlify/functions/lib/metaSignedRequest.mjs — run with
 * Node's built-in test runner as part of `npm test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifySignedRequest } from '../netlify/functions/lib/metaSignedRequest.mjs';

const SECRET = 'test-app-secret';

/**
 * Builds a valid Meta signed_request string for the given payload.
 * @param {object} payload
 * @param {string} [secret]
 * @returns {string}
 */
function buildSignedRequest(payload, secret = SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${sig}.${encodedPayload}`;
}

describe('verifySignedRequest', () => {
  it('decodes a validly-signed payload', () => {
    const payload = { algorithm: 'HMAC-SHA256', user_id: '12345', issued_at: 1 };
    const result = verifySignedRequest(buildSignedRequest(payload), SECRET);
    assert.deepStrictEqual(result, payload);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const payload = { algorithm: 'HMAC-SHA256', user_id: '12345' };
    const signed = buildSignedRequest(payload, 'wrong-secret');
    assert.strictEqual(verifySignedRequest(signed, SECRET), null);
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const payload = { algorithm: 'HMAC-SHA256', user_id: '12345' };
    const [sig, encodedPayload] = buildSignedRequest(payload).split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '99999' })
    ).toString('base64url');
    assert.strictEqual(verifySignedRequest(`${sig}.${tamperedPayload}`, SECRET), null);
    // sanity: original still verifies
    assert.ok(verifySignedRequest(`${sig}.${encodedPayload}`, SECRET));
  });

  it('rejects an unsupported algorithm', () => {
    const payload = { algorithm: 'MD5', user_id: '12345' };
    assert.strictEqual(verifySignedRequest(buildSignedRequest(payload), SECRET), null);
  });

  for (const bad of [null, undefined, '', 'no-dot-here', '.', 'sig.', '.payload']) {
    it(`rejects malformed input: ${JSON.stringify(bad)}`, () => {
      assert.strictEqual(verifySignedRequest(bad, SECRET), null);
    });
  }

  it('rejects a payload whose JSON is invalid', () => {
    const badPayload = Buffer.from('not json').toString('base64url');
    const sig = createHmac('sha256', SECRET).update(badPayload).digest('base64url');
    assert.strictEqual(verifySignedRequest(`${sig}.${badPayload}`, SECRET), null);
  });
});
