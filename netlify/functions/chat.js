/**
 * Netlify Function: /api/chat
 *
 * Server-side proxy for the Anthropic API. Keeps ANTHROPIC_API_KEY out of the
 * browser bundle. Returns a JSON object with a `text` field on success, or an
 * `error` field on failure.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const { prompt } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not set — AI assistant unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await upstream.json();
    const text = data.content?.[0]?.text ?? '';
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { path: '/api/chat' };
