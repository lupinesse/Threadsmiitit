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
 * @param {object} a - Action object with op, and relevant fields.
 * @param {object|null} link - Detected Threads link, or null if none found.
 * @param {object|null} user - Currently logged-in user, or null if signed out.
 * @returns {Promise<object|null>} Result object with changed, kind, label (and optional event), or null.
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
    const result = await EventStore.edit(id, a);
    return result.ok
      ? {
          changed: true,
          kind: 'edit',
          event: result.event,
          label: `Päivitetty #${result.event.id}`,
        }
      : { changed: false, kind: 'error', label: `Tunnistetta #${id} ei löytynyt` };
  }

  if (a.op === 'remove' && a.id) {
    const id = String(a.id).replace('#', '');
    const result = await EventStore.remove(id);
    return result.ok
      ? { changed: true, kind: 'remove', label: `Poistettu #${id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${id} ei löytynyt` };
  }

  return null;
}
