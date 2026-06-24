# Threadsmiitit

Finnish community meetup calendar — aggregates Threads-posted meetups across Finnish cities into one read-only calendar that links back to the original posts for sign-up. Volunteer-run, all UI copy in Finnish.

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

The key is read **server-side** only by Vite's dev middleware — it is never exposed in the browser bundle. For production, replace the `/api/chat` route with your own authenticated backend.

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
| Build | Vite 6 + `@vitejs/plugin-react` |
| Styles | SCSS via sass (global resets only; components use inline styles) |
| AI | Anthropic Messages API via Vite server middleware |
| Storage | localStorage via EventStore |
| Lint | ESLint + Prettier + Stylelint + commitlint |
| Tests | Node built-in `node:test` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
