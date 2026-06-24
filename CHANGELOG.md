# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
