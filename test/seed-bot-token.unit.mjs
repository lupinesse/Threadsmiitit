/**
 * Unit tests for scripts/seed-bot-token.mjs's pure exported helpers — run
 * with Node's built-in test runner as part of `npm test`. The interactive
 * `main()` flow (readline prompt, real Blobs write) is intentionally not
 * exercised here; it's a thin orchestrator over already-tested pieces
 * (threadsClient.mjs, botState.mjs) and manual readline interaction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthorizeUrl, extractCode, requireEnv } from '../scripts/seed-bot-token.mjs';

describe('buildAuthorizeUrl', () => {
  it('includes the client id, redirect uri, and required scopes', () => {
    const url = buildAuthorizeUrl({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
    });
    const parsed = new URL(url);
    assert.strictEqual(parsed.searchParams.get('client_id'), 'client-123');
    assert.strictEqual(parsed.searchParams.get('redirect_uri'), 'https://example.com/callback');
    assert.strictEqual(parsed.searchParams.get('response_type'), 'code');
    assert.match(parsed.searchParams.get('scope'), /threads_content_publish/);
  });
});

describe('extractCode', () => {
  it('returns a bare code unchanged', () => {
    assert.strictEqual(extractCode('abc123'), 'abc123');
  });

  it('extracts the code query param from a full redirect URL', () => {
    assert.strictEqual(extractCode('https://example.com/callback?code=xyz789&state=foo'), 'xyz789');
  });

  it('trims surrounding whitespace from pasted input', () => {
    assert.strictEqual(extractCode('  abc123  \n'), 'abc123');
  });

  it('returns an empty string for a URL with no code param', () => {
    assert.strictEqual(extractCode('https://example.com/callback?state=foo'), '');
  });

  it('returns an empty string for unparseable input that looks like a URL', () => {
    assert.strictEqual(extractCode('https://'), '');
  });
});

describe('requireEnv', () => {
  it('does not throw or exit when every required var is set', () => {
    const env = {
      THREADS_CLIENT_ID: 'x',
      THREADS_CLIENT_SECRET: 'x',
      THREADS_REDIRECT_URI: 'x',
      NETLIFY_SITE_ID: 'x',
      NETLIFY_API_TOKEN: 'x',
    };
    assert.doesNotThrow(() => requireEnv(env));
  });
});
