/**
 * @fileoverview Blobs-backed persistence for the broadcast bot: idempotency
 * state (what's already been announced) and the bot's own Threads access
 * token. Two separate Blobs stores, both single-blob (one JSON document
 * each) — same one-document-per-store idiom as
 * `netlify/functions/lib/session.mjs`'s cookie handling, chosen because
 * this data is small, always read/written as a whole, and never queried by
 * key the way `eventsStore.mjs`'s per-event blobs are.
 *
 * State and token are split into separate stores (rather than one) so the
 * access token — a live credential — is never accidentally included when
 * something logs or inspects the state blob.
 *
 * Every export accepts an optional injectable store, mirroring
 * `eventsStore.mjs`'s `BlobStoreLike` pattern, so unit tests use the same
 * in-memory fake instead of touching real Netlify Blobs.
 */

import { getStore } from '@netlify/blobs';

const STATE_STORE_NAME = 'bot-state';
const STATE_KEY = 'state';

/**
 * Name of the Blobs store holding the bot's access token. Exported so
 * `scripts/seed-bot-token.mjs` — which runs outside a deployed Netlify
 * Function and must construct its own store with explicit
 * `siteID`/`token` — connects to the exact same store `getBotToken`/
 * `putBotToken` read and write, rather than duplicating this literal.
 */
export const SECRETS_STORE_NAME = 'bot-secrets';
const TOKEN_KEY = 'token';

/**
 * @typedef {object} BotState
 * @property {Record<string, string>} lastSnapshot - Every known event id → its status,
 *   as of the last time any trigger ran. Lets a future trigger detect status
 *   transitions directly, rather than only "is this id announced yet".
 * @property {{new: string[], cancelled: string[]}} announced - Event ids already
 *   announced for each trigger kind — the idempotency ledger.
 * @property {number} lastDailyRunAtMs - Epoch ms of the last daily-digest run.
 * @property {string|null} lastWeeklyTargetSunday - `YYYY-MM-DD` of the Sunday the
 *   weekly summary was last posted for, or `null` if never posted.
 */

/**
 * @typedef {object} BotToken
 * @property {string} accessToken - Live Threads Graph API token. Treat as a secret.
 * @property {number} expiresAt - Epoch ms the token expires at.
 */

/**
 * A minimal key-value store — the same `BlobStoreLike` subset
 * `eventsStore.mjs` depends on.
 * @typedef {object} BlobStoreLike
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<unknown>} set
 */

/**
 * @returns {BotState} A fresh, empty state — used the first time the bot ever runs.
 */
function emptyState() {
  return {
    lastSnapshot: {},
    announced: { new: [], cancelled: [] },
    lastDailyRunAtMs: 0,
    lastWeeklyTargetSunday: null,
  };
}

/**
 * Resolves the Blobs store to use for bot state, defaulting to a real
 * `bot-state` store with strict consistency — two overlapping cron ticks
 * must never both see a stale "not yet announced" read.
 * @param {BlobStoreLike} [store] - Injectable for tests.
 * @returns {BlobStoreLike}
 */
function resolveStateStore(store) {
  return store ?? getStore({ name: STATE_STORE_NAME, consistency: 'strict' });
}

/**
 * Resolves the Blobs store to use for the bot's access token.
 * @param {BlobStoreLike} [store] - Injectable for tests.
 * @returns {BlobStoreLike}
 */
function resolveSecretsStore(store) {
  return store ?? getStore({ name: SECRETS_STORE_NAME, consistency: 'strict' });
}

/**
 * Loads the bot's persisted state, or a fresh empty one if it has never run.
 * @param {BlobStoreLike} [store]
 * @returns {Promise<BotState>}
 */
export async function getBotState(store) {
  const raw = await resolveStateStore(store).get(STATE_KEY);
  return raw ? JSON.parse(raw) : emptyState();
}

/**
 * Persists the bot's state, overwriting whatever was there before.
 * @param {BotState} state
 * @param {BlobStoreLike} [store]
 * @returns {Promise<void>}
 */
export async function putBotState(state, store) {
  await resolveStateStore(store).set(STATE_KEY, JSON.stringify(state));
}

/**
 * Reads the announced-id list for a given trigger kind. A small explicit
 * branch rather than `state.announced[kind]` — `kind` is restricted to
 * `'new'|'cancelled'` by every caller, but bracket-accessing an object with
 * a variable key still reads as a generic injection risk to static
 * analysis, so this stays unambiguous instead of silencing that check.
 * @param {BotState} state
 * @param {'new'|'cancelled'} kind
 * @returns {string[]}
 */
function announcedList(state, kind) {
  return kind === 'new' ? state.announced.new : state.announced.cancelled;
}

/**
 * Whether an event has already been announced for a given trigger kind.
 * @param {BotState} state
 * @param {'new'|'cancelled'} kind
 * @param {string} eventId
 * @returns {boolean}
 */
export function hasAnnounced(state, kind, eventId) {
  return announcedList(state, kind).includes(eventId);
}

/**
 * Returns a new state with an event marked announced for a given trigger
 * kind. Pure — does not persist; callers pass the result to `putBotState`.
 * A no-op (returns the same state) if the event was already marked, so
 * repeated calls within a run can't grow the ledger unboundedly.
 * @param {BotState} state
 * @param {'new'|'cancelled'} kind
 * @param {string} eventId
 * @returns {BotState}
 */
export function markAnnounced(state, kind, eventId) {
  if (hasAnnounced(state, kind, eventId)) return state;
  const updated = [...announcedList(state, kind), eventId];
  return {
    ...state,
    announced:
      kind === 'new'
        ? { ...state.announced, new: updated }
        : { ...state.announced, cancelled: updated },
  };
}

/**
 * Events that are `approved` and not yet announced as new.
 * @param {Array<{id: string, status: string}>} events
 * @param {BotState} state
 * @returns {Array<{id: string, status: string}>}
 */
export function newlyApproved(events, state) {
  return events.filter((e) => e.status === 'approved' && !hasAnnounced(state, 'new', e.id));
}

/**
 * Events that are `cancelled` and not yet announced as cancelled.
 * @param {Array<{id: string, status: string}>} events
 * @param {BotState} state
 * @returns {Array<{id: string, status: string}>}
 */
export function newlyCancelled(events, state) {
  return events.filter((e) => e.status === 'cancelled' && !hasAnnounced(state, 'cancelled', e.id));
}

/**
 * Returns a new state with `lastSnapshot` rebuilt from the current full
 * event list. Pure — does not persist.
 * @param {BotState} state
 * @param {Array<{id: string, status: string}>} events
 * @returns {BotState}
 */
export function updateSnapshot(state, events) {
  const lastSnapshot = Object.fromEntries(events.map((e) => [e.id, e.status]));
  return { ...state, lastSnapshot };
}

/**
 * Loads the bot's persisted Threads access token, or `null` if it has never
 * been seeded (see `scripts/seed-bot-token.mjs`).
 * @param {BlobStoreLike} [store]
 * @returns {Promise<BotToken|null>}
 */
export async function getBotToken(store) {
  const raw = await resolveSecretsStore(store).get(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Persists the bot's Threads access token, overwriting whatever was there
 * before. Never log the value passed here — it's a live credential.
 * @param {BotToken} token
 * @param {BlobStoreLike} [store]
 * @returns {Promise<void>}
 */
export async function putBotToken(token, store) {
  await resolveSecretsStore(store).set(TOKEN_KEY, JSON.stringify(token));
}
