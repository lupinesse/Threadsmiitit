/**
 * Unit tests for netlify/functions/lib/moderatorsStore.mjs — run with
 * Node's built-in test runner as part of `npm test`. Every test injects the
 * in-memory fake store from test/fakes/blobsStore.mjs, so nothing here
 * touches real Netlify Blobs or requires `netlify dev`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  listModerators,
  isSelfServiceModerator,
  addModerator,
  removeModerator,
} from '../netlify/functions/lib/moderatorsStore.mjs';
import { createFakeStore } from './fakes/blobsStore.mjs';

describe('listModerators / addModerator', () => {
  it('starts empty', async () => {
    const store = createFakeStore();
    assert.deepStrictEqual(await listModerators(store), []);
  });

  it('adds a moderator, normalising the @ prefix and case', async () => {
    const store = createFakeStore();
    const result = await addModerator('@Bob', 'lupinesse', store);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.moderators.length, 1);
    assert.strictEqual(result.moderators[0].username, 'bob');
    assert.strictEqual(result.moderators[0].addedBy, 'lupinesse');
    assert.strictEqual(typeof result.moderators[0].addedAt, 'number');

    assert.deepStrictEqual(await listModerators(store), result.moderators);
  });

  it('rejects an empty or blank username', async () => {
    const store = createFakeStore();
    for (const bad of ['', '   ', undefined, null]) {
      const result = await addModerator(bad, 'lupinesse', store);
      assert.strictEqual(result.ok, false);
    }
  });

  it('rejects a username already on the roster, matching by normalised handle', async () => {
    const store = createFakeStore();
    await addModerator('@bob', 'lupinesse', store);
    const result = await addModerator('Bob', 'nipatran', store);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /already a moderator/);
    assert.strictEqual((await listModerators(store)).length, 1);
  });
});

describe('removeModerator', () => {
  it('removes an existing moderator, matching by normalised handle', async () => {
    const store = createFakeStore();
    await addModerator('@bob', 'lupinesse', store);
    const result = await removeModerator('BOB', store);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.moderators, []);
  });

  it('returns not_found for a username never added', async () => {
    const store = createFakeStore();
    const result = await removeModerator('nobody', store);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'not_found');
  });

  it('leaves other moderators untouched', async () => {
    const store = createFakeStore();
    await addModerator('@bob', 'lupinesse', store);
    await addModerator('@alice', 'lupinesse', store);
    await removeModerator('bob', store);
    const remaining = await listModerators(store);
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].username, 'alice');
  });
});

describe('isSelfServiceModerator', () => {
  it('returns true for a moderator on the roster', async () => {
    const store = createFakeStore();
    await addModerator('@bob', 'lupinesse', store);
    assert.strictEqual(await isSelfServiceModerator('@Bob', store), true);
    assert.strictEqual(await isSelfServiceModerator('bob', store), true);
  });

  it('returns false for a stranger and for a falsy username', async () => {
    const store = createFakeStore();
    await addModerator('@bob', 'lupinesse', store);
    assert.strictEqual(await isSelfServiceModerator('alice', store), false);
    assert.strictEqual(await isSelfServiceModerator('', store), false);
    assert.strictEqual(await isSelfServiceModerator(undefined, store), false);
  });
});
