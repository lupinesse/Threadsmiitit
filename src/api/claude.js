/**
 * @fileoverview AI chat backend client.
 *
 * Calls the /api/chat endpoint that Vite's development server provides via
 * the `chatApiPlugin` in vite.config.js. That plugin reads the
 * ANTHROPIC_API_KEY environment variable server-side and proxies requests to
 * the Anthropic Messages API — the key is never exposed in the browser bundle.
 *
 * To enable the AI assistant:
 *   1. Set ANTHROPIC_API_KEY in your shell environment before `npm run dev`.
 *   2. The assistant uses claude-haiku-4-5-20251001 (fast, low-cost).
 *
 * For production deployment, replace the /api/chat endpoint with your own
 * backend that authenticates users before forwarding prompts.
 */

/**
 * Sends a prompt to the AI backend and returns the raw text response.
 *
 * @param {string} prompt - Full system + conversation prompt for the assistant.
 * @returns {Promise<string>} The assistant's raw text reply.
 * @throws {Error} When the server is unreachable or returns a non-OK status.
 */
export async function complete(prompt) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // Ignore JSON parse failure; use the default message.
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data.text ?? '';
}
