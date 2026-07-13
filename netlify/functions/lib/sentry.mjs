/**
 * Sentry error monitoring for Netlify Functions (Node runtime).
 *
 * Each function file is its own bundle and module instance, so `initSentry`
 * must be called once per file at module load time (i.e. once per cold
 * start) rather than per request.
 */
import * as Sentry from '@sentry/node';

/**
 * Configures the Sentry Node SDK from environment variables. No-ops when
 * SENTRY_DSN is unset, so local dev, CI, and PR previews never need one.
 *
 * @param {NodeJS.ProcessEnv} [env] - Injectable for tests; defaults to process.env.
 * @param {typeof Sentry} [sentryClient] - Injectable for tests; defaults to the real SDK.
 * @returns {void}
 */
export function initSentry(env = process.env, sentryClient = Sentry) {
  const dsn = env.SENTRY_DSN;
  console.info('[sentry] config in effect', { dsnConfigured: Boolean(dsn) });
  if (!dsn) return;
  sentryClient.init({ dsn, environment: env.CONTEXT ?? 'development', tracesSampleRate: 0 });
}

/**
 * Wraps a Netlify Function handler so an uncaught exception is reported to
 * Sentry and the caller still gets a well-formed JSON 500 response, instead
 * of Netlify's runtime returning an opaque platform error page.
 *
 * @param {(req: Request) => Promise<Response>|Response} handler
 * @param {typeof Sentry} [sentryClient] - Injectable for tests; defaults to the real SDK.
 * @returns {(req: Request) => Promise<Response>}
 */
export function withSentry(handler, sentryClient = Sentry) {
  return async function wrapped(req) {
    try {
      return await handler(req);
    } catch (error) {
      // Always log to the function's own console output — Sentry.captureException
      // is a silent no-op when SENTRY_DSN is unset (the default), and Netlify's
      // own crash logging is bypassed by this try/catch, so this is the only
      // place the error is guaranteed to be visible.
      console.error('[sentry] unhandled error in Netlify Function', error);
      sentryClient.captureException(error);
      await sentryClient.flush(2000);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
