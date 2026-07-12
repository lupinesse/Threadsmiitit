/**
 * @fileoverview Small shared helpers for Netlify Function JSON responses,
 * used by every /api/events* handler to avoid repeating the same
 * Content-Type/status boilerplate.
 */

/**
 * Builds a JSON Response.
 * @param {object} body
 * @param {number} [status=200]
 * @returns {Response}
 */
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Parses a request body as JSON, returning null on failure instead of
 * throwing (callers should respond 400 when this returns null).
 * @param {Request} req
 * @returns {Promise<object|null>}
 */
export async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
