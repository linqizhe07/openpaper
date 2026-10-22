<!-- The rules are in CONTRIBUTING.md; this is the shape a pull request takes. One branch per change, off main. -->

## What a user sees differently

<!-- In a sentence or two: what is on the page, in the terminal, in the MCP surface or in the docs now that was not before. -->

## How it was tested

- [ ] `npm test` and `npm run typecheck` pass locally (CI runs both).
- [ ] If this closes a hole: a test under `test/attack/` that asserts the refusal, red before the fix and green after.
- [ ] If a test file or an MCP tool was added: `npm run site:numbers` was run, so `site/data/numbers.json` matches.
- [ ] If a `/api` route was added: it is in the header comment of `src/portfolio/server.ts`.
- [ ] A line under **Unreleased** in `CHANGELOG.md`.

## Rules kept

- [ ] UI text is English; nothing simulated is drawn on a real page; every write that moves money stands behind a signature.
- [ ] Keys stay in files under the home; their values never enter the page, the log, the ledger or an error.
- [ ] No code from a project under a copyleft licence.
