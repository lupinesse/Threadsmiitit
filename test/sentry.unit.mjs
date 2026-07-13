/**
 * Unit tests for netlify/functions/lib/sentry.mjs — run with Node's built-in
 * test runner as part of `npm test`. The real @sentry/node SDK is never
 * imported here; a fake client is injected instead so these tests never make
 * network calls or require a DSN.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { initSentry, withSentry } from '../netlify/functions/lib/sentry.mjs';

function createFakeSentryClient() {
  return { init: mock.fn(), captureException: mock.fn(), flush: mock.fn(async () => true) };
}

describe('initSentry', () => {
  it('does not configure the SDK when SENTRY_DSN is unset', () => {
    const client = createFakeSentryClient();
    initSentry({}, client);
    assert.equal(client.init.mock.callCount(), 0);
  });

  it('configures the SDK with the DSN and environment when SENTRY_DSN is set', () => {
    const client = createFakeSentryClient();
    initSentry(
      { SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1', CONTEXT: 'production' },
      client
    );
    assert.equal(client.init.mock.callCount(), 1);
    assert.deepEqual(client.init.mock.calls[0].arguments[0], {
      dsn: 'https://example@o0.ingest.sentry.io/1',
      environment: 'production',
      tracesSampleRate: 0,
    });
  });

  it('defaults environment to "development" when CONTEXT is unset', () => {
    const client = createFakeSentryClient();
    initSentry({ SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1' }, client);
    assert.equal(client.init.mock.calls[0].arguments[0].environment, 'development');
  });
});

describe('withSentry', () => {
  it('returns the wrapped handler result unchanged on success', async () => {
    const client = createFakeSentryClient();
    const handler = async (req) => new Response(`ok:${req.url}`, { status: 200 });
    const wrapped = withSentry(handler, client);

    const response = await wrapped({ url: '/api/events' });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok:/api/events');
    assert.equal(client.captureException.mock.callCount(), 0);
  });

  it('reports a thrown error to Sentry and returns a 500 JSON response', async () => {
    const client = createFakeSentryClient();
    const boom = new Error('boom');
    const handler = async () => {
      throw boom;
    };
    const wrapped = withSentry(handler, client);
    const consoleError = mock.method(console, 'error', () => {});

    const response = await wrapped({ method: 'POST', url: 'https://example.test/api/events?id=1' });

    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
    assert.equal(client.captureException.mock.callCount(), 1);
    assert.equal(client.captureException.mock.calls[0].arguments[0], boom);
    assert.deepEqual(client.captureException.mock.calls[0].arguments[1], {
      contexts: { request: { method: 'POST', path: '/api/events' } },
    });
    assert.equal(client.flush.mock.callCount(), 1);
    consoleError.mock.restore();
  });

  it('does not throw when the request has no url (e.g. a malformed test double)', async () => {
    const client = createFakeSentryClient();
    const handler = async () => {
      throw new Error('boom');
    };
    const wrapped = withSentry(handler, client);
    const consoleError = mock.method(console, 'error', () => {});

    const response = await wrapped({});

    assert.equal(response.status, 500);
    assert.deepEqual(client.captureException.mock.calls[0].arguments[1], {
      contexts: { request: { method: null, path: null } },
    });
    consoleError.mock.restore();
  });

  it('logs the error to the console even when Sentry is not configured (SENTRY_DSN unset)', async () => {
    // A no-op Sentry client is what @sentry/node behaves like when init() was
    // never called — this asserts the error is still visible somewhere.
    const client = {
      captureException: mock.fn(),
      flush: mock.fn(async () => true),
    };
    const boom = new Error('boom without a DSN');
    const handler = async () => {
      throw boom;
    };
    const wrapped = withSentry(handler, client);
    const consoleError = mock.method(console, 'error', () => {});

    await wrapped({ method: 'GET', url: 'https://example.test/api/events' });

    assert.equal(consoleError.mock.callCount(), 1);
    assert.equal(consoleError.mock.calls[0].arguments[2], boom);
    consoleError.mock.restore();
  });

  it('reports a synchronously thrown error, not just rejected promises', async () => {
    const client = createFakeSentryClient();
    const handler = () => {
      throw new Error('sync boom');
    };
    const wrapped = withSentry(handler, client);

    const response = await wrapped({});

    assert.equal(response.status, 500);
    assert.equal(client.captureException.mock.callCount(), 1);
  });
});
