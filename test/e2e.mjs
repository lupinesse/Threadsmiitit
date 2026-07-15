/**
 * End-to-end test — run with Node's built-in test runner: `npm test`.
 *
 * Renders the real App component tree in a simulated browser DOM
 * (happy-dom) via @testing-library/react and drives complete user flows:
 * browse/favourite a meetup, an admin approving a submission, and the chat
 * assistant removing one. No mocking of app internals except `fetch` — event
 * data and auth state now live behind /api/events and /api/auth/whoami
 * (Netlify Functions backed by Netlify Blobs), which this test environment
 * can't run, so those endpoints are mocked with canned JSON. Everything else
 * (App, ScreenMiitit, MeetupCard, MeetupDetail, EventStore's request-building
 * logic) runs exactly as it does in production.
 *
 * Node's test runner has no JSX transform, so .jsx source files are loaded
 * through Vite's own programmatic SSR module loader (`ssrLoadModule`), using
 * only the React plugin rather than the project's full vite.config.js — the
 * full config's dev-server settings (port, HMR client) would make the
 * SSR-loaded app try to reach a real server that isn't running here.
 */

import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Vite's own server setup relies on Node's real timer API, so it must be
// created before GlobalRegistrator overrides globals (setTimeout etc.) with
// their browser-simulated equivalents for the app render below.
const vite = await createServer({
  configFile: false,
  plugins: [react({ jsxRuntime: 'automatic' })],
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent',
});

GlobalRegistrator.register();

const { render, screen, cleanup, fireEvent, waitFor, act } = await import('@testing-library/react');
const React = await import('react');
const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
const { AuthProvider } = await vite.ssrLoadModule('/src/contexts/AuthContext.jsx');
const { ScreenLisaa } = await vite.ssrLoadModule('/src/screens/ScreenLisaa.jsx');
const { makeTheme } = await vite.ssrLoadModule('/src/theme.js');
const { AppErrorBoundary } = await vite.ssrLoadModule('/src/components/AppErrorBoundary.jsx');

const TEST_TITLE = 'E2E-testimiitti';
const TEST_ID = 'e2t1';
/** Far enough in the future to be "upcoming" but outside the "this week" rail. */
const TEST_DATE = '2099-06-15';

const APPROVED_EVENT = {
  id: TEST_ID,
  title: TEST_TITLE,
  date: TEST_DATE,
  city: 'helsinki',
  cat: 'kulttuuri',
  org: ['@e2e-test'],
  status: 'approved',
  url: '',
  addedBy: { id: 'u2', username: 'e2e-test', avatarUrl: null, profileUrl: '' },
};

const ADMIN_USER = {
  id: 'admin-1',
  username: 'lupinesse',
  avatarUrl: null,
  profileUrl: 'https://www.threads.com/@lupinesse',
  isAdmin: true,
};

/**
 * Installs a fetch mock for this test only (auto-restored after the test
 * completes), routed by pathname + method to canned JSON responses.
 * @param {import('node:test').TestContext} t
 * @param {Record<string, {status?:number, body:object}>} routes - Keyed by "METHOD pathname".
 */
function mockFetch(t, routes) {
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const pathname = new URL(String(url), 'https://example.com').pathname;
    const method = (opts.method ?? 'GET').toUpperCase();
    const route = routes[`${method} ${pathname}`];
    if (!route) {
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked route' }) };
    }
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body };
  });
}

// A single top-level after() tears down the simulated DOM once all describe
// blocks in this file have run — GlobalRegistrator/vite must stay alive
// across every describe, since Node's test runner fires a describe-scoped
// after() as soon as that describe's own tests finish, not at file end.
after(async () => {
  cleanup();
  await vite.close();
  await GlobalRegistrator.unregister();
});

describe('End-to-end: browse, open, and favourite a meetup', () => {
  it('renders a meetup, opens its detail sheet, and favourites it', async (t) => {
    localStorage.clear();
    mockFetch(t, {
      'GET /api/auth/whoami': { status: 401, body: null },
      'GET /api/events': { body: { events: [APPROVED_EVENT] } },
    });

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));

    // The seeded meetup renders in the Miitit list.
    const cardTitle = await screen.findByText(TEST_TITLE);
    const card = cardTitle.closest('button');
    assert.ok(card, 'meetup card should be a clickable button');

    // Opening it shows the detail sheet with a matching heading.
    fireEvent.click(card);
    await screen.findByRole('heading', { name: TEST_TITLE });

    // Regression: a signed-out visitor sees the organiser (shown both in the
    // list card behind the sheet and in the sheet's own organiser row) but
    // not who submitted the listing — submitter identity is moderation-only.
    assert.ok(screen.queryAllByText('@e2e-test').length > 0, 'organiser handle should be visible');
    assert.equal(
      screen.queryByText('Lisätty sovelluksessa'),
      null,
      'submitter section should be hidden from non-admins'
    );

    // Favouriting toggles the button's accessible pressed state.
    const favButton = screen.getByRole('button', { name: 'Lisää suosikiksi' });
    assert.equal(favButton.getAttribute('aria-pressed'), 'false');
    fireEvent.click(favButton);
    assert.equal(favButton.getAttribute('aria-pressed'), 'true');
    assert.equal(favButton.getAttribute('aria-label'), 'Poista suosikeista');

    // The favourite is persisted to localStorage under the event's id.
    const storedFavs = JSON.parse(localStorage.getItem('threadsmiitit_favs_v1'));
    assert.ok(storedFavs.includes(TEST_ID));

    // Closing the sheet returns to the list, where the heart badge now shows.
    fireEvent.click(screen.getByRole('button', { name: 'Sulje' }));
    await screen.findByLabelText('Suosikki');

    await act(async () => unmount());
  });
});

describe('ScreenLisaa — login-gate hook order (regression)', () => {
  after(cleanup);

  it('preserves in-progress form state if `user` briefly drops out and comes back', async (t) => {
    // ScreenLisaa's gate checks the `user` PROP directly (not AuthContext's
    // own state), so AuthProvider's whoami call is irrelevant here — mocked
    // anyway so no unmocked fetch lingers past the test.
    mockFetch(t, { 'GET /api/auth/whoami': { status: 401, body: null } });

    // The add-mode ScreenLisaa instance can see `user` flip without
    // remounting — e.g. a session re-check briefly nulls `user` out and
    // then AuthContext re-hydrates it. If any `useState` call sits after
    // the login-gate's early return, going logged-in -> gate makes React
    // call zero *tracked* hooks that render (the gate's only hook,
    // useAuth's useContext, isn't part of React's hook-count bookkeeping),
    // which silently discards the fiber's hook state. Going back to the
    // form then re-mounts step/f/saved/customCity from their initial
    // values instead of resuming — a logged-in user's half-filled form
    // silently empties itself. This does not throw (so a naive
    // assert.doesNotThrow around the rerender would pass either way) —
    // the only way to catch it is to check the typed value survives.
    const th = makeTheme('social', 'monodark');
    const props = { t: th, onDone: () => {}, onOpenChat: () => {}, refresh: () => {} };
    const loggedIn = { id: 'u1', username: 'kirjautunut', avatarUrl: '', profileUrl: '' };

    const { rerender, unmount } = render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(ScreenLisaa, { ...props, user: loggedIn })
      )
    );
    const titleInput = await screen.findByLabelText('Miitin nimi');
    fireEvent.change(titleInput, { target: { value: 'Kirjoitettu otsikko' } });
    assert.equal(titleInput.value, 'Kirjoitettu otsikko');

    // `user` drops out and comes back on the same mounted instance.
    rerender(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(ScreenLisaa, { ...props, user: null })
      )
    );
    await screen.findByText('Kirjaudu sisään lisätäksesi miitin');
    rerender(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(ScreenLisaa, { ...props, user: loggedIn })
      )
    );

    const titleInputAgain = await screen.findByLabelText('Miitin nimi');
    assert.equal(titleInputAgain.value, 'Kirjoitettu otsikko');

    await act(async () => unmount());
  });
});

describe('AppErrorBoundary', () => {
  after(cleanup);

  it('renders its children normally when nothing throws', () => {
    const { unmount } = render(
      React.createElement(AppErrorBoundary, null, React.createElement('p', null, 'ok'))
    );
    assert.ok(screen.getByText('ok'));
    unmount();
  });

  it('renders the Finnish fallback instead of crashing when a child throws', () => {
    function Boom() {
      throw new Error('boom');
    }
    const consoleError = mock.method(console, 'error', () => {});

    const { unmount } = render(
      React.createElement(AppErrorBoundary, null, React.createElement(Boom))
    );

    assert.ok(screen.getByText('Jokin meni pieleen. Yritä päivittää sivu.'));
    unmount();
    consoleError.mock.restore();
  });
});

describe('ScreenLisaa — step 3 preview card', () => {
  after(cleanup);

  it('opens the full detail sheet with no favourite toggle when the preview card is tapped', async (t) => {
    // ScreenLisaa's gate checks the `user` prop directly, so the whoami
    // mock only needs to exist to satisfy AuthProvider's own fetch — its
    // result is irrelevant to this test.
    mockFetch(t, { 'GET /api/auth/whoami': { status: 401, body: null } });

    const th = makeTheme('social', 'monodark');
    const loggedIn = { id: 'u1', username: 'kirjautunut', avatarUrl: '', profileUrl: '' };
    const { unmount } = render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(ScreenLisaa, {
          t: th,
          user: loggedIn,
          onDone: () => {},
          onOpenChat: () => {},
          refresh: () => {},
        })
      )
    );

    // Step 0 — title + date.
    fireEvent.change(await screen.findByLabelText('Miitin nimi'), {
      target: { value: 'Esikatselumiitti' },
    });
    fireEvent.change(screen.getByLabelText('Päivämäärä'), { target: { value: '2099-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Jatka' }));

    // Step 1 — city + category.
    fireEvent.click(await screen.findByRole('button', { name: 'Helsinki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Karaoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jatka' }));

    // Step 2 — organiser + Threads URL.
    fireEvent.change(await screen.findByLabelText('Threads-käyttäjänimesi'), {
      target: { value: '@jarjestaja' },
    });
    fireEvent.change(screen.getByLabelText('Linkki Threads-postaukseen'), {
      target: { value: 'https://www.threads.com/@jarjestaja/post/xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jatka' }));

    // Step 3 — the preview card is a real button; tapping it opens the same
    // MeetupDetail sheet used everywhere else in the app.
    await screen.findByText('Näin se näyttää!');
    const previewCard = screen.getByText('Esikatselumiitti').closest('button');
    assert.ok(previewCard, 'preview card should be a clickable button');
    fireEvent.click(previewCard);

    await screen.findByRole('heading', { name: 'Esikatselumiitti' });
    assert.ok(screen.getAllByText('@jarjestaja').length > 0, 'organiser handle should be visible');

    // Regression: the draft has no stable id yet, so the favourite toggle
    // (which persists to localStorage keyed by id/title|date) must be hidden.
    assert.equal(
      screen.queryByRole('button', { name: 'Lisää suosikiksi' }),
      null,
      'favourite toggle should be hidden for an unsaved draft'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sulje' }));
    assert.equal(screen.queryByRole('heading', { name: 'Esikatselumiitti' }), null);

    await act(async () => unmount());
  });
});

describe('End-to-end: admin moderation queue', () => {
  after(cleanup);

  const PENDING_EVENT = {
    id: 'pend',
    title: 'Odottava miitti',
    date: TEST_DATE,
    city: 'helsinki',
    cat: 'yleinen',
    org: ['@submitter'],
    status: 'pending',
    submitted: 1000,
    url: 'https://www.threads.com/@submitter/post/1',
    addedBy: { id: 'u9', username: 'submitter', avatarUrl: null, profileUrl: '' },
  };

  it('lets a signed-in admin approve a pending submission', async (t) => {
    localStorage.clear();
    let approveCalled = false;
    // App.jsx refetches /api/events (not just /api/events/pending) after
    // refresh() bumps — wait for that second call too before the test ends,
    // otherwise its still-pending promise resolves during a later test and
    // trips Node's test runner's "activity after test ended" detector once
    // GlobalRegistrator has already torn down `window`.
    let eventsFetchCount = 0;
    // Routed manually (not via mockFetch) because /api/events/pending's
    // response must change after the moderate call, reflecting the approval
    // on refetch — mockFetch's static route table can't express that.
    t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
      const u = new URL(String(url), 'https://example.com');
      const method = (opts.method ?? 'GET').toUpperCase();
      if (method === 'GET' && u.pathname === '/api/auth/whoami') {
        return { ok: true, status: 200, json: async () => ADMIN_USER };
      }
      if (method === 'GET' && u.pathname === '/api/events') {
        eventsFetchCount++;
        return { ok: true, status: 200, json: async () => ({ events: [] }) };
      }
      if (method === 'GET' && u.pathname === '/api/events/pending') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ events: approveCalled ? [] : [PENDING_EVENT] }),
        };
      }
      if (method === 'POST' && u.pathname === '/api/events/moderate') {
        approveCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ event: { ...PENDING_EVENT, status: 'approved' } }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked route' }) };
    });

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));

    const adminButton = await screen.findByRole('button', { name: /Ylläpito/ });
    fireEvent.click(adminButton);

    await screen.findByText('Odottava miitti');

    // Regression: admins reviewing the moderation queue need to see who
    // submitted each entry, unlike the public card/detail views. '@submitter'
    // appears twice here — once as the organiser (m.org) and once as the
    // submitter (m.addedBy, only shown because AdminInbox passes showAddedBy).
    await waitFor(() => assert.equal(screen.queryAllByText('@submitter').length, 2));

    const approveButton = screen.getByRole('button', { name: /Julkaise/ });
    fireEvent.click(approveButton);

    await waitFor(() => assert.ok(approveCalled, 'moderate endpoint should have been called'));
    await screen.findByText('Kaikki tarkistettu 🎉');
    await waitFor(() => assert.ok(eventsFetchCount >= 2, 'events should refetch after approve'));

    await act(async () => unmount());
  });
});

describe('End-to-end: chat assistant remove confirmation', () => {
  after(cleanup);

  const SIGNED_IN_USER = {
    id: 'u1',
    username: 'testuser',
    avatarUrl: null,
    profileUrl: 'https://www.threads.com/@testuser',
    isAdmin: false,
  };

  /** Wires the same mocked routes every test in this block needs, tracking whether DELETE fired. */
  function mockRemoveFlow(t) {
    const state = { deleteCalled: false };
    t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
      const u = new URL(String(url), 'https://example.com');
      const method = (opts.method ?? 'GET').toUpperCase();
      if (method === 'GET' && u.pathname === '/api/auth/whoami') {
        return { ok: true, status: 200, json: async () => SIGNED_IN_USER };
      }
      if (method === 'GET' && u.pathname === '/api/events') {
        return { ok: true, status: 200, json: async () => ({ events: [] }) };
      }
      if (method === 'GET' && u.pathname === '/api/events/mine') {
        return { ok: true, status: 200, json: async () => ({ events: [] }) };
      }
      if (method === 'POST' && u.pathname === '/api/chat') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: JSON.stringify({
              reply: 'Selvä, poistetaanko miitti #ab12?',
              actions: [{ op: 'remove', id: 'ab12' }],
            }),
          }),
        };
      }
      if (method === 'DELETE' && u.pathname === '/api/events') {
        state.deleteCalled = true;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked route' }) };
    });
    return state;
  }

  // Regression (#92): a remove action from the assistant used to hit
  // EventStore.remove() the instant the model emitted it — no confirmation
  // step, unlike every other destructive action in the app. It must now
  // surface a pending-action chip and wait for an explicit tap before the
  // DELETE request is ever sent.
  it('does not delete until the pending-action chip is confirmed', async (t) => {
    localStorage.clear();
    const state = mockRemoveFlow(t);

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));

    const openChatButton = await screen.findByRole('button', { name: /Apuri/ });
    fireEvent.click(openChatButton);

    const input = await screen.findByPlaceholderText('Kirjoita viesti…');
    fireEvent.change(input, { target: { value: 'poista #ab12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lähetä viesti' }));

    const confirmButton = await screen.findByRole('button', { name: /Poista — miitti #ab12/ });
    assert.strictEqual(state.deleteCalled, false, 'DELETE must not fire before confirmation');

    fireEvent.click(confirmButton);

    await waitFor(() =>
      assert.ok(state.deleteCalled, 'DELETE /api/events should have been called')
    );
    await screen.findByText('Poistettu #ab12');

    await act(async () => unmount());
  });

  it('tapping cancel dismisses the chip without ever calling DELETE', async (t) => {
    localStorage.clear();
    const state = mockRemoveFlow(t);

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));

    const openChatButton = await screen.findByRole('button', { name: /Apuri/ });
    fireEvent.click(openChatButton);

    const input = await screen.findByPlaceholderText('Kirjoita viesti…');
    fireEvent.change(input, { target: { value: 'poista #ab12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lähetä viesti' }));

    const cancelButton = await screen.findByRole('button', { name: /Peruuta — miitti #ab12/ });
    fireEvent.click(cancelButton);

    await waitFor(() =>
      assert.strictEqual(
        screen.queryByRole('button', { name: /Peruuta — miitti #ab12/ }),
        null,
        'the pending-action chip should be gone after cancelling'
      )
    );
    assert.strictEqual(state.deleteCalled, false, 'DELETE must never fire when the user cancels');

    await act(async () => unmount());
  });
});

describe('Bottom nav — lazy-loaded screens (regression, #81)', () => {
  it('renders Kalenteri and Info after code-splitting them via React.lazy', async (t) => {
    mockFetch(t, {
      'GET /api/auth/whoami': { status: 401, body: null },
      'GET /api/events': { body: { events: [APPROVED_EVENT] } },
    });

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));
    await screen.findByText(TEST_TITLE);

    fireEvent.click(screen.getByRole('button', { name: 'Kalenteri' }));
    await screen.findByText('MA'); // weekday header, only rendered by ScreenKalenteri

    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    await screen.findByText('THREADSMIITIT');

    await act(async () => unmount());
  });

  it('renders Lisää after code-splitting it via React.lazy', async (t) => {
    // Distinct from the direct-render ScreenLisaa tests elsewhere in this
    // file: this drives the tab === 'lisaa' branch through App's own
    // React.lazy wrapper, in its own render so an earlier tab switch in the
    // same test can't leave a pending Suspense boundary interfering.
    mockFetch(t, {
      'GET /api/auth/whoami': { status: 401, body: null },
      'GET /api/events': { body: { events: [APPROVED_EVENT] } },
    });

    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));
    await screen.findByText(TEST_TITLE);

    fireEvent.click(screen.getByRole('button', { name: 'Lisää' }));
    // The closed "Muokkaa miittiä" edit sheet also renders its own (hidden)
    // ScreenLisaa instance, so this same login-gate text appears twice —
    // use findAllByText rather than findByText, which requires exactly one.
    await waitFor(() =>
      assert.ok(screen.queryAllByText('Kirjaudu sisään lisätäksesi miitin').length > 0)
    );

    await act(async () => unmount());
  });
});

describe('ScreenKalenteri — calendar grid keys (regression)', () => {
  after(cleanup);

  // Regression: day cells were keyed with `key={d}` (the bare day-of-month
  // number), while the grid's leading blank cells are keyed by index. On any
  // month whose first day lands on Tuesday or later, a blank at index 1
  // collides with day-cell key `1`, and React warns "Encountered two
  // children with the same key". Keying day cells by a composite instead of
  // the bare day number keeps every cell's key unique.
  it('renders the Kalenteri tab without a duplicate-key console warning', async (t) => {
    localStorage.clear();
    mockFetch(t, {
      'GET /api/auth/whoami': { status: 401, body: null },
      'GET /api/events': { body: { events: [APPROVED_EVENT] } },
    });

    const consoleError = mock.method(console, 'error', () => {});
    const { unmount } = render(React.createElement(AuthProvider, null, React.createElement(App)));

    const kalenteriTab = (await screen.findByText('Kalenteri')).closest('button');
    fireEvent.click(kalenteriTab);

    // The month grid renders synchronously with the tab switch.
    await screen.findByText('MA');

    const keyWarnings = consoleError.mock.calls.filter((call) =>
      String(call.arguments[0]).includes('same key')
    );
    assert.equal(keyWarnings.length, 0, 'no duplicate-key warning should be logged');

    consoleError.mock.restore();
    await act(async () => unmount());
  });
});
