# openpaper（中文详版）

> 英文的简短说明在 [README.md](../README.md)；这一页是原来的中文 README，细节最全。

给 AI agent 用的资金账户（**Account**）：你真实的交易所、券商、钱包和预测市场账户在一个页面上；agent 在你签的额度里交易、挪钱、付款，你看、引导、批准。仓库里还留着更早的几个模拟演示（[docs/earlier-demos.md](earlier-demos.md)）。

## 跑起来

```bash
npm install
npm run account                                    # http://127.0.0.1:4820，配对码打印在终端
npm run account:service -- install --live-cap 20   # macOS 后台常驻；之后 status · restart · logs · code · uninstall
npx tsx test/standin/ui-standin.ts --port 4821     # 替身账户：同一个页面和门，场所是假的，不联网、不动钱
npm run account:demo                               # 无头跑十四个 beat
npm run account:check                              # 从这台机器能接哪些场所，每家用自己的话答；不含 IP、地方、钥匙，可以直接贴给别人
npm test
```

Node ≥ 22。常用开关：`--live-cap 50`（单笔上限，默认 $100）、`--read-only`（不下单、不动钱）、`--fresh`（不接着以前的运行）。钥匙文件和账本在 home（`$OPENPAPER_HOME`，默认 `~/.openpaper/`），钥匙文件 `chmod 600`；页面只传文件在哪，值不进页面和账本。

## 页面

样子是 Demo v2 画布第七轮的（F1 / F5，用这一层自己的 tokens 和尺寸）：左边一条白 rail，Markets · Trade · Agents；rail 最下面是 **Account** 钱包按钮（净值 · 模式），打开 Account 的三页，头上是模式（Guard | Beast）、"Trading on · $100 a move"（单笔上限，点它去 Settings 改，一次签名）、Settings。

- **Portfolio**：你有什么。净值曲线；**Open positions · live**——每一样账户知道成本的持仓（你自己下的单、场所报了入场价的仓位）一张实时卡：入场价、现价、未实现盈亏和百分比，每 5 秒拿一次场所的新价，数字闪一下、点在梯子上滑过去、走势线一点点长出来，纸上账户的也在（标 Paper）；跨场所按资产汇总、持仓；右栏是等你批的卡和 agent 的请求（第七轮的圆键：蓝的 ✓ 批、✗ 拒）、agent 在做什么、现成的钱、配置条。Move · Receive · Earn · Sell many 都从这里开。
- **Venues**：接上的账户（健康、对 agent 的开关、Details）和 Connect an account。
- **Memory**：照画布的 F13，「<agent> 记得的你」：风格 · 规矩 · 场所和人三段，每条写着从哪来（你说的 · 它学的 · 来自额度），三个开关，Export 和 Forget all（下面「记忆」）。
- **Markets**：有什么可以交易。接上的场所，加上没接的场所不带钥匙读来的公开行情（标 "Connect to trade"）。tab：All · Crypto · Stocks · RWAs · Perps · Pre-IPO · Predictions · Watching；一个市场一个抽屉。
- **Trade**：照 Hyperliquid 的交易屏排的一块终端，在一个市场里建仓位。顶上一条市场栏：市场名点开是选市场的面板（六种 Crypto · Stocks · RWAs · Perps · Pre-IPO · Predictions，和 Markets 同样的词），旁边是价格、24h 涨跌、成交额、买一卖一，永续加资金费率和最高杠杆，股票加时段，都只写源说过的，5 秒一读。下面三栏：左边 K 线（5m / 1h / 1d，带成交量）；中间盘口和最新成交（真实档位，点一档就是限价；美股公开报价没有深度，只写买一卖一并说明）；右边下单面板：Market · Limit · Pro（Stop、Stop limit、Trailing stop）、Buy / Sell（永续 Long / Short）、可用和当前持仓、数量和百分比滑杆、Reduce only、Take profit / Stop loss。最下面 Positions · Open orders · Trade history 三个 tab。
- **Agents**（rail 上，`#/desk`）：账户自己的 agent 团队——**Desk**（下面一节），和「带你自己的 agent 进来」（复制 MCP 命令、放敲门的钥匙进来）。
- **Trade：一个地方，两种模式**：rail 上只有一个 Trade，进去是同一块交易区；顶栏最前面一个 **Regular · Superagent** 开关，两种模式共用它、位置一像素不动，点一下就换。**Regular** 是上面那块终端，你自己下单；**Superagent** 是 Desk 在纸上账户上自己交易、你看着：一张和 Regular 一样大的 K 线图，它的每一笔买卖落在图上、每一步在图上方演出来，旁边一栏说它此刻在做什么、刚做了什么，跟着 Light / Black 走（下面「Desk」一节的最后一段）。Trade 在两种模式下都亮着；地址栏说是哪一种：`#/trade` 和 `#/trade?mode=superagent`（旧的 `#/superagent` 落到同一处）；这个浏览器记得你上次用的是哪一种，下次从 rail 进 Trade 就开那一种（只在你按开关时记）。

页面上只有真的：没有模拟场所、没有样例数据，没有接口的就不画。界面英文，背景可选 Light / Black。**整页是「ASCII 海洋」的样子**（照 stackedlol 的 ascii-sharks：Light 是它视频里的白底，Black 是它源码默认的黑底）：页面底下一张固定的 canvas（`ui/ocean.js`，自己写的，没有用它的代码——那个仓库没有许可证），一格一格的字符网格（格子约是窗口宽度的 1/170）上几条鲨鱼在追一群群小鱼：按窗口宽度两到五条，从九种里随机挑、九种都游过之前不重复（黑鳍礁鲨、路氏双髻鲨、无沟双髻鲨、虎鲨、灰鲭鲨、长尾鲨、护士鲨、豹纹鲨，三次里有一次是最大的鲸鲨）；**纸上账户赚得越多鲨鱼越多**：从开账户起每赚整 1% 多一条、每亏整 1% 少一条（最多 12 条、至少 1 条；只算知道自己起始金额的纸上账户，后来加的纸上钱算投入、不算赚的），新的一条从边上游进来、少的那条（最小的）游出去，一次一条、隔几秒；变的时候弹一句提示（"3 sharks joined the water: your paper accounts stand at +3.4% since they started"），Portfolio 的 Paper 卡下面写着现在几条、为什么（`ui/shell.js` 的 `shSharks`，`ui/ocean.js` 的 `OCEAN.bonus`）；各有各的轮廓、斑纹和游法；鲨鱼是一格格灰色方块、方块上一个等宽字符，按光照选字、偶尔闪一点颜色，斑纹是自己的方块（虎鲨的横纹、豹纹鲨的斑点、鲸鲨的白点和白线、黑鳍礁鲨的鳍尖），小鱼是 `-`，游过的地方留下点状尾迹；鼠标附近的鱼会躲，点空白的海面会把鱼吓散。界面浮在上面，是磨砂玻璃，排版是**瑞士国际主义风格**：一种新怪诞无衬线体 Inter（Helvetica、Neue Haas Grotesk 要授权、不能放在本机，Inter 是同一路的开源字），大数字粗而紧，标签小而粗，卡片顶上一道粗线，近乎直角，没有阴影；黑白之外只有一对颜色——绿 #00843D 是 Account 自己的颜色（它的标、被选中的标记、涨、买、同意），强调红 #DA291C 只表示跌、卖和亏损、不做装饰（两者亮度相同，在白底上都是 4.9:1），等待的琥珀色照旧，在黑底上小字用同色相的浅一点的绿红以保证读得清。**鲨鱼是半透明的，而且从不出现在字后面**：面板（卡片、rail、交易区的面板……）底下的鲨鱼看不见，海面上的字底下什么都不画。Portfolio 的净值不放在卡里，直接浮在海面上（后面一层雾，鲨鱼绕着它游）。字都放在本机（`public/fonts/`：Inter 和 Geist Mono，SIL OFL，不连 Google Fonts）；等宽字只给海面上的字符、哈希和签名的内容。"减少动画"时海面只画一帧、不动。**交易区（Trade 的两种模式）跟着 Light / Black 走**，保留 Hyperliquid 交易屏的排法和密度（12px、一个字重、盘口、tab 下划线）：玻璃面板，面板之间 6px 的缝露出海面，按下的开关是黑白，选中的 tab 下面一道绿线，买是绿、卖是红、白字；`ui/tokens.css` 里一组只在交易区生效的 tokens（`<html data-area="trade">`，名字仍叫 `--hl-*`，Light 一套、Black 一套）。Superagent 用的是同一组 tokens，图表就是 Regular 那一张（`ui/chart.js`），所以也跟着 Light / Black 走，切换时不用刷新。在交易区里时左边的 rail 也换成这一组颜色，离开就换回来（0.2 秒过渡，"减少动画"时直接换）。

## 谁能让钱动

- **owner**：浏览器里一把不可导出的设备钥匙（第一次输终端的配对码）。每一笔真钱是一次签名，签之前 "What you sign" 把字段摆出来；执行前再问一次价格或地址，变了就不做。
- **agent**：自己的钥匙（MCP 席位在本机生成），加 owner 签的额度：交易、挪钱、付款、earn，各有单笔、总额和到期。
- **模式**：

  | agent 在额度内 | Guard | Beast |
  |---|---|---|
  | 下单、挪钱、放进 earn | 出一张卡，等你批 | 直接做 |
  | 撤自己的单 | 直接做 | 直接做 |
  | 超出额度 | 拒绝 | 拒绝 |

  切到 Guard 一键，切到 Beast 要签名；卡 30 分钟没人答自动过期。十扇门的完整对照在页面的 Mode 弹层（服务器给的 `modeRules`）。接口上的值仍是 `guard` | `open`。
- **不变的线**：单笔上限（启动时 `--live-cap`，之后在 Settings 里改，升降都是 owner 一次签名 `setPolicy cap`，重启按最后一次签的恢复；纸上账户不受它）；钱只去你自己的地方；随时撤销；场所自己的地区规则不绕。

## 能接什么

| 类 | 场所 | 能做 |
|---|---|---|
| 交易所 | OKX、Kraken、Coinbase、Binance、Bybit、KuCoin 等统一接口库（ccxt）里用 API 钥匙接的 93 家，Binance.US、OKX US 这样的美国版也在里面；钥匙文件 | 读；现货和 U 本位永续；提到自己的地方、划转、稳定币互换；OKX、Kraken、KuCoin、Binance 的 earn |
| 券商 | Alpaca（钥匙文件；它的 paper 账户也能接："Alpaca · paper"，纸上的钱、真实报价，盘前 / 盘后 / 隔夜都能下带 extended hours 的限价单——隔夜时段就是香港、新加坡的白天）、Robinhood（它的 Trading MCP，OAuth 登录）、Robinhood Crypto | 读、下单；现金只在券商自己那边进出 |
| 预测市场 | Kalshi（钥匙文件）、Polymarket US（钥匙文件：Key ID 和 Secret Key）、Polymarket（钥匙文件，或只填地址看） | 读、事件合约下单 |
| 钱包 | 浏览器钱包（OKX Wallet、MetaMask 等，签一句话证明地址）、MetaMask Agent Wallet（本机 `mm`） | 换币、跨链、代币化股票（RWA）；`mm` 还有永续、预测、earn，写操作要 `PORTFOLIO_MM_WRITES=1` |
| 永续 DEX | Hyperliquid：API 钱包（钥匙文件；只能交易，不能提币） | 永续、现货、HIP-3（含 pre-IPO）；每单之前按它条款 §1.6 查你此刻所在的地方 |
| 纸上账户 | **Paper account**：什么都不用接——起个名、写一笔纸上美元（默认 $10,000），账户自己记账，可以开好几个。市场是 Markets 不带钥匙读到的那些公开行情，四类都有：美股（Robinhood / Nasdaq 公开的实时报价，按 Robinhood 每 15 秒的写入在后台读、Nasdaq 同时问，读不到时退回 Cboe 的 15 分钟延迟报价——只看不成交：只有它时市价单被拒、限价单等实时报价；常规时段任何单都成交，盘前 / 盘后 / 隔夜只成交勾了 extended hours 的限价单，时段外的市价单排队等开盘，不收佣金）、crypto（交易所的币、Hyperliquid 永续——逐仓杠杆、每小时资金费、按声明的规则强平）、RWA（Robinhood Stock Tokens、Gate 上的 xStocks、Ondo 股票代币）、预测市场（Kalshi / Polymarket / Polymarket US 的事件合约，场所结算后按场所付的钱付掉）；按公开报价成交，规则是账户自己定的、处处写明；单子有市价、限价、止损、止损限价、追踪止损，有效期 day / gtc / ioc / fok，开仓单可以带止盈止损（成交后挂上两个退出单，一个成交另一个撤掉，它们也是账户自己的订单，挂单、撤单、对账单照常）；服务每 5 秒自己看一遍账本（挂单、止损、到期、资金费、强平），不用开着页面。Portfolio 的净值卡片在只有纸上账户时直接显示纸上账户：金额、自开户以来的盈亏、1D / 1W / 1M / All 曲线（从账本自己的成交和公开 K 线复原，之后服务每 5 分钟记一个点），真钱和纸上钱都有时卡片上一键切换，纸上的钱永远不算进净值。没有账户可接的人第一步就能开一个。真仓和模拟仓怎么分：票里一条横幅写 PAPER 或 REAL MONEY，旁边 Real money | Paper 一键翻转，签名按钮在纸上写 "Sign and place · PAPER"；顶部 All accounts 里有 Real money / Paper 两档整页切换；MCP 里 `venue: "paper"` 直指纸上账户。另有 **Hyperliquid · paper**：Hyperliquid 自己的测试网（钥匙文件：在 app.hyperliquid-testnet.xyz 批的 API 钱包；mock USDC 从它的水龙头领），真接口、假钱 | 两种都走同一扇门：同样的签名或 agent 额度、同样的 Guard / Beast；余额不算钱（不进净值、持仓、可用现金），订单是演练、不受 `--live-cap`；页面和 agent 处处标 Paper；测试网那条同样按 §1.6 查地方 |
| 只看 | Hyperliquid、Ondo、Robinhood Wallet（按地址） | 读 |

**地区：按每个用户自己所在的地方，不按开发者。** 账户启动后、之后每 30 分钟，自动替每个场所问一遍它对**这台机器的网络**怎么答（不带钥匙），再把它公布的居住地规矩对上这台机器此刻所在的地方：能接、不服务这里、只能平仓（Polymarket 对美国就是这样：照样接得上，能卖、能撤单，不能开新仓；美国人开新仓的地方是另一家交易所 Polymarket US，自己的账户、自己的钥匙，单独一张卡）、它的条款排除你所在的地方（只提示，不拦）、本机先要准备。连不了的，如果它有给你那里的另一个版本（Binance → Binance.US、OKX → OKX US、Polymarket → Polymarket US），而且那个版本从你的网络能接、它自己的话说它是为你那里做的，就标在旁边。同一个答案用在 Connect an account 的卡片、Markets 和下单票（只对会收你的场所给 "Connect to trade"），以及 agent（`portfolio_venues`；agent 请主人接一个不服务你这个网络的场所会直接被拒）。地方只在内存里用于这个判断，不保存、不返回、不写进拒绝；开发者那里被拒的场所（Binance、Bybit、Polymarket 开新仓、Hyperliquid 下单）照样接好了，在服务它们的地方就全有；每个用户都按他自己的网络算，开发者机器上的答案不进代码。**网络的回答也拦不住接**：场所不服务这个网络、或这会儿没答，Connect 照样能签，连接留在账户上等（Venues 里 "Waiting for the venue"，场所的原话），场所答之前什么都不往它发，换了网络 "Check again" 发现它答了就自动接上；拒的是钥匙或账户本身才是拒绝。IP 引起的另几种问题分开说，各用场所自己的话：钥匙绑了别的 IP（去场所把这台机器的地址加上）、场所前面的服务器拒绝这个网络、请求太多被封（等到它说的时间）。场所话里带着的 IP 不进日志和账本。账户从不提供绕过地区规矩的办法。

**Pre-IPO**：交易所上按一家未上市公司的估值定价的永续合约，不是股份。九个公开源不带钥匙读（OKX、Gate、Kraken Futures、Deribit、KuCoin Futures、MEXC、Binance、Bybit、Hyperliquid HIP-3；在不服务你的地方，那几家用它们的原话写在列表底下），一家公司一行，写各家隐含估值的中位数（Oura 的合约各家都按一股定价，按股数算）；接上其中一家的钥匙，就在同一行下单。Anthropic、OpenAI 都说未经同意的股权转让无效，原话跟着它们那一行走。

## 记忆

agent 记得的你放在账户里，不放在某一个 agent 程序里：换一个会话、重启、换一个程序拿同一个席位来接，它都读得回来；你在 Account › Memory 读每一个字，签名改、签名删（`account/memory.ts`，照 Demo v2 画布的 F13）。

- **一个 agent 一份**，分风格 · 规矩 · 场所和人三段，每条写着从哪来：**你说的**（你写的、你改过的）、**它学的**（agent 用自己的钥匙记的，带一句它怎么学到的，"从你的问题里"、"从你拒掉的那次"）、**来自额度**（你签的额度和模式，账户照它们此刻的样子写出来，不存，改它就是去改额度）。
- **三个开关**（都是你的签名）：让它记新东西（关了它只用现有的）· 它学到的先问我再记（新的一条先进 Waiting for you，✓ 才记下，之前哪个 agent 都不读它）· 别的 agent 也能读（关着只有它自己读）。
- **Export** 是一份 JSON；**Forget all** 删的是文件，没有回收站（开关留着）。

记忆是话，不是权限：额度、门、卡都不读它。钥匙、密钥、密码、助记词、IP 一律不收；忘了就是从文件里删掉，记忆的字从不进账本。agent 用 `portfolio_memory` 读，用 `portfolio_remember` / `portfolio_forget` 记它学到的。

## Desk：账户自己的 agent 团队

没有 agent 可接的人是大多数，就像没有钱包可接的人是大多数——纸上账户给后者，Desk 给前者。照「八个 agent 跑一个 desk」的套路做在账户里（`src/portfolio/account/desk.ts`）：

- **八个席位，各一份章程**（owns · good output · never）：Head of desk（从不交易，管漏斗、早晚报、日亏熔断）· Search（从 Markets 找线索）· Risk（清算：市场开着、有报价、价差、当日亏损余量、仓位大小）· Sniper（下入场单）· Exit（止盈 / 止损 / 时限，提前平）· Watch（盯危险：强平距离、资金费、事件收盘、场所不应答）· Flow 和 Sentiment（账户没有那两种数据，只能由你自己的 agent 来坐）。
- **章程变成额度**：每个席位都是 owner 签名放进来的一把 agent 钥匙（`approveAgent`），会交易的席位（Sniper · Exit · Watch）拿 owner 签的交易额度（`approveSpend`），不该交易的席位没有额度——门拒绝它们下单，不管它们"想"什么。Guard 下每一单还是一张卡；Beast 下在额度内直接走。
- **一个房间，一个目标**：你的一句话 + 一个场所（推荐先用纸上账户）+ 范围 + 本周目标 % + 每笔最多占权益 % + 当日亏损熔断 % + 会话几小时 + 几分钟一轮 + 晚报几点（纽约时间）。房间里每条消息带线索号 `L-0047`，各席位能互相核对；漏斗 scanned → cleared → confirmed → placed → executed → closed（placed 是场所收下了入场单，executed 是它成交了；一张盘前盘后的当日限价单、一个场所先答"收到"后成交的市价单，在两者之间；等你批的卡是 confirmed 减 placed）。
- **每一轮**：先按计划处理在手的线索（止盈 / 止损 / 时限自动平，Exit 可以提前平），Search 读账户自己的 Markets 列表找线索，Risk 先跑硬检查再问脑子，Sniper 通过 `agentLiveOrder` 下单，Head 写一行。21:00 晚报、周日周评、日亏到线就熔断到纽约次日、会话到点就结束——都在房间里。
- **脑子（Brains）**：房里的席位用哪个模型想，在 **Brains** 里选——一处接所有模型 API，十四个预设分三组：**Model APIs**（OpenAI · DeepSeek · Grok · xAI API · Muse · Meta Model API · Claude · Kimi · Qwen · OpenRouter · Gemini · Groq · Together）、**On this machine**（Ollama · vLLM）、**Custom**。每家一张卡：名字、种类和它现在的样子（Ready · key …ab12、No key、Key refused；本机的两家写 Local · ready、Local · needs a model（只差模型名）或 Local · not ready）。**每家要什么**：Claude 要一把 Anthropic 的钥匙，模型从它的三个里选；其余十三家都是 OpenAI 的 chat completions 格式，要一把钥匙和一个模型名，Qwen 和 Custom 还要你填 base URL（Qwen 的是你 workspace 自己的地址），本机的 Ollama 不要钥匙，vLLM 只在起的时候带了 `--api-key` 才要。预设填好 base URL，各家的差别脑子自己处理（DeepSeek 只收 `json_object`，提示里带 "json"；Muse 从不发 effort "none"；接口回 400 就换它点名的字段再问，最多三次）。**effort 只在各家文档说清了的地方给**：OpenAI、Muse、Claude 三档（low / medium / high），DeepSeek 两档（low、high；desk 的 medium 对它不发）；其余十家一个 `reasoning_effort` 都不发，用那一家自己的默认，Brains 上也不给这个选项。几家可以同时有钥匙，想的是雇的那一家；雇的那家没钥匙就直说，从不悄悄换一家花你的钱。模型名是**建议**：写着从哪一页、哪一天读的（2026-10-15），从不说是全的，你可以填那家认的任何名字；价格是你自己填的，没填就只计 token、页面标 "unpriced"。Brains 从三处打开，是同一个地方：Superagent 顶栏的 **Brain ›**、启动面板的脑子那一步、Agents 页的 **Brain…**；换脑子是一个签名（`setDesk brain`）。
- **直接粘贴一把钥匙，账户认出是谁家的**（`account/brain-detect.ts`、`ui/brains.js` 的 `brConnect`）：Superagent 上有一格 **Paste an API key**——顶栏 **Brain** 按钮（带框，写着 **Change ›**；脑子不能用时是琥珀色的 **Connect a key ›**，顶栏下面还有一条 **Next: connect a brain** 和一个 **Connect a brain** 按钮，图表旁边的 Now 也写着 "No AI brain" 和同一个按钮）打开的 Brains 最上面一行；还没雇 Desk 时，启动面板清单的「2 · A brain key」里也有一格——任何一家的钥匙粘进去按 **Connect**，不用选是哪一家。账户先按钥匙的样子认（2026-10-21 从各家文档和 gitleaks、TruffleHog、GitHub 的密钥扫描规则读的）：`sk-ant-` 是 Anthropic，`sk-proj-` / `sk-svcacct-`（或中间带 OpenAI 记号的老钥匙）是 OpenAI，`sk-or-` OpenRouter，`xai-` xAI，`gsk_` Groq，`AIza` / `AQ.` Google Gemini，`LLM_` Meta，`tgp_v1_` Together；别的 `sk-` 钥匙（DeepSeek、Kimi、阿里老钥匙都长这样）按 DeepSeek → Kimi → OpenAI 的顺序真去问，哪家收下就停——问过的每一家都看得到这把钥匙，格子下面在你按 Connect 之前就写着；只有被拒才问下一家，有一家连不上或答了别的就停在那里，不把钥匙送给下一家。每一家都在它自己的地址问一次**不计费的模型列表**（OpenRouter 的列表人人能读，所以先问它的 `/key`；xAI 先问 `/v1/api-key`，新钥匙的访问列表是空的就直说）。收下之后从那一家给这把钥匙列的模型里挑最好的（各家推荐的旗舰在前：Claude Opus 5.5、gpt-6-astra、grok-4.7、gemini-4-argon、kimi-k3……；Claude 只从 Desk 的三个模型里挑），再问你一句 **"Connect <那一家>?"**：哪一家、哪个模型（为什么是它、价格）、钥匙的末四位和指纹、Desk 换成它——钥匙不在里面；按 **Sign and connect** 才签，签的是和手填一模一样的 `setBrainKey`（钥匙跟着签名送到 `POST /api/account/brain-key`：同一个文件、同一扇门、同样拒示例钥匙）和 `setDesk brain`（还没雇时是把那一家和模型填进启动面板，Start 时一起签）。钥匙经本机回环送两次——认的那一次（`POST /api/account/brain-detect`：什么都不写、不签，同一时间只认一把）和存的那一次——此外不进页面存储、账本、房间和日志。结果写在格子下面：哪一家、哪个模型、钥匙末四位，和 **Replace key** / **Remove key**。不成的时候用平白的英文说为什么：不认识的钥匙；示例（`sk-ant-...`）、星号遮住的钥匙；钱包的私钥（64 位十六进制）或助记词（从不发出去，页面上就拦下）；管账户、不跑模型的钥匙（`sk-ant-admin`、`sk-admin-`、OpenRouter 的 management key）；Claude 订阅的登录 token（`sk-ant-oat`，Anthropic 的条款不许别的应用用）；阿里 Model Studio 的 `sk-sp-` 钥匙（地址是你自己 workspace 的，要到 Qwen 那张卡上填）；Perplexity（2026-09-27 起不再支持脑子说的格式）；别家服务的密钥；那一家拒了（401、403，xAI 和 Gemini 是 400，带它自己的原话和可能的原因）；连不上或超时；收下了但没有 Desk 能用的模型。替身加 `--providers` 时，各家的模型列表对含 "standin" 的钥匙作答，可以一路点到底。
- **钥匙在页面上填**（`account/brain-keys.ts`）：选一家，把钥匙粘进那一格，按 **Save the key**。那一格是画成圆点的文本框（`type="text"` 加 `-webkit-text-security: disc`；画不了圆点的浏览器把它换成密码框，从不露出钥匙）——不用密码框，是因为浏览器会提出把它当成 127.0.0.1 的密码存进自己的密码库、再同步出去；它不自动填、不拼写检查，也不在页面任何会做成草稿的表单里。浏览器先算钥匙的指纹（加盐的 SHA-256），然后在签名之前问你一句 **"Save the <那一家> key?"**：摆出要签的四样——Provider、Base URL、Model、Key fingerprint——钥匙不是其中之一，再写明钥匙只送到本机的账户、之后只发给那一家的主机；按 **Sign and save** 才签，按 Cancel 什么都不发，连指纹都不发。你签的是 `setBrainKey`——哪一家、base URL、模型和指纹，从来不是钥匙；钥匙只跟着这一个签名，经本机回环送一次到 `POST /api/account/brain-key`，先对上你签的指纹，再过同一扇门（签名、owner、nonce、十分钟），写进 `~/.openpaper/credentials/brains/<家>.json`（只有你可读，文件夹也只有你能开，原子写入，遇到链接就拒）。它不进账本、房间、desk.json、日志、任何答复、页面存储和缓存；之后只发给那一家自己的 base URL。答复只给你看末四位（"…ab12"）和指纹，输入框随即清空。**钥匙从不进模型那一格，也不进 base URL**：模型名长得像钥匙（`sk-…`、`sk-or-…`、`xai-…`、`gsk_…`、`AIza…`、一长串十六进制或随机字符——`keyShaped`，页面、`/prepare`、钥匙的路由、门和 Test 用的是同一个检查），base URL 的主机或路径里有像钥匙的东西（主机按你打的样子一段一段地查，大小写不变——Qwen 的 workspace id 就写在主机里，钥匙粘到那里会在 DNS 查询和 TLS 握手里明着发出去；路径里只有一段 32–39 位十六进制的，是 Cloudflare 的账户 id，不算钥匙，`https://api.cloudflare.com/client/v4/accounts/<账户 id>/ai/v1` 这样的地址照收），或者钥匙那一格里的钥匙（或它 8 个字符以上的一段）也出现在模型或 base URL 里，都在签名和过门之前被拒，拒的话从不重复那个值，说到那个主机时只说 "another address"——不然它会被签进账本（账本是哈希链，写进去就擦不掉）、写进房间、当成模型名发给别家；换脑子（`setDesk brain`、雇佣表单、resume 带的脑子）也一样：脑子必须是一个对象，里面每一个字段名和值、多深都查。Desk 自己的话——名字、目标那一句、席位的章程——带着自报家门的钥匙（`sk-…`、`gsk_…`、`AIza…`、密钥块、JWT）也在门前拒（`0x` 地址和交易哈希照收）；指令里多出一个不签的字段，拒的话只在它是普通的名字时才说出名字。那一家回的话（拒绝、错误、模型自己说的拒答）写到页面和房间之前都抹过：整把钥匙、它 8 个字符以上的任何一段、Bearer 后面的东西、像钥匙的词，都换成 "…"。存好之后 Desk 马上知道（`Desk.keyChanged`）：旧钥匙被拒的那条「Key refused」当场撤掉，答复、Brains 的卡、Superagent 顶栏说的是同一个样子，不用等下一轮；房间记一句，只带指纹。环境变量压过文件时，Desk 用的还是那个变量的钥匙，被拒就还是被拒，房间也这么说。**Test the saved key**（本机的 Ollama、vLLM 上叫 **Test it**）问那一家的模型列表（不计费），用那家自己的话回答；同一家同一个模型同时问两次只发一次。它不要签名（什么都不改、不花钱），和每条路由一样挡在来源守卫后面，还要浏览器自己的头——但这不是认证：本机的程序带上那个头也能问，得到的只是那份模型列表和抹过钥匙的话。**Use this brain** 一个签名让 Desk 用它，**Remove the key** 拿掉它——没有新文件可拿时账本写 "nothing to take away"，旧文件还在读的话也写明。http 的 base URL 只给本机（Ollama、vLLM）；OpenAI 格式的接口回重定向时不跟，直说它重定向了、该把哪个地址填成 base URL。**本机的 Ollama、vLLM 不用文件**：不放文件就按默认地址（`http://localhost:11434/v1`、`http://localhost:8000/v1`）、不带钥匙去问，选它当脑子时写上模型名就能用——卡上是 Local · not ready 只因为还没有模型名，Use this brain 和启动面板写的是 "ready with <模型> once you sign"；文件只在换地址、写死一个模型，或你的服务器起的时候带了钥匙时才要。换地址不用编一把钥匙：写上新地址和模型名，钥匙那一格空着按 Save（它已经存着一把钥匙时，要么把那把再粘一次，要么先 Remove the key），问的是 **"Save the Ollama address?"**（Provider · Base URL · Model · Key: none），签的 `setBrainKey` 指纹为空，账户只写地址和模型，回 `{keyless: true}`，之后 Desk 的问题发到那个地址、不带钥匙（说的是那个主机，只有本机的回环才叫 "this machine"）。这是全账户唯一一处从页面收钥匙的地方，别的钥匙照旧是你写文件、页面只说文件在哪。
- **旧的钥匙文件照旧读**：新文件还不在时，Claude 读 `credentials/anthropic/api-key.json`，OpenAI 读 `credentials/openai/api-key.json`——以前放在那里的钥匙什么都不用做照样用；页面写的是新文件，新文件在了就读新的。手动起服务时，环境里的 `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`）、`OPENAI_API_KEY`（和 `OPENAI_BASE_URL`、`OPENAI_MODEL`）照旧优先于文件，改了要重启；在页面上填了钥匙也照写文件，答复会说是环境变量在起作用（`envWins`）。**网关的环境不算 Anthropic 的钥匙**：Claude Code 接 OpenRouter、DeepSeek、Kimi 这类网关的写法是 `ANTHROPIC_BASE_URL=<网关>` 加上那个网关的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`——那是网关的钥匙。`ANTHROPIC_BASE_URL` 指向 `https://api.anthropic.com` 以外的地方时，Claude 这个脑子两个变量都不用、不建客户端、什么都不发，说「不能用」，修法写明是哪个主机、把两个都去掉再重启（之后读你在 Brains 里存的文件）。这时变量不是"压过"文件，是**挡住**了文件：Brains 上 Claude 那张卡写 **Blocked by the environment**，表单写 "<变量> is set where the account runs and blocks a saved key: unset it and ANTHROPIC_BASE_URL, then restart."，在那里存钥匙的答复带的是 `envBlocks`，不是 `envWins`。装好的 LaunchAgent 不带这些变量。不读命令行登录的 profile：账户看不见的钥匙不承诺。脑子不能用时页面给一块「怎么修」：一句话、钥匙文件的绝对路径（带 Copy）、一条照抄就能跑的命令（带 Copy；没有文件时它建好空模板 `{"apiKey": ""}`、只让你读、用编辑器打开；命令里从来没有要先替换的示例值），和要不要重启（只有环境变量那条要）。空模板和旧的示例值都不算钥匙；API 拒了的钥匙（形状对、被拒）从那一次调用起算「不能用」，房间说一次，下一次有回答的调用就恢复——在 Brains 里存了新钥匙就不等回答，当场恢复。没有钥匙时 desk 照样雇得了，但房间会说它没法想，不编线索。花了多少按 API 返回的 token 数和你的价格算，页面上写着「about $x」。
- **Muse、Grok Bot、Instinct**（Brains 里一段直话，2026-10-15 查的）：这三个是个人 agent，没有一个程序能调的 API——Meta 的 Muse 只能反过来接别人的服务（Muse Connector Platform，要 Meta 审核）；xAI 的 Grok Bot（2026-08-11 beta）的文档没有写任何 API、webhook 或 MCP 入口，grok.com（Grok 的聊天产品）能加自定义的 MCP connector，但要公网地址、拒 localhost，而 xAI 的文档没说这些 connector 到不到得了 Grok Bot；Instinct，不论是 Spear Street 的助理，还是 instinct.xyz 的交易 agent app（2026-10-14 才上线，排队中，文档写着 "coming soon"），都还没有接入的路。所以这里一个都没接，也不装作接了。能接的是它们背后的模型：Muse 的模型走 Meta Model API（`https://api.meta.ai/v1`，美国公开预览），Grok 的模型走 xAI API（`https://api.x.ai/v1`），都在上面的 Model APIs 里。反过来的那条路——让这些 agent 通过一个公网的 MCP connector 接进账户——2026-10-15 决定不做，这里没有它（真要做，账户签的是真钱，得有一条通到本机的隧道和一道只读或要批的边界）。
- **实时界面**（照一段 perps bot 的直播画面做的）：LIVE 计时 / 会话时长、权益和曲线、到目标的进度条、每条在手线索一张实时卡（入场、现价、TP / SL、未实现）、Trade tape（一笔一根柱）、Big closes（最大的五笔）、房间、名单、脑子的花费。
- **接口留着**：任何席位都可以换成你自己的 agent（MCP 席位、任何签名的钥匙）——它用 `portfolio_desk` 读自己的章程和房间，用 `portfolio_desk_say` 在房里说话，下单还是 `portfolio_live_order`。Flow 和 Sentiment 只能这样来。怎么用见 [COOKBOOK](../COOKBOOK.md) 第 3b 条。

**Superagent：Desk 在纸上账户上自己交易**（Trade 的 Superagent 模式，`#/trade?mode=superagent`，`ui/superagent.js`，图表是 Regular 的 `ui/chart.js`）。同一个 Desk、同样八个席位，多一个 owner 签的词：纸上自主（`setDesk autonomy {paper: true}`）——开着时，这个 Desk 自己的房里席位在它的纸上账户下单不再变成等你批的卡，直接下，仍在每个席位的交易额度以内；场所不是纸上账户时账户拒绝，场所不再是纸上账户时自动关掉；外来 agent、别的场所、超额度的单照旧。页面从上到下：顶栏照 Hyperliquid 市场栏的写法——Desk 的名字、PAPER、它的纸上账户、会话的状态和计时，然后四个「小字标签在上、数在下」的读数 **Equity · Target · Next cycle · Brain**（权益和自会话开始的涨跌、本周目标和进度、下一轮倒计时、哪个脑子和它的调用次数与花费——有调用什么都没拿回来时加一段 "N not answered"：拒了钥匙、限流、连不上，账户分不出是哪一种，所以只说没回答，不说"拒了"；它是一个带框的按钮，右上写着 **Change ›**，打开 Brains，换脑子一个签名；脑子不能用时框和字变琥珀色、写一个短词（Not ready、Key refused……）和 **Connect a key ›**），名字那一行最后是 **How it works**（一张说明：纸上账户、脑子、每一轮怎么走和硬检查、Autonomy、几个控制、怎么看、鲨鱼），右边是你的控制：Pause / Resume · Cycle now · Autonomy（Cards | Auto on paper）· End，指上去各说一句自己做什么；会话结束后是 "Start again"，场所是纸上账户时写 "Start again · auto on paper"——一个签名重开会话、同时开纸上自主；顶栏下面一条**下一步**：脑子不能用时是 "Next: connect a brain"，否则是三行的 "How to use it"（按 Got it 收起，这个浏览器记得）；然后是**一大张 K 线图**（宽屏上占一行的大半，高是屏幕的 58%、380–620px；手机上整宽），画 Desk 手上那个市场（开着的线索的，否则最新线索的，否则上一轮扫描排第一的；一笔都还没有时，账户自己的纸上账户上画 BTC，股票的 Desk 画 SPY，写着 "no lead yet"；别的场所不猜），手上不止一个市场时图上方各一个按钮，点了看那个，**Follow the desk** 回去。**它的每一笔买卖都落在图上**：入场是那根 K 线、那个价上一个点和一块字（"BUY 0.002 BTC · 61,706.4"，买绿卖红，字在点下面），出场是一个点和一块墨色的字（"SOLD · take-profit · +$1.50"，在点上面），同一笔线索的入场和出场连一条虚线；手上的线索画入场、止盈、止损三条横线；只有最新三笔写字，更早的是点，指上去看字。**它做的每一步都演出来**：图的上方落下一条横幅，一步一条、按发生的顺序——"Search picked DOGE long · confidence 71%"、"Risk cleared …"（仓位、止盈止损、时限）、"Risk turned down …"（和为什么）、"Sniper buys …"、"Bought 0.002 BTC at …"（止盈止损价）、"Closed SOL · take-profit · +$1.50"、"Halted for the day"——买绿底，卖和亏红底，平和拒墨色，等你批的琥珀色，左边是做这一步的席位的脸；成交的点同时落在图上、外面一圈脉冲，止盈止损线从左画过来，平仓的点旁边浮起盈亏。图右边一栏：**Now**（一句大字说它此刻在干什么——"Search is scanning the venue's markets"、"Exit is watching 1 lead"、"Waiting for the next cycle"——右上第几轮、下一轮倒计时，下面一行是手上线索的浮盈和止盈止损价；做不了事时说为什么：No AI brain（账户自己的原因和 **Connect a brain**）、Paused、Halted、Session ended、No session、Not read since…）；**席位的流水线**（Search → Risk → Sniper → Exit 四张脸，各带本会话的数：看了几个市场、清了几个拒了几个、下了几单、平了几单；正在做的那个亮着、跳着，它刚说的话冒个气泡；眼下那笔线索是一枚小牌子，从一格滑到下一格，被拒的划掉，等你批的琥珀色）；**What it did**（一步一行、新的在上：买了、卖了、平了——哪里、为什么、赚亏多少——被拒和为什么、账户拒了、等你批、熔断，各带时间和哪个席位；刚发生的那行亮着落进来）。图下面是**持仓表**（Hyperliquid 的样子：市场、方向、数量、入场、现价、PNL、止盈、止损、开仓时间、状态；上面写今天平了几笔、赚亏多少）；最下面一块面板、四个 tab，一次只看一个（这个浏览器记得上次看的，方向键切换）：**Equity**（权益曲线，每笔平仓一根柱）· **Seats**（八张角色卡：席位状态、它最新一句话打字出现、它的一个真数字）· **Room**（房间）· **Rules**（规则和流水线：硬检查的真数字，正在做的那一步亮着）。每秒读一次 `GET /api/account/desk/feed?since=<seq>`。

**第一次用 Superagent**：Trade 顶栏按 Superagent，没雇过 Desk 时是启动面板，最上面一张三步的清单，从账户实时读、做完一步打一个 ✓：① **一个纸上账户**（没有就按 "Open a paper account"，起名、写一笔纸上美元，什么都不用接）；② **一个脑子**（打开 Brains，选一家，把钥匙粘进去按 Save the key，回答那一句 "Save the <那一家> key?" 按 Sign and save；还不能用的每一家旁边一个 **Type its key ›**，本机的 Ollama、vLLM 写 **Set it up ›**——它们不用钥匙，选它时写上模型名就行；钥匙写进 `~/.openpaper/credentials/brains/<家>.json`，不用重启；也可以自己写那个文件，旧的 `credentials/anthropic/api-key.json` 照旧读；没放好时清单下面是服务给的「怎么修」：一句话、文件的绝对路径和一条照抄就能跑的命令，各带 Copy）；③ **Start**：写一句它这周要做什么，按 **"Start the superagent"**，依次签：放每个房里席位进来、给交易席位额度、雇 Desk、开纸上自主（"What Start signs" 里逐条列着）。表单的每个数在 `catalog.bounds` 的范围外就用字拒，不悄悄改成别的数。第一轮在雇好几秒后（`FIRST_CYCLE_MS`），时钟的下一跳不会抢在它前面；雇的那一个签名里也可以直接带上纸上自主（`setDesk hire` 的值里 `autonomy: {paper: true}`，只在纸上账户收），这样从第一刻起它就是自主的。自主关着时（Cards），它清过的线索在 Guard 下变成等你批的卡，图表上面一条 **Waits for you** 把这些卡列出来，就地批或拒。脑子的调用按次花你的钥匙的钱；开始是你按的。

## 给 agent 的接口

- **MCP**：`npm run portfolio:mcp`（stdio；席位持自己的钥匙，每次写都签名）。接 Claude Code：Agents 页的 "Copy setup command"。真实账户上的工具：
  - 读：`portfolio_account` · `portfolio_venues`（从用户所在的网络自动判断哪些场所能接，各用场所自己的话）· `portfolio_overview` · `portfolio_holdings` · `portfolio_history` · `portfolio_asset` · `portfolio_candles` · `portfolio_book` · `portfolio_financials`（一家美股公司在 SEC 的档案：是谁、财年、注册地、最新年报季报和最近十份申报，加上它申报的财务数字）· `portfolio_explore` · `portfolio_receive` · `portfolio_earn` · `portfolio_watchlist` · `portfolio_statement`
  - 下单和动钱：`portfolio_live_markets` · `portfolio_live_compare` · `portfolio_live_positions` · `portfolio_live_preview` · `portfolio_live_order` · `portfolio_live_batch` · `portfolio_live_amend` · `portfolio_live_cancel` · `portfolio_live_close` · `portfolio_live_leverage` · `portfolio_live_move` · `portfolio_live_earn` · `portfolio_pay`
  - 纸上交易：开一个 Paper account（什么都不用接；`live:paper`，可以开多个；美股、crypto、RWA、预测市场都能练，永续能设杠杆）或接上 "Hyperliquid · paper"（它的测试网）后，`portfolio_account` 里那家标 `paper: true`，同一套下单工具（`portfolio_live_markets`、`portfolio_live_order`——含 `trailing_stop` 和 `takeProfit` / `stopLoss`——、`portfolio_live_leverage`、`portfolio_live_positions`、`portfolio_history {paper: true}`……）在它上面演练——纸上账户按账户自己声明的规则成交，测试网真的发到测试网，都不是真钱；门一样（额度、Guard / Beast），只是不受 `--live-cap`；比价不比它；答复里的订单和持仓带 `paper: true`
  - 和 owner 说话、等结果：`portfolio_report` · `portfolio_ask` · `portfolio_approval` · `portfolio_wait`
  - 记忆（账户替 agent 记着，换会话、重启都在）：`portfolio_memory`（读：它记得的你、等你答的、来自额度的、别的 agent 分享的、你的开关）· `portfolio_remember` · `portfolio_forget`（它学到的，用它的钥匙签）
  - Desk（账户自己的 agent 团队，见下面「Desk」）：`portfolio_desk`（读：这把钥匙在 desk 上的席位和章程、目标、漏斗、房间最近几行）· `portfolio_desk_say`（在房间里说一句，用它的钥匙签：只是话，不是权限）
  - 回测（见 [account.md](account.md) 的「回测」）：`portfolio_backtest`（一个策略在录下的 K 线上用纸上账户的规则跑一遍，旁边是买入持有；只能跑在留出期之前，每一次都记进试验台账，带上这个席位；回答里有 Sharpe 按试过的策略数 deflate 之后的概率和 PBO）· `portfolio_backtests`（读：留出期、台账和它的哈希链、最近的回测；给 `id` 读一次回测的全部成交和曲线）
  - 只在模拟对账单（`--classic`）和测试里：`portfolio_read` · `portfolio_markets` · `portfolio_quote` · `portfolio_openness` · `portfolio_execute` · `portfolio_order` · `portfolio_transfer`
- **HTTP**：只读接口 `GET /api/account/...`，只听 127.0.0.1；表在 [docs/account.md](account.md)。
- **给做 Agent 模块的团队**：[COOKBOOK](../COOKBOOK.md) 的「11b · Agent 模块接口」。

## 诚实边界

- Account 的真实连接和真钱写入只对着替身测过：这里没有用过一把真钥匙、一个真钱包。接你自己的账户之前先用只读钥匙；要写，先用小上限、小金额。
- 真的读过的，是不带钥匙的公开数据：交易所行情、Kalshi、Polymarket、Polymarket US 的公开 gateway、pre-IPO 价格、LI.FI 报价。
- Pre-IPO 是估值合约，不是股份；各家谁能交易由它们自己定，账户只转述。
- 本机文件系统是信任边界：能写 home 的人能改账本和钥匙文件；同一系统用户下的 agent 席位之间不隔离，记忆文件也一样（MCP 席位只读它该读的，「别的 agent 也能读」关着时不读别人的，是约定，不是墙）。
- 记忆挡钥匙、密钥、助记词、IP 靠的是一组模式，换个写法的秘密它认不出；agent 自己写的话账户不审，只保证它们不变成权限。
- Brains 挡钥匙进模型那一格、进 base URL、进 Desk 的话，靠的也是形状（`keyShaped`、`prefixedKey`）：不到 32 个字符、又没有认得的前缀的钥匙（比如一串 24 位的字母数字）粘进模型那一格认不出，钥匙那一格同时填着同一把钥匙时才抓得住；Desk 的话里只拦自报家门的钥匙，好让 `0x` 地址和交易哈希过。页面上填的钥匙落地是 `credentials/brains/<家>.json`，同一个系统用户下的程序都读得到，和别的钥匙文件一样。
- **Paste an API key 认钥匙靠的是形状加一次真调用**：形状是 2026-10-21 读的，各家会改；DeepSeek、Kimi 的钥匙形状各家文档没写，所以普通的 `sk-` 钥匙会依次给几家看到；Together 的新前缀只在公开代码里见过；Google 新的 `AQ.` 钥匙在 2026 年 10 月被它自己的模型列表拒（Google 还没修），这时连不上的话照实说；xAI 只在访问列表是空的时候拦，列表里有东西就交给模型列表去说。挑的「最好的模型」也是当天读的各家推荐，模型会换：挑的那个写在签名之前的那句话里，不想要就换。
- 场所的地区规则是场所的，这里只表现为一扇关着的门，不提供绕过的办法。
- 托管、牌照、出了错谁赔，不是软件，这里没有。

## 更早的模拟演示

| 命令 | 是什么 |
|---|---|
| `npm run demo` | 十一个场景：agent 走进四个模拟市场，每笔写都停在一张卡上（`--live --hold` 打开控制台 :4800） |
| `npm run wallet` | 智能 agent 钱包骨架（:4810） |
| `npm run account -- --classic` | 原来的模拟对账单：拆单、跨链报价、预测市场；`npm run portfolio:demo` 无头跑它的十个 beat |

## 网站

公开介绍页：[linqizhe07.github.io/openpaper](https://linqizhe07.github.io/openpaper/)（源码在 `site/`，GitHub Pages，推到 main 自动发布）。页上的数字由 `npm run site:numbers` 从仓库算出来写进 `site/data/numbers.json`，过期时 `test/unit/site-numbers.test.ts` 失败、发布停下；行情由访客自己的浏览器直接从 Hyperliquid、Kraken、Coinbase、OKX、Polymarket 的公开接口读，读不到的不画；截图来自替身账户，图下写明。本地预览 `npm run site`（http://127.0.0.1:4870/buyer-agent-demo/）。

## 文档

- [COOKBOOK.md](../COOKBOOK.md)：每件事怎么做、会看到什么、什么会被拒；能直接跑的示例在 `examples/account/`。
- [docs/account.md](account.md)：Account 的全部细节：三层协议、每个场所的接法、下单动钱 Earn 的规矩、RWA、永续、Pre-IPO、页面和接口表、MCP 工具表、审阅留下的、这一层的诚实边界、代码地图。
- [docs/earlier-demos.md](earlier-demos.md)：十一个场景、插件合同、钱包骨架、模拟对账单、整个仓库的诚实边界、回灌 Kairos、目录。

## 目录

```
src/portfolio/    Account（:4820）：account/ 签名的门与账本 · live/ 真实连接 · public/ 页面 · mcp.ts agent 面
src/wallet/       智能 agent 钱包骨架（:4810）
src/agent/ src/contract/ src/venues/ src/plugins/ src/runner/ src/control-room/   十一个场景的演示
test/             unit · attack（攻击复现，必须失败）· standin（替身账户）· e2e
docs/             细节
site/             公开介绍页（GitHub Pages）；scripts/ 它的数字和本地预览
```

## 许可

Apache-2.0（仓库根目录的 [LICENSE](../LICENSE)），版权 2026 Linqi Zhe：可以用、改、再分发，包括放进你卖的东西里，只要许可证和声明跟着走；不提供任何担保。要贡献先读 [CONTRIBUTING.md](../CONTRIBUTING.md)；安全问题按 [SECURITY.md](../SECURITY.md) 私下报，不要开公开的 issue。
