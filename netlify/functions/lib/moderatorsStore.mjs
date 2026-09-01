/**
 * @fileoverview Self-service moderator list, backed by Netlify Blobs.
 *
 * The hardcoded `ADMINS` array in `admins.mjs` stays the permanent, CODEOWNERS-
 * protected "root" tier. This store holds a second, in-app-managed tier that
 * root admins can grant or revoke without a code change — see
 * `session.mjs#isModerator`, which checks both tiers. Mirrors
 * `eventsStore.mjs`'s injectable-`store` dependency-injection idiom so unit
 * tests can supply an in-memory fake instead of hitting real Blobs.
 */

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'moderators';
const LIST_KEY = 'list';

/**
 * @typedef {object} ModeratorEntry
 * @property {string} username - Normalised: no leading `@`, lowercased.
 * @property {string} addedBy - Root admin's username who granted this.
 * @property {number} addedAt - Epoch ms.
 */

/**
 * A minimal key-value store interface — the subset of `@netlify/blobs`'s
 * `Store` this module relies on. Real Blobs stores and the in-memory test
 * fake both satisfy it.
 * @typedef {object} BlobStoreLike
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<unknown>} set
 */

/**
 * Resolves the Blobs store to use, defaulting to a real `moderators` store
 * with strict consistency — a grant/revoke must be visible on the very next
 * request, since it's a security-relevant change.
 * @param {BlobStoreLike} [store] - Injectable for tests.
 * @returns {BlobStoreLike}
 */
function resolveStore(store) {
  return store ?? getStore({ name: STORE_NAME, consistency: 'strict' });
}

/**
 * Strips a leading `@` and lowercases, matching `session.mjs#isAdmin`'s
 * normalisation so the two tiers compare usernames the same way. Exported
 * so callers (e.g. `moderators.js`) can normalise a raw request value once
 * and reuse the same clean form everywhere it's needed — including in a
 * notification — rather than let an unnormalised `@Bob` leak past this
 * module's own comparisons.
 * @param {string} username
 * @returns {string}
 */
export function normalize(username) {
  return String(username ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

/**
 * Loads the current moderator list.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<ModeratorEntry[]>}
 */
export async function listModerators(store) {
  const raw = await resolveStore(store).get(LIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Checks whether `username` is a self-service moderator (not root — callers
 * needing the full moderator check, root included, should use
 * `session.mjs#isModerator`).
 * @param {string} username
 * @param {BlobStoreLike} [store]
 * @returns {Promise<boolean>}
 */
export async function isSelfServiceModerator(username, store) {
  const normalized = normalize(username);
  if (!normalized) return false;
  const moderators = await listModerators(store);
  return moderators.some((m) => m.username === normalized);
}

/**
 * Grants self-service moderator status. Doesn't know about root admins at
 * all — that check (rejecting a username already in `ADMINS`) is the
 * caller's job, same as `eventsStore.mjs` staying agnostic of what "admin"
 * means and leaving that to `session.mjs`/the endpoint handler.
 * @param {string} username
 * @param {string} addedBy - Root admin's username.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, moderators:ModeratorEntry[]}|{ok:false, error:string}>}
 */
export async function addModerator(username, addedBy, store) {
  const normalized = normalize(username);
  if (!normalized) return { ok: false, error: 'username is required' };

  const s = resolveStore(store);
  const moderators = await listModerators(s);
  if (moderators.some((m) => m.username === normalized)) {
    return { ok: false, error: `@${normalized} is already a moderator` };
  }

  const updated = [...moderators, { username: normalized, addedBy, addedAt: Date.now() }];
  await s.set(LIST_KEY, JSON.stringify(updated));
  return { ok: true, moderators: updated };
}

/**
 * Revokes self-service moderator status. Never affects root admins — they
 * aren't stored here, so removing one is simply a not-found.
 * @param {string} username
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, moderators:ModeratorEntry[]}|{ok:false, error:string}>}
 */
export async function removeModerator(username, store) {
  const normalized = normalize(username);
  const s = resolveStore(store);
  const moderators = await listModerators(s);
  if (!moderators.some((m) => m.username === normalized)) {
    return { ok: false, error: 'not_found' };
  }

  const updated = moderators.filter((m) => m.username !== normalized);
  await s.set(LIST_KEY, JSON.stringify(updated));
  return { ok: true, moderators: updated };
}
