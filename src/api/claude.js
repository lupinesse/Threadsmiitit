/**
 * @fileoverview AI chat backend client.
 *
 * Calls the /api/chat endpoint. In development, Vite's `chatApiPlugin`
 * (vite.config.js) handles the route server-side. In production, the Netlify
 * Function at netlify/functions/chat.js takes over.
 *
 * Both paths read ANTHROPIC_API_KEY server-side — the key is never in the
 * browser bundle. The production endpoint enforces:
 *   - Origin check: only requests from ALLOWED_ORIGIN are accepted.
 *   - Body validation: prompt must be a non-empty string ≤ 4 000 characters.
 *   - Rate limiting: 30 requests per 60 s per IP (via Netlify edge rules).
 *
 * To enable the AI assistant in development:
 *   1. Set ANTHROPIC_API_KEY in your shell environment before `npm run dev`.
 *   2. The assistant uses claude-haiku-4-5-20251001 (fast, low-cost).
 *
 * Adding per-user authentication (session cookie verification) is a larger
 * future change — see chat.js for details.
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
