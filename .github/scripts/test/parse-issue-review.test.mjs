/**
 * Unit tests for parseIssueReviewOutput() in lib/parse-issue-review.mjs.
 *
 * Run: node --test .github/scripts/test/parse-issue-review.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueReviewOutput } from '../lib/parse-issue-review.mjs';

describe('parseIssueReviewOutput — no rewrite needed', () => {
  test('returns needsRewrite: false', () => {
    const result = parseIssueReviewOutput('{"needs_rewrite": false, "reason": "already clear"}');
    assert.deepStrictEqual(result, { needsRewrite: false });
  });

  test('ignores title/body fields when needs_rewrite is false', () => {
    const result = parseIssueReviewOutput(
      '{"needs_rewrite": false, "title": "ignored", "body": "ignored"}'
    );
    assert.deepStrictEqual(result, { needsRewrite: false });
  });

  test('treats a missing needs_rewrite field as false (regression: absent field is not truthy true)', () => {
    const result = parseIssueReviewOutput('{"reason": "no field at all"}');
    assert.deepStrictEqual(result, { needsRewrite: false });
  });

  test('treats a truthy-but-non-boolean needs_rewrite as false (regression: "true" string != true)', () => {
    const result = parseIssueReviewOutput('{"needs_rewrite": "true"}');
    assert.deepStrictEqual(result, { needsRewrite: false });
  });
});

describe('parseIssueReviewOutput — rewrite needed', () => {
  test('returns the trimmed title, body, and reason', () => {
    const raw = JSON.stringify({
      needs_rewrite: true,
      title: '  Clearer title  ',
      body: '  ## Problem\nMore detail.  ',
      reason: 'original was one line with no repro steps',
    });
    const result = parseIssueReviewOutput(raw);
    assert.deepStrictEqual(result, {
      needsRewrite: true,
      title: 'Clearer title',
      body: '## Problem\nMore detail.',
      reason: 'original was one line with no repro steps',
    });
  });

  test('defaults reason to an empty string when absent', () => {
    const raw = JSON.stringify({ needs_rewrite: true, title: 't', body: 'b' });
    const result = parseIssueReviewOutput(raw);
    assert.strictEqual(result.reason, '');
  });

  test('strips a markdown code-fence wrapper before parsing', () => {
    const raw = '```json\n{"needs_rewrite": true, "title": "t", "body": "b"}\n```';
    const result = parseIssueReviewOutput(raw);
    assert.strictEqual(result.needsRewrite, true);
    assert.strictEqual(result.title, 't');
  });

  test('throws when title is missing', () => {
    const raw = JSON.stringify({ needs_rewrite: true, body: 'b' });
    assert.throws(() => parseIssueReviewOutput(raw), /title is missing\/empty/);
  });

  test('throws when title is whitespace-only', () => {
    const raw = JSON.stringify({ needs_rewrite: true, title: '   ', body: 'b' });
    assert.throws(() => parseIssueReviewOutput(raw), /title is missing\/empty/);
  });

  test('throws when body is missing', () => {
    const raw = JSON.stringify({ needs_rewrite: true, title: 't' });
    assert.throws(() => parseIssueReviewOutput(raw), /body is missing\/empty/);
  });

  test('throws when title is a non-string truthy value (regression: number bypasses typeof-less check)', () => {
    const raw = JSON.stringify({ needs_rewrite: true, title: 123, body: 'b' });
    assert.throws(() => parseIssueReviewOutput(raw), /title is missing\/empty/);
  });
});

describe('parseIssueReviewOutput — malformed JSON', () => {
  test('throws on unparseable text', () => {
    assert.throws(() => parseIssueReviewOutput('not json at all'));
  });

  test('throws on empty string', () => {
    assert.throws(() => parseIssueReviewOutput(''));
  });
});
