#!/usr/bin/env node
/**
 * ChatGPT-driven issue clarity review.
 *
 * Sends an issue's title + body to OpenAI and asks whether it is too terse
 * or inconclusive. If so, ChatGPT rewrites the title/body to be more verbose
 * and conclusive (problem, context, expected outcome) while preserving the
 * reporter's original intent, edits the issue in place, and leaves an audit
 * comment showing the original text and the reasoning for the rewrite.
 *
 * Loop prevention lives in the workflow (skips runs where the triggering
 * actor is a bot), not here — this script always edits when the model says
 * to.
 *
 * All HTTP via native `fetch` (Node ≥ 22); no external deps.
 *
 * Required env vars:
 *   OPENAI_API_KEY     OpenAI bearer token
 *   GITHUB_TOKEN       GitHub auth (App installation token or default)
 *   GITHUB_REPOSITORY  "owner/repo" — auto-set by Actions
 *   ISSUE_NUMBER       Issue number to review
 *
 * Optional env vars (all have sensible defaults):
 *   MODEL              default 'gpt-4o-2024-08-06'
 *   MAX_TOKENS         default '2048'
 */

import { ghHeaders, upsertIssueComment } from './lib/github-threads.mjs';
import { parseIssueReviewOutput } from './lib/parse-issue-review.mjs';

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

const OPENAI_API_KEY = must('OPENAI_API_KEY');
const GITHUB_TOKEN = must('GITHUB_TOKEN');
const [OWNER, REPO] = must('GITHUB_REPOSITORY').split('/');
const ISSUE_NUMBER = parseInt(must('ISSUE_NUMBER'), 10);

const MODEL = process.env.MODEL || 'gpt-4o-2024-08-06';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '2048', 10);

const ATTRIBUTION_MARKER = '<!-- chatgpt-issue-review -->';

const SYSTEM_PROMPT = `You are triaging GitHub issues for a personal time-tracking web app (vanilla JavaScript ES modules, SCSS, HTML). Your job is to judge whether an issue's title and body give a maintainer enough to act on without follow-up questions.

An issue needs a rewrite if it is vague, missing context, or does not reach a conclusion (e.g. no expected behaviour, no reproduction steps, no clear ask). An issue does NOT need a rewrite if it is already clear and actionable, even if short.

When a rewrite is needed:
- Preserve the reporter's original intent and facts exactly — never invent details, root causes, or fixes that aren't implied by the original text.
- Expand the body with whatever structure fits the issue (e.g. Problem / Context / Expected outcome, or Steps to reproduce / Expected / Actual for bugs).
- Keep the title short and specific; make it more concrete only if the original is vague, not merely longer.
- Write in the reporter's voice/register — factual, not promotional.

Output a single raw JSON object, no markdown wrapper, no text outside the JSON:
{"needs_rewrite": <boolean>, "title": "<rewritten title, only if needs_rewrite>", "body": "<rewritten body markdown, only if needs_rewrite>", "reason": "<one sentence on why a rewrite was/wasn't needed>"}`;

/**
 * Fetch the current title/body of the issue.
 * @returns {Promise<{title: string, body: string, isPullRequest: boolean}>}
 */
async function fetchIssue() {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}`,
    { headers: ghHeaders(GITHUB_TOKEN) }
  );
  if (!response.ok) throw new Error(`Get issue API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return {
    title: data.title || '',
    body: data.body || '',
    isPullRequest: Boolean(data.pull_request),
  };
}

/**
 * Ask OpenAI to judge and, if needed, rewrite the issue.
 * @param {string} title
 * @param {string} body
 * @returns {Promise<string>} Raw text content of the model's reply.
 */
async function reviewWithOpenAI(title, body) {
  const userContent = `Issue title:\n${title}\n\nIssue body:\n${body || '(empty)'}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) die(`OpenAI API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (data.error) die(`OpenAI API error (${data.error.code}): ${data.error.message}`);
  const usage = data.usage ?? {};
  console.log(
    `  tokens: ${usage.prompt_tokens ?? '?'} in / ${usage.completion_tokens ?? '?'} out` +
      (usage.total_tokens != null ? ` / ${usage.total_tokens} total` : '')
  );
  return (data.choices?.[0]?.message?.content || '').trim();
}

/**
 * PATCH the issue's title and body.
 * @param {string} title
 * @param {string} body
 * @returns {Promise<object>}
 * @throws {Error} If the GitHub API request fails.
 */
async function updateIssue(title, body) {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/${ISSUE_NUMBER}`,
    { method: 'PATCH', headers: ghHeaders(GITHUB_TOKEN), body: JSON.stringify({ title, body }) }
  );
  if (!response.ok) throw new Error(`Patch issue API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function main() {
  console.log(`ChatGPT issue review for ${OWNER}/${REPO}#${ISSUE_NUMBER}`);
  console.log(`  model: ${MODEL}`);

  const issue = await fetchIssue();
  if (issue.isPullRequest) {
    console.log('Issue number refers to a pull request — skipping.');
    return;
  }

  const rawText = await reviewWithOpenAI(issue.title, issue.body);
  if (!rawText) {
    console.warn('OpenAI returned an empty response — skipping.');
    return;
  }

  let result;
  try {
    result = parseIssueReviewOutput(rawText);
  } catch (parseErr) {
    console.warn(`Could not parse review output (${parseErr.message}) — skipping edit.`);
    return;
  }

  if (!result.needsRewrite) {
    console.log(`No rewrite needed${result.reason ? `: ${result.reason}` : '.'}`);
    return;
  }

  console.log(`Rewriting issue title/body${result.reason ? ` — ${result.reason}` : ''}`);
  await updateIssue(result.title, result.body);

  const auditBody = [
    ATTRIBUTION_MARKER,
    `Expanded this issue for clarity${result.reason ? ` — ${result.reason}` : ''}.`,
    '',
    '<details><summary>Original title/body</summary>',
    '',
    `**Title:** ${issue.title}`,
    '',
    issue.body || '_(empty)_',
    '',
    '</details>',
    '',
    `*Automated by ChatGPT \`${MODEL}\`*`,
  ].join('\n');

  const { comment, updated } = await upsertIssueComment({
    token: GITHUB_TOKEN,
    owner: OWNER,
    repo: REPO,
    prNumber: ISSUE_NUMBER,
    marker: ATTRIBUTION_MARKER,
    body: auditBody,
  });
  console.log(`${updated ? 'Updated' : 'Posted'} audit comment: ${comment.html_url}`);
}

main().catch((error) => die(`Unhandled error: ${error.stack || error.message}`));
