/**
 * Netlify Function: /api/auth/delete
 *
 * Meta's required data-deletion callback. Called by Meta when a user
 * requests deletion of their data from this app.
 *
 * Event submissions persist a submitter's Threads id/username/avatar/profile
 * URL server-side (`addedBy` in `lib/eventsStore.mjs`, via Netlify Blobs).
 * On a verified request this anonymises every event the requesting user
 * submitted, replacing `addedBy` with a `{deleted: true}` marker — the event
 * content itself is kept for archival purposes. No other user-specific data
 * is cached server-side: sessions (`lib/session.mjs`) are stateless signed
 * cookies, and the only access token Blobs holds is the broadcast bot's own
 * (`lib/botState.mjs`), not per-user.
 *
 * Meta sends a signed_request POST parameter (form-urlencoded), HMAC-signed
 * with the app secret; we verify it, extract `user_id`, and return the
 * confirmation URL and a confirmation code as specified in the Threads API
 * docs.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
import { verifySignedRequest } from './lib/metaSignedRequest.mjs';
import { anonymizeEventsByUserId } from './lib/eventsStore.mjs';
import { initSentry, withSentry } from './lib/sentry.mjs';

initSentry();

/**
 * Builds the /api/auth/delete handler, with the Blobs store injectable for tests.
 * @param {import('./lib/eventsStore.mjs').BlobStoreLike} [store]
 * @returns {(req: Request) => Promise<Response>}
 */
export function createHandler(store) {
  return async function handler(req) {
    if (req.method !== 'POST') {
      return new Response(null, { status: 405 });
    }

    const origin = process.env.URL || 'https://threadsmiitit.netlify.app';

    let signedRequest;
    try {
      const params = new URLSearchParams(await req.text());
      signedRequest = params.get('signed_request');
    } catch (err) {
      console.error('[auth-delete] failed to read request body', err);
      return new Response('Bad Request', { status: 400 });
    }

    const payload = verifySignedRequest(signedRequest, process.env.THREADS_CLIENT_SECRET);
    if (!payload?.user_id) {
      console.error('[auth-delete] missing or invalid signed_request');
      return new Response('Bad Request', { status: 400 });
    }

    const { anonymised } = await anonymizeEventsByUserId(payload.user_id, store);
    console.log(`[auth-delete] anonymised ${anonymised} event(s) for user_id=${payload.user_id}`);

    // Meta expects a JSON response with a url (status page) and confirmation_code.
    const confirmationCode = `del_${Date.now()}`;
    const statusUrl = `${origin}/api/auth/delete/status?code=${confirmationCode}`;

    return new Response(JSON.stringify({ url: statusUrl, confirmation_code: confirmationCode }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

export default withSentry(createHandler());

export const config = { path: '/api/auth/delete' };
