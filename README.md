# Threadsmiitit

Finnish community meetup calendar — aggregates Threads-posted meetups across Finnish cities into one read-only calendar that links back to the original posts for sign-up. Volunteer-run, all UI copy in Finnish.

**Live:** https://threadsmiitit.netlify.app/

## Screenshots

| Home (monodark) | Detail sheet | Chat assistant |
|---|---|---|
| ![Home screen](docs/screenshots/01-monodark-default.png) | ![Detail sheet](docs/screenshots/02-detail-sheet.png) | ![Chat assistant](docs/screenshots/05-chat-assistant.png) |

| Warm palette | Bold vibe |
|---|---|
| ![Warm palette](docs/screenshots/03-palette-warm.png) | ![Bold vibe](docs/screenshots/04-vibe-bold.png) |

## Features

- **Miitit** — filterable list with a "this week" highlight rail and group-by (date / city)
- **Kalenteri** — month grid with colour-coded category dots and selected-day detail
- **Lisää miitti** — 4-step guided form for adding your own meetup
- **Info** — sub-pages: how to organise, Karaoke challenge 2026, city directory, past meetups
- **Miitti-apuri** — AI chat assistant (Finnish) powered by Anthropic; add / edit / remove your meetups conversationally

## Development

### Prerequisites

- Node.js ≥ 22.12.0 (`.nvmrc` provided; `nvm use` to activate)

### Install

```bash
npm ci
```

### Run

```bash
npm run dev
```

Opens http://localhost:8001.

#### AI assistant

To enable the Miitti-apuri chat assistant, set your Anthropic API key in the shell before starting the dev server:

```bash
$env:ANTHROPIC_API_KEY = "sk-ant-..."    # PowerShell
export ANTHROPIC_API_KEY="sk-ant-..."    # bash/zsh
npm run dev
```

The key is read **server-side** only — never exposed in the browser bundle. In production, the Netlify Function at `netlify/functions/chat.js` handles the route and enforces:

- **Origin check** — only requests from the deployed site's origin are accepted (set `ALLOWED_ORIGIN` in Netlify environment variables; defaults to `https://threadsmiitit.netlify.app`).
- **Body validation** — prompt must be a non-empty string ≤ 4 000 characters.
- **Rate limiting** — 30 requests per 60 s per IP via Netlify edge rules (requires Netlify Pro or higher; configured in `netlify.toml`).

### Build

```bash
npm run build
```

Compiles React + SCSS via Vite into `dist/`.

### Lint & format

```bash
npm run lint
npm run format
```

### Test

```bash
npm test
```

Runs unit tests (Node's built-in test runner, no extra dependencies).

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 18 + inline style props (no CSS-in-JS lib) |
| Build | Vite 8 + `@vitejs/plugin-react` |
| Styles | SCSS via sass (global resets only; components use inline styles) |
| AI | Anthropic Messages API via Netlify Function (`/api/chat`) in production; Vite dev middleware locally |
| Deploy | Netlify (SPA redirect + Netlify Functions v2) |
| Storage | localStorage via EventStore |
| Lint | ESLint + Prettier + Stylelint + commitlint |
| Tests | Node built-in `node:test` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
