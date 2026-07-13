/**
 * @fileoverview Shared, server-side event store backed by Netlify Blobs.
 *
 * Replaces the old per-browser localStorage moderation queue with a single
 * authoritative dataset: one JSON blob per event, keyed by its 4-char id, in
 * the `events` store. Every export accepts an optional `store` parameter
 * (an object exposing `get`/`set`/`delete`/`list`, the subset of the
 * `@netlify/blobs` Store interface this module uses) so unit tests can
 * inject an in-memory fake instead of hitting real Blobs — the same
 * dependency-injection idiom used throughout `session.mjs`.
 */

import { getStore } from '@netlify/blobs';
import { genId } from './genId.mjs';
import { normalizeEvent } from './eventNormalize.mjs';

const STORE_NAME = 'events';

/**
 * @typedef {object} StoredEvent
 * @property {string} id
 * @property {true} user
 * @property {'pending'|'approved'|'rejected'|'cancelled'} status
 * @property {number} submitted - Epoch ms.
 * @property {number} [reviewedAt] - Epoch ms.
 * @property {string} [rejectReason]
 * @property {number} [cancelledAt] - Epoch ms.
 * @property {string} [cancelledBy] - Username of whoever cancelled it (owner or admin).
 * @property {{id:string, username:string, avatarUrl:string|null, profileUrl:string}} addedBy
 * @property {string} title
 * @property {string} date - YYYY-MM-DD.
 * @property {string} city
 * @property {string} cat
 * @property {string} [catSuggestion] - Free-text category the submitter proposed adding.
 * @property {string[]} org
 * @property {string} [area]
 * @property {string} url
 */

/**
 * A minimal key-value store interface — the subset of `@netlify/blobs`'s
 * `Store` this module relies on. Real Blobs stores and the in-memory test
 * fake both satisfy it. `set`'s `onlyIfNew` option is used by `createEvent`
 * to avoid a check-then-act race on id generation: the write result's
 * `etag` is present only if the write actually happened, so a missing
 * `etag` means another writer already claimed that id.
 * @typedef {object} BlobStoreLike
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string, opts?: {onlyIfNew?: boolean}) => Promise<{etag?: string}>} set
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<{blobs: Array<{key: string}>}>} list
 */

/**
 * Resolves the Blobs store to use, defaulting to a real `events` store with
 * strict consistency (the moderation queue needs to see its own writes
 * immediately — an admin approving an item must not see it reappear).
 * @param {BlobStoreLike} [store] - Injectable for tests.
 * @returns {BlobStoreLike}
 */
function resolveStore(store) {
  return store ?? getStore({ name: STORE_NAME, consistency: 'strict' });
}

/**
 * Fetches a single event by id.
 * @param {string} id
 * @param {BlobStoreLike} [store]
 * @returns {Promise<StoredEvent|null>}
 */
export async function getEvent(id, store) {
  const raw = await resolveStore(store).get(id);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Persists an event, overwriting any existing record with the same id.
 * @param {StoredEvent} event
 * @param {BlobStoreLike} [store]
 * @returns {Promise<void>}
 */
export async function putEvent(event, store) {
  await resolveStore(store).set(event.id, JSON.stringify(event));
}

/**
 * Writes an event only if its id isn't already taken.
 * @param {StoredEvent} event
 * @param {BlobStoreLike} [store]
 * @returns {Promise<boolean>} True if the write happened (id was free).
 */
async function putEventIfNew(event, store) {
  const result = await resolveStore(store).set(event.id, JSON.stringify(event), {
    onlyIfNew: true,
  });
  return !!result?.etag;
}

/**
 * Deletes an event by id.
 * @param {string} id
 * @param {BlobStoreLike} [store]
 * @returns {Promise<void>}
 */
export async function deleteEvent(id, store) {
  await resolveStore(store).delete(id);
}

/**
 * Loads every event in the store.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<StoredEvent[]>}
 */
export async function listAllEvents(store) {
  const s = resolveStore(store);
  const { blobs } = await s.list();
  const events = await Promise.all(blobs.map((b) => s.get(b.key)));
  return events.filter(Boolean).map((raw) => JSON.parse(raw));
}

/**
 * Events visible in the public feed: every approved or cancelled event, plus
 * the given user's own pending submissions (shown only to their submitter
 * while awaiting review). Cancelled events stay visible (flagged, not
 * hidden) so people who saved a meetup can see it's off, rather than have it
 * silently vanish — flip this to `e.status === 'approved'` only if that
 * turns out to be the wrong call. Rejected events and other users' pending
 * submissions are never included — mirrors the old client-side
 * `EventStore.all()` filter.
 * @param {object} opts
 * @param {string} [opts.username] - The requesting user's handle, if signed in.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<StoredEvent[]>}
 */
export async function listVisibleEvents({ username } = {}, store) {
  const all = await listAllEvents(store);
  return all.filter(
    (e) =>
      e.status === 'approved' ||
      e.status === 'cancelled' ||
      (e.status === 'pending' && e.addedBy?.username === username)
  );
}

/**
 * All pending submissions across every user, oldest first — the admin
 * moderation queue.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<StoredEvent[]>}
 */
export async function listPendingEvents(store) {
  const all = await listAllEvents(store);
  return all
    .filter((e) => e.status === 'pending')
    .sort((a, b) => (a.submitted ?? 0) - (b.submitted ?? 0));
}

/**
 * Every event submitted by a given user, regardless of moderation status.
 * @param {string} username
 * @param {BlobStoreLike} [store]
 * @returns {Promise<StoredEvent[]>}
 */
export async function listOwnedEvents(username, store) {
  const all = await listAllEvents(store);
  return all.filter((e) => e.addedBy?.username === username);
}

/** Max attempts to find a free id before giving up (each attempt is a fresh 4-char draw). */
const MAX_ID_ATTEMPTS = 5;

/**
 * Creates a new event submission. Always starts `pending` — an admin must
 * approve it before it reaches the public feed.
 *
 * Id generation reads only `store.list()`'s keys (which already equal every
 * event's id, since `putEvent` always writes with `key === event.id`) rather
 * than fetching and parsing every event body via `listAllEvents`. The write
 * itself uses `onlyIfNew` and retries on a rare id collision instead of a
 * plain check-then-act `set()`, so two concurrent submissions can't silently
 * overwrite one another.
 * @param {object} partial - Raw event fields from the client.
 * @param {{id:string, username:string, avatarUrl:string|null, profileUrl:string}} addedBy
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, event:StoredEvent}|{ok:false, error:string}>}
 */
export async function createEvent(partial, addedBy, store) {
  const normalized = normalizeEvent(partial);
  if (!normalized.ok) return normalized;

  const s = resolveStore(store);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const { blobs } = await s.list();
    const existingIds = new Set(blobs.map((b) => b.key));
    const event = {
      id: genId(existingIds),
      user: true,
      status: 'pending',
      submitted: Date.now(),
      addedBy,
      ...normalized.data,
    };
    if (await putEventIfNew(event, s)) return { ok: true, event };
    // Another writer claimed this id between list() and set() — retry with a fresh id.
  }
  return { ok: false, error: 'Could not allocate a unique id — please try again' };
}

/**
 * Edits an existing event. Preserves `id`, `submitted`, and `addedBy`.
 * Editing a previously-rejected event resets it to `pending` for re-review,
 * clearing `reviewedAt`/`rejectReason`. Refuses to edit a cancelled event —
 * cancellation is terminal, so a cancelled event must never be revived back
 * to `approved` via an edit.
 *
 * Takes the existing record directly rather than an id — callers (e.g. the
 * PATCH handler in events.js) already fetch it once to check ownership, so
 * this avoids a second Blobs read and a second, independently-maintained
 * not-found check.
 * @param {StoredEvent} existing - The current record, already confirmed to exist.
 * @param {object} patch - Fields to update (merged with the existing record, then re-normalised).
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, event:StoredEvent}|{ok:false, error:string}>}
 */
export async function updateEvent(existing, patch, store) {
  if (existing.status === 'cancelled') {
    return { ok: false, error: 'cancelled events cannot be edited' };
  }

  const normalized = normalizeEvent({ ...existing, ...patch });
  if (!normalized.ok) return normalized;

  const event = {
    ...existing,
    ...normalized.data,
    id: existing.id,
    user: true,
    submitted: existing.submitted,
    addedBy: existing.addedBy,
  };
  if (existing.status === 'rejected') {
    event.status = 'pending';
    delete event.reviewedAt;
    delete event.rejectReason;
  } else {
    event.status = existing.status ?? 'pending';
  }
  await putEvent(event, store);
  return { ok: true, event };
}

/**
 * Sets an event's moderation status and records the review time.
 * @param {string} id
 * @param {'approve'|'reject'} action
 * @param {string} [reason] - Optional reason shown to the submitter (reject only), capped at 120 chars.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, event:StoredEvent}|{ok:false, error:string}>}
 */
export async function moderateEvent(id, action, reason, store) {
  if (action !== 'approve' && action !== 'reject') {
    return { ok: false, error: 'action must be "approve" or "reject"' };
  }
  const existing = await getEvent(id, store);
  if (!existing) return { ok: false, error: 'not_found' };

  const event = {
    ...existing,
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewedAt: Date.now(),
    ...(action === 'reject' && reason ? { rejectReason: String(reason).slice(0, 120) } : {}),
  };
  await putEvent(event, store);
  return { ok: true, event };
}

/**
 * Cancels an approved event. Unlike `deleteEvent`, this keeps the record —
 * cancellation is the intent signal that disambiguates "this meetup is off"
 * (still worth knowing about, and worth announcing) from "this row was a
 * mistake" (a silent hard delete). Only allowed from `approved`; cancelling
 * is terminal, so an event already `cancelled` (or any other status) is
 * refused rather than re-cancelled.
 * @param {StoredEvent} existing - The current record, already confirmed to exist.
 * @param {string} actorUsername - Handle of whoever cancelled it (owner or admin).
 * @param {BlobStoreLike} [store]
 * @returns {Promise<{ok:true, event:StoredEvent}|{ok:false, error:string}>}
 */
export async function cancelEvent(existing, actorUsername, store) {
  if (existing.status !== 'approved') {
    return { ok: false, error: `cannot cancel an event with status "${existing.status}"` };
  }

  const event = {
    ...existing,
    status: 'cancelled',
    cancelledAt: Date.now(),
    cancelledBy: actorUsername,
  };
  await putEvent(event, store);
  return { ok: true, event };
}
