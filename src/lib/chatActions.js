/**
 * @fileoverview Pure request/response helpers for the "Miitti-apuri" chat
 * assistant, kept free of JSX so they can be unit tested directly with
 * Node's test runner (see test/unit.mjs).
 */

import EventStore from '../store/EventStore.js';
import { buildAddedBy } from './addedBy.js';

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
 * Applies a single action from the assistant's response to EventStore.
 * @param {object} a - Action object with op, and relevant fields.
 * @param {object|null} link - Detected Threads link, or null if none found.
 * @param {object|null} user - Currently logged-in user, or null if signed out.
 * @returns {object|null} Result object with changed, kind, label (and optional event), or null.
 */
export function applyAction(a, link, user) {
  if (!a || !a.op) return null;

  if (a.op === 'add') {
    // Backfill url/org from a pasted Threads link if the model omitted them.
    if (link) {
      if (!a.url) a.url = link.url;
      if (!a.org) a.org = link.handle;
    }
    const validUrl = /^https?:\/\/(www\.)?threads\.(com|net)\//i.test(String(a.url ?? '').trim());
    if (!validUrl) {
      return {
        changed: false,
        kind: 'error',
        label: 'Threads-postauslinkki puuttuu — miittiä ei lisätty',
      };
    }
    const addedBy = buildAddedBy(user);
    const payload = addedBy ? { ...a, addedBy } : a;
    const ev = EventStore.add(payload);
    return { changed: true, kind: 'add', event: ev, label: `Lisätty #${ev.id}` };
  }

  if (a.op === 'edit' && a.id) {
    const ev = EventStore.edit(String(a.id).replace('#', ''), a);
    return ev
      ? { changed: true, kind: 'edit', event: ev, label: `Päivitetty #${ev.id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${a.id} ei löytynyt` };
  }

  if (a.op === 'remove' && a.id) {
    const id = String(a.id).replace('#', '');
    const ev = EventStore.find(id);
    const ok = EventStore.remove(id);
    return ok
      ? { changed: true, kind: 'remove', event: ev, label: `Poistettu #${id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${id} ei löytynyt` };
  }

  return null;
}
