/**
 * End-to-end test — run with Node's built-in test runner: `npm test`.
 *
 * Renders the real App component tree in a simulated browser DOM
 * (happy-dom) via @testing-library/react and drives one complete user
 * flow start to finish: browse the Miitit list, open a meetup's detail
 * sheet, favourite it, and verify the change is reflected in both the UI
 * and localStorage. No mocking of app internals — only the DOM itself is
 * simulated, so this exercises App, ScreenMiitit, MeetupCard,
 * MeetupDetail, and EventStore together exactly as they run in production.
 *
 * Node's test runner has no JSX transform, so .jsx source files are loaded
 * through Vite's own programmatic SSR module loader (`ssrLoadModule`), using
 * only the React plugin rather than the project's full vite.config.js — the
 * full config's dev-server settings (port, HMR client) would make the
 * SSR-loaded app try to reach a real server that isn't running here.
 */

import { after, describe, it } from 'node:test';
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

const { render, screen, cleanup, fireEvent } = await import('@testing-library/react');
const React = await import('react');
const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
const { AuthProvider } = await vite.ssrLoadModule('/src/contexts/AuthContext.jsx');
const { default: EventStore } = await vite.ssrLoadModule('/src/store/EventStore.js');

const TEST_TITLE = 'E2E-testimiitti';
/** Far enough in the future to be "upcoming" but outside the "this week" rail. */
const TEST_DATE = '2099-06-15';

describe('End-to-end: browse, open, and favourite a meetup', () => {
  after(async () => {
    cleanup();
    await vite.close();
    await GlobalRegistrator.unregister();
  });

  it('renders a meetup, opens its detail sheet, and favourites it', async () => {
    localStorage.clear();
    const added = EventStore.add({
      title: TEST_TITLE,
      date: TEST_DATE,
      city: 'helsinki',
      cat: 'kulttuuri',
      org: ['@e2e-test'],
    });

    render(React.createElement(AuthProvider, null, React.createElement(App)));

    // The seeded meetup renders in the Miitit list.
    const cardTitle = await screen.findByText(TEST_TITLE);
    const card = cardTitle.closest('button');
    assert.ok(card, 'meetup card should be a clickable button');

    // Opening it shows the detail sheet with a matching heading.
    fireEvent.click(card);
    await screen.findByRole('heading', { name: TEST_TITLE });

    // Favouriting toggles the button's accessible pressed state.
    const favButton = screen.getByRole('button', { name: 'Lisää suosikiksi' });
    assert.equal(favButton.getAttribute('aria-pressed'), 'false');
    fireEvent.click(favButton);
    assert.equal(favButton.getAttribute('aria-pressed'), 'true');
    assert.equal(favButton.getAttribute('aria-label'), 'Poista suosikeista');

    // The favourite is persisted to localStorage under the event's id.
    const storedFavs = JSON.parse(localStorage.getItem('threadsmiitit_favs_v1'));
    assert.ok(storedFavs.includes(added.id));

    // Closing the sheet returns to the list, where the heart badge now shows.
    fireEvent.click(screen.getByRole('button', { name: 'Sulje' }));
    await screen.findByLabelText('Suosikki');
  });
});
