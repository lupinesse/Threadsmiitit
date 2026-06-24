# Contributing

## Development setup

1. Clone the repo and install dependencies:
   ```bash
   npm ci
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

## Branching strategy

- `main` — always releasable; no direct pushes
- `feat/description` — new features
- `fix/issue-N-description` — bug fixes
- `docs/description` — documentation only
- `chore/description` — maintenance (deps, config)

## Commit messages — Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
Enforced via commitlint (`commit-msg` hook).

```
feat: add thread search filter
fix: correct date parsing on leap years
docs: update README install steps
chore: bump eslint to v10.5
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`.

## Before opening a PR

```bash
npm run build   # must succeed
npm run lint    # 0 errors
npm test        # all pass
```

Update `CHANGELOG.md` under `[Unreleased]` for any user-facing change.
