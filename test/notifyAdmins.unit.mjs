/**
 * Unit tests for netlify/functions/lib/notifyAdmins.mjs — run with Node's
 * built-in test runner as part of `npm test`. `fetch` is mocked throughout;
 * nothing here makes a real call to the Resend API.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  notifyAdminsOfPendingEvent,
  notifyAdminsOfModeratorChange,
} from '../netlify/functions/lib/notifyAdmins.mjs';

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM', 'ADMIN_NOTIFY_EMAILS'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const event = {
  id: 'ab12',
  title: 'Threads-kahvit',
  city: 'helsinki',
  date: '2026-08-01',
  addedBy: { username: 'submitter' },
};

/**
 * Builds a fake fetch that always succeeds and records the calls it received.
 * @returns {{fetchImpl: typeof fetch, calls: Array<{url: string, opts: object}>}}
 */
function fakeFetch() {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    return { ok: true, status: 200, json: async () => ({ id: 'email-1' }) };
  };
  return { fetchImpl, calls };
}

describe('notifyAdminsOfPendingEvent', () => {
  it('does not call fetch when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfPendingEvent(event, { fetchImpl });
    assert.strictEqual(calls.length, 0);
  });

  it('does not call fetch when ADMIN_NOTIFY_EMAILS is unset', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    delete process.env.ADMIN_NOTIFY_EMAILS;
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfPendingEvent(event, { fetchImpl });
    assert.strictEqual(calls.length, 0);
  });

  it('sends to every trimmed, non-empty address in ADMIN_NOTIFY_EMAILS', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = ' admin1@example.com ,admin2@example.com,,';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfPendingEvent(event, { fetchImpl });
    assert.strictEqual(calls.length, 1);
    const body = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual(body.to, ['admin1@example.com', 'admin2@example.com']);
    assert.match(body.subject, /Threads-kahvit/);
    assert.match(body.text, /submitter/);
  });

  it('collapses newlines embedded in the submitted title before using it as the subject', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfPendingEvent(
      { ...event, title: 'Kahvit\nBcc: attacker@example.com' },
      { fetchImpl }
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.strictEqual(
      body.subject,
      'Uusi miitti odottaa hyväksyntää: Kahvit Bcc: attacker@example.com'
    );
  });

  it('logs and swallows a send failure instead of throwing', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const fetchImpl = async () => {
      throw new Error('network down');
    };

    await assert.doesNotReject(() => notifyAdminsOfPendingEvent(event, { fetchImpl }));
  });
});

describe('notifyAdminsOfModeratorChange', () => {
  it('does not call fetch when unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfModeratorChange(
      { action: 'added', username: 'bob', actorUsername: 'lupinesse' },
      { fetchImpl }
    );
    assert.strictEqual(calls.length, 0);
  });

  it('sends an "added" notification naming the moderator and the actor', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfModeratorChange(
      { action: 'added', username: 'bob', actorUsername: 'lupinesse' },
      { fetchImpl }
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.match(body.subject, /lisätty/);
    assert.match(body.subject, /@bob/);
    assert.match(body.text, /@lupinesse/);
    assert.match(body.text, /lisäsi/);
  });

  it('sends a "removed" notification', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const { fetchImpl, calls } = fakeFetch();

    await notifyAdminsOfModeratorChange(
      { action: 'removed', username: 'bob', actorUsername: 'lupinesse' },
      { fetchImpl }
    );
    const body = JSON.parse(calls[0].opts.body);
    assert.match(body.subject, /poistettu/);
    assert.match(body.text, /poisti/);
  });

  it('logs and swallows a send failure instead of throwing', async () => {
    process.env.RESEND_API_KEY = 'key-123';
    process.env.EMAIL_FROM = 'bot@threadsmiitit.netlify.app';
    process.env.ADMIN_NOTIFY_EMAILS = 'admin@example.com';
    const fetchImpl = async () => {
      throw new Error('network down');
    };

    await assert.doesNotReject(() =>
      notifyAdminsOfModeratorChange(
        { action: 'added', username: 'bob', actorUsername: 'lupinesse' },
        { fetchImpl }
      )
    );
  });
});
