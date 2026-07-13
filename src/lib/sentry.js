/**
 * Sentry error monitoring for the browser bundle.
 */
import * as Sentry from '@sentry/react';

/**
 * Configures the Sentry React SDK from the Vite-injected env. No-ops when
 * VITE_SENTRY_DSN is unset, so local dev, CI, and PR previews never need one.
 *
 * @param {ImportMetaEnv} [env] - Injectable for tests; defaults to import.meta.env.
 * @param {typeof Sentry} [sentryClient] - Injectable for tests; defaults to the real SDK.
 * @returns {void}
 */
export function initSentry(env = import.meta.env, sentryClient = Sentry) {
  const dsn = env.VITE_SENTRY_DSN;
  console.info('[sentry] config in effect', { dsnConfigured: Boolean(dsn) });
  if (!dsn) return;
  sentryClient.init({ dsn, environment: env.MODE, tracesSampleRate: 0 });
}

export { Sentry };
