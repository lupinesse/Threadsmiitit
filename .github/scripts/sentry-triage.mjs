#!/usr/bin/env node
/**
 * Sentry issue triage.
 *
 * Lists every unresolved issue in the configured Sentry project. Issues
 * whose title matches a configured noise pattern (e.g. a smoke test thrown
 * deliberately to verify the Sentry wiring works) are resolved immediately —
 * no code change is needed for those.
 *
 * Everything else is a real bug: this script does NOT attempt to write a
 * fix itself. Writing and verifying a patch one-shot from a stack trace,
 * unattended, risks merging a wrong fix with nobody watching. Instead it
 * opens (or updates) a single tracking GitHub issue listing what still needs
 * attention, so a maintainer — or an agent explicitly asked to pick it up —
 * follows the repo's normal branch/lint/test/PR-review workflow and a human
 * approves the merge. Sentry issues are only marked resolved by this script
 * when they're noise; real-bug issues stay open until whoever ships the fix
 * resolves them by hand once it's live.
 *
 * All HTTP via native `fetch` (Node ≥ 22); no external deps.
 *
 * Required env vars:
 *   SENTRY_AUTH_TOKEN   Sentry internal integration token (Issues: Read & Write)
 *   SENTRY_ORG          Sentry organization slug
 *   SENTRY_PROJECT      Sentry project slug
 *   GITHUB_TOKEN        GitHub auth (App installation token or default)
 *   GITHUB_REPOSITORY   "owner/repo" — auto-set by Actions
 *
 * Optional env vars:
 *   SENTRY_TRIAGE_CONFIG_PATH   Path to the noise-pattern config JSON,
 *                               default 'sentry-triage.config.json'.
 *   SENTRY_API_HOST             Sentry API host, default 'sentry.io'. Set
 *                               this for data-residency orgs (e.g.
 *                               'de.sentry.io' for EU) — see the org's
 *                               Settings > General > "Data Storage Region".
 */

import { readFile } from 'node:fs/promises';
import {
  listUnresolvedIssues,
  resolveIssue,
  classifyIssue,
  formatNeedsFixList,
  validateNoisePatterns,
} from './lib/sentry-api.mjs';
import { upsertTrackingIssue, findOpenIssueByMarker, closeIssueWithComment } from './lib/github-threads.mjs';

const TRACKING_ISSUE_MARKER = '<!-- sentry-triage-tracking-issue -->';

/** @param {string} msg */
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

/**
 * Read a required environment variable or exit with an informative error.
 * @param {string} key
 * @returns {string}
 */
const must = (key) => {
  const value = process.env[key];
  if (!value) die(`Missing required env var: ${key}`);
  return value;
};

const SENTRY_AUTH_TOKEN = must('SENTRY_AUTH_TOKEN');
const SENTRY_ORG = must('SENTRY_ORG');
const SENTRY_PROJECT = must('SENTRY_PROJECT');
const GITHUB_TOKEN = must('GITHUB_TOKEN');
const [OWNER, REPO] = must('GITHUB_REPOSITORY').split('/');
const CONFIG_PATH = process.env.SENTRY_TRIAGE_CONFIG_PATH || 'sentry-triage.config.json';
const SENTRY_API_HOST = process.env.SENTRY_API_HOST || 'sentry.io';

/**
 * Load the noise-pattern list from the JSON config file, validating that
 * it's readable, well-formed, and every pattern compiles as a regex —
 * so a missing file or a typo'd config surfaces one clear error here
 * instead of a confusing failure partway through classifying issues.
 *
 * @param {string} configPath
 * @returns {Promise<string[]>}
 * @throws {Error} If the file is missing, not valid JSON, missing the
 *   expected shape, or contains an invalid regex pattern.
 */
async function loadNoisePatterns(configPath) {
  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read noise-pattern config at "${configPath}": ${error.message}`, {
      cause: error,
    });
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`"${configPath}" is not valid JSON: ${error.message}`, { cause: error });
  }

  if (!Array.isArray(config.noisePatterns)) {
    throw new Error(`"${configPath}": expected a "noisePatterns" array`);
  }

  validateNoisePatterns(config.noisePatterns);
  return config.noisePatterns;
}

/**
 * Build the tracking issue body listing what still needs a fix.
 * @param {import('./lib/sentry-api.mjs').SentryIssue[]} needsFix
 * @returns {string}
 */
function buildTrackingIssueBody(needsFix) {
  return [
    TRACKING_ISSUE_MARKER,
    `Sentry has ${needsFix.length} unresolved issue${needsFix.length === 1 ? '' : 's'} that don't match a known-noise pattern and need an actual fix:`,
    '',
    formatNeedsFixList(needsFix),
    '',
    'Pick one up by branching per the repo\'s PR workflow, fixing it with a regression test, ' +
      'and opening a PR — then resolve the Sentry issue once the fix has shipped. This issue is ' +
      'kept in sync automatically; it stays open until every listed issue is resolved in Sentry.',
  ].join('\n');
}

async function main() {
  console.log(`Sentry triage for ${SENTRY_ORG}/${SENTRY_PROJECT} (API host: ${SENTRY_API_HOST})`);
  console.log(`  noise-pattern config: ${CONFIG_PATH}`);

  const noisePatterns = await loadNoisePatterns(CONFIG_PATH);
  console.log(`  ${noisePatterns.length} noise pattern(s) configured`);

  const issues = await listUnresolvedIssues({
    token: SENTRY_AUTH_TOKEN,
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    apiHost: SENTRY_API_HOST,
  });
  console.log(`  ${issues.length} unresolved issue(s) found`);

  const noise = [];
  const needsFix = [];
  for (const issue of issues) {
    const classification = classifyIssue(issue, noisePatterns);
    console.log(`  [${classification}] ${issue.shortId}: ${issue.title}`);
    if (classification === 'noise') noise.push(issue);
    else needsFix.push(issue);
  }

  for (const issue of noise) {
    await resolveIssue({ token: SENTRY_AUTH_TOKEN, issueId: issue.id, apiHost: SENTRY_API_HOST });
    console.log(`  resolved noise issue ${issue.shortId}`);
  }

  if (needsFix.length === 0) {
    const existing = await findOpenIssueByMarker({
      token: GITHUB_TOKEN,
      owner: OWNER,
      repo: REPO,
      marker: TRACKING_ISSUE_MARKER,
    });
    if (existing) {
      await closeIssueWithComment({
        token: GITHUB_TOKEN,
        owner: OWNER,
        repo: REPO,
        issueNumber: existing.number,
        comment: 'All previously tracked Sentry issues are now resolved — closing.',
      });
      console.log(`  closed tracking issue #${existing.number} (nothing left to fix)`);
    } else {
      console.log('  no issues need a fix — nothing to track');
    }
    return;
  }

  const { issue: trackingIssue, created } = await upsertTrackingIssue({
    token: GITHUB_TOKEN,
    owner: OWNER,
    repo: REPO,
    marker: TRACKING_ISSUE_MARKER,
    title: `Sentry: ${needsFix.length} issue${needsFix.length === 1 ? '' : 's'} need${needsFix.length === 1 ? 's' : ''} a fix`,
    body: buildTrackingIssueBody(needsFix),
    labels: ['sentry-triage'],
  });
  console.log(`  ${created ? 'created' : 'updated'} tracking issue #${trackingIssue.number}`);
}

main().catch((error) => die(`Unhandled error: ${error.stack || error.message}`));
