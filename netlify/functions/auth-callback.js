/**
 * Netlify Function: /api/auth/callback
 *
 * Handles the Threads OAuth redirect. Verifies the CSRF state cookie,
 * exchanges the authorization code for a long-lived access token, fetches
 * the user profile, then redirects back to the app with the profile data
 * encoded in the URL hash. The access token is never sent to the browser.
 *
 * Required env vars: THREADS_CLIENT_ID, THREADS_CLIENT_SECRET,
 *   THREADS_REDIRECT_URI, URL (set automatically by Netlify)
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const origin = process.env.URL || 'https://threadsmiitit.netlify.app';
  const clearState = 'threads_state=; Path=/; HttpOnly; Max-Age=0';

  if (error || !code) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${origin}/#auth=error`, 'Set-Cookie': clearState },
    });
  }

  // Verify CSRF state
  const cookieState = (req.headers.get('cookie') || '')
    .split(';')
    .find((c) => c.trim().startsWith('threads_state='))
    ?.split('=')?.[1]
    ?.trim();

  if (!cookieState || cookieState !== state) {
    return new Response('Invalid state parameter', { status: 400 });
  }

  // Exchange authorization code for a short-lived access token
  const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.THREADS_CLIENT_ID,
      client_secret: process.env.THREADS_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: process.env.THREADS_REDIRECT_URI,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${origin}/#auth=error`, 'Set-Cookie': clearState },
    });
  }

  const { access_token: shortToken } = await tokenRes.json();

  // Exchange for a long-lived token (valid 60 days)
  const longRes = await fetch(
    `https://graph.threads.net/access_token?${new URLSearchParams({
      grant_type: 'th_exchange_token',
      client_secret: process.env.THREADS_CLIENT_SECRET,
      access_token: shortToken,
    })}`
  );
  const { access_token: token } = longRes.ok ? await longRes.json() : { access_token: shortToken };

  // Fetch the user's public profile fields
  const profileRes = await fetch(
    `https://graph.threads.net/me?${new URLSearchParams({
      fields: 'id,username,threads_profile_picture_url',
      access_token: token,
    })}`
  );

  if (!profileRes.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${origin}/#auth=error`, 'Set-Cookie': clearState },
    });
  }

  const { id, username, threads_profile_picture_url: avatarUrl } = await profileRes.json();
  const user = {
    id,
    username,
    avatarUrl: avatarUrl || null,
    profileUrl: `https://www.threads.com/@${username}`,
  };

  const encoded = Buffer.from(JSON.stringify(user)).toString('base64');

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/#auth=${encoded}`,
      'Set-Cookie': clearState,
    },
  });
}

export const config = { path: '/api/auth/callback' };
