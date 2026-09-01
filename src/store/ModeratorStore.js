/**
 * @fileoverview Self-service moderator roster — a thin, server-backed
 * client for /api/moderators (see netlify/functions/moderators.js).
 * Mirrors EventStore.js's shape: every function is `async` and resolves to
 * `{ ok: true, ... }` or `{ ok: false, error }`, never throws.
 */

import { apiFetch, JSON_HEADERS } from '../lib/apiFetch.js';

/**
 * Returns the current self-service moderator roster. Requires a moderator
 * session (root or self-service — see requireModerator).
 * @returns {Promise<object>} `{ok: true, moderators}` or `{ok: false, error}`.
 */
async function list() {
  return apiFetch('/api/moderators');
}

/**
 * Grants self-service moderator status. Requires a root admin session.
 * @param {string} username - Threads handle, with or without a leading `@`.
 * @returns {Promise<object>} `{ok: true, moderators}` or `{ok: false, error}`.
 */
async function add(username) {
  return apiFetch('/api/moderators', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username }),
  });
}

/**
 * Revokes self-service moderator status. Requires a root admin session.
 * @param {string} username
 * @returns {Promise<object>} `{ok: true, moderators}` or `{ok: false, error}`.
 */
async function remove(username) {
  return apiFetch(`/api/moderators?username=${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
}

const ModeratorStore = { list, add, remove };

export default ModeratorStore;
