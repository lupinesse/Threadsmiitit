/**
 * Unit tests for netlify/functions/lib/emailClient.mjs — run with Node's
 * built-in test runner as part of `npm test`. `fetch` is mocked throughout;
 * nothing here makes a real call to the Resend API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sendEmail } from '../netlify/functions/lib/emailClient.mjs';

/**
 * Builds a fake fetch that returns one canned response and records the call
 * it received.
 * @param {{status?: number, body?: object, text?: string}} [response]
 * @returns {{fetchImpl: typeof fetch, calls: Array<{url: string, opts: object}>}}
 */
function fakeFetch(response = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const { status = 200, body = {}, text } = response;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text ?? JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

describe('sendEmail', () => {
  it('posts to the Resend API with the expected headers and body', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: { id: 'email-1' } });
    const result = await sendEmail({
      apiKey: 'key-123',
      from: 'bot@threadsmiitit.netlify.app',
      to: ['admin@example.com'],
      subject: 'Uusi miitti odottaa hyväksyntää',
      text: 'Katso ylläpitopaneelista.',
      fetchImpl,
    });

    assert.deepStrictEqual(result, { id: 'email-1' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api.resend.com/emails');
    assert.strictEqual(calls[0].opts.method, 'POST');
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer key-123');
    assert.strictEqual(calls[0].opts.headers['Content-Type'], 'application/json');

    const body = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual(body, {
      from: 'bot@threadsmiitit.netlify.app',
      to: ['admin@example.com'],
      subject: 'Uusi miitti odottaa hyväksyntää',
      text: 'Katso ylläpitopaneelista.',
    });
  });

  it('throws with the response status and body when the send fails', async () => {
    const { fetchImpl } = fakeFetch({ status: 422, text: 'invalid recipient' });
    await assert.rejects(
      () =>
        sendEmail({
          apiKey: 'key-123',
          from: 'bot@threadsmiitit.netlify.app',
          to: 'admin@example.com',
          subject: 'x',
          text: 'x',
          fetchImpl,
        }),
      /Resend send failed \(422\).*invalid recipient/s
    );
  });

  it('wraps a network failure in an informative error', async () => {
    const fetchImpl = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    };
    await assert.rejects(
      () =>
        sendEmail({
          apiKey: 'key-123',
          from: 'bot@threadsmiitit.netlify.app',
          to: 'admin@example.com',
          subject: 'x',
          text: 'x',
          fetchImpl,
        }),
      /Resend send request failed.*ENOTFOUND/s
    );
  });
});
