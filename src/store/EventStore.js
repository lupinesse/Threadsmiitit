/**
 * @fileoverview User-added meetup store backed by localStorage.
 *
 * Seed meetups (from data.js) are read-only. User meetups are stored under
 * a versioned localStorage key, each with a short 4-char ID so they can be
 * edited or removed later via the AI assistant.
 *
 * Custom cities entered by users are persisted separately and merged back
 * into the CITIES array on module load so all existing city lookups keep
 * working without changes.
 */

import { CITIES, CATEGORIES, MEETUPS } from '../data.js';
import { FI_KUNNAT } from '../cities.js';

const KEY = 'threadsmiitit_user_events_v1';
const KEY_CITIES = 'threadsmiitit_custom_cities_v1';

/** Characters to use for generated IDs — excludes visually ambiguous glyphs. */
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generates a unique 4-character ID not already in the provided set.
 * @param {Set<string>} [existing] - IDs already in use.
 * @returns {string}
 */
function genId(existing) {
  let id;
  do {
    id = '';
    for (let i = 0; i < 4; i++) {
      id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
  } while (existing && existing.has(id));
  return id;
}

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

// ── User events ─────────────────────────────────────────────────────────────

/**
 * Loads all user-added events from localStorage.
 * @returns {object[]}
 */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Migration: events saved before moderation existed had no `status` field.
    // Treat them as already published so nothing already-live disappears.
    return arr.map((e) => (e && e.status ? e : { ...e, status: 'approved' }));
  } catch (err) {
    console.warn('[EventStore] Could not load user events:', err);
    return [];
  }
}

/**
 * Persists the user event list to localStorage.
 * @param {object[]} arr
 */
function save(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch (err) {
    console.warn('[EventStore] Could not save user events:', err);
  }
}

// ── Normalisation helpers ───────────────────────────────────────────────────

/**
 * Ensures a handle string starts with '@'.
 * @param {string} s
 * @returns {string}
 */
function tagHandle(s) {
  s = String(s).trim();
  if (!s) return '';
  return s.startsWith('@') ? s : '@' + s.replace(/^@+/, '');
}

/**
 * Normalises organizer input to an array of @-prefixed handles.
 * @param {string|string[]} o
 * @returns {string[]}
 */
function normOrg(o) {
  if (Array.isArray(o)) return o.map(tagHandle).filter(Boolean);
  if (typeof o === 'string' && o.trim()) {
    return o.split(/[,/]+/).map(tagHandle).filter(Boolean);
  }
  return [];
}

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
 * Validates and normalises a partial event object from the assistant or form.
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
    url:
      p.url && /^https?:\/\/(www\.)?threads\.(com|net)\//i.test(String(p.url).trim())
        ? String(p.url).trim()
        : '',
    ...(p.addedBy ? { addedBy: p.addedBy } : {}),
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Adds a new user event and persists it. New submissions start as `pending`
 * — an admin must approve them before they appear in the public feed.
 * @param {object} partial - Partial event fields (will be normalised).
 * @returns {object} The saved event with an assigned `id`.
 */
function add(partial) {
  const arr = load();
  const ids = new Set(arr.map((e) => e.id).concat(MEETUPS.map((m) => m.id).filter(Boolean)));
  const ev = {
    id: genId(ids),
    user: true,
    status: 'pending',
    submitted: Date.now(),
    ...normalize(partial),
  };
  arr.push(ev);
  save(arr);
  return ev;
}

/**
 * Edits an existing user event by ID and persists the change. Preserves the
 * event's `status`, `submitted` timestamp, and `addedBy` — except that
 * editing a previously-rejected event resets it to `pending` for re-review.
 * @param {string} id - 4-char event ID.
 * @param {object} patch - Fields to update (will be merged and normalised).
 * @returns {object|null} The updated event, or null if the ID was not found.
 */
function edit(id, patch) {
  const arr = load();
  const i = arr.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const merged = { ...arr[i], ...normalize({ ...arr[i], ...patch }) };
  merged.id = arr[i].id;
  merged.user = true;
  merged.submitted = arr[i].submitted;
  if (arr[i].status === 'rejected') {
    merged.status = 'pending';
    delete merged.reviewedAt;
    delete merged.rejectReason;
  } else {
    merged.status = arr[i].status ?? 'pending';
  }
  arr[i] = merged;
  save(arr);
  return merged;
}

/**
 * Removes a user event by ID.
 * @param {string} id
 * @returns {boolean} True if the event was found and removed.
 */
function remove(id) {
  const arr = load();
  const i = arr.findIndex((e) => e.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  save(arr);
  return true;
}

/**
 * Finds a user event by ID without removing it.
 * @param {string} id
 * @returns {object|null}
 */
function find(id) {
  return load().find((e) => e.id === id) ?? null;
}

/**
 * Returns all meetups visible in the public feed — seed events followed by
 * approved user events, plus the current user's own pending submissions
 * (shown to their submitter, flagged, while awaiting review). Rejected
 * events and other users' pending submissions are never included here; use
 * `ownedBy()` to see a user's full submission history regardless of status.
 * @param {string} [currentUsername] - The signed-in user's Threads handle (no `@`).
 * @returns {object[]}
 */
function all(currentUsername) {
  const visible = load().filter(
    (e) =>
      e.status === 'approved' || (e.status === 'pending' && e.addedBy?.username === currentUsername)
  );
  return MEETUPS.concat(visible);
}

/**
 * Returns every event submitted by a given Threads handle, regardless of
 * moderation status — used by the "Miittini" profile section so a user can
 * see their own pending/rejected submissions alongside published ones.
 * @param {string} username - Threads handle (no `@`).
 * @returns {object[]}
 */
function ownedBy(username) {
  if (!username) return [];
  return load().filter((e) => e.addedBy?.username === username);
}

/**
 * Returns all pending submissions across every user, oldest first — the
 * admin moderation queue.
 * @returns {object[]}
 */
function pending() {
  return load()
    .filter((e) => e.status === 'pending')
    .sort((a, b) => (a.submitted ?? 0) - (b.submitted ?? 0));
}

/**
 * Sets an event's moderation status and records the review time.
 * @param {string} id
 * @param {'approved'|'rejected'} status
 * @param {object} [extra] - Additional fields to merge in (e.g. rejectReason).
 * @returns {object|null} The updated event, or null if the ID was not found.
 */
function setStatus(id, status, extra) {
  const arr = load();
  const i = arr.findIndex((e) => e.id === id);
  if (i < 0) return null;
  arr[i] = { ...arr[i], status, reviewedAt: Date.now(), ...(extra ?? {}) };
  save(arr);
  return arr[i];
}

/**
 * Approves a pending submission, publishing it to the public feed.
 * @param {string} id
 * @returns {object|null} The updated event, or null if the ID was not found.
 */
function approve(id) {
  return setStatus(id, 'approved');
}

/**
 * Rejects a pending submission, hiding it from the public feed. The
 * submitter can still see it (as rejected) via `ownedBy()`.
 * @param {string} id
 * @param {string} [reason] - Optional reason shown to the submitter, capped at 120 chars.
 * @returns {object|null} The updated event, or null if the ID was not found.
 */
function reject(id, reason) {
  return setStatus(id, 'rejected', reason ? { rejectReason: String(reason).slice(0, 120) } : {});
}

/**
 * Returns a stable, unique key for a meetup suitable for use in the
 * favourites Set. User-added meetups use their generated `id`; seed
 * meetups (which have no id) use a `title|date` composite.
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
  load,
  save,
  add,
  edit,
  remove,
  find,
  all,
  ownedBy,
  pending,
  approve,
  reject,
  favKey,
  genId,
  normalize,
  resolveCity,
  resolveCat,
  registerCity,
  loadCities,
  canonicalKunta,
};

export default EventStore;
