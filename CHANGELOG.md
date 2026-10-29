# Changelog

What changed in openpaper, newest first, one line per merged pull request. A pull request adds its line under **Unreleased**; a release
moves those lines under its version and date, which is also `version` in package.json, the tag, and what Settings and `/api/now` say.
Pull requests before #1 of this repository were merged in its earlier home, [linqizhe07/account](https://github.com/linqizhe07/account), and
link there.

## Unreleased

- The project is openpaper: its own name on the package, the MCP server, the EDGAR user agent, the site and every link, which now point at linqizhe07/openpaper; "The rest of Gravit" is gone from the site. [#1](https://github.com/linqizhe07/openpaper/pull/1)
- CI runs the type check and the test suite on every push and pull request, and the stand-in's price curves no longer depend on the date it started. [#2](https://github.com/linqizhe07/openpaper/pull/2)
- The ledger is written for the user alone (0600 in a 0700 directory, an older one tightened on its first write), and a seat's key file is read on Windows whatever its mode bits say. [#3](https://github.com/linqizhe07/openpaper/pull/3)
- `npm run account -- --help` lists every option with its default and every environment variable; a misspelt option, a wrong value or a stray word is refused with the list instead of ignored, on the server, `account:check` and `account:service`. [#4](https://github.com/linqizhe07/openpaper/pull/4)
- A version: this file, `version` in package.json, the commit and version in `/api/now`, in Settings, in the service's `status` and on the server's first line. [#5](https://github.com/linqizhe07/openpaper/pull/5)
- A code of conduct, issue forms for a bug and for a venue to add, a pull request template, and a private way to report a security problem. [#6](https://github.com/linqizhe07/openpaper/pull/6)
- The background service carries `PORTFOLIO_MM_BIN` and `PORTFOLIO_MM_WRITES` (never an AI key), and `.env` files are ignored by git. [#7](https://github.com/linqizhe07/openpaper/pull/7)
- `npm run site:progress` refreshes the site's list of merged pull requests from GitHub, and its `--check` keeps the Pages build from shipping a stale one. [#8](https://github.com/linqizhe07/openpaper/pull/8)
- The README in English: what the account does, the page, what has and has not been tested, every option and environment variable, the project's structure and scripts. [#9](https://github.com/linqizhe07/openpaper/pull/9)
- The background service on Linux (a systemd user unit), its logs rotated at five megabytes, and `npm run account:backup` for a 0600 archive of the home. [#10](https://github.com/linqizhe07/openpaper/pull/10)
- The home is `~/.openpaper` (`OPENPAPER_HOME`); an older `~/.buyer-agent-demo` is still read and said on the first line; the service's label is `com.openpaper.account`, the old one booted out on install. [#11](https://github.com/linqizhe07/openpaper/pull/11)
- A Light / Black switch in the top bar, on every tab. [#12](https://github.com/linqizhe07/openpaper/pull/12)
- The attack tests assert the refusal they expect instead of `it.fails`: an environment that breaks no longer passes them. [#13](https://github.com/linqizhe07/openpaper/pull/13) [#14](https://github.com/linqizhe07/openpaper/pull/14) [#16](https://github.com/linqizhe07/openpaper/pull/16) [#17](https://github.com/linqizhe07/openpaper/pull/17)
- Markets says in one line where its prices come from and how they reach the page. [#15](https://github.com/linqizhe07/openpaper/pull/15)
- Three lists over All: the biggest moves, the most traded, what closes soonest. [#18](https://github.com/linqizhe07/openpaper/pull/18)
- The search shows its results under the field, with the arrow keys and the recent searches. [#19](https://github.com/linqizhe07/openpaper/pull/19)
- A US share's drawer carries the company's own record and its newest filings from the SEC, and agents read both over `portfolio_financials`. [#20](https://github.com/linqizhe07/openpaper/pull/20)
- The chart fills the window (its head's last button, or F), and a market's drawer opens the Trade page's own chart of it. [#21](https://github.com/linqizhe07/openpaper/pull/21)
- Eight indicators on the chart, over the price and in panes under it, kept in the address and this browser. [#22](https://github.com/linqizhe07/openpaper/pull/22)
- Drawings on the chart — a horizontal line, a trend line, a note — anchored to bars and prices, kept in this browser for the market. [#23](https://github.com/linqizhe07/openpaper/pull/23)
- The page's keys in one sheet behind `?`, and from Settings. [#24](https://github.com/linqizhe07/openpaper/pull/24)
- Three session-word tests read the same in any zone, and the site's Progress list follows the merge history rather than GitHub's merge time. [#25](https://github.com/linqizhe07/openpaper/pull/25)
- The Progress script reads a merge subject that lost its number, by its branch. [#26](https://github.com/linqizhe07/openpaper/pull/26)
- The page calls itself openpaper: its title, the rail's brand with the ring for a mark, and the tab's icon. [#27](https://github.com/linqizhe07/openpaper/pull/27)
- The left rail keeps watch from any tab: the markets starred, priced fresh every five seconds; the books in a line each (open orders, positions and what they are up or down, the paper result); the stream's dot beside the clock; how many agents. [#28](https://github.com/linqizhe07/openpaper/pull/28)
- One hand of motion and bolder colour for a move: a price's tick fades, a press is felt, menus and toasts arrive, a 24h move is a chip in its colour, the live dot breathes; a move too small for its figures reads flat. [#30](https://github.com/linqizhe07/openpaper/pull/30)
- Why beside every trade of the superagent's: Search's thesis and Risk's reason under each entry in What it did, on the banners, in the chart's marks, in a Why column of the positions and on the cards, and the fill line says bought or sold; on paper a seat's trading limit is the whole balance an order and fifty balances a day, and the form's risk per lead starts at 10%. [#31](https://github.com/linqizhe07/openpaper/pull/31)
- `npm run account:replay`: one of tardis.dev's recorded days of Hyperliquid (the first of each month is free) replayed through the desk at the account's own clock, the paper account filling against the recorded book and the momentum script for a brain, a day in seconds; the service's market-read cache expires on the account's clock, not the wall clock. [#32](https://github.com/linqizhe07/openpaper/pull/32)
- The home at a glance: under the net worth, four pulse tiles (today's change, what waits for you, the cash that is ready, the desk's day) and a Markets card of US stocks, crypto and perpetuals — the biggest moves and the most traded of a class, a star on a watched market, prices every five seconds — with the perpetuals in a table of their own: mark, 24h, funding and its next payment, volume, and your own position with how far the mark is from liquidation. [#33](https://github.com/linqizhe07/openpaper/pull/33)
- A heatmap on the home's Markets card: one cell a market, its area the day's dollar volume, its colour the 24-hour move, the three classes as labelled blocks under All, every cell a press to the market's drawer. [#34](https://github.com/linqizhe07/openpaper/pull/34)
- Markets on a slow network: a source late this time has its last list stand in, said as that with its age; US stocks never wait for all of Cboe past the time a source is allowed; the heatmap keeps a market with no volume as a small cell and sizes its three classes alike; the home asks a listing with late sources again in fifteen seconds. [#35](https://github.com/linqizhe07/openpaper/pull/35)
- `npm run account:backtest`: a strategy (buy and hold, a moving-average cross, time-series momentum, a funding carry) played over recorded bars of Hyperliquid perpetuals, Coinbase coins and Nasdaq shares, kept in the home, through the paper account itself, beside a buy-and-hold, with its figures; a paper account stepped over bars judges each bar, so a liquidation or a stop lands inside the bar that reached it. [#36](https://github.com/linqizhe07/openpaper/pull/36)
- The backtest lab: every run is a row of a hash-chained trials ledger that deflates the next run's Sharpe (and judges runs on the same markets for overfitting), and the latest 90 days are held out — only the owner's signature, or `--holdout` at their terminal, runs a strategy on them, and the figures of those looks are theirs; agents run backtests over `POST /api/account/backtest` and `portfolio_backtest`, one at a time. [#37](https://github.com/linqizhe07/openpaper/pull/37)
- A Backtest tab: run a strategy from a form drawn from the lab's catalog, see its equity beside buying and holding with its drawdown, figures, deflated Sharpe and PBO, open any kept run, and — the owner only, by signature — look at the held-out data, the answer kept in that browser; the stand-in account backtests on made-up history. [#38](https://github.com/linqizhe07/openpaper/pull/38)
- The desk backtested: `npm run account:backtest -- --strategy desk` hires the account's own desk at a paper account in an offline account of its own and plays its seats over recorded bars with the momentum script for a brain — sessions started again past fourteen days, every fill counted, the run kept and counted in the lab beside the buy-and-hold, the owner's look at the holdout playing it again. [#39](https://github.com/linqizhe07/openpaper/pull/39)
- Walk-forward: `npm run account:backtest -- --grid fast=10,20,40 --grid slow=50,100,200 --folds 3` picks a grid's best on each fold's past and tries it on the fold, the out-of-sample runs chained with the share of the in-sample Sharpe they kept, every try a row of the trials ledger. [#40](https://github.com/linqizhe07/openpaper/pull/40)
- The desk backtest waits out a day's halt — its new leads held until the next day, as the desk does — instead of trying to start another session and stopping the run; the day's loss line is one of its numbers (`dayLossPct`, 5 as before). [#41](https://github.com/linqizhe07/openpaper/pull/41)
- Walk-forward for agents and the page: `POST /api/account/backtest/walk` and `portfolio_backtest_walk` walk a grid through the training window's folds under a work budget checked before anything runs, and the Backtest page's Walk forward mode shows the chained curve, what the walk kept and each fold's pick and run. [#42](https://github.com/linqizhe07/openpaper/pull/42)
- CI's type check passes again: a test added with the walk-forward API cast the lab's answer to a shape TypeScript refuses. [#43](https://github.com/linqizhe07/openpaper/pull/43)
- A signed backtest runs outside the door's line once it is taken: a cancel, an agent's order or a desk's exit sent while the owner looks at the held-out data is no longer kept waiting behind it, and the holdout is not moved while a backtest runs. [#44](https://github.com/linqizhe07/openpaper/pull/44)

## v0.1.0 — 2026-10-22

The first tagged state: the account as it stood when the repository went open source, built between 3 and 22 October 2026.

**The account**

- Real connectors to the user's own venues, with reads and signed writes; Robinhood through the interfaces it publishes; every venue's trader, cross-chain moves, price comparison and a statement. [#3](https://github.com/linqizhe07/account/pull/3) [#4](https://github.com/linqizhe07/account/pull/4) [#5](https://github.com/linqizhe07/account/pull/5)
- Stock sessions said honestly, a stand-in broker, pre-IPO in the company's own words. [#6](https://github.com/linqizhe07/account/pull/6)
- Connect an account asks each venue first, so a tile the venue refuses here says so before a key is made; every user judged from their own network: close-only, the venues' terms, regional editions, IP blocks told apart; what two reviews of those fixes found. [#7](https://github.com/linqizhe07/account/pull/7) [#8](https://github.com/linqizhe07/account/pull/8) [#11](https://github.com/linqizhe07/account/pull/11) [#13](https://github.com/linqizhe07/account/pull/13)
- Memory: what an agent remembers about you, where each note came from, and three switches. [#10](https://github.com/linqizhe07/account/pull/10)
- Real money and paper told apart at every step: a Real money / Paper lens, a switch and a band on the ticket, "paper" as a venue name for agents. [#20](https://github.com/linqizhe07/account/pull/20)
- Alpaca's paper account as a connection of its own, and the sessions outside the regular one — pre-market, after-hours, overnight — with limit orders that trade in them. [#22](https://github.com/linqizhe07/account/pull/22)
- The account's own paper service for US stocks and crypto on live data: a market-data stream hub, tick-driven fills, one push channel to the page, five years of chart history fetched on demand, and the paper equity curve; 41 review findings on the paper pipeline fixed. [#23](https://github.com/linqizhe07/account/pull/23) [#24](https://github.com/linqizhe07/account/pull/24) [#28](https://github.com/linqizhe07/account/pull/28)
- US share quotes reach the page 0.45 s after Robinhood writes them. [#29](https://github.com/linqizhe07/account/pull/29)
- Sign out: a signed instruction that takes this browser off the account, and a new pairing code once no browser signs for it. [#31](https://github.com/linqizhe07/account/pull/31)
- Perps on HyperCore's public API: mark, oracle, open interest, a funding countdown, a funding history tab, hourly paper funding at Hyperliquid's own rates. [#32](https://github.com/linqizhe07/account/pull/32)
- The installed service carries `SEC_CONTACT`, and `install` waits for a running copy to leave before it bootstraps the new one. [#42](https://github.com/linqizhe07/account/pull/42) [#43](https://github.com/linqizhe07/account/pull/43)

**Markets and Trade**

- The order ticket lists the venues that answer this network and says nothing of the rest; a Markets row is one line, the rest in its hover card; every tile's real logo, with Elbstream's credit. [#14](https://github.com/linqizhe07/account/pull/14) [#15](https://github.com/linqizhe07/account/pull/15) [#16](https://github.com/linqizhe07/account/pull/16)
- The Trade page as a trading terminal: its own candle chart, order book and trades. [#23](https://github.com/linqizhe07/account/pull/23)
- Price alerts (🔔), the Pulse over All, ⌘K search, and a US share's Financials from SEC EDGAR. [#42](https://github.com/linqizhe07/account/pull/42)
- Three things a new user met on the first run, and six more before the beta: the 24h change at its market's own places, a paper account said in one line, US stocks kept on Markets while one broker serves them, a search that keeps the share's own paper line, the drawer forgetting a refusal after a restart. [#39](https://github.com/linqizhe07/account/pull/39) [#45](https://github.com/linqizhe07/account/pull/45)

**Superagent and brains**

- The Desk: an account's own agent team, with charters that become limits. [#21](https://github.com/linqizhe07/account/pull/21)
- Superagent: the desk trading a paper account on its own, as a live trading floor, one click from the Regular terminal. [#25](https://github.com/linqizhe07/account/pull/25)
- Brains: fourteen model providers in one place, keys typed on the page safely, the brain switched and the desk restarted from the Superagent page; paste an API key and the account tells whose it is, checks it with that provider, and connects the desk to its best model. [#26](https://github.com/linqizhe07/account/pull/26) [#36](https://github.com/linqizhe07/account/pull/36)
- The desk you can read: nothing covered, the floor in Light or Black, the brain a button; then the desk on its chart, the candles big, every trade on them and each step played as it happens. [#37](https://github.com/linqizhe07/account/pull/37) [#38](https://github.com/linqizhe07/account/pull/38)

**The look**

- The ASCII ocean under the whole page, sharks of glyph blocks hunting fish, every surface frosted glass; Swiss type in Inter, the trading area following Light and Black; the Account's green, with sharks that never swim behind a word. [#33](https://github.com/linqizhe07/account/pull/33) [#34](https://github.com/linqizhe07/account/pull/34) [#35](https://github.com/linqizhe07/account/pull/35)

**Site and docs**

- The public page: the instruments on a light ground, "The airport for agents and money", and the affiliation line dropped. [#17](https://github.com/linqizhe07/account/pull/17) [#18](https://github.com/linqizhe07/account/pull/18) [#19](https://github.com/linqizhe07/account/pull/19)
- README and COOKBOOK brought up to date; a README for users, in English. [#9](https://github.com/linqizhe07/account/pull/9) [#38](https://github.com/linqizhe07/account/pull/38)
- Open source under Apache-2.0: LICENSE and NOTICE, a SECURITY.md that says how to report a hole privately, a CONTRIBUTING.md with the rules the code holds to. [#44](https://github.com/linqizhe07/account/pull/44)
