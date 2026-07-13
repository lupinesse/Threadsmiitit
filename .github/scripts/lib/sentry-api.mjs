/**
 * Shared helpers for talking to the Sentry API and classifying issues as
 * either known noise (safe to auto-resolve) or real bugs that need a human
 * or agent to write a fix.
 *
 * Consumed by sentry-triage.mjs. All HTTP via native `fetch` (Node ≥ 22).
 */

/**
 * @typedef {{
 *   id: string,
 *   shortId: string,
 *   title: string,
 *   culprit: string,
 *   permalink: string,
 *   count: string,
 *   firstSeen: string,
 *   lastSeen: string,
 * }} SentryIssue
 */

/**
 * Build the standard headers for the Sentry API.
 * @param {string} token
 * @returns {Record<string, string>}
 */
export function sentryHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Fetch every unresolved issue for a project, paginating via Sentry's `Link`
 * header until the API reports no further page.
 *
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.org
 * @param {string} params.project
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @returns {Promise<SentryIssue[]>}
 */
export async function listUnresolvedIssues({ token, org, project, fetchImpl = fetch }) {
  const MAX_PAGES = 20; // 2 000 issues per project is an unreachable ceiling in practice
  const issues = [];
  let url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is%3Aunresolved&limit=100`;
  let page = 0;

  while (url) {
    const response = await fetchImpl(url, { headers: sentryHeaders(token) });
    if (!response.ok) {
      throw new Error(`Sentry issues API ${response.status}: ${await response.text()}`);
    }
    issues.push(...(await response.json()));

    const nextLink = parseNextLink(response.headers.get('link'));
    url = nextLink;
    page++;
    if (page >= MAX_PAGES) {
      throw new Error(
        `listUnresolvedIssues: reached page limit (${MAX_PAGES}) for ${org}/${project} — ` +
          'possible API response loop; halting to avoid runaway pagination'
      );
    }
  }
  return issues;
}

/**
 * Parse Sentry's RFC 5988 `Link` response header and return the `next` URL,
 * or `null` when there is no further page (`results="false"`).
 *
 * @param {string|null} linkHeader
 * @returns {string|null}
 */
export function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next";\s*results="true"/);
  return match ? match[1] : null;
}

/**
 * Mark a Sentry issue as resolved.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.issueId
 * @param {typeof fetch} [params.fetchImpl] - Injectable for tests.
 * @returns {Promise<object>}
 */
export async function resolveIssue({ token, issueId, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://sentry.io/api/0/issues/${issueId}/`, {
    method: 'PUT',
    headers: sentryHeaders(token),
    body: JSON.stringify({ status: 'resolved' }),
  });
  if (!response.ok) {
    throw new Error(`Sentry resolve API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/**
 * Decide whether an issue is known noise (matches a configured pattern and
 * can be auto-resolved) or a real bug that needs a fix.
 *
 * Matching is against the issue's title, which for a smoke test or
 * deliberately-thrown marker error is the message itself.
 *
 * @param {SentryIssue} issue
 * @param {string[]} noisePatterns - Regex source strings, matched case-insensitively.
 * @returns {'noise'|'needs-fix'}
 */
export function classifyIssue(issue, noisePatterns) {
  const title = issue.title || '';
  // Patterns come from the repo-committed sentry-triage.config.json, not from
  // Sentry event data or any other untrusted input.
  const isNoise = noisePatterns.some((pattern) => {
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(pattern, 'i');
    return regex.test(title);
  });
  return isNoise ? 'noise' : 'needs-fix';
}

/**
 * Verify every noise pattern compiles as a regular expression, throwing an
 * informative error naming the first offender rather than letting a bad
 * pattern surface as a confusing failure later, mid-classification.
 *
 * @param {string[]} noisePatterns
 * @throws {Error} If any pattern is not a valid regex.
 * @returns {void}
 */
export function validateNoisePatterns(noisePatterns) {
  for (const pattern of noisePatterns) {
    try {
      // Patterns come from the repo-committed sentry-triage.config.json, not
      // from Sentry event data or any other untrusted input.
      // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(pattern, 'i');
    } catch (error) {
      throw new Error(`Invalid noise pattern "${pattern}": ${error.message}`, { cause: error });
    }
  }
}

/**
 * Render the issues that still need a fix as a GitHub-flavoured markdown
 * list, for the body of a tracking issue.
 *
 * @param {SentryIssue[]} issues
 * @returns {string}
 */
export function formatNeedsFixList(issues) {
  return issues
    .map(
      (issue) =>
        `- [${issue.shortId}](${issue.permalink}) — ${issue.title}\n` +
        `  culprit: \`${issue.culprit}\`, events: ${issue.count}, ` +
        `first seen: ${issue.firstSeen}, last seen: ${issue.lastSeen}`
    )
    .join('\n');
}
