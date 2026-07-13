/**
 * Parse and validate the structured JSON response from the ChatGPT issue-review
 * prompt (chatgpt-issue-review.mjs).
 *
 * Extracted from the script so the parsing/validation rules can be unit
 * tested without a live OpenAI or GitHub call.
 */

/**
 * @typedef {{
 *   needsRewrite: false,
 * } | {
 *   needsRewrite: true,
 *   title: string,
 *   body: string,
 *   reason: string,
 * }} IssueReviewResult
 */

/**
 * Strip accidental markdown code-fence wrapping and parse the model's raw
 * text response, then validate it into a well-typed result.
 *
 * @param {string} rawText Raw text content from the OpenAI chat completion.
 * @returns {IssueReviewResult}
 * @throws {Error} If the text is not valid JSON, or `needs_rewrite: true` is
 *   missing a non-empty `title`/`body`.
 * @example
 * parseIssueReviewOutput('{"needs_rewrite": false}')
 * // → { needsRewrite: false }
 * parseIssueReviewOutput('{"needs_rewrite": true, "title": "t", "body": "b", "reason": "r"}')
 * // → { needsRewrite: true, title: 't', body: 'b', reason: 'r' }
 */
export function parseIssueReviewOutput(rawText) {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  if (parsed.needs_rewrite !== true) {
    return { needsRewrite: false };
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : null;
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : null;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';

  if (!title) throw new Error(`needs_rewrite is true but title is missing/empty: ${rawText}`);
  if (!body) throw new Error(`needs_rewrite is true but body is missing/empty: ${rawText}`);

  return { needsRewrite: true, title, body, reason };
}
