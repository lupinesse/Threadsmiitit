/**
 * @fileoverview User-submitted meetup store — a thin, server-backed client.
 *
 * All shared event data (submissions, moderation status) now lives in the
 * server-side Blobs store behind /api/events* (see
 * netlify/functions/events*.js), not in localStorage. Every network-backed
 * function here is `async` and resolves to either `{ ok: true, ... }` or
 * `{ ok: false, error }` — never throws — so callers don't need try/catch
 * for the common case, mirroring the `Guard` pattern already used in
 * netlify/functions/lib/session.mjs.
 *
 * Only city lookup/registration (genuinely local — a user's custom city
 * entry persists per-browser) and the pure `normalize()`/`favKey()` helpers
 * stay synchronous.
 */

import { CITIES, CATEGORIES, MEETUPS } from '../data.js';
import { FI_KUNNAT } from '../cities.js';
import { THREADS_URL_RE, normOrg } from '../../shared/eventFields.mjs';

const KEY_CITIES = 'threadsmiitit_custom_cities_v1';

// ── Custom cities ───────────────────────────────────────────────────────────

/**
 * Loads persisted custom cities from localStorage.
 * @returns {Array<{key:string, name:string, short:string, custom:true}>}
 */
function loadCities() {
  try {
    const raw = localStorage.getItem(KEY_CITIES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.warn('[EventStore] Could not load custom cities:', err);
    return [];
  }
}

/**
 * Persists the custom city list to localStorage.
 * @param {object[]} arr
 */
function saveCities(arr) {
  try {
    localStorage.setItem(KEY_CITIES, JSON.stringify(arr));
  } catch (err) {
    console.warn('[EventStore] Could not save custom cities:', err);
  }
}

/**
 * Converts a city name to a URL-safe slug for use as a city key.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .trim()
      .replace(/[äàáâ]/g, 'a')
      .replace(/[öòóô]/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'kaupunki'
  );
}

/**
 * Converts a string to Title Case, handling Finnish hyphenated compounds.
 * @param {string} name
 * @returns {string}
 */
function titleCase(name) {
  return String(name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s-])([a-zäöå])/g, (_, p, c) => p + c.toUpperCase());
}

/**
 * Matches free-text input against the official Finnish municipality list.
 * Returns the canonical name with correct casing, or null if no match.
 * @param {string} input
 * @returns {string|null}
 */
function canonicalKunta(input) {
  if (!FI_KUNNAT || !input) return null;
  const s = String(input).toLowerCase().trim();
  let hit = FI_KUNNAT.find((k) => k.toLowerCase() === s);
  if (hit) return hit;
  hit = FI_KUNNAT.find((k) => k.toLowerCase().startsWith(s) && s.length >= 3);
  return hit ?? null;
}

/**
 * Registers a new city in the runtime CITIES array and persists it.
 * Uses the canonical Finnish municipality name if the input matches one.
 * @param {string} rawName
 * @returns {string} The newly assigned city key.
 */
function registerCity(rawName) {
  const canon = canonicalKunta(rawName);
  const name = canon ?? titleCase(rawName);
  let key = slugify(name);
  const base = key;
  let n = 2;
  const taken = new Set(CITIES.map((c) => c.key));
  while (taken.has(key)) {
    key = base + '-' + n;
    n++;
  }
  const city = { key, name, short: name, custom: true };
  CITIES.push(city); // mutates the shared reference so all lookups stay in sync
  const stored = loadCities();
  stored.push(city);
  saveCities(stored);
  return key;
}

// ── Normalisation helpers ───────────────────────────────────────────────────

/**
 * Normalises a date value to YYYY-MM-DD.
 * Accepts YYYY-MM-DD or DD.MM.YYYY.
 * @param {string} d
 * @returns {string}
 */
function normDate(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = String(d).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return d;
}

/**
 * Resolves a city value to a known city key, registering a new city if needed.
 * @param {string} c - City key, name, or short name.
 * @returns {string} Resolved city key.
 */
function resolveCity(c) {
  if (!c || !String(c).trim()) return '';
  const k = String(c).toLowerCase().trim();
  const exact = CITIES.find((x) => x.key === k);
  if (exact) return exact.key;
  const byName = CITIES.find(
    (x) =>
      x.short.toLowerCase() === k || x.name.toLowerCase() === k || x.name.toLowerCase().includes(k)
  );
  if (byName) return byName.key;
  return registerCity(c);
}

/**
 * Resolves a category value to a known category key, falling back to 'yleinen'.
 * @param {string} c - Category key or label substring.
 * @returns {string}
 */
function resolveCat(c) {
  if (!c) return 'yleinen';
  const k = String(c).toLowerCase().trim();
  if (CATEGORIES[k]) return k;
  const byLabel = Object.keys(CATEGORIES).find(
    (key) => CATEGORIES[key].label.toLowerCase().includes(k) || k.includes(key)
  );
  return byLabel ?? 'yleinen';
}

/**
 * Validates and normalises a partial event object from the assistant or form
 * before it's sent to the server. The server independently re-validates the
 * shape of whatever it receives (see netlify/functions/lib/eventNormalize.mjs)
 * — this local pass exists so city/category free text gets resolved against
 * the full lookup tables the server doesn't bundle.
 * @param {object} p - Partial event fields.
 * @returns {object} Normalised event fields.
 */
function normalize(p) {
  return {
    title: (p.title ?? '').toString().trim().slice(0, 80),
    date: normDate(p.date),
    city: resolveCity(p.city),
    cat: resolveCat(p.cat ?? p.category),
    org: normOrg(p.org ?? p.organizer),
    area: p.area ? String(p.area).trim().slice(0, 40) : undefined,
    url: p.url && THREADS_URL_RE.test(String(p.url).trim()) ? String(p.url).trim() : '',
  };
}

// ── Server-backed API ───────────────────────────────────────────────────────

/**
 * Issues a fetch against an /api/events* endpoint, translating network and
 * non-2xx failures into a `{ ok: false, error }` result instead of throwing.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<{ok:true, [key:string]: unknown}|{ok:false, error:string}>}
 */
async function apiFetch(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...opts });
  } catch (err) {
    console.warn('[EventStore] Network error:', err);
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
    console.warn('[EventStore] Malformed response body:', err);
    return { ok: false, error: 'Virheellinen vastaus palvelimelta.' };
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Returns every meetup visible in the public feed — seed events followed by
 * approved user events, plus the current user's own pending submissions.
 * The server derives "current user" from the verified session cookie, not
 * from any client-supplied value.
 * @returns {Promise<{ok:true, events:object[]}|{ok:false, error:string}>}
 */
async function all() {
  const result = await apiFetch('/api/events');
  if (!result.ok) return result;
  return { ok: true, events: MEETUPS.concat(result.events) };
}

/**
 * Returns every event submitted by the signed-in user, regardless of
 * moderation status — used by the "Miittini" profile section.
 * @param {string} [username] - The signed-in user's Threads handle (no `@`).
 * @returns {Promise<{ok:true, events:object[]}|{ok:false, error:string}>}
 */
async function ownedBy(username) {
  if (!username) return { ok: true, events: [] };
  return apiFetch('/api/events/mine');
}

/**
 * Returns all pending submissions across every user, oldest first — the
 * admin moderation queue. Requires an admin session.
 * @returns {Promise<{ok:true, events:object[]}|{ok:false, error:string}>}
 */
async function pending() {
  return apiFetch('/api/events/pending');
}

/**
 * Submits a new event. Requires the caller to be signed in — the server
 * derives the submission's owner from the session and always starts it as
 * `pending`.
 * @param {object} partial - Partial event fields (will be normalised locally, then re-validated server-side).
 * @returns {Promise<{ok:true, event:object}|{ok:false, error:string}>}
 */
async function add(partial) {
  return apiFetch('/api/events', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(normalize(partial)),
  });
}

/**
 * Edits an existing event the caller owns. Editing a previously-rejected
 * event resets it to `pending` for re-review.
 * @param {string} id - 4-char event ID.
 * @param {object} patch - Fields to update (will be normalised locally, then re-validated server-side).
 * @returns {Promise<{ok:true, event:object}|{ok:false, error:string}>}
 */
async function edit(id, patch) {
  return apiFetch(`/api/events?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(normalize(patch)),
  });
}

/**
 * Removes an event the caller owns.
 * @param {string} id
 * @returns {Promise<{ok:true}|{ok:false, error:string}>}
 */
async function remove(id) {
  return apiFetch(`/api/events?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Approves a pending submission, publishing it to the public feed. Requires
 * an admin session.
 * @param {string} id
 * @returns {Promise<{ok:true, event:object}|{ok:false, error:string}>}
 */
async function approve(id) {
  return apiFetch(`/api/events/moderate?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'approve' }),
  });
}

/**
 * Rejects a pending submission, hiding it from the public feed. Requires an
 * admin session. The submitter can still see it (as rejected) via
 * `ownedBy()`.
 * @param {string} id
 * @param {string} [reason] - Optional reason shown to the submitter, capped at 120 chars.
 * @returns {Promise<{ok:true, event:object}|{ok:false, error:string}>}
 */
async function reject(id, reason) {
  return apiFetch(`/api/events/moderate?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'reject', reason }),
  });
}

/**
 * Returns a stable, unique key for a meetup suitable for use in the
 * favourites Set. User-added meetups use their assigned `id`; seed meetups
 * (which have no id) use a `title|date` composite.
 * @param {object} m
 * @returns {string}
 */
function favKey(m) {
  return m.id ?? `${m.title}|${m.date}`;
}

// Hydrate persisted custom cities into CITIES on module load.
loadCities().forEach((c) => {
  if (!CITIES.find((x) => x.key === c.key)) CITIES.push(c);
});

const EventStore = {
  all,
  ownedBy,
  pending,
  add,
  edit,
  remove,
  approve,
  reject,
  favKey,
  normalize,
  resolveCity,
  resolveCat,
  registerCity,
  loadCities,
  canonicalKunta,
};

export default EventStore;
