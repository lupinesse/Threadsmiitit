/**
 * @fileoverview Single source of truth for moderator Threads handles.
 *
 * Imported by both the client (`src/data.js`) and the server (`session.mjs`)
 * so the UI's admin affordances and the server's write-endpoint guards never
 * drift apart.
 */

/** Moderator Threads handles (with leading @). @type {string[]} */
export const ADMINS = ['@tintsh', '@nipatran', '@lupinesse'];
