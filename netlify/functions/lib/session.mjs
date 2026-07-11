/**
 * @fileoverview Server-verifiable session tokens for Threadsmiitit.
 *
 * Replaces the old client-only, unsigned identity (base64 payload in the URL
 * hash → localStorage) with a compact HMAC-signed token stored in an
 * httpOnly cookie. Netlify Functions can verify the token without any
 * external dependency — `node:crypto` only.
 *
 * Token format: `${payloadB64}.${sigB64}`, where payloadB64 is the
 * base64url-encoded JSON payload `{ id, username, avatarUrl, profileUrl,
 * iat, exp }` and sigB64 is the base64url HMAC-SHA256 of payloadB64 keyed by
 * SESSION_SECRET.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMINS } from './admins.mjs';

const COOKIE_NAME = 'tm_session';
const DEFAULT_TTL_SECONDS = 5184000; // 60 days

/**
 * @typedef {object} SessionUser
 * @property {string} id
 * @property {string} username        - Threads username, no leading @.
 * @property {string|null} avatarUrl
 * @property {string} profileUrl
 */

/**
 * @typedef {{ ok: true, user: SessionUser } | { ok: false, response: Response }} Guard
 */

const b64u = (data) => Buffer.from(data).toString('base64url');

/**
 * HMAC-SHA256 of `data` keyed by `secret`, base64url-encoded.
 * @param {string} data
 * @param {string} secret
 * @returns {string}
 */
function sign(data, secret) {
  return b64u(createHmac('sha256', secret).update(data).digest());
}

/**
 * Mints a signed session token.
 * @param {SessionUser} user
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds=5184000] - Token lifetime in seconds (60 days).
 * @param {string} [opts.secret=process.env.SESSION_SECRET]
 * @param {number} [opts.nowMs=Date.now()] - Injectable clock for tests.
 * @returns {string} The signed token.
 */
export function signSession(user, opts = {}) {
  const {
    ttlSeconds = DEFAULT_TTL_SECONDS,
    secret = process.env.SESSION_SECRET,
    nowMs = Date.now(),
  } = opts;
  const iat = Math.floor(nowMs / 1000);
  const payload = {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl ?? null,
    profileUrl: user.profileUrl,
    iat,
    exp: iat + ttlSeconds,
  };
  const payloadB64 = b64u(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verifies and decodes a session token. Never throws — any failure (bad
 * format, bad signature, wrong secret, expired) returns null.
 * @param {string|null|undefined} token
 * @param {object} [opts]
 * @param {string} [opts.secret=process.env.SESSION_SECRET]
 * @param {number} [opts.nowMs=Date.now()]
 * @returns {SessionUser|null}
 */
export function verifySession(token, opts = {}) {
  const { secret = process.env.SESSION_SECRET, nowMs = Date.now() } = opts;
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  let expected;
  let got;
  try {
    expected = Buffer.from(sign(payloadB64, secret), 'base64url');
    got = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  // timingSafeEqual throws on length mismatch, so guard it explicitly.
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Math.floor(nowMs / 1000) >= payload.exp) return null;

  return {
    id: payload.id,
    username: payload.username,
    avatarUrl: payload.avatarUrl ?? null,
    profileUrl: payload.profileUrl,
  };
}

/**
 * Extracts a named cookie's value from a raw Cookie header. Matches the
 * cookie name exactly (a cookie whose name merely ends with `name` is not a
 * match).
 * @param {string|null} cookieHeader
 * @param {string} [name='tm_session']
 * @returns {string|null}
 */
export function readSessionCookie(cookieHeader, name = COOKIE_NAME) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === name) return value || null;
  }
  return null;
}

/**
 * Builds a Set-Cookie value carrying the session token.
 * @param {string} token
 * @param {object} [opts]
 * @param {number} [opts.maxAge=5184000]
 * @param {boolean} [opts.secure=true] - Pass false for local http dev.
 * @returns {string}
 */
export function sessionCookie(token, opts = {}) {
  const { maxAge = DEFAULT_TTL_SECONDS, secure = true } = opts;
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * Set-Cookie value that clears the session cookie.
 * @returns {string}
 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/**
 * Resolves the authenticated user from a request, or null.
 * @param {Request} req
 * @returns {SessionUser|null}
 */
export function getUser(req) {
  const token = readSessionCookie(req.headers.get('cookie'));
  return verifySession(token);
}

/**
 * Case-insensitive, @-insensitive moderator check.
 * @param {string} username
 * @param {string[]} [admins=ADMINS] - Injectable for tests.
 * @returns {boolean}
 */
export function isAdmin(username, admins = ADMINS) {
  if (!username) return false;
  const normalized = username.replace(/^@/, '').toLowerCase();
  return admins.some((handle) => handle.replace(/^@/, '').toLowerCase() === normalized);
}

/**
 * Guard: requires any authenticated user. Responds 401 if absent.
 * @param {Request} req
 * @returns {Guard}
 */
export function requireUser(req) {
  const user = getUser(req);
  if (!user) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
  return { ok: true, user };
}

/**
 * Guard: requires a moderator. 401 if unauthenticated, 403 if authenticated
 * but not in ADMINS.
 * @param {Request} req
 * @returns {Guard}
 */
export function requireAdmin(req) {
  const result = requireUser(req);
  if (!result.ok) return result;
  if (!isAdmin(result.user.username)) {
    return { ok: false, response: new Response('Forbidden', { status: 403 }) };
  }
  return result;
}
