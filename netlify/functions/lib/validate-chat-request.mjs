/**
 * @fileoverview Pure validation helpers for the /api/chat proxy.
 *
 * Kept separate so they can be unit-tested without standing up a server.
 */

/** Maximum accepted prompt length in characters. */
export const MAX_PROMPT_LENGTH = 4000;

/**
 * Normalises an Origin or Referer header value to a bare origin string
 * (scheme + host + port, no trailing slash or path).
 *
 * @param {string | null | undefined} raw - Raw header value.
 * @returns {string} Normalised origin, or empty string if input is empty.
 */
export function normaliseOrigin(raw) {
  if (!raw) return '';
  // Strip trailing slash then keep only the first three slash-delimited parts
  // (scheme, empty string, host[:port]) to handle full Referer URLs.
  return raw.replace(/\/$/, '').split('/').slice(0, 3).join('/');
}

/**
 * Returns true when the request originates from the allowed origin.
 *
 * Checks the `Origin` header first; falls back to `Referer` for browsers that
 * send one but not the other. Passes automatically in the Netlify local dev
 * environment (`NETLIFY_DEV === 'true'`), which is set by the Netlify CLI.
 *
 * @param {string | null | undefined} originHeader - Value of the Origin header.
 * @param {string | null | undefined} refererHeader - Value of the Referer header.
 * @param {string} allowedOrigin - The permitted origin (e.g. "https://example.com").
 * @param {boolean} [isNetlifyDev=false] - True when running under `netlify dev`.
 * @returns {boolean}
 */
export function isOriginAllowed(originHeader, refererHeader, allowedOrigin, isNetlifyDev = false) {
  if (isNetlifyDev) return true;
  const candidate = normaliseOrigin(originHeader) || normaliseOrigin(refererHeader);
  return candidate === allowedOrigin;
}

/**
 * Validates the `prompt` field from a parsed request body.
 *
 * @param {unknown} prompt - The raw `prompt` value from the request body.
 * @returns {{ ok: true } | { ok: false; status: number; error: string }}
 */
export function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { ok: false, status: 400, error: 'prompt must be a non-empty string' };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      ok: false,
      status: 413,
      error: `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
    };
  }
  return { ok: true };
}
