/**
 * Unit tests for src/lib/reportError.js — run with Node's built-in test
 * runner as part of `npm test`. The real dynamic import of `./sentry.js` is
 * never exercised here; a fake `importSentry` is injected instead so these
 * tests never load the real @sentry/react SDK.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { reportErrorToSentry } from '../src/lib/reportError.js';

describe('reportErrorToSentry', () => {
  it('reports the error and its component stack to Sentry once the chunk loads', async () => {
    const captureException = mock.fn();
    const importSentry = mock.fn(async () => ({ Sentry: { captureException } }));
    const error = new Error('boom');
    const info = { componentStack: '\n  in Boom\n  in AppErrorBoundary' };

    await reportErrorToSentry(error, info, importSentry);

    assert.equal(importSentry.mock.callCount(), 1);
    assert.equal(captureException.mock.callCount(), 1);
    const [reportedError, options] = captureException.mock.calls[0].arguments;
    assert.equal(reportedError, error);
    assert.deepEqual(options, { contexts: { react: { componentStack: info.componentStack } } });
  });

  it('logs a warning instead of throwing when the Sentry chunk fails to load', async () => {
    const loadError = new Error('network offline');
    const importSentry = mock.fn(async () => {
      throw loadError;
    });
    const consoleWarn = mock.method(console, 'warn', () => {});

    await reportErrorToSentry(new Error('boom'), { componentStack: '' }, importSentry);

    assert.equal(consoleWarn.mock.callCount(), 1);
    assert.match(consoleWarn.mock.calls[0].arguments[0], /Failed to load Sentry/);
    assert.equal(consoleWarn.mock.calls[0].arguments[1], loadError);
    consoleWarn.mock.restore();
  });
});
