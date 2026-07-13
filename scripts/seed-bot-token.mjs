#!/usr/bin/env node
/**
 * One-time local script: authorizes the broadcast bot's own Threads account
 * against the existing Meta app and stores its initial long-lived access
 * token in Netlify Blobs, ready for `netlify/functions/bot-token-refresh.js`
 * to keep renewed from then on.
 *
 * Run this once, locally, signed in to the BOT's Threads account in your
 * browser (not your personal account):
 *
 *   node scripts/seed-bot-token.mjs
 *
 * It prints an authorization URL to open, then waits for you to paste back
 * the redirect URL (or just its `code` value) once you've granted access.
 * At the end it prints the bot's Threads user id — set that as
 * THREADS_BOT_USER_ID in the site's environment variables. It never prints
 * the access token itself.
 *
 * Required env vars:
 *   THREADS_CLIENT_ID, THREADS_CLIENT_SECRET, THREADS_REDIRECT_URI
 *     — the same Meta app already used for user login.
 *   NETLIFY_SITE_ID, NETLIFY_API_TOKEN
 *     — needed to reach Netlify Blobs from outside a deployed function;
 *       see https://docs.netlify.com/blobs/overview/#external-connections.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { getStore } from '@netlify/blobs';
import { exchangeAuthCode, fetchBotProfile } from '../netlify/functions/lib/threadsClient.mjs';
import { putBotToken, SECRETS_STORE_NAME } from '../netlify/functions/lib/botState.mjs';

/** Env vars this script cannot proceed without. */
const REQUIRED_ENV = [
  'THREADS_CLIENT_ID',
  'THREADS_CLIENT_SECRET',
  'THREADS_REDIRECT_URI',
  'NETLIFY_SITE_ID',
  'NETLIFY_API_TOKEN',
];

/**
 * Prints an error and exits non-zero.
 * @param {string} message
 * @returns {never}
 */
function die(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Verifies every required env var is set, exiting with an informative
 * message naming all missing ones (not just the first) if not.
 * @param {NodeJS.ProcessEnv} [env] - Injectable for tests.
 * @returns {void}
 */
export function requireEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length) die(`Missing required env var(s): ${missing.join(', ')}`);
}

/**
 * Builds the Meta authorization URL an operator opens in a browser while
 * signed in as the bot's own Threads account.
 * @param {{clientId: string, redirectUri: string}} params
 * @returns {string}
 */
export function buildAuthorizeUrl({ clientId, redirectUri }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'threads_basic,threads_content_publish',
    response_type: 'code',
  });
  return `https://threads.net/oauth/authorize?${params}`;
}

/**
 * Extracts the OAuth `code` from operator input that may be either a bare
 * code or the full redirect URL Meta sent it back in.
 * @param {string} input
 * @returns {string} The code, or '' if none could be found.
 */
export function extractCode(input) {
  const trimmed = input.trim();
  if (!trimmed.includes('://')) return trimmed;
  try {
    return new URL(trimmed).searchParams.get('code') ?? '';
  } catch {
    return '';
  }
}

/**
 * Runs the interactive bootstrap: prompts for the OAuth code, exchanges it
 * for a long-lived token, fetches the bot's profile, and persists the token.
 * @returns {Promise<void>}
 */
async function main() {
  requireEnv();
  const clientId = process.env.THREADS_CLIENT_ID;
  const clientSecret = process.env.THREADS_CLIENT_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI;

  console.log('Open this URL in a browser, signed in to the BOT Threads account (not your own):\n');
  console.log(buildAuthorizeUrl({ clientId, redirectUri }));
  console.log('\nAfter granting access, paste the full redirect URL (or just its "code" value) below.');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await rl.question('> ');
  rl.close();

  const code = extractCode(pasted);
  if (!code) die('Could not find an authorization code in that input.');

  const { accessToken, expiresAt } = await exchangeAuthCode({
    clientId,
    clientSecret,
    redirectUri,
    code,
  });
  const profile = await fetchBotProfile({ accessToken });

  const store = getStore({
    name: SECRETS_STORE_NAME,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
    consistency: 'strict',
  });
  await putBotToken({ accessToken, expiresAt }, store);

  console.log(`\nDone. Bot account: @${profile.username} (id: ${profile.id}).`);
  console.log(`Set THREADS_BOT_USER_ID=${profile.id} in the site's environment variables.`);
  console.log('The access token has been stored in Netlify Blobs — it was never printed above.');
}

// Only run the interactive flow when executed directly (`node
// scripts/seed-bot-token.mjs`), not when imported by tests for its pure
// exported helpers. Compares as file:// URLs (via pathToFileURL) rather
// than raw strings, since process.argv[1] uses OS-native path separators
// and would never match import.meta.url's forward-slash form on Windows.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => die(`seed-bot-token failed: ${err.message}`));
}
