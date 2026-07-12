/**
 * @fileoverview Server-side validation/normalisation for submitted events.
 *
 * The client (`src/store/EventStore.js`'s `normalize()`) already resolves
 * `city`/`cat` against the full municipality and category lookup tables
 * before submitting, so the server doesn't need to bundle those tables to
 * re-derive them — it only needs to confirm the payload has the *shape* a
 * legitimate client would have produced (a resolved slug, a valid date, a
 * genuine Threads URL) rather than trust the client blindly.
 */

import { THREADS_URL_RE, normOrg } from '../../../shared/eventFields.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Validates and normalises a submitted event payload.
 * @param {object} p - Partial event fields as received from the client.
 * @returns {{ok: true, data: object}|{ok: false, error: string}}
 */
export function normalizeEvent(p) {
  const title = (p?.title ?? '').toString().trim().slice(0, 80);
  if (!title) return { ok: false, error: 'title is required' };

  const date = (p?.date ?? '').toString().trim();
  if (!DATE_RE.test(date)) return { ok: false, error: 'date must be YYYY-MM-DD' };

  const city = (p?.city ?? '').toString().trim().toLowerCase().slice(0, 60);
  if (!city || !SLUG_RE.test(city)) return { ok: false, error: 'city must be a resolved city key' };

  const cat = (p?.cat ?? p?.category ?? '').toString().trim().toLowerCase().slice(0, 40);
  if (!cat || !SLUG_RE.test(cat))
    return { ok: false, error: 'cat must be a resolved category key' };

  const url = (p?.url ?? '').toString().trim();
  if (url && !THREADS_URL_RE.test(url))
    return { ok: false, error: 'url must be a threads.com/threads.net link' };

  return {
    ok: true,
    data: {
      title,
      date,
      city,
      cat,
      org: normOrg(p?.org ?? p?.organizer),
      area: p?.area ? String(p.area).trim().slice(0, 40) : undefined,
      url,
    },
  };
}
