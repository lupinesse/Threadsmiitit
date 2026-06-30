/**
 * @fileoverview Shared Anthropic API request helper.
 *
 * Centralises the model name, token limit, and upstream-call logic so both
 * the Netlify Function (chat.js) and the Vite dev-server middleware
 * (vite.config.js) stay in sync when these values change.
 */

/** Anthropic model used by the /api/chat proxy. */
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

/** Maximum tokens to request from the Anthropic API. */
export const ANTHROPIC_MAX_TOKENS = 1024;

/**
 * Sends `prompt` to the Anthropic Messages API and returns the assistant's
 * text reply.
 *
 * Propagates upstream errors: when the Anthropic API responds with a non-2xx
 * status the function returns an error result carrying that status and a
 * descriptive message. The raw API key and full upstream response body are
 * never included in the returned error (they are logged server-side via
 * `console.error` only).
 *
 * @param {string} prompt - User prompt text to forward.
 * @param {string} apiKey - Anthropic API key (read from environment).
 * @returns {Promise<
 *   { ok: true; text: string } |
 *   { ok: false; status: number; error: string }
 * >}
 */
export async function callAnthropic(prompt, apiKey) {
  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    return { ok: false, status: 502, error: `Upstream unreachable: ${err.message}` };
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      const body = await upstream.json();
      detail = body?.error?.message ?? body?.error ?? '';
    } catch {
      // Ignore non-JSON error body; use status text.
    }
    const message = detail
      ? `Anthropic API error ${upstream.status}: ${detail}`
      : `Anthropic API error ${upstream.status}`;
    console.error('[/api/chat] upstream error', upstream.status, detail || '(no detail)');
    return { ok: false, status: upstream.status, error: message };
  }

  const data = await upstream.json();
  const text = data.content?.[0]?.text ?? '';
  return { ok: true, text };
}
