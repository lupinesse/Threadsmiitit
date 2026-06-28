/**
 * @fileoverview City notification preference store backed by localStorage.
 *
 * Logged-in users can subscribe to a city to receive in-app notifications
 * when new meetups appear there. Since the app is client-side only,
 * "notification" means a banner shown the next time the user opens the app
 * and new meetups have appeared in their chosen city.
 *
 * Persisted key: `threadsmiitit_city_notif_v1`
 * Shape: `{ cityKey: string, seenKeys: string[] }`
 *
 * A meetup is "new" if its `EventStore.favKey` is absent from `seenKeys`.
 * On subscribe, all meetups currently in the city are pre-populated into
 * `seenKeys` so only meetups added *after* the subscription trigger a banner.
 */

import EventStore from './EventStore.js';

const KEY = 'threadsmiitit_city_notif_v1';

/**
 * @typedef {{ cityKey: string, seenKeys: string[] }} NotifPref
 */

/**
 * Loads the raw preference object from localStorage.
 * @returns {NotifPref | null}
 */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj.cityKey === 'string' && Array.isArray(obj.seenKeys)) {
      return { cityKey: obj.cityKey, seenKeys: obj.seenKeys };
    }
    return null;
  } catch (err) {
    console.warn('[NotificationStore] Could not load preference:', err);
    return null;
  }
}

/**
 * Persists the preference object to localStorage.
 * @param {NotifPref} pref
 */
function save(pref) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch (err) {
    console.warn('[NotificationStore] Could not save preference:', err);
  }
}

/**
 * Returns the current city notification preference, or null if none is set.
 * @returns {NotifPref | null}
 */
function getPreference() {
  return load();
}

/**
 * Subscribes to notifications for the given city. All meetups currently in
 * that city are marked as seen so only future additions trigger a banner.
 * @param {string} cityKey - The city key to subscribe to.
 * @param {object[]} allEvents - All current meetups (used to seed seenKeys).
 */
function setPreference(cityKey, allEvents) {
  const seenKeys = allEvents.filter((m) => m.city === cityKey).map((m) => EventStore.favKey(m));
  save({ cityKey, seenKeys });
}

/**
 * Removes the city notification preference entirely.
 */
function clearPreference() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // localStorage unavailable — no-op
  }
}

/**
 * Marks all meetups currently in the subscribed city as seen, dismissing
 * the active in-app notification banner.
 * @param {object[]} allEvents - All current meetups.
 */
function markSeen(allEvents) {
  const pref = load();
  if (!pref) return;
  const freshKeys = allEvents
    .filter((m) => m.city === pref.cityKey)
    .map((m) => EventStore.favKey(m));
  const seenKeys = [...new Set([...pref.seenKeys, ...freshKeys])];
  save({ ...pref, seenKeys });
}

/**
 * Returns meetups in the subscribed city that have not yet been seen.
 * Returns an empty array when pref is null.
 * @param {object[]} allEvents - All current meetups (seed + user-added).
 * @param {NotifPref | null} pref - Notification preference.
 * @returns {object[]}
 */
function getNewMeetups(allEvents, pref) {
  if (!pref) return [];
  const seen = new Set(pref.seenKeys);
  return allEvents.filter((m) => m.city === pref.cityKey && !seen.has(EventStore.favKey(m)));
}

const NotificationStore = {
  getPreference,
  setPreference,
  clearPreference,
  markSeen,
  getNewMeetups,
};

export default NotificationStore;
