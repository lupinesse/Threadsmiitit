/**
 * @fileoverview Short, visually-unambiguous ID generator for events, shared
 * by the server-side event store. (The client no longer generates event
 * IDs itself — the server assigns them on create so they're guaranteed
 * unique against the authoritative dataset, not just a client-visible set.)
 */

/** Characters to use for generated IDs — excludes visually ambiguous glyphs. */
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generates a unique 4-character ID not already present in `existing`.
 * @param {Set<string>} [existing] - IDs already in use.
 * @returns {string}
 */
export function genId(existing) {
  let id;
  do {
    id = '';
    for (let i = 0; i < 4; i++) {
      id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
  } while (existing && existing.has(id));
  return id;
}
