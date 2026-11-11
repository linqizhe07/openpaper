<p align="center"><img src="../site/img/og.png" alt="openpaper —— agent 和钱的机场" width="720"></p>
<p align="center"><a href="../README.md">English</a> · <b>中文</b></p>

# openpaper

**你的交易账户在一页上，AI agent 只在你签过名的额度里交易。**

openpaper 在你自己的电脑上跑。它把你的交易所、券商、钱包和预测市场账户放在一页上，给你一个用真实行情的纸上账户练手，让 AI agent——它自己的交易桌 Desk，或你通过 MCP 带进来的——在你签的额度里交易、挪钱、付款。中间没有服务器，不用注册账号，没有埋点：你的电脑自己读公开行情、直接和场所说话。网站：[linqizhe07.github.io/openpaper](https://linqizhe07.github.io/openpaper/)

**它做什么**

- **你的账户在一页上**：93 家交易所（API 钥匙）、Alpaca 和 Robinhood、Kalshi 和 Polymarket、Hyperliquid、MetaMask 等钱包——持仓、订单、仓位、净值曲线，和一份可筛选、可导出的对账单。
- **用真实行情的纸上账户**：币、美股、永续和事件合约都用纸上的钱练：市价、限价、止损、止损限价、追踪止损，开仓带止盈止损，美股时段照实算，永续有资金费和强平；一张单可以按 TWAP、VWAP 或 iceberg 分片执行，每单写上交易成本分析。
- **Markets**：从你的网络能读到的每个场所的每个市场；★ 关注，🔔 提醒——价越过一条线、当天涨跌或成交额或资金费率过了一个数、上了新闻、一只美股一周内出财报；一条命令行（⌘K：`AAPL DES`、`BTC GP`、`MOST`、`HELP`）。
- **新闻、日历、世界、期权**：出版方自己放出的标题（`TOP`）；Nasdaq 的经济数据、财报、股息、拆股和 IPO 日历（`ECO`、`ERN`）；股指、美债收益率曲线、外汇和商品（`WEI`、`GC`、`FXC`、`GLCO`）；Cboe 和 Deribit 的期权链，每个到期日的平值 IV、看跌 / 看涨比、最大痛点和偏斜（`OMON`、`SKEW`）。
- **一只股票、筛选器、分析、风险**：一只美股照 Nasdaq 自己页面说的（`DES`、`ANR`、`SI`、`HDS`）；全部美股按条件筛，和板块地图（`EQS`、`IMAP`）；几个市场放在一起比、算相关和 beta（`COMP`、`CORR`、`HVG`、`BETA`、`SEAG`）；你自己持仓的敞口、波动率、VaR 和回撤（`RISK`）。都是对场所自己的数做算术，不预测。
- **Monitor**：一屏自己拼的格子——一个市场、一块板、一个主题的标题、今天的日历、一条期权链——布局写在地址里（`MON`）。
- **世界市场的永续**：Hyperliquid HIP-3 上按股票、指数、商品、外汇和利率部署的合约，列在永续里、有 K 线、能在纸上交易；每份是那个 dex 自己按预言机价定的合约，页上写明。
- **交易终端**：几年历史的 K 线、场所流推的盘口和成交，账户自己的入场、止损和挂单画在图上。
- **Superagent**：一桌 AI agent 自己在纸上账户上交易，动手前先读当天的标题和经济数据，回答你的 `ASK`，每一步实时放出来——用十三家模型 API 任何一家的钥匙，或你机器上跑的模型。
- **你自己的 agent（MCP）**：四十九个工具：读、交易、挪钱、付款、生息、提问、记忆，每个都在你为那个席位签的额度里。
- **要紧的都由你签**：每一笔订单、挪动和额度都由浏览器里一把导不出来的钥匙签；Guard 把每个请求留给你点头，Beast 让 agent 在额度里直接做；每笔有上限；哈希链账本记下一切。

## 目录

- [页面](#页面)
- [五分钟跑起来](#五分钟跑起来)
- [接你真实的账户](#接你真实的账户)
- [一切由你签](#一切由你签)
- [诚实边界](#诚实边界)
- [你的网络决定你看到什么](#你的网络决定你看到什么)
- [带你自己的 agent 进来](#带你自己的-agent-进来)
- [常驻后台](#常驻后台)
- [不联网看一圈](#不联网看一圈)
- [选项和环境变量](#选项和环境变量)
- [代码结构](#代码结构)
- [技术栈](#技术栈)
- [开发与测试](#开发与测试)
- [更多](#更多)
- [许可](#许可)

## 页面

<p align="center"><img src="img/account.png" alt="替身账户上的 Trade → Superagent：Momentum desk 开始四十秒，第一笔买入和它的止盈、止损画在 K 线上，四个席位和它们做的事" width="900"></p>

替身账户上的 Trade → Superagent——不联网、不动钱、不要钥匙——`npx tsx test/standin/ui-standin.ts --port 4821 --superagent` 给出的样子：页上每个场所、每个价、每笔成交都是编的，Desk 用脚本代替模型交易。真账户长得一样，换成你的场所和一把模型钥匙。

## 五分钟跑起来

要 [Node.js](https://nodejs.org) 22 或更新，和 Git。在 macOS 上测过；Linux 应该一样；Windows 没测。

```bash
git clone https://github.com/linqizhe07/openpaper.git
cd openpaper
npm ci
npm run account
```

打开 **http://127.0.0.1:4820**，输入终端打印的配对码：这个浏览器就是 owner，之后每一笔动钱的事都由它签名。`npm run account -- --help` 列出全部选项。（`npm ci` 可能提示跳过了几个包的安装脚本——npm 11.19 起会先问；这里用不到它们，接着走就行。）

然后在页面上：

1. **开一个纸上账户**——$10,000 纸上的钱、真实的公开行情，什么都不用接。
2. **Trade**——在纸上买卖币、美股、永续和事件合约。
3. **Superagent**（Trade → Superagent）——粘一把 API 钥匙，按 **Start the superagent**：Desk 自己在你的纸上账户上交易，每笔都落在图上，每一步实时放出来。
4. **看市场**（Markets）——★ 关注一个市场，🔔 设提醒；⌘K 或 `/` 是命令行（`AAPL DES`、`BTC GP`、`TOP`、`ECO`、`HELP`）。一只美股的 **Financials** 来自它在 SEC 的申报，SEC 要求每个读者报上自己是谁：起账户时把 `SEC_CONTACT` 设成你的邮箱。
5. **Backtest**——一个策略在录下的 K 线上按同一个纸上账户的规则跑，每一次都计数、Sharpe 按之前试过的次数 deflate，最近 90 天留出来只给你自己看。

Superagent 要一个模型来想：Anthropic、OpenAI、DeepSeek、Gemini、xAI、Kimi、Qwen、OpenRouter、Groq、Together、Meta 任何一家的钥匙——账户认出是谁家的、选那家最好的模型——或者你机器上的 Ollama / vLLM，不要钥匙。调用算在你的钥匙上。

## 接你真实的账户

**Account → Venues → Connect an account**：93 家交易所用 API 钥匙（Coinbase、Kraken、OKX、Binance 等）；美股用 Alpaca 和 Robinhood；Kalshi 和 Polymarket；Hyperliquid；MetaMask 等钱包。

- 场所的 API 钥匙放在你电脑上的文件里（`~/.openpaper/`；旧的 `~/.buyer-agent-demo/` 照样读）：页面只告诉你放哪，钥匙的值不经过页面和日志。页面上粘的 AI 钥匙存在同一个文件夹。
- 真钱交易默认开着，每笔订单和挪动有上限（$100，除非起的时候给 `--live-cap`）；`--read-only` 关掉交易。选项在[下面](#选项和环境变量)。

## 一切由你签

- **要紧的都由你签**：订单、挪动和每个 agent 的额度都由浏览器的钥匙签，账户逐一验签。
- **Guard 或 Beast**：Guard 下 agent 要做的每件事出一张卡等你点头；Beast 下 agent 直接做——但只在你签的额度里。
- **每笔有上限**：起服务时的 `--live-cap`（默认 $100）；在 Settings 里签一个别的数，升降都行、精确到分，重启后照签的恢复。钱只去证明是你自己的地方。
- **什么都记着**：你电脑上一本哈希链账本，和一份可筛选、可导出的对账单。

## 诚实边界

做这个东西从没用过一把真钥匙、一个真钱包。真实连接和真钱写入只对着替身测过：替身交易所、替身链、用完即扔的测试钱包，和不带钥匙读场所自己的公开接口。纸上账户、行情、agent 和签名从头到尾跑过；在真场所落下的最后一步没有。

所以接你自己的账户之前：先用只读钥匙。要写，先用小上限、小金额，在页面上读过场所自己的回答，再信下一笔。

信任边界是你自己的电脑。钥匙文件只有你能读（0600），页面从不见它们的值，但以你的身份跑的任何程序都读得到——任何电脑上的钱包和券商钥匙都是这样。owner 的钥匙在你的浏览器里、导不出来；浏览器的存储被清了，`npm run account -- --fresh` 是回来的路，它从零开始。

再细几条——记忆和 Brains 认钥匙靠的是形状，地区规则是场所的，托管和牌照不在这里——在[导览](tour.zh.md#诚实边界)。

## 你的网络决定你看到什么

中间没有服务器：你的电脑自己读公开行情、直接和场所说话，所以你的网络——国家、IP、公司防火墙——决定哪些场所答你。

- **从你的网络问每一家**，只画答你的。拒绝你网络的标 *Not served here*，有地区版的（Binance.US、OKX US、Polymarket US）写在旁边。
- **从不绕过封锁**——没有代理、没有别的主机。为了把场所公布的规则对上你的网络，它问一个公开的位置检查（Polymarket 的、Cloudflare 的或 ipapi.co 的）。
- **先查一下**：`npm run account:check` 打印你的网络能接到什么，每家用自己的话；里面没有 IP、地点和钥匙，可以直接贴给别人。

每个数从哪来、多新：

| 什么 | 从哪读 | 多新 |
|---|---|---|
| 币 | 接上的场所自己的流；否则 Kraken、Coinbase、OKX、Binance、Bybit 的公开行情，和 Hyperliquid、Coinbase、Kraken、OKX 的流 | 实时；纸上订单按一秒内的报价成交 |
| 美股和 ETF | Robinhood 实时，否则 Nasdaq 实时；Cboe 的 15 分钟延迟报价排最后、标明 | 约 15 秒一次；纸上订单只按实时报价、在它的时段里成交 |
| 永续 | Hyperliquid 的公开接口和流：它自己的合约，和它 HIP-3 dex 上世界市场的 | 实时；每小时资金费，按维持保证金强平 |
| 事件合约 | Kalshi、Polymarket、Polymarket US 的公开盘口 | 实时；场所结算时按 $1 或 $0 结 |
| Pre-IPO 和 RWA | 九家的公开行情；Robinhood Stock Tokens、Gate 的 xStocks、Ondo | 每次读 |
| 财务 | SEC EDGAR，`SEC_CONTACT` 是读者的名字 | 留 12 小时 |
| 新闻 | 出版方自己的源——美联储、欧央行、SEC、CNBC、MarketWatch、华尔街日报、BBC、Nasdaq、CoinDesk、Cointelegraph、The Block、Decrypt、PR Newswire——只有标题、链接和时间 | 留 5 分钟 |
| 日历 | Nasdaq 自己的日历页：经济数据、财报、股息、拆股、IPO | 一天留 15 分钟 |
| 股指 | Cboe 的延迟指数报价：标普 500、纳斯达克 100、道琼斯、罗素 2000、VIX 等 | 晚 15 分钟 |
| 收益率曲线 | 美国财政部自己的 par 曲线，带 2s10s、3m10y、5s30s 利差 | 收盘后一天一次 |
| 外汇 | Kraken 的公开行情九对；其余二十对是 ECB 的欧元参考汇率 | 实时；ECB 的是当天定盘价 |
| 商品 | Hyperliquid xyz 永续的预言机价，照实说明 | 实时 |
| 期权 | Cboe 的延迟报价（美股和它的指数，IV 和希腊字母是 Cboe 的）；Deribit 的 BTC、ETH 汇总，delta 从它的 mark IV 算 | 晚 15 分钟；Deribit 实时 |
| 一只股票的页、筛选器 | Nasdaq 自己的页面和筛选表，每个数照 Nasdaq 写的 | 留 5 分钟 |
| 提醒 | 上面的源 | 账户跑着时每 30 秒判一次，页开不开都一样 |

没有源答的市场就没有价：纸上的市价单被拒、限价单等着，页上说明原因。

## 带你自己的 agent 进来

按 **Copy setup command**（Portfolio 的 *Get started*，或 Agents 下），在你的 agent 那边跑（Claude Code 或任何 MCP 客户端）。在页面上放它进来、给它一个额度：它能读你的账户，在额度里交易、挪钱、付款。

## 常驻后台

macOS 上：

```bash
npm run account:service -- install --live-cap 20
```

登录就起、停了就重启。还有 `status`、`restart`（`git pull` 之后）、`logs`、`code`（配对码）、`uninstall`。服务只从跑 `install` 的 shell 带走 `BUYER_HOME`、`SEC_CONTACT`、`PORTFOLIO_RPC_*` 和 MetaMask 的开关，别的不带：模型钥匙放钥匙文件，不放 shell。Linux 上先用你自己的服务管理器跑 `npm run account`；Windows 在终端里跑。

## 不联网看一圈

```bash
npx tsx test/standin/ui-standin.ts --port 4821 --superagent
```

同一个页面，场所是替身，在 http://127.0.0.1:4821——不联网、不动钱、不要钥匙——Desk 用脚本交易。它的 Backtest 跑在编出来的历史上。`--no-desk` 则自己走一遍设置。

## 选项和环境变量

`npm run account -- …` 收这些；`--help` 打印同一张表，拼错的选项会被拒绝，不会被忽略。

| 选项 | 做什么 | 默认 |
|---|---|---|
| `--port <number>` | 页面和接口听的端口，只听 127.0.0.1 | 4820 |
| `--home <dir>` | home 目录：账本、钥匙文件、纸上账本、席位 | `$OPENPAPER_HOME`（或 `$BUYER_HOME`），否则 `~/.openpaper`；旧的 `~/.buyer-agent-demo` 照样读 |
| `--live-cap <dollars>` | 起服务时一笔订单或挪动最多值多少；之后 owner 在 Settings 签别的数，重启照签的 | 100 |
| `--read-only` | 不下单、不动钱：只读 | 关 |
| `--fresh` | 从零开始，不接着以前的运行 | 关 |
| `--classic` | 原来的模拟对账单，没有账户层（那里的 `--mm` 读真的 `mm` CLI） | 关 |

`npm run account:check -- …` 收 `--keys`（钥匙文件在 home 里的连接也各开一次，只读）、`--home <dir>` 和 `--json`。`npm run account:service -- <command>` 收 `install`（后面跟服务器的选项）、`status`、`restart`、`logs`、`code`、`uninstall` 和 `help`。

账户读的环境变量，和 `account:service install` 带不带它们进后台服务：

| 变量 | 做什么 | 谁读 | 进服务？ |
|---|---|---|---|
| `OPENPAPER_HOME` | 没给 `--home` 时的 home 目录（新名字） | `home.ts` | 是 |
| `BUYER_HOME` | `--home` 和 `OPENPAPER_HOME` 都没给时的 home 目录（旧名字，照样读） | `home.ts` | 是 |
| `SEC_CONTACT` | 你的邮箱：SEC 要求每个 EDGAR 读者带一个；没有它美股的 Financials 关着 | `live/edgar.ts` | 是 |
| `PORTFOLIO_RPC_ETHEREUM`、`…_OPTIMISM`、`…_BNB`、`…_POLYGON`、`…_BASE`、`…_ARBITRUM`、`…_ROBINHOOD` | 每条链你自己的 RPC | `live/chain.ts` | 是 |
| `PORTFOLIO_MM_BIN` | MetaMask Agent Wallet 的 `mm` 命令 | `live/metamask.ts` | 是 |
| `PORTFOLIO_MM_WRITES=1` | MetaMask 自己的真交易开关；不设就关 | `live/writes.ts` | 是 |
| `PORTFOLIO_URL` | MCP 席位去哪找账户（`http://127.0.0.1:4820`） | `mcp.ts` | — |
| `PORTFOLIO_AGENT` | MCP 客户端没给名字时席位的名字 | `mcp.ts` | — |
| `PORTFOLIO_SEAT_KEYS=sim` | 席位的钥匙从名字推出来，不用钥匙文件：只给演示和测试 | `mcp.ts` | — |
| `PORTFOLIO_MM=1` | 配 `--classic`：模拟对账单读真的 `mm` CLI | `server.ts` | — |
| `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` | shell 里 Claude 的钥匙或 token；base URL 不是 Anthropic 自己的主机时，钥匙文件关掉 | `account/brain-claude.ts` | 故意不带 |
| `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` | shell 里 OpenAI 的钥匙、主机和模型，给 OpenAI 预设 | `account/brain-openai.ts` | 故意不带 |
| `NODE_ENV=development` | 每个请求重读页面文件 | `server.ts` | — |

不读任何 `.env` 文件。想用的话交给 Node 自己：`node --env-file=.env --import tsx src/portfolio/server.ts -- --live-cap 20`。

## 代码结构

```
src/portfolio/         账户：server.ts（接口；每条 /api 路由在它的头注释里）、service.ts、router.ts
  account/             签名的门（exchange.ts、sign.ts）、状态、恢复、Desk 和它的脑子、日历、对账单
  live/                真实场所和公开行情：交易所、Alpaca、Robinhood、Kalshi、Polymarket、Hyperliquid、钱包、价格、K 线、流、EDGAR
  public/              页面：account.html 和 ui/*.js，纯 HTML、CSS、JavaScript，不用构建
  backtest/            录下的 K 线、把纸上账户推过它们的引擎、策略和 Desk 回测、指标、实验室的留出期和试验台账
  mcp.ts               agent 席位跑的 MCP 服务（49 个工具）
  account-service.ts   后台服务 · account-check.ts  你的网络能接什么 · home.ts  home 目录
  adapters/, venues.ts 模拟场所，只给 --classic 和测试
src/core/ src/agent/   共用：哈希链账本（agent/ledger.ts）、拒绝码、哈希、jsonl
src/runner/ src/plugins/ src/venues/ src/contract/ src/control-room/ src/wallet/
                       更早的演示（docs/earlier-demos.md），留给 npm run demo、control-room、wallet 和它们的测试
fixtures/home/         账户起步的 fixtures（fixtures/home/portfolio/*.json）和演示的种子
test/                  unit/ · attack/（每个文件是一个堵上的洞）· standin/（替身账户）· e2e
site/ scripts/         公开介绍页，和算它的数字的脚本
docs/ COOKBOOK.md      导览、每件事怎么做、每一部分怎么做出来的
```

## 技术栈

Node 22、TypeScript（strict）、Express、ccxt、viem、zod、MCP SDK、vitest。页面是纯 HTML、CSS 和 JavaScript 当文件发，没有框架、不用构建；字体自己托管。

## 开发与测试

Node 22 或更新（CI 用 22）、Git、`npm ci`，没有别的：不用构建、没有数据库。页面是纯文件，改 `src/portfolio/public/` 下的东西刷新就见；改服务端重启就见。

```bash
npm ci                                          # 装一次
npm run typecheck                               # tsc --noEmit，strict：vitest 不做类型检查，每次提交前先跑它
npx vitest run test/unit/live-paper.test.ts     # 跑一个文件；加 -t "几个字" 只跑一个用例
npm test                                        # 整套：约 210 个文件、3,300 个用例，串行（模拟场所绑定固定端口），10–20 分钟
npx tsx test/standin/ui-standin.ts --port 4821  # 替身账户：同一个页面和门，场所是假的，不联网、不动钱，配对码打印在终端
npm run site:numbers                            # 新增测试文件后重算网站的数字（site/data/numbers.json），有测试钉着它
```

测试钉死的几条约定，免得改了才知道：页面新加一个 `ui/*.js` 要进 `page-scripts.test.ts` 的清单；新路由要写进 `server.ts` 的头注释；新 MCP 工具要写进 `mcp.ts` 的头注释、[导览](tour.zh.md)的工具表、两份 README 和 `site/index.html` 里的数字；每个 PR 在 [CHANGELOG.md](../CHANGELOG.md) 加一行。CI 在每次 push 和 PR 上跑类型检查和整套测试，检查绿了再合并。

| 命令 | 做什么 |
|---|---|
| `npm run account` | 账户，在 http://127.0.0.1:4820（`npm run portfolio` 一样） |
| `npm run account:check` | 你的网络能接到什么，每家用自己的话；可以直接贴给别人 |
| `npm run account:service -- <command>` | macOS 上把账户装成后台服务 |
| `npm run account:replay -- --day 2026-10-01` | 录下的 Hyperliquid 一天（tardis.dev；每月一号免费）在纸上账户上让 Desk 回放一遍，几秒钟 |
| `npm run account:backtest -- --markets perp:BTC,perp:ETH` | 一个策略在录下的 K 线上按纸上账户自己的规则跑，旁边是买入持有。每一次都是试验台账（哈希链）的一行，deflate 下一次的 Sharpe，最近 90 天留出（`--holdout`、`--trials`、`--set-holdout`）；`--grid fast=10,20 --folds 4` walk-forward；`--screen RUN` 扫一次 Desk 回测的出场；`--strategy desk` 跑账户自己的 Desk，`--rule` 让它守一条教训的规则 |
| `npm run account:demo` | 账户的十四个 beat，无头跑 |
| `npm test` | 整套：约 210 个文件、3,300 个用例，其中三十二个文件是攻击复现；串行，因为模拟场所绑定固定端口 |
| `npm run typecheck` | `tsc --noEmit`，strict |
| `npm run site` · `npm run site:numbers` | 本地预览公开介绍页（`site/`，GitHub Pages，推到 main 自动发布）；从仓库重算它的数字 |
| `npm run demo` · `npm run control-room` · `npm run wallet` | 更早的模拟演示（[earlier-demos.md](earlier-demos.md)） |

## 更多

- 第二个独立的账户：`npm run account -- --port 4825 --home ~/openpaper-second`；`--fresh` 从零开一个。
- 再往下读：[导览](tour.zh.md)（页面、谁能让钱动、能接什么、记忆、Desk、给 agent 的接口，一部分一节）、[COOKBOOK](../COOKBOOK.md)（每件事怎么做）、[account.md](account.md)（每一部分怎么做出来的）、[earlier-demos.md](earlier-demos.md)（更早的模拟演示）。
- 改了什么在 [CHANGELOG.md](../CHANGELOG.md)，每个合并的 PR 一行。你跑的是哪个版本在 Settings → Version、`npm run account` 打印的第一行和 `GET /api/now`。最新的 release 和 `main` 都在维护。
- 问题和 bug：[GitHub issues](https://github.com/linqizhe07/openpaper/issues)。

## 许可

Apache-2.0：见 [LICENSE](../LICENSE)。版权 2026 Linqi Zhe。可以用、改、再分发，包括放进你卖的东西里，只要许可证和声明跟着走；不提供任何担保。

要贡献先读 [CONTRIBUTING.md](../CONTRIBUTING.md)；安全问题按 [SECURITY.md](../SECURITY.md) 私下报，不要开公开的 issue。

openpaper 不是投资建议。真钱交易风险自负；纸上的钱不是钱。
