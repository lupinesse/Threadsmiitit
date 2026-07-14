/**
 * @fileoverview Reports a caught render error to Sentry, loading the SDK on
 * demand. Kept as a plain module (no JSX) so it can be unit tested directly
 * with Node's test runner, without a JSX transform.
 */

/**
 * Reports a caught render error to Sentry, loading the SDK on demand — an
 * uncaught render error is rare enough that paying its chunk's load cost
 * only when it actually happens is a better trade than bundling Sentry into
 * every user's first load (see issue #81, code-splitting the client bundle).
 * @param {Error} error
 * @param {{componentStack: string}} info
 * @param {Function} [importSentry] - Injectable for tests; a zero-arg
 *   function returning a promise that resolves to `{ Sentry }`. Defaults to
 *   the real dynamic import of `./sentry.js`.
 * @returns {Promise<void>}
 */
export function reportErrorToSentry(error, info, importSentry = () => import('./sentry.js')) {
  return importSentry()
    .then(({ Sentry }) => {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
      });
    })
    .catch((loadError) => {
      // The Sentry chunk itself failed to load (e.g. offline) — the
      // original render error is already logged by React's own error
      // boundary reporting, so this is only about the reporting path.
      console.warn('[reportErrorToSentry] Failed to load Sentry to report error:', loadError);
    });
}
