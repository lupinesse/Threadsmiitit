/**
 * @fileoverview Field-normalization helpers shared between the client
 * (src/store/EventStore.js) and the server
 * (netlify/functions/lib/eventNormalize.mjs), so the Threads-URL pattern and
 * organizer-handle normalization can't silently drift between what the form
 * accepts and what the server accepts. Pure functions/regex only — no
 * browser or Node-specific globals — so both a Vite client build and
 * Netlify's function bundler can import it directly via a relative path.
 */

/** Matches a Threads post URL (threads.com or threads.net, with or without www). */
export const THREADS_URL_RE = /^https?:\/\/(www\.)?threads\.(com|net)\//i;

/** Max length for the free-text "suggest a new category" field. */
export const CAT_SUGGESTION_MAX_LEN = 40;

/**
 * Normalises a free-text category suggestion: trims and caps length. Unlike
 * `cat`, this is never resolved against the known `CATEGORIES` table — it's
 * shown to admins as-is so they can decide whether to add a matching
 * category, and doesn't affect how the submission is displayed publicly.
 * @param {string} s
 * @returns {string} The trimmed suggestion, or '' if empty.
 */
export function normCatSuggestion(s) {
  return (s ?? '').toString().trim().slice(0, CAT_SUGGESTION_MAX_LEN);
}

/**
 * Normalises a handle string to start with '@'.
 * @param {string} s
 * @returns {string}
 */
export function tagHandle(s) {
  const trimmed = String(s).trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : '@' + trimmed.replace(/^@+/, '');
}

/**
 * Normalises organizer input to an array of @-prefixed handles.
 * @param {string|string[]} o
 * @returns {string[]}
 */
export function normOrg(o) {
  if (Array.isArray(o)) return o.map(tagHandle).filter(Boolean);
  if (typeof o === 'string' && o.trim()) {
    return o.split(/[,/]+/).map(tagHandle).filter(Boolean);
  }
  return [];
}
