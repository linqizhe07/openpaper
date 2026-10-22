# Contributing

Thanks for looking. Gravit has a definite shape, and the rules below are what keep it: read them once, then send what you have.

## Run it

```bash
npm ci
npm run account -- --port 4825 --home ~/gravit-dev
```

That is a second, separate account on port 4825 with its own home, so it never touches one you already run (the README has the rest). `npm test` runs the suite (vitest; some tests bind local ports), `npm run typecheck` runs `tsc`. To see the page with stand-in venues — no network, no money, no key:

```bash
npx tsx test/standin/ui-standin.ts --port 4821 --superagent
```

## What the code holds to

- **UI text is English.** Replies, labels, errors: all of it.
- **Nothing simulated on a real page.** A venue, a price or a number that is not real is not drawn; stand-ins live only in `test/standin/`, terminal demos and tests.
- **Every write that moves money stands behind the owner's signature or an agent's signed limit.** Never add a path around them, and never widen what a signature covers without saying so on the page.
- **Keys stay in files under the home directory.** Their values never enter the page, the log, the ledger or an error message.
- **A venue's rules are the venue's own words, read from the user's network.** Nothing in the code decides from the developer's IP, and the account never routes around a block.
- **A runnable command in the docs never contains a placeholder value.** Readers run them verbatim.
- **Every `/api` route is listed in the header comment of `src/portfolio/server.ts`.**
- **If you add a test file, run `npm run site:numbers`** so `site/data/numbers.json` matches.
- **Ideas are welcome from anywhere; code is not.** Don't copy code from a project under a copyleft licence (OpenStock, whose dashboard some of Markets follows, is AGPL-3.0): a line of it would put this whole repository under that licence.

## Commits and pull requests

- One branch per change, off `main`, one pull request; no stacked branches.
- A commit message is a plain-English subject sentence saying what changed, and a body saying why.
- A pull request says what a user sees differently and how you tested it. Tests go with the change; an attack you closed gets a test under `test/attack/` that must fail.
- Run `npm test` and `npm run typecheck` before you open it. CI runs the same two commands on every pull request (`.github/workflows/ci.yml`).

By contributing you agree that your contribution is licensed under the Apache License 2.0, as section 5 of [LICENSE](LICENSE) says. There is no separate contributor agreement.

Bugs and questions go to [GitHub issues](https://github.com/linqizhe07/buyer-agent-demo/issues); a security problem goes privately, as [SECURITY.md](SECURITY.md) says.
