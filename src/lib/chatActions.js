/**
 * @fileoverview Pure request/response helpers for the "Miitti-apuri" chat
 * assistant, kept free of JSX so they can be unit tested directly with
 * Node's test runner (see test/unit.mjs).
 */

import EventStore from '../store/EventStore.js';
import { THREADS_URL_RE } from '../../shared/eventFields.mjs';

/**
 * Extracts a Threads post URL and organizer handle from free text.
 * @param {string} text
 * @returns {object|null} Object with url and handle properties, or null.
 */
export function parseThreadsLink(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?threads\.(?:com|net)\/[^\s)]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,)]+$/, '');
  const h = url.match(/threads\.(?:com|net)\/([@A-Za-z0-9._]+)/i);
  return { url, handle: h ? h[1] : null };
}

/**
 * Robustly parses a JSON object from a string, tolerating surrounding text.
 * @param {string} s
 * @returns {object|null}
 */
export function parseJSON(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Try extracting the first {...} block.
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Applies a single action from the assistant's response via EventStore's
 * server-backed API. Requires a signed-in user for every op — the server
 * derives ownership from the session, so an anonymous caller can't add,
 * edit, or remove anything. Checked explicitly up front (rather than
 * letting the network call fail with a generic error) so the assistant can
 * reply with a helpful Finnish message instead.
 *
 * `edit`/`remove` are destructive and mutate a meetup outside the user's
 * direct interaction with it, so — unlike `add` — they are never executed
 * here. This returns a `pending: true` descriptor instead; the caller must
 * show it as a confirmation chip and only call {@link executeConfirmedAction}
 * once the user explicitly confirms (see `ChatAssistant.jsx`).
 * @param {object} a - Action object with op, and relevant fields.
 * @param {object|null} link - Detected Threads link, or null if none found.
 * @param {object|null} user - Currently logged-in user, or null if signed out.
 * @returns {Promise<object|null>} Result object with changed, kind, label
 *   (and optional event or pending), or null.
 */
export async function applyAction(a, link, user) {
  if (!a || !a.op) return null;

  if (!user) {
    return {
      changed: false,
      kind: 'error',
      label: 'Kirjaudu sisään Threadsilla ennen kuin muokkaat miittejä',
    };
  }

  if (a.op === 'add') {
    // Backfill url/org from a pasted Threads link if the model omitted them.
    if (link) {
      if (!a.url) a.url = link.url;
      if (!a.org) a.org = link.handle;
    }
    const validUrl = THREADS_URL_RE.test(String(a.url ?? '').trim());
    if (!validUrl) {
      return {
        changed: false,
        kind: 'error',
        label: 'Threads-postauslinkki puuttuu — miittiä ei lisätty',
      };
    }
    const result = await EventStore.add(a);
    return result.ok
      ? { changed: true, kind: 'add', event: result.event, label: `Lisätty #${result.event.id}` }
      : { changed: false, kind: 'error', label: result.error };
  }

  if (a.op === 'edit' && a.id) {
    const id = String(a.id).replace('#', '');
    return {
      changed: false,
      pending: true,
      kind: 'edit',
      action: { ...a, id },
      label: `Vahvista muokkaus miittiin #${id}`,
    };
  }

  if (a.op === 'remove' && a.id) {
    const id = String(a.id).replace('#', '');
    return {
      changed: false,
      pending: true,
      kind: 'remove',
      action: { ...a, id },
      label: `Vahvista miitin #${id} poisto`,
    };
  }

  // Every recognised op (add/edit/remove) is handled above and returns
  // before this point. Reaching here means the model emitted an op we don't
  // know, or an edit/remove with no id — surfaced as a warning so a model
  // regression producing malformed actions is visible rather than silently
  // dropped.
  console.warn(`chatActions.applyAction: unhandled action`, a);
  return null;
}

/**
 * Executes a previously-confirmed `edit` or `remove` action against
 * EventStore. Only call this after the user has explicitly confirmed the
 * pending-action chip produced by {@link applyAction} — it performs the
 * actual mutation.
 * @param {object} action - The `action` field from a `pending` result of {@link applyAction}.
 * @param {object|null} user - Currently logged-in user, or null if signed out.
 * @returns {Promise<object|null>} Result object with changed, kind, label (and optional event), or null.
 */
export async function executeConfirmedAction(action, user) {
  if (!action || !user) return null;

  if (action.op === 'edit' && action.id) {
    const result = await EventStore.edit(action.id, action);
    return result.ok
      ? {
          changed: true,
          kind: 'edit',
          event: result.event,
          label: `Päivitetty #${result.event.id}`,
        }
      : { changed: false, kind: 'error', label: `Tunnistetta #${action.id} ei löytynyt` };
  }

  if (action.op === 'remove' && action.id) {
    const result = await EventStore.remove(action.id);
    return result.ok
      ? { changed: true, kind: 'remove', label: `Poistettu #${action.id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${action.id} ei löytynyt` };
  }

  return null;
}

/**
 * Merges a patch into one pending-action chip, leaving every other message
 * and chip untouched. Used by `ChatAssistant.jsx` to flip a chip to its busy
 * state, or attach an error, while a confirm/cancel request is in flight.
 * @param {object[]} msgs - Chat message list (each may have a `pending` array).
 * @param {number} msgIndex - Index of the message the chip belongs to.
 * @param {number} pendingId - The chip's `id`.
 * @param {object} patch - Fields to merge into the matching pending entry.
 * @returns {object[]} A new messages array with the patch applied.
 */
export function patchPendingAction(msgs, msgIndex, pendingId, patch) {
  return msgs.map((m, i) => {
    if (i !== msgIndex || !m.pending) return m;
    return { ...m, pending: m.pending.map((p) => (p.id === pendingId ? { ...p, ...patch } : p)) };
  });
}

/**
 * Resolves a pending-action chip after it executes successfully: removes it
 * from `pending` and appends its result to `cards` so a confirmation is shown
 * in its place.
 * @param {object[]} msgs - Chat message list.
 * @param {number} msgIndex - Index of the message the chip belongs to.
 * @param {number} pendingId - The chip's `id`.
 * @param {object} result - Result returned by {@link executeConfirmedAction}.
 * @returns {object[]} A new messages array with the pending entry resolved.
 */
export function resolvePendingAction(msgs, msgIndex, pendingId, result) {
  return msgs.map((m, i) => {
    if (i !== msgIndex || !m.pending) return m;
    return {
      ...m,
      pending: m.pending.filter((p) => p.id !== pendingId),
      cards: [...(m.cards ?? []), result],
    };
  });
}

/**
 * Discards a pending-action chip without executing it — the user tapped
 * cancel, so no store mutation ever happens for it.
 * @param {object[]} msgs - Chat message list.
 * @param {number} msgIndex - Index of the message the chip belongs to.
 * @param {number} pendingId - The chip's `id`.
 * @returns {object[]} A new messages array with the pending entry removed.
 */
export function dismissPendingAction(msgs, msgIndex, pendingId) {
  return msgs.map((m, i) => {
    if (i !== msgIndex || !m.pending) return m;
    return { ...m, pending: m.pending.filter((p) => p.id !== pendingId) };
  });
}
