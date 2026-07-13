/**
 * Unit tests for the Sentry API helpers in lib/sentry-api.mjs.
 *
 * Run: node --test .github/scripts/test/sentry-api.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sentryHeaders,
  listUnresolvedIssues,
  parseNextLink,
  resolveIssue,
  classifyIssue,
  formatNeedsFixList,
  validateNoisePatterns,
} from '../lib/sentry-api.mjs';

/**
 * Build a minimal fetch-Response substitute with ok, status, text(), json(), headers.
 *
 * @param {*}      body       Value returned by json(); stringified for text().
 * @param {object} [options]
 * @param {number} [options.status]
 * @param {string|null} [options.linkHeader]
 * @returns {object}
 */
function makeResponse(body, { status = 200, linkHeader = null } = {}) {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
    json: async () => body,
    headers: { get: (name) => (name.toLowerCase() === 'link' ? linkHeader : null) },
  };
}

const issueFixture = (overrides = {}) => ({
  id: '1',
  shortId: 'JS-1',
  title: 'TypeError: cannot read property of undefined',
  culprit: 'App',
  permalink: 'https://threadsmiitit.sentry.io/issues/1/',
  count: '3',
  firstSeen: '2026-07-01T00:00:00Z',
  lastSeen: '2026-07-13T00:00:00Z',
  ...overrides,
});

describe('sentryHeaders', () => {
  test('builds a bearer auth header', () => {
    assert.deepStrictEqual(sentryHeaders('tok-123'), {
      Authorization: 'Bearer tok-123',
      'Content-Type': 'application/json',
    });
  });
});

describe('parseNextLink', () => {
  test('returns null when there is no header', () => {
    assert.strictEqual(parseNextLink(null), null);
  });

  test('returns null when results="false"', () => {
    const header = '<https://sentry.io/api/0/x/?cursor=1>; rel="next"; results="false"';
    assert.strictEqual(parseNextLink(header), null);
  });

  test('returns the next URL when results="true"', () => {
    const header =
      '<https://sentry.io/api/0/x/?cursor=0:100:0>; rel="previous"; results="true", ' +
      '<https://sentry.io/api/0/x/?cursor=0:200:0>; rel="next"; results="true"';
    assert.strictEqual(parseNextLink(header), 'https://sentry.io/api/0/x/?cursor=0:200:0');
  });
});

describe('listUnresolvedIssues', () => {
  const params = { token: 'tok-123', org: 'acme', project: 'javascript-react-1' };

  test('requests the unresolved-issues query with the bearer token', async () => {
    let calls = 0;
    const fetchImpl = async (url, opts) => {
      calls++;
      assert.strictEqual(
        url,
        'https://sentry.io/api/0/projects/acme/javascript-react-1/issues/?query=is%3Aunresolved&limit=100'
      );
      assert.strictEqual(opts.headers.Authorization, 'Bearer tok-123');
      return makeResponse([issueFixture()]);
    };

    const issues = await listUnresolvedIssues({ ...params, fetchImpl });
    assert.strictEqual(calls, 1);
    assert.strictEqual(issues.length, 1);
  });

  test('uses a custom apiHost for data-residency orgs (e.g. EU)', async () => {
    let requestedUrl;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return makeResponse([issueFixture()]);
    };

    await listUnresolvedIssues({ ...params, apiHost: 'de.sentry.io', fetchImpl });

    assert.strictEqual(
      requestedUrl,
      'https://de.sentry.io/api/0/projects/acme/javascript-react-1/issues/?query=is%3Aunresolved&limit=100'
    );
  });

  test('follows the Link header across pages and stops when results="false"', async () => {
    const pages = [
      makeResponse([issueFixture({ id: '1' })], {
        linkHeader: '<https://sentry.io/api/0/x/?cursor=next>; rel="next"; results="true"',
      }),
      makeResponse([issueFixture({ id: '2' })], {
        linkHeader: '<https://sentry.io/api/0/x/?cursor=none>; rel="next"; results="false"',
      }),
    ];
    let call = 0;
    const fetchImpl = async () => pages[call++];

    const issues = await listUnresolvedIssues({ ...params, fetchImpl });
    assert.strictEqual(call, 2);
    assert.deepStrictEqual(
      issues.map((i) => i.id),
      ['1', '2']
    );
  });

  test('throws with the response body when the API returns a non-ok status', async () => {
    const fetchImpl = async () => makeResponse('rate limited', { status: 429 });
    await assert.rejects(listUnresolvedIssues({ ...params, fetchImpl }), (err) => {
      assert.ok(err.message.includes('429'));
      assert.ok(err.message.includes('rate limited'));
      return true;
    });
  });
});

describe('resolveIssue', () => {
  test('PUTs status=resolved to the issue endpoint', async () => {
    let capturedUrl;
    let capturedOpts;
    const fetchImpl = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return makeResponse({ id: '1', status: 'resolved' });
    };

    const result = await resolveIssue({ token: 'tok-123', issueId: '1', fetchImpl });

    assert.strictEqual(capturedUrl, 'https://sentry.io/api/0/issues/1/');
    assert.strictEqual(capturedOpts.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(capturedOpts.body), { status: 'resolved' });
    assert.strictEqual(result.status, 'resolved');
  });

  test('throws when the API rejects the request', async () => {
    const fetchImpl = async () => makeResponse('Forbidden', { status: 403 });
    await assert.rejects(resolveIssue({ token: 'tok-123', issueId: '1', fetchImpl }), /403/);
  });

  test('uses a custom apiHost for data-residency orgs (e.g. EU)', async () => {
    let requestedUrl;
    const fetchImpl = async (url) => {
      requestedUrl = url;
      return makeResponse({ id: '1', status: 'resolved' });
    };

    await resolveIssue({ token: 'tok-123', issueId: '1', apiHost: 'de.sentry.io', fetchImpl });

    assert.strictEqual(requestedUrl, 'https://de.sentry.io/api/0/issues/1/');
  });
});

describe('classifyIssue', () => {
  const patterns = ['^sentry-smoke-test\\b'];

  test('classifies a matching title as noise', () => {
    const issue = issueFixture({ title: 'sentry-smoke-test — temporary, will be reverted immediately' });
    assert.strictEqual(classifyIssue(issue, patterns), 'noise');
  });

  test('matching is case-insensitive', () => {
    const issue = issueFixture({ title: 'SENTRY-SMOKE-TEST — uppercase' });
    assert.strictEqual(classifyIssue(issue, patterns), 'noise');
  });

  test('classifies a real error as needs-fix', () => {
    const issue = issueFixture({ title: 'TypeError: cannot read property "id" of undefined' });
    assert.strictEqual(classifyIssue(issue, patterns), 'needs-fix');
  });

  test('does not match the pattern as a substring mid-message', () => {
    // The anchor (^) means "mentions sentry-smoke-test somewhere" must not match.
    const issue = issueFixture({ title: 'Unrelated error near sentry-smoke-test in logs' });
    assert.strictEqual(classifyIssue(issue, patterns), 'needs-fix');
  });

  test('treats an issue with no configured patterns as needs-fix', () => {
    const issue = issueFixture();
    assert.strictEqual(classifyIssue(issue, []), 'needs-fix');
  });
});

describe('validateNoisePatterns', () => {
  test('does not throw for well-formed patterns', () => {
    assert.doesNotThrow(() => validateNoisePatterns(['^sentry-smoke-test\\b', 'foo.*bar']));
  });

  test('does not throw for an empty list', () => {
    assert.doesNotThrow(() => validateNoisePatterns([]));
  });

  test('throws naming the offending pattern when one is not a valid regex', () => {
    assert.throws(() => validateNoisePatterns(['valid-one', '(unclosed-group']), (err) => {
      assert.ok(err.message.includes('(unclosed-group'));
      return true;
    });
  });
});

describe('formatNeedsFixList', () => {
  test('renders each issue as a markdown bullet with a permalink and details', () => {
    const issues = [issueFixture(), issueFixture({ id: '2', shortId: 'JS-2', title: 'Second issue' })];
    const markdown = formatNeedsFixList(issues);

    assert.ok(markdown.includes('[JS-1](https://threadsmiitit.sentry.io/issues/1/)'));
    assert.ok(markdown.includes('TypeError: cannot read property of undefined'));
    assert.ok(markdown.includes('culprit: `App`, events: 3'));
    assert.ok(markdown.includes('[JS-2]'));
  });

  test('returns an empty string for an empty list', () => {
    assert.strictEqual(formatNeedsFixList([]), '');
  });
});
