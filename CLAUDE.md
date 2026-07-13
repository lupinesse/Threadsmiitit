# Project quality standard

All code you write, edit, or generate in this project must comply with the
**Higher quality assurance** tier of the UK Government Analysis Function's
*Quality Assurance of Code for Analysis and Research* ("the Duck Book").

Reference (for humans, not auto-fetched):
https://best-practice-and-impact.github.io/qa-of-code-guidance/checklist_higher.html

Treat the rules below as the operative version of that checklist, adapted to
this project's stack: JavaScript, SCSS/CSS, and HTML. When a request conflicts
with these rules, follow these rules and flag the conflict.

---

## Concurrent sessions — always use an isolated git worktree

Multiple Claude Code sessions run against this repo at the same time, and
history shows they collide when they share the single main checkout: one
session's `git checkout`/`git stash` silently discards or hides another
session's uncommitted work, with no error and no recovery path (see issues
#67, #68, #70).

**Rule: never run `git checkout <branch>` or `git switch` directly in the
main working directory if any git operation you're about to run could affect
files another session might be mid-edit on.** Instead, at the start of any
task that involves creating a branch or switching branches, create an
isolated worktree and do all work there:

```bash
git fetch origin main --quiet
git worktree add .claude/worktrees/<branch-name> -b <type>/<branch-name> origin/main
cd .claude/worktrees/<branch-name>
# ... implement, build, lint, test, commit, push from here ...
```

When the task is done (PR merged, or work abandoned):

```bash
cd <repo-root>
git worktree remove .claude/worktrees/<branch-name> --force
git branch -D <type>/<branch-name>   # only if not already deleted by --delete-branch on merge
```

Exceptions — brief, read-only commands in the shared root are fine (`git
status`, `git log`, `git diff <ref>..<ref>`, `gh` calls that don't touch the
working tree, reading files). The hazard is specifically switching HEAD or
mutating the index/working tree of the shared checkout.

If you inherit an already-dirty shared working tree from a previous
convention (uncommitted changes, an unfamiliar branch checked out), do not
assume it's abandoned — it may belong to another live session. Leave it
alone, work in your own worktree, and mention what you found to the user
rather than stashing or discarding it yourself.

---

## Rules — apply to everything you create

### Modular code
- Write logic as small, single-purpose functions; use classes/modules only
  when they genuinely fit better.
- Each function does exactly one thing — one reason to change.
- Group related code into themed ES modules; export a clear public surface.
- Entry-point scripts only import and orchestrate higher-level functions — no
  business logic inline.
- Remove repetition: extract reusable code into shared functions/modules.
  In SCSS, factor shared rules into mixins, placeholders, and variables.
- Design for extension without modifying internals.

### Coding style
- Names are informative, concise, and explicit — no cryptic abbreviations.
- Keep logic clear; reject unnecessary complexity and clever one-liners.
- JavaScript: follow the project's ESLint + Prettier config; prefer `const`,
  avoid `var`, handle Promises explicitly, no unused code.
- SCSS/CSS: follow the project's Stylelint config; use a consistent class
  naming convention (e.g. BEM); avoid deep nesting and `!important`.
- HTML: use semantic elements; meet accessibility requirements (WCAG) —
  labels, alt text, landmarks, keyboard operability.
- Assume linters/formatters are part of the definition of "done".

### Project structure
- Use a clear, standard layout that separates source code, build output,
  assets, and documentation. Never write build output into source directories.
- Build artefacts are disposable and regenerable — they are not committed.

### Code documentation
- Document every exported function/module: purpose, parameters, return value.
- JavaScript: JSDoc comments.
- Comments explain *why*, not *what*. Keep them accurate when code changes.
- Never comment out code to toggle behaviour — delete it; version control
  keeps the history.

### Configuration
- Never hard-code credentials, secrets, tokens, or API keys. Read them from
  environment variables or an untracked secrets store.
- Keep configuration in dedicated config files, separate from code.
- Provide an example config file (e.g. `00-config.local.example.js`) with dummy values only.
- Make file paths OS-independent (`path.join`) — this repo is used on Windows;
  never assume a path separator.

### Data management
- Treat any input/fixture data as read-only; never modify it in place.
- Use open, software-agnostic data formats.
- Generated outputs are disposable: code must regenerate them at any time.
- Never commit sensitive data. If a runnable example needs data, generate
  dummy data instead.

### Testing — required, not optional
- For every piece of core functionality, write unit tests in the same change.
  JavaScript: Node's built-in test runner (`node:test`).
- Every bug fix ships with a regression test that fails before the fix.
- Add integration tests where modules interact.
- Test code is clean and readable; use fixtures, mocks, and parameterised
  (table-driven) cases to cut repetition. Tests are first-class code.

### Logging & error handling
- Failures and misuse must produce informative errors — never swallow errors
  with empty `catch` blocks. ESLint enforces this (`'no-empty': 'error'`,
  `allowEmptyCatch` is **not** set). When a catch is intentionally a no-op
  (e.g. localStorage unavailable, clipboard denied), document it with an
  explanatory comment in the catch body rather than leaving it blank.
- Log the configuration in effect when a run starts.
- If the code branches on decisions, log which path was taken.

### Dependency management
- Keep dependencies as few as possible; justify each new one.
- Pin dependencies and always commit the lockfile (`package-lock.json`).
- Pin the Node version (`.nvmrc` / `engines` in `package.json`).
- Separate runtime vs. dev dependencies (`dependencies` vs `devDependencies`).

### Version control hygiene
- Propose small, focused commits scoped to one discrete unit of work.
- Write clear commit messages: concise summary line plus a body explaining why.
- Never commit secrets, sensitive data, build output, or `node_modules`.

### Documentation deliverables
- Keep the README current: purpose, install steps, usage examples.
- Update the CHANGELOG (Keep a Changelog format) for any user-facing change.
- Document non-obvious assumptions next to the code that implements them.

---

## Definition of done — self-check before finishing any task

Before reporting a task complete, confirm:
1. Logic is modular, single-purpose, and free of needless repetition.
2. Names and style follow ESLint/Stylelint; no lint errors.
3. Every new exported function/module has JSDoc.
4. Unit tests exist and cover the new/changed behaviour (plus a regression
   test for any bug fix).
5. No secrets, credentials, or real sensitive data in code or config.
6. Errors are handled with informative messages; key decisions are logged.
7. New dependencies are minimal, justified, pinned, and the lockfile updated.
8. HTML/CSS changes preserve semantic markup and accessibility.
9. README / CHANGELOG updated if behaviour changed.

State explicitly which of these you have and have not satisfied, and why.

---

## PR workflow — mandatory for every code change

You write all the code in this project. The user reviews your work through
pull requests. Follow these steps for every task that involves code changes.
Never push directly to `main`.

### Step 1 — Create a branch in an isolated worktree
Follow [Concurrent sessions — always use an isolated git worktree](#concurrent-sessions--always-use-an-isolated-git-worktree)
above — do not `git checkout -b` in the shared main working directory.
```bash
git worktree add .claude/worktrees/issue-N-description -b fix/issue-N-description origin/main   # bug fixes and QA items
git worktree add .claude/worktrees/feature-description  -b feat/feature-description origin/main   # new features
git worktree add .claude/worktrees/docs-description     -b docs/docs-description    origin/main   # documentation only
cd .claude/worktrees/<branch-name>
```

### Step 2 — Implement, build, lint, test
```bash
npm run build && npm run lint && npm test
```
All tests must pass and lint must show 0 errors before continuing.
Never stage build artefacts (`script.js`, `styles.css`, `docs/*.html`).

### Step 3 — Commit on the branch
Small, focused commits. One discrete unit of work per commit.

### Step 4 — Run /pr-review and show the findings to the user
The skill generates the diff and reviews the changes against CLAUDE.md.
Present the **full review output** to the user in the conversation.
If there are 🔴 blocking issues, fix them before continuing.
Do not open a PR with known blocking issues.

### Step 5 — Push and open a PR
```bash
git push -u origin <branch-name>
gh pr create --title "Short title (≤70 chars)" --body "Closes #N — one sentence why."
```

### Step 5b — Wait for the automated review dialogue to finish

The `chatgpt-pr-review` workflow runs a five-phase AI dialogue automatically
after the PR is opened. Wait for all phases to complete, then triage any
unresolved findings that remain.

### Step 6 — Tell the user and wait for approval
Say exactly: "PR #N is open — [link]. The review is above. Tell me to merge
when you're happy, or point out anything to fix first."
Do NOT run `gh pr merge` until the user explicitly says to merge.

### Step 7 — Merge on instruction
```bash
gh pr merge <N> --squash --delete-branch
```
Then clean up the isolated worktree from Step 1 (from the repo root, not
from inside the worktree being removed):
```bash
git worktree remove .claude/worktrees/<branch-name> --force
```

---

## Out of scope for you (team responsibility — do not fake these)

The Higher QA tier also requires process controls owned by the team, not by
code generation: an issue tracker with templated issues and acceptance
criteria, hosted auto-generated documentation, CI pipelines, and formal user
acceptance testing.

Do not pretend to perform these. When your change would normally trigger one,
say so — e.g. "add a CI job to run these tests".
