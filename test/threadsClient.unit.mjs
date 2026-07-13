/**
 * Unit tests for netlify/functions/lib/threadsClient.mjs — run with Node's
 * built-in test runner as part of `npm test`. `fetch` is mocked throughout;
 * nothing here makes a real call to the Threads API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  publish,
  refreshToken,
  exchangeAuthCode,
  fetchBotProfile,
} from '../netlify/functions/lib/threadsClient.mjs';

/**
 * Builds a fake fetch that returns canned JSON responses in sequence — one
 * per call, in the order given — and records every call it received.
 * @param {Array<{status?: number, body?: object, text?: string}>} responses
 * @returns {{fetchImpl: typeof fetch, calls: Array<{url: string, opts: object}>}}
 */
function fakeFetchSequence(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const { status = 200, body = {}, text } = responses[i++] ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text ?? JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

describe('publish', () => {
  it('creates a container then publishes it, in that order', async () => {
    const { fetchImpl, calls } = fakeFetchSequence([
      { body: { id: 'creation-1' } },
      { body: { id: 'post-1' } },
    ]);
    const result = await publish({
      accessToken: 'tok',
      threadsUserId: 'bot123',
      text: 'Hello Threads',
      fetchImpl,
    });
    assert.deepStrictEqual(result, { id: 'post-1' });
    assert.match(calls[0].url, /\/bot123\/threads$/);
    assert.match(calls[1].url, /\/bot123\/threads_publish$/);
    assert.strictEqual(new URLSearchParams(calls[1].opts.body).get('creation_id'), 'creation-1');
  });

  it('includes plaintext and reply_to_id in the create call when given', async () => {
    const { fetchImpl, calls } = fakeFetchSequence([
      { body: { id: 'creation-2' } },
      { body: { id: 'post-2' } },
    ]);
    await publish({
      accessToken: 'tok',
      threadsUserId: 'bot123',
      text: 'Weekly summary',
      attachmentText: 'The whole week, in detail',
      replyToId: 'root-1',
      fetchImpl,
    });
    const createBody = new URLSearchParams(calls[0].opts.body);
    assert.strictEqual(createBody.get('plaintext'), 'The whole week, in detail');
    assert.strictEqual(createBody.get('reply_to_id'), 'root-1');
    assert.strictEqual(createBody.get('media_type'), 'TEXT');
  });

  it('throws with the response status and body when container creation fails', async () => {
    const { fetchImpl } = fakeFetchSequence([{ status: 400, text: 'bad request' }]);
    await assert.rejects(
      () => publish({ accessToken: 'tok', threadsUserId: 'bot123', text: 'x', fetchImpl }),
      /container create failed \(400\).*bad request/s
    );
  });

  it('throws when publishing the container fails', async () => {
    const { fetchImpl } = fakeFetchSequence([
      { body: { id: 'creation-3' } },
      { status: 500, text: 'server error' },
    ]);
    await assert.rejects(
      () => publish({ accessToken: 'tok', threadsUserId: 'bot123', text: 'x', fetchImpl }),
      /publish failed \(500\).*server error/s
    );
  });

  it('wraps a network failure during container creation in an informative error', async () => {
    const fetchImpl = async () => {
      throw new Error('getaddrinfo ENOTFOUND graph.threads.net');
    };
    await assert.rejects(
      () => publish({ accessToken: 'tok', threadsUserId: 'bot123', text: 'x', fetchImpl }),
      /container create request failed.*ENOTFOUND/s
    );
  });

  it('wraps a network failure during publish in an informative error', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => ({ id: 'creation-4' }) };
      throw new Error('socket hang up');
    };
    await assert.rejects(
      () => publish({ accessToken: 'tok', threadsUserId: 'bot123', text: 'x', fetchImpl }),
      /publish request failed.*socket hang up/s
    );
  });
});

describe('refreshToken', () => {
  it('returns a fresh access token and its expiry', async () => {
    const { fetchImpl, calls } = fakeFetchSequence([
      { body: { access_token: 'new-tok', expires_in: 5184000 } },
    ]);
    const result = await refreshToken({ accessToken: 'old-tok', fetchImpl, now: () => 1000 });
    assert.deepStrictEqual(result, { accessToken: 'new-tok', expiresAt: 1000 + 5184000 * 1000 });
    assert.match(calls[0].url, /grant_type=th_refresh_token/);
    assert.match(calls[0].url, /access_token=old-tok/);
  });

  it('throws with status and body on failure', async () => {
    const { fetchImpl } = fakeFetchSequence([{ status: 401, text: 'invalid token' }]);
    await assert.rejects(
      () => refreshToken({ accessToken: 'old-tok', fetchImpl }),
      /token refresh failed \(401\).*invalid token/s
    );
  });
});

describe('exchangeAuthCode', () => {
  it('exchanges a code for a short-lived token, then for a long-lived one', async () => {
    const { fetchImpl, calls } = fakeFetchSequence([
      { body: { access_token: 'short-tok' } },
      { body: { access_token: 'long-tok', expires_in: 5184000 } },
    ]);
    const result = await exchangeAuthCode({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://example.com/callback',
      code: 'auth-code',
      fetchImpl,
      now: () => 2000,
    });
    assert.deepStrictEqual(result, { accessToken: 'long-tok', expiresAt: 2000 + 5184000 * 1000 });
    assert.match(calls[0].url, /\/oauth\/access_token$/);
    assert.match(calls[1].url, /grant_type=th_exchange_token/);
  });

  it('throws if the auth-code exchange fails', async () => {
    const { fetchImpl } = fakeFetchSequence([{ status: 400, text: 'bad code' }]);
    await assert.rejects(
      () =>
        exchangeAuthCode({
          clientId: 'id',
          clientSecret: 'secret',
          redirectUri: 'https://example.com/callback',
          code: 'bad',
          fetchImpl,
        }),
      /auth-code exchange failed \(400\).*bad code/s
    );
  });

  it('throws if the long-lived exchange fails', async () => {
    const { fetchImpl } = fakeFetchSequence([
      { body: { access_token: 'short-tok' } },
      { status: 400, text: 'bad exchange' },
    ]);
    await assert.rejects(
      () =>
        exchangeAuthCode({
          clientId: 'id',
          clientSecret: 'secret',
          redirectUri: 'https://example.com/callback',
          code: 'auth-code',
          fetchImpl,
        }),
      /long-lived token exchange failed \(400\).*bad exchange/s
    );
  });
});

describe('fetchBotProfile', () => {
  it('returns the id and username', async () => {
    const { fetchImpl, calls } = fakeFetchSequence([{ body: { id: '999', username: 'bot' } }]);
    const result = await fetchBotProfile({ accessToken: 'tok', fetchImpl });
    assert.deepStrictEqual(result, { id: '999', username: 'bot' });
    assert.match(calls[0].url, /\/me\?/);
  });

  it('throws with status and body on failure', async () => {
    const { fetchImpl } = fakeFetchSequence([{ status: 403, text: 'forbidden' }]);
    await assert.rejects(
      () => fetchBotProfile({ accessToken: 'tok', fetchImpl }),
      /profile fetch failed \(403\).*forbidden/s
    );
  });
});
