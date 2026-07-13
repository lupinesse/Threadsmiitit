/**
 * @fileoverview Thin wrapper over the Threads Graph API — the only module
 * that knows the API's URL shapes and field names. Every other bot module
 * talks to this one, never to `fetch` directly, so the two-step
 * container-create-then-publish dance and the token-refresh call shape are
 * defined in exactly one place.
 *
 * `fetch` is injectable (`fetchImpl`) so unit tests never make a real
 * network call. Never logs `accessToken` — it's a live credential.
 *
 * Field names are as documented at
 * https://developers.facebook.com/docs/threads/reference/publishing/ and
 * https://developers.facebook.com/docs/threads/create-posts/text-attachments/
 * (checked 2026-07; re-verify against Meta's docs if these calls start
 * failing, since this is a third-party API this repo doesn't control).
 */

const GRAPH_ROOT = 'https://graph.threads.net';
const GRAPH_BASE = `${GRAPH_ROOT}/v1.0`;

/**
 * Reads an error response body as text without letting a non-JSON or empty
 * body throw a second, more confusing error.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function safeErrorText(response) {
  try {
    return await response.text();
  } catch {
    return '(could not read response body)';
  }
}

/**
 * Publishes a single Threads post: creates a media container, then
 * publishes it. Always `media_type=TEXT` — this bot never posts images or
 * video. Text-only containers publish immediately, so this never waits
 * between the two calls (that wait is only needed once media processing is
 * involved, which is out of scope for v1).
 * @param {object} params
 * @param {string} params.accessToken - Live Threads Graph API access token. Never logged.
 * @param {string} params.threadsUserId - The bot's own Threads user id.
 * @param {string} params.text - Main post/reply text, ≤500 UTF-8 bytes.
 * @param {string} [params.attachmentText] - Text-attachment body, ≤10 000 UTF-8 bytes.
 * @param {string} [params.replyToId] - Id of the post this is a reply to, for comment threads.
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @returns {Promise<{id: string}>} The id of the published post.
 * @throws {Error} If either the container-create or publish call fails.
 */
export async function publish({
  accessToken,
  threadsUserId,
  text,
  attachmentText,
  replyToId,
  fetchImpl = fetch,
}) {
  const createParams = new URLSearchParams({
    media_type: 'TEXT',
    text,
    access_token: accessToken,
  });
  if (attachmentText) createParams.set('plaintext', attachmentText);
  if (replyToId) createParams.set('reply_to_id', replyToId);

  let createResponse;
  try {
    createResponse = await fetchImpl(`${GRAPH_BASE}/${threadsUserId}/threads`, {
      method: 'POST',
      body: createParams,
    });
  } catch (err) {
    throw new Error(`Threads container create request failed: ${err.message}`, { cause: err });
  }
  if (!createResponse.ok) {
    throw new Error(
      `Threads container create failed (${createResponse.status}): ${await safeErrorText(createResponse)}`
    );
  }
  const { id: creationId } = await createResponse.json();

  const publishParams = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  let publishResponse;
  try {
    publishResponse = await fetchImpl(`${GRAPH_BASE}/${threadsUserId}/threads_publish`, {
      method: 'POST',
      body: publishParams,
    });
  } catch (err) {
    throw new Error(`Threads publish request failed: ${err.message}`, { cause: err });
  }
  if (!publishResponse.ok) {
    throw new Error(
      `Threads publish failed (${publishResponse.status}): ${await safeErrorText(publishResponse)}`
    );
  }
  return publishResponse.json();
}

/**
 * Exchanges a still-valid long-lived Threads access token for a fresh one
 * with a renewed ~60-day expiry. Must be called before the current token
 * expires — a fully expired token cannot be refreshed and requires the
 * manual `scripts/seed-bot-token.mjs` re-authorization flow instead.
 * @param {object} params
 * @param {string} params.accessToken - The current, still-valid long-lived token. Never logged.
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @param {() => number} [params.now] - Injectable clock for tests.
 * @returns {Promise<{accessToken: string, expiresAt: number}>} The new token and its expiry (epoch ms).
 * @throws {Error} If the refresh call fails.
 */
export async function refreshToken({ accessToken, fetchImpl = fetch, now = Date.now }) {
  const params = new URLSearchParams({
    grant_type: 'th_refresh_token',
    access_token: accessToken,
  });
  const response = await fetchImpl(`${GRAPH_BASE}/refresh_access_token?${params}`);
  if (!response.ok) {
    throw new Error(
      `Threads token refresh failed (${response.status}): ${await safeErrorText(response)}`
    );
  }
  const body = await response.json();
  return {
    accessToken: body.access_token,
    expiresAt: now() + body.expires_in * 1000,
  };
}

/**
 * One-time OAuth bootstrap: exchanges an authorization code for a
 * short-lived token, then immediately exchanges that for a long-lived one
 * (~60-day expiry). Used only by `scripts/seed-bot-token.mjs` to mint the
 * bot's very first token — every renewal after that goes through
 * `refreshToken` instead, which doesn't need the client secret or a fresh
 * user authorization.
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.clientSecret - Never logged.
 * @param {string} params.redirectUri
 * @param {string} params.code - The `code` query param from the OAuth redirect.
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @param {() => number} [params.now] - Injectable clock for tests.
 * @returns {Promise<{accessToken: string, expiresAt: number}>}
 * @throws {Error} If either exchange call fails.
 */
export async function exchangeAuthCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const shortLivedResponse = await fetchImpl(`${GRAPH_ROOT}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!shortLivedResponse.ok) {
    throw new Error(
      `Threads auth-code exchange failed (${shortLivedResponse.status}): ${await safeErrorText(shortLivedResponse)}`
    );
  }
  const { access_token: shortLivedToken } = await shortLivedResponse.json();

  const longLivedParams = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: clientSecret,
    access_token: shortLivedToken,
  });
  const longLivedResponse = await fetchImpl(`${GRAPH_ROOT}/access_token?${longLivedParams}`);
  if (!longLivedResponse.ok) {
    throw new Error(
      `Threads long-lived token exchange failed (${longLivedResponse.status}): ${await safeErrorText(longLivedResponse)}`
    );
  }
  const { access_token: accessToken, expires_in: expiresIn } = await longLivedResponse.json();
  return { accessToken, expiresAt: now() + expiresIn * 1000 };
}

/**
 * Fetches the authenticated account's own Threads id and username — used
 * once during bootstrap to discover the bot's `THREADS_BOT_USER_ID`.
 * @param {object} params
 * @param {string} params.accessToken - Never logged.
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @returns {Promise<{id: string, username: string}>}
 * @throws {Error} If the profile fetch fails.
 */
export async function fetchBotProfile({ accessToken, fetchImpl = fetch }) {
  const params = new URLSearchParams({ fields: 'id,username', access_token: accessToken });
  const response = await fetchImpl(`${GRAPH_ROOT}/me?${params}`);
  if (!response.ok) {
    throw new Error(
      `Threads profile fetch failed (${response.status}): ${await safeErrorText(response)}`
    );
  }
  return response.json();
}
