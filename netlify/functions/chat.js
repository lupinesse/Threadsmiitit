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
 *   per 60 s). Requires Netlify Pro or higher.
 *
 * Note: adding per-user authentication (session cookie verification) is a
 * larger change that requires updating auth-callback.js to set a signed,
 * HttpOnly cookie. Raise with the team before implementing.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { isOriginAllowed, validatePrompt } from './lib/validate-chat-request.mjs';

/** Allowed request origin — set ALLOWED_ORIGIN in Netlify environment variables. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://threadsmiitit.netlify.app';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const isNetlifyDev = process.env.NETLIFY_DEV === 'true';
  if (
    !isOriginAllowed(
      req.headers.get('origin'),
      req.headers.get('referer'),
      ALLOWED_ORIGIN,
      isNetlifyDev
    )
  ) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
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

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });

    const data = await upstream.json();
    const text = data.content?.[0]?.text ?? '';
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { path: '/api/chat' };
