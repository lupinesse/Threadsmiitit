/**
 * Netlify Function: /api/auth/uninstall
 *
 * Meta's required uninstall callback. Called by Meta when a user
 * deauthorizes this app from their Threads account.
 *
 * This app stores no user data server-side — profile data lives only in the
 * user's own browser localStorage and is cleared on logout. This endpoint
 * acknowledges the webhook as required by Meta's platform policy.
 *
 * @param {Request} req
 * @returns {Response}
 */
export default function handler(req) {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  return new Response(null, { status: 200 });
}

export const config = { path: '/api/auth/uninstall' };
