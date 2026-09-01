/**
 * @fileoverview Shared fetch wrapper for this app's `/api/*` endpoints.
 * Extracted from `EventStore.js` so `ModeratorStore.js` (and any future
 * server-backed store) doesn't duplicate the same failure-normalisation
 * logic.
 */

/**
 * Issues a fetch against an `/api/*` endpoint, translating network and
 * non-2xx failures into a `{ ok: false, error }` result instead of throwing.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<object>} `{ok: true, ...body}` on success, `{ok: false, error: string}` on failure.
 */
export async function apiFetch(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...opts });
  } catch (err) {
    console.warn('[apiFetch] Network error:', err);
    return { ok: false, error: 'Verkkovirhe. Yritä uudelleen.' };
  }

  if (!res.ok) {
    let error = `Pyyntö epäonnistui (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) error = body.error;
    } catch {
      // Non-JSON error body (e.g. a bare 401/405) — keep the generic message.
    }
    return { ok: false, error };
  }

  if (res.status === 204) return { ok: true };
  try {
    const body = await res.json();
    return { ok: true, ...body };
  } catch (err) {
    console.warn('[apiFetch] Malformed response body:', err);
    return { ok: false, error: 'Virheellinen vastaus palvelimelta.' };
  }
}

/** Shared JSON request headers for `/api/*` POST/PATCH/DELETE bodies. */
export const JSON_HEADERS = { 'Content-Type': 'application/json' };
