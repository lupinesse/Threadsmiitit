/**
 * Netlify Function: /api/chat
 *
 * Server-side proxy for the Anthropic API. Keeps ANTHROPIC_API_KEY out of the
 * browser bundle. Returns a JSON object with a `text` field on success, or an
 * `error` field on failure.
 *
 * Security controls enforced:
 * - **Origin**: requests whose Origin/Referer does not match ALLOWED_ORIGIN
 *   (env var, defaults to 'https://threadsmiitit.netlify.app') receive 403.
 *   Bypassed automatically under `netlify dev` (NETLIFY_DEV=true).
 * - **Body**: prompt must be a non-empty string ≤ 4 000 characters; invalid
 *   prompts receive 400 and oversized ones receive 413.
 * - **Rate limiting**: configured via netlify.toml edge rules (per-IP, 30 req
 *   per 60 s). Requires Netlify Pro or higher — as a backstop for lower
 *   plans (where that edge rule silently doesn't apply), this function also
 *   enforces the same limit via `lib/rate-limit.mjs`, backed by a shared
 *   Netlify Blobs store so the limit holds across every warm function
 *   instance rather than resetting per instance (see its module doc
 *   comment). Like the origin check, it's bypassed under `netlify dev`.
 *   The bucket key is resolved via `lib/client-ip.mjs`, which falls back
 *   to `X-Forwarded-For` before giving up and bucketing unidentified
 *   clients together (#78). Every log line in this handler includes
 *   `requestId` (from Netlify's `x-nf-request-id`, or a generated UUID
 *   outside Netlify) so a single request's config, rate-limit, and error
 *   logs can be correlated.
 *
 * Upstream API errors (e.g. 429 Too Many Requests, 400 Bad Request) are
 * propagated to the caller with the real status code and a descriptive
 * message, so the client can surface a meaningful error instead of an empty
 * reply.
 *
 * Note: adding per-user authentication (session cookie verification) is a
 * larger change that requires updating auth-callback.js to set a signed,
 * HttpOnly cookie. Raise with the team before implementing.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { isOriginAllowed, validatePrompt } from './lib/validate-chat-request.mjs';
import { callAnthropic } from './lib/anthropic-proxy.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';
import { isWithinRateLimit } from './lib/rate-limit.mjs';
import { resolveClientId } from './lib/client-ip.mjs';

initSentry();

/** Allowed request origin — set ALLOWED_ORIGIN in Netlify environment variables. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://threadsmiitit.netlify.app';

async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  // Netlify sets x-nf-request-id on every request; falling back to a
  // generated id only matters under netlify dev or non-Netlify test
  // invocations. Logged on every log line below so a request's config,
  // rate-limit, and error logs can all be correlated to one another.
  const requestId = req.headers.get('x-nf-request-id') ?? crypto.randomUUID();

  const isNetlifyDev = process.env.NETLIFY_DEV === 'true';
  const originAllowed = isOriginAllowed(
    req.headers.get('origin'),
    req.headers.get('referer'),
    ALLOWED_ORIGIN,
    isNetlifyDev
  );
  console.info('[/api/chat] config in effect', {
    requestId,
    allowedOrigin: ALLOWED_ORIGIN,
    netlifyDev: isNetlifyDev,
    anthropicKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    originAllowed,
  });

  if (!originAllowed) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id: clientIp, identified } = resolveClientId(req.headers);
  if (!identified) {
    console.warn(
      '[/api/chat] no client-identifying header present — bucketing under the shared "unknown" rate limit key',
      { requestId, clientIp }
    );
  }
  if (!isNetlifyDev && !(await isWithinRateLimit(clientIp))) {
    console.info('[/api/chat] rate limit exceeded (in-function backstop)', { requestId, clientIp });
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const promptResult = validatePrompt(body?.prompt);
  if (!promptResult.ok) {
    return new Response(JSON.stringify({ error: promptResult.error }), {
      status: promptResult.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not set — AI assistant unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const result = await callAnthropic(body.prompt, apiKey);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ text: result.text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default withSentry(handler);

export const config = { path: '/api/chat' };
