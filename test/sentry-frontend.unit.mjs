/**
 * Unit tests for src/lib/sentry.js — run with Node's built-in test runner as
 * part of `npm test`. The real @sentry/react SDK is never configured here; a
 * fake client is injected instead so these tests never make network calls or
 * require a DSN.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { initSentry } from '../src/lib/sentry.js';

function createFakeSentryClient() {
  return { init: mock.fn() };
}

describe('initSentry (frontend)', () => {
  it('does not configure the SDK when VITE_SENTRY_DSN is unset', () => {
    const client = createFakeSentryClient();
    initSentry({}, client);
    assert.equal(client.init.mock.callCount(), 0);
  });

  it('configures the SDK with the DSN and Vite mode when VITE_SENTRY_DSN is set', () => {
    const client = createFakeSentryClient();
    initSentry(
      { VITE_SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1', MODE: 'production' },
      client
    );
    assert.equal(client.init.mock.callCount(), 1);
    assert.deepEqual(client.init.mock.calls[0].arguments[0], {
      dsn: 'https://example@o0.ingest.sentry.io/1',
      environment: 'production',
      tracesSampleRate: 0,
    });
  });
});
