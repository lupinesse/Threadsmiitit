/**
 * @fileoverview In-memory fake matching the `BlobStoreLike` interface
 * `netlify/functions/lib/eventsStore.mjs` depends on, so tests can exercise
 * the store/handler logic without real Netlify Blobs or `netlify dev`.
 */

/**
 * Creates a fresh in-memory fake Blobs store.
 * @returns {{get: Function, set: Function, delete: Function, list: Function}}
 */
export function createFakeStore() {
  const map = new Map();
  let etagCounter = 0;
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, value, opts) {
      if (opts?.onlyIfNew && map.has(key)) return {}; // no etag — write skipped, matching real Blobs
      map.set(key, value);
      return { etag: `fake-etag-${++etagCounter}` };
    },
    async delete(key) {
      map.delete(key);
    },
    async list() {
      return { blobs: [...map.keys()].map((key) => ({ key })) };
    },
  };
}
