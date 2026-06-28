# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- In-app edit form: "Muokkaa lomakkeella" button in ProfileSheet opens the existing 4-step form pre-filled with the meetup's current data. Calls `EventStore.edit()` on submit; cancel closes the sheet without saving.
- Copy-URL button: a clipboard icon in the meetup detail sheet copies the Threads post URL. Shows a check icon for 2 seconds to confirm.
- Auth error banner: a dismissible strip appears at the top of the screen when Threads OAuth returns `#auth=error`. `AuthContext` exposes `authError` + `clearAuthError()`.
- Contextual search empty state: when a keyword search returns no results the screen shows "Ei tuloksia haulle '…'" and a "Tyhjennä haku" link. The meetup count label also changes to "X tulosta" during an active search.

## [0.4.0] — 2026-06-28

### Added
- `netlify.toml`: build config pointing to `dist/`, Netlify Functions at `netlify/functions/`, and a SPA fallback redirect so React Router routes resolve correctly.
- `netlify/functions/chat.js`: Netlify Functions v2 handler proxying `/api/chat` to the Anthropic API — keeps `ANTHROPIC_API_KEY` out of the browser bundle and makes the Miitti-apuri AI assistant work in production.
- Threads OAuth login: users can sign in with their Threads account. A "Kirjaudu" button appears in the header; after OAuth the session is stored in `localStorage`.
- `netlify/functions/auth-login.js`: redirects to the Threads OAuth authorization page with a CSRF state cookie.
- `netlify/functions/auth-callback.js`: exchanges the authorization code for a long-lived access token, fetches the user profile, and redirects back to the app. The token never reaches the browser.
- `src/contexts/AuthContext.jsx`: React context exposing `user`, `login()`, and `logout()`.
- `addedBy` attribution on user-submitted meetups: a small avatar + `@username` chip appears on meetup cards and in the detail sheet, linking to the poster's Threads profile.
- `netlify/functions/auth-delete.js`: Meta-required data-deletion callback endpoint. Returns a confirmation code; no server-side data is stored so nothing needs to be deleted.
- Profile sheet (`src/components/ProfileSheet.jsx`): tapping the avatar chip opens a sheet showing the logged-in user's favourited meetups (Suosikit) and their own submitted meetups (Miittini). Each user meetup has a *Muokkaa apurilla* shortcut and a *Poista* delete button. A *Kirjaudu ulos* button sits at the bottom.
- Favourites are now persisted to `localStorage` (`threadsmiitit_favs_v1`) and survive page reload.

### Changed
- `vite.config.js`: simplified `base` to always `'/'`; removed the `GITHUB_REPOSITORY`-derived `pagesBase` variable that was only needed for GitHub Pages sub-path deployments.
- Deployment platform migrated from GitHub Pages to Netlify.

### Removed
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow no longer needed.

## [0.3.0] — 2026-06-24

### Added
- GitHub Pages deployment workflow (`.github/workflows/deploy.yml`): builds on every push to `main` and deploys `dist/` via the official `actions/deploy-pages` action
- `vite.config.js` now derives `base` from `GITHUB_REPOSITORY` in CI so asset paths resolve correctly under the repo sub-path; falls back to `/` locally

### Notes
- The Miitti-apuri AI assistant requires a server-side API key and is unavailable on the static GitHub Pages build. The chat UI shows a clear error message in that case — all other features work fully offline.

## [0.2.0] — 2026-06-24

### Added
- Full Threadsmiitit app implementation: 4 screens (Miitit, Kalenteri, Lisää miitti, Info)
- React 18 + Vite build replacing the previous vanilla-JS concatenation pipeline
- Theme system (`src/theme.js`): 4 vibes × 5 palettes; production default `social + monodark`
- Seed data (`src/data.js`): 30+ Finnish community meetups, 13 cities, 9 categories, DH date helpers
- Finnish municipality list (`src/cities.js`) from Tilastokeskus / Statistics Finland 2026
- `EventStore` (`src/store/EventStore.js`): localStorage persistence for user-added meetups with normalisation, ID generation, and custom city registration
- Miitti-apuri AI assistant (`src/components/ChatAssistant.jsx`): Finnish-language chat backed by Anthropic API via server-side Vite middleware — API key never exposed to the browser
- `/api/chat` Vite server middleware in `vite.config.js` (reads `ANTHROPIC_API_KEY` from `process.env`)
- Shared UI primitives: `MeetupCard`, `DateLeaf`, `CatTag`, `Pill`, `Sheet`, `MeetupDetail`, colour helpers
- Icon set (all inline SVG, `currentColor` stroked)
- Unit tests covering DH helpers, EventStore normalisation, and add/find/remove round-trips

### Changed
- `index.html`: now a Vite React entry point (`<div id="root">`, `src/main.jsx`)
- `package.json`: added `react`, `react-dom`, `@vitejs/plugin-react`; updated `build` and `lint` scripts
- `eslint.config.js`: added JSX support for `src/**/*.{js,jsx}`
- `src/css/_base.scss`: full global reset, Poppins font import, `tmblink` keyframe animation
- `README.md`: updated for React + Vite + AI assistant setup

### Removed
- `src/js/00-config.js` and `src/js/00-config.local.example.js` (superseded by React module system)
- `build.js` (superseded by Vite)

## [0.1.0] — 2026-06-24

### Added
- Initial project scaffold: ESLint, Prettier, Stylelint, Husky, commitlint
- Vite build pipeline (JS concatenation + SCSS compilation)
- CI workflow (lint, build, test) and ChatGPT/Claude PR review dialogue
- GitHub issue templates and PR template
- `.claude/` hooks, settings, and token optimisation guide
- CLAUDE.md quality standard (Duck Book Higher tier)
