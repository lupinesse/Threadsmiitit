/**
 * Unit tests for shared/postTemplates.mjs — run with Node's built-in test
 * runner as part of `npm test`. Pure functions only; no network, no Blobs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  truncateToBytes,
  renderCancellation,
  renderDailyRoot,
  renderDailyReply,
  renderWeekly,
  MAIN_POST_MAX_BYTES,
  ATTACHMENT_MAX_BYTES,
} from '../shared/postTemplates.mjs';

const event = {
  id: 'ab12',
  title: 'Threads-kahvit',
  date: '2026-08-01',
  city: 'helsinki',
  org: ['@submitter'],
  url: 'https://www.threads.com/@submitter/post/abc',
};

describe('truncateToBytes', () => {
  it('leaves a short string untouched', () => {
    assert.strictEqual(truncateToBytes('hello', 100), 'hello');
  });

  it('truncates a long string and appends an ellipsis', () => {
    const long = 'x'.repeat(50);
    const result = truncateToBytes(long, 10);
    assert.strictEqual(Buffer.byteLength(result, 'utf8') <= 10, true);
    assert.strictEqual(result.endsWith('…'), true);
  });

  it('counts multi-byte characters (emoji) by UTF-8 byte length, not JS length', () => {
    // Each 🎉 is 4 UTF-8 bytes but a single JS "character" (surrogate pair, length 2).
    const text = '🎉'.repeat(5); // 20 bytes
    assert.strictEqual(truncateToBytes(text, 100), text); // fits, untouched
    const truncated = truncateToBytes(text, 9); // budget for ~2 emoji + ellipsis
    assert.strictEqual(Buffer.byteLength(truncated, 'utf8') <= 9, true);
    assert.strictEqual(truncated.endsWith('…'), true);
  });

  it('never splits a multi-byte character in half', () => {
    const text = 'a'.repeat(8) + '🎉'; // budget lands mid-emoji if done byte-wise
    const result = truncateToBytes(text, 9);
    // Valid UTF-8 round-trips through Buffer without replacement characters.
    assert.strictEqual(Buffer.from(result, 'utf8').toString('utf8'), result);
  });
});

describe('renderCancellation', () => {
  it('includes the title, date, city, organiser, and url', () => {
    const { text } = renderCancellation(event);
    assert.match(text, /Threads-kahvit/);
    assert.match(text, /2026-08-01/);
    assert.match(text, /Helsinki/);
    assert.match(text, /@submitter/);
    assert.match(text, /threads\.com\/@submitter\/post\/abc/);
  });

  it('falls back to the calendar link when the event has no url', () => {
    const { text } = renderCancellation({ ...event, url: '' });
    assert.match(text, /threadsmiitit\.netlify\.app/);
  });

  it('falls back to a generic organiser label when org is empty', () => {
    const { text } = renderCancellation({ ...event, org: [] });
    assert.match(text, /Järjestäjä ei tiedossa/);
  });

  it('stays within the main-post byte limit for a very long title', () => {
    const { text } = renderCancellation({ ...event, title: 'x'.repeat(1000) });
    assert.strictEqual(Buffer.byteLength(text, 'utf8') <= MAIN_POST_MAX_BYTES, true);
  });
});

describe('renderDailyRoot', () => {
  it('uses singular phrasing for exactly one new meetup', () => {
    assert.match(renderDailyRoot(1), /uusi miitti/);
  });

  it('uses plural phrasing and the count for more than one', () => {
    const text = renderDailyRoot(3);
    assert.match(text, /3/);
    assert.match(text, /uutta miittiä/);
  });
});

describe('renderDailyReply', () => {
  it('includes the event summary and its link', () => {
    const text = renderDailyReply(event);
    assert.match(text, /Threads-kahvit/);
    assert.match(text, /threads\.com\/@submitter\/post\/abc/);
  });

  it('stays within the main-post byte limit', () => {
    const text = renderDailyReply({ ...event, title: 'x'.repeat(1000) });
    assert.strictEqual(Buffer.byteLength(text, 'utf8') <= MAIN_POST_MAX_BYTES, true);
  });
});

describe('renderWeekly', () => {
  it('returns an empty-week message with no attachment when there are no events', () => {
    const { text, attachmentText } = renderWeekly([]);
    assert.match(text, /Ensi viikolle ei ole/);
    assert.strictEqual(attachmentText, '');
  });

  it('uses singular phrasing for exactly one event', () => {
    const { text } = renderWeekly([event]);
    assert.match(text, /Tulevan viikon miitti:/);
  });

  it('uses plural phrasing and the count for more than one event', () => {
    const events = [event, { ...event, id: 'cd34', title: 'Toinen miitti' }];
    const { text, attachmentText } = renderWeekly(events);
    assert.match(text, /2 kpl/);
    assert.match(attachmentText, /Threads-kahvit/);
    assert.match(attachmentText, /Toinen miitti/);
  });

  it('caps the attachment at the attachment byte limit for a very large week', () => {
    const manyEvents = Array.from({ length: 500 }, (_, i) => ({
      ...event,
      id: `id${i}`,
      title: `Miitti numero ${i}`,
    }));
    const { attachmentText } = renderWeekly(manyEvents);
    assert.strictEqual(Buffer.byteLength(attachmentText, 'utf8') <= ATTACHMENT_MAX_BYTES, true);
  });
});
