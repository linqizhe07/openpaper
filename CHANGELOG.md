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
