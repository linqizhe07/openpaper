/* THE SUPERAGENT (#/trade?mode=superagent; the older #/superagent lands there too): Trade's second mode, beside Regular, switched in one
   click from the top bar's Regular · Superagent (account.html #trade-mode, shell.js). In Regular you place your own orders; here the
   account's own desk (account/desk.ts, drawn as cards on the Agents pane by ui/desk.js) trades a PAPER account by itself, and the page
   shows what it does on the market it trades. It is the same desk, with the same eight seats — Head, Search,
   Risk, Sniper, Exit and Watch from the house, Flow and Sentiment open to an agent of the owner's own — plus one word the owner signs:
   autonomy on paper (setDesk autonomy {paper: true}). With it on, the desk's own seats place their orders at its paper account at once,
   each inside its seat's trading limit, instead of waiting for the owner on a card. Paper money only: the account refuses autonomy at a
   venue that is not a paper account, and turns it off when the desk's venue stops being one.

   NOTHING ON THIS PAGE IS MADE UP. Every figure is the desk's own record or a market's real read; every banner, every chip passed along the
   seats' line and every mark that lands on the chart is a step a lead really took; every speech bubble is a line the room really holds. An
   empty seat says why; a brain that cannot think says its own reason and where its key goes; a part with nothing to show says so in words
   instead of drawing something. What moves without data (a seat's face breathing, its blink) is decoration, and nothing on the page dresses
   it as a number. The desk's room speaks its own protocol ("LEAD L-0006 | AVAX/USD | long | … → RISK"): the page says each line in plain
   English where a person reads it (sgPlain), built from the lead's own record where there is one, the brain's own words kept as they are,
   and the line as written one pointer away (its title); the room itself is never rewritten.

   What it reads, and how often — only while this pane shows and the page is in view. The beat stops by itself otherwise, and starts again
   when the pane is drawn or the page comes back:
     GET /api/account/desk/feed?since=<seq>   every second: the room's lines after the last one seen, who is working and the brain calls
                                              under way, the last scan, the autonomy, the session, the equity's last points, the target,
                                              the funnel, the day, the last leads, the next cycle, the brain's standing and spend
     GET /api/account/desk                    every five seconds: the objective, the seats with their standing at the door and their
                                              limits, the full equity curve, the tape of closes, the open leads with their fees
     GET /api/account/desk/catalog            kept half a minute: the roles and their charters, the house seats' keys, the brains
     GET /api/account/quotes                  the open leads' prices every five seconds: the balance's live point, summed as the desk sums
                                              it at each cycle (start + realised + each open lead's side × (mark − entry) × qty)
   and the chart (ui/chart.js) reads its own bars and live price for the market it shows.

   WHAT HAPPENED, PLAYED AS IT HAPPENS. Each read is compared with the one before (sgDiff): the leads' own states decide the events — a lead
   that went from scanned to cleared is a handoff from Search to Risk, one that went to rejected was turned down, an entry that appeared is a
   fill, a close that came is an exit — each placed just after the room line that speaks of it, in the order they happened. sgPlay plays
   them on the page: a banner over the chart says each step in a line, one after another (Search picked, Risk cleared or turned down, the
   Sniper's order and its fill, the Exit's close and its result, a halt); the lead's chip moves along the seats' line under "Now" (Search →
   Risk → Sniper → Exit), struck through where it was turned down; the seat at work breathes in front of its name, its brain call drawn as
   three dots, its latest line in a bubble over it; an entry filled lands on the chart as a dot with its words, the plan's take-profit and
   stop drawing across, and a close lands with its result floating up beside it (chMarks, chLines: `fresh`); the new rows of "What it did"
   slide in at its top. A read that comes after a gap (the pane put aside, the page hidden), or the first one, draws what is now and plays
   nothing.

   THE PAGE, top to bottom: a header in the grammar of Hyperliquid's market bar (the desk, PAPER, its venue, the session's state and clock,
   and "How it works" — a sheet of what the desk is and does, sgHow; Equity, Target, Next cycle and the Brain as label-over-value stats — the
   Brain always a button, and drawn as one: edged, "Change ›" written on it, in amber "Connect a key ›" while it cannot think — that opens
   the Brains sheet (ui/brains.js): at its top one field to paste ANY provider's key ("Paste an API key", Connect — the account tells whose
   it is, checks it with that provider and switches the desk to its best model, after the owner's yes and signatures; in focus while the
   brain cannot think), then every provider the account offers, a key typed once, the model, Test, and "Use this brain", one signature;
   the owner's controls, each saying what it does where it is pointed at — Pause or Resume, Cycle now, Autonomy Cards | Auto on paper,
   End; an ended session's "Start again · auto on paper", ONE signature: setDesk resume carrying the autonomy, so the new session's first
   cycle already has it); the next step, only while there is one (sgNextHtml: "Connect a brain" while it cannot think, else "How to use
   it" in three lines until "Got it" puts it away in this browser); the "Waits for you" strip, only while a card of the desk's waits (each
   with Reject and Approve, the same signature the Agents pane asks); then THE CHART and beside it what the desk is doing: the market it
   trades — its open lead's, else its newest lead's, else the last scan's top pick, else (no lead yet) the market a desk of its kind trades
   first — as Regular draws it (ui/chart.js), its leads drawn on it: each entry and each exit a dot at its bar and price with its words,
   an entry and its exit joined, an open lead's entry, take-profit and stop as lines across; the other markets the desk holds one press
   away over it. Beside it "Now" (what the desk is doing in one sentence, its cycle and the next, or why it cannot: no brain, paused,
   halted, ended — with the way out), the seats' line (Search → Risk → Sniper → Exit, each with its count this session) and "What it did":
   one row a step that mattered — bought, sold, closed with its result and why, turned down and why, waiting for you, halted — newest
   first. Under them the open positions; then one panel of tabs, one showing at a time and the one picked last kept in this browser
   (SG_TABS): Equity (the desk's equity curve, its closes as bars, the big figure rolling), Seats (eight role cards: each seat's standing,
   its duty, its latest line typed out as it lands, its one real number), Room (the room's stream), Rules (the real numbers the hard checks
   use and the pipeline lit where the desk is working).
   NO DESK YET: what each mode is in one sentence, then — two columns on a wide pane, one on a narrow one — the steps (the form) beside a
   checklist read live from the first view (a paper account, a brain key: pasted right there, any provider's — the Brains sheet's own paste
   row, outside the form, its provider and best model put into the form once the owner signs (sgConnectAct); once a key is in, its masked
   tail and "Replace or remove the key ›" — or typed in the Brains sheet from "3 · The brain", or the key file the account names, with Copy
   — never a command composed here, never a sample key — and Start) and what the superagent is (its eight
   seats, each with its duty). What is typed in the form survives the form being drawn again when a key saved meanwhile flips a brain to
   ready (core formKeep). "Start the superagent"
   signs in order: approveAgent for each house seat, approveSpend for each seat that trades, setDesk hire, setDesk autonomy {paper: true}
   (sgSetupSteps). The owner starts it: the brain's calls cost money. While the owner signs, the frame on screen is held (SG.signing): the
   feed's beat finds the desk hired before the last step is answered, and the form must stay to say that answer; a refusal after the hire
   is said again under the desk's header and as a toast, since the form goes once the desk comes in.
   A DESK ON A REAL VENUE: said so, with a way to move it to a paper account (only with no lead open) or to look at it on Agents.
   WHILE THE ACCOUNT DOES NOT ANSWER: said in the page's own words, since when; after two misses the session's clock and the countdown stop,
   "Now" says since when, and the beat asks less often (1, 2, 5, then every 10 s) until it answers.

   The look is Hyperliquid's trade app's grammar, on the trading area's tokens (ui/tokens.css html[data-area="trade"]): panels, controls,
   type and motion as Regular has them, so the two modes are one screen, in the page's own background (Light or Black).
   Every string from outside is escaped before it is drawn. The parts are built once and painted with paint(): a read that changed nothing
   writes nothing. */

const SG = {
  // the feed's last body: undefined until the first read, null where the account keeps no desk
  desk: undefined,
  err: "",
  // the room's newest seq seen (the cursor the next read asks with), and its lines kept (the stream and the cards' latest lines)
  seq: 0,
  room: [],
  // what the last read said, for the next diff (sgDiff)
  prev: null,
  feedAt: 0,
  // the slower reads: the desk's full view, its catalog, the open leads' live prices
  view: null,
  viewAt: 0,
  catalog: null,
  live: { at: 0, usd: null },
  quotesAt: 0,
  // the beat: a timer, or -1 while a read is on its way; the reads numbered, so one let go after a stall is not used when it comes back;
  // when the last read began, and whether the desk moved while one was on its way (the next read comes as soon as it ends: sgNudge)
  timer: 0,
  readNo: 0,
  tickAt: 0,
  nudged: false,
  // the market the chart is mounted on, "venue|symbol" ("off": the venue is not connected; "none": nothing to chart), the market the owner
  // picked over it ("" follows the desk), the lines and the trades last handed to it, and the range, the bar size and the price scale the
  // owner picked on it (kept when the chart moves to another market; a day of five-minute bars until one is picked)
  mounted: "",
  pick: "",
  linesSig: "",
  marksSig: "",
  chart: { range: "1D", interval: "5m", log: false, ind: "" },
  stopSecond: null,
  // WHAT IS BEING PLAYED (sgPlay): what just happened, by "<lead>|in", "<lead>|out", "<lead>|plan", "<lead>|no", "<lead>|card" → until when
  // it is fresh (ms); the banners waiting and the one showing ({ id, role, tone, text, sub } and until when); the lead's chip on the seats'
  // line ({ lead, base, side, step, tone, until }); the newest bubble over a seat ({ role, text, until })
  fresh: new Map(),
  banner: { queue: [], now: null, until: 0, timer: 0, n: 0 },
  chip: null,
  bubble: null,
  // the cards' typed lines: the element being typed into and its words; the seq each card shows
  typing: new Map(),
  typeFrame: 0,
  typed: {},
  // the room's newest seq when the frame was drawn, or when a read came after a gap: a line at or before it was already there — it is
  // shown whole, and only a line that arrives in a later read is typed out as landing
  typeFloor: 0,
  setupSig: "",
  params: {},
  // the reads that failed in a row, and since when the account has not answered (ms; 0 while it answers): two misses make the page stale
  fails: 0,
  downSince: 0,
  // the frame the pane showed last ("setup", "desk" …), so the desk opening after Start is brought into view once, and what Start (or a
  // move) said there for a minute — the one-shot line under the header: { at, text, tone: "ok" | "warn" }
  shown: "",
  started: null,
  // the owner is signing a run of steps (Start, a move): the frame on screen is held until the last step is answered, so the words of
  // that answer land in the form that asked — the feed's beat, which keeps reading meanwhile, would otherwise swap the setup for the
  // desk as soon as it is hired, and a refusal of the steps after it would be said nowhere
  signing: false,
  // the tab showing under the positions ("" until read: the one picked last in this browser, else Equity), and whether "How to use it"
  // was put away in this browser (read once, then kept here)
  tab: "",
  guideOff: null,
};
const SG_EVERY_MS = 1_000;
/* while the account's stream is connected the desk tells the page each time it moves (a `desk` event: sgNudge reads it at once), and
   the beat is the fallback: this many times slower */
const SG_PUSHED_SLOW = 4;
/* the least time between two reads a burst of the desk's moves asks for */
const SG_NUDGE_MS = 150;
const SG_VIEW_MS = 5_000;
const SG_QUOTES_MS = 5_000;
/* what is played (sgPlay): how long a step that just happened stays fresh (its dot ringing on the chart, the plan's lines drawn in, its row
   lit in "What it did"), how long each banner shows (and, with more waiting behind it, the shorter time each takes then), how long a seat's
   bubble stays, how long a chip stays on the seats' line after its last step */
const SG_FRESH_MS = 20_000;
const SG_BANNER_MS = 2_800;
const SG_BANNER_FAST_MS = 1_300;
const SG_BUBBLE_MS = 6_000;
const SG_CHIP_MS = 9_000;
/* the seats' line under "Now": the four steps a lead goes through, each by the seat that takes it */
const SG_STEPS = [["search", "Scan"], ["risk", "Risk"], ["sniper", "Sniper"], ["exit", "Exit"]];
/* a read further apart than this from the one before is a gap: what happened in it is not played */
const SG_GAP_MS = 10_000;
/* a feed read not back after this long is let go: the beat says so and asks again (api() has no timeout of its own) */
const SG_STALL_MS = 10_000;
const SG_ROOM_KEPT = 300;
/* the beat while the account does not answer: a second, then 2, 5, and every 10 s after that (back to a second at the first answer) */
const SG_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
/* misses in a row before the page says its figures are stale: one miss is a blip, two are a pattern */
const SG_STALE_AFTER = 2;
/* how long the line Start leaves under the header stays */
const SG_STARTED_MS = 60_000;
const SG_ROLES = ["head", "search", "risk", "sniper", "exit", "watch", "flow", "sentiment"];
/* the cards type their lines at about 45 characters a second */
const SG_TYPE_CPS = 45;
/* the widest spread Risk's hard check allows, as the feed gives it (desk.ts DeskFeed.hard.maxSpreadPct, from MAX_SPREAD_PCT) — or null:
   not read, and nothing is said in its place */
const sgMaxSpread = (feed) => {
  const v = feed && feed.hard ? feed.hard.maxSpreadPct : undefined;
  return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
};
/* the superagent's trading limits: a seat's ENTRY budget is twenty orders of the per-order size A DAY, and it renews — every SG_RENEW_HOURS
   the account counts what the entries spent afresh (approveSpend renewHours, signed with the limit: account/state.ts renewSpend), and a
   close (a sell of what is held, a reduce-only order) counts against none of it, so a session never stops after its twentieth order and a
   stop is never kept waiting by the day's entries. It is still a limit the owner signs, never a silent exemption for paper: the words beside
   the button say what it is. The limit's window stays 0: on a trade limit the window is not the budget's — it allows ONE order per window
   at each venue (account/state.ts covers, E_MANDATE_RATE), so 24 there would let the Sniper enter once a day and the Exit close once a day */
const SG_BUDGET_TIMES = 20;
const SG_RENEW_HOURS = 24;
const SG_WINDOW_HOURS = 0;
/* ROOM FOR A CLOSE on that limit: a close counts against none of the budget, but the limit's per-order cap still holds it (account/state.ts
   covers — it is what keeps a limit from selling a whole holding in one order). The desk sizes an entry at the risk per lead (sgPer; the
   desk's own clamp, desk.ts clearing: the least of the objective's risk, the limit per order and what is left), and buys it at up to a 2%
   worse price — so the plan's own close of a lead that gained a few percent is worth more than the entry was. The per-order cap the owner
   signs is this many times the entry size, so that close still goes (a lead up to about 45%). That cap holds entries too: the desk sizes
   each at the risk per lead of what the account held when ITS SESSION started (session.startEquityUsd), and a later session of an account
   that grew (gains, a top-up) sizes them larger, up to the cap — and the day's budget then covers fewer of them. So the words beside the
   button say what is signed: entries sized at the risk per lead of a session's start (today's size beside it), any one order up to the
   cap, the day's budget in dollars (about SG_BUDGET_TIMES entries at today's size) — never an entry size the signature does not hold */
const SG_CLOSE_ROOM = 1.5;
const SG_SEAT_DAYS = 30;
/* a superagent's cycle, by default: every five minutes (the Agents pane's hire starts at fifteen) */
const SG_EVERY_MIN = 5;
/* a lead's states: waiting on the owner or held at the venue (open), past Risk (entered), with something held (held) */
const SG_OPEN = new Set(["confirmed", "executed", "closing"]);
const SG_ENTERED = new Set(["confirmed", "executed", "closing", "closed"]);
const SG_HELD = new Set(["executed", "closing", "closed"]);
/* the names before the catalog is read (its own names, charters and seats come with it) */
/* a brain that cannot think and gave no reason: said so, never a reason guessed */
const SG_NO_WHY = "the account gave no reason";
const SG_ROLE_NAMES = { head: ["Head of desk", "HEAD"], search: ["Search", "SEARCH"], risk: ["Risk", "RISK"], sniper: ["Sniper", "SNIPER"], exit: ["Exit", "EXIT"], watch: ["Watch", "WATCH"], flow: ["Flow", "FLOW"], sentiment: ["Sentiment", "SENTIMENT"] };
const SG_STATUS_WORDS = { reading: "reading", thinking: "thinking", working: "working", ready: "ready", "no brain": "no brain", "not let in": "not let in", expired: "key expired", revoked: "key revoked", empty: "empty" };
/* the seats that cannot do their work without the brain: the Head writes the reports, Search finds the leads, Risk clears them. The rest
   do theirs without it — the Sniper places what Risk cleared, the Exit's plan exits (take-profit, stop, time) run by themselves, Watch
   reads the venue — so while the brain cannot think these three say so on their cards, never "ready" */
const SG_THINKS = ["head", "search", "risk"];
/* each seat's duty in one line, the card's subtitle (the full charter is the card's title, as the catalog writes it) */
const SG_DUTIES = { head: "Runs the day: the funnel, the reports, the halt", search: "Finds markets worth a look", risk: "Clears a lead: size, take-profit, stop", sniper: "Places each cleared lead", exit: "Takes the profit, the stop or the time limit", watch: "Watches liquidation, funding and closings", flow: "Large and informed money — needs a feed", sentiment: "News and social attention — needs a feed" };
/* the setup's numbers, as the desk bounds them (desk.ts parseObjective) where the catalog does not say (catalog.bounds): a number outside
   them is refused in words, never clamped without a word */
const SG_BOUNDS = { targetPct: [0.1, 100], maxRiskPct: [0.1, 50], maxDailyLossPct: [0.1, 50], hours: [1, 336], everyMin: [1, 240], maxOpen: [1, 10] };
const SG_BOUND_WORDS = { targetPct: (lo, hi) => `The week's target is ${lo}% to ${hi}%`, maxRiskPct: (lo, hi) => `A lead may risk ${lo}% to ${hi}% of the equity`, maxDailyLossPct: (lo, hi) => `The day's loss line is ${lo}% to ${hi}%`, hours: (lo, hi) => `A session is ${lo} to ${hi} hours`, everyMin: (lo, hi) => `A cycle comes every ${lo} to ${hi} minutes`, maxOpen: (lo, hi) => `${lo} to ${hi} leads may be open at once` };
const SG_WORK_WORDS = { scan: "scanning the venue's markets", clear: "clearing a lead", enter: "placing an entry", exit: "reviewing the open leads", close: "closing a lead", report: "writing the report", review: "writing the weekly review", follow: "following its orders at the venue" };

// ---- small words ---------------------------------------------------------------------------------------------------------------------

const sgClamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
/* a span of time as a clock reads it: 03:14:09 */
const sgClock = (ms) => {
  const s = Math.max(0, Math.floor(num(ms) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
/* the next cycle as the header says it: its countdown while there is a second or more to it; at the time itself (the desk gives the time
   no later than now while a cycle is due) "running" while a seat is at work, "due now" until one starts — never a frozen 00:00 */
function sgNextWords(nextAt, feed, now) {
  const left = Date.parse(nextAt) - num(now);
  if (Number.isFinite(left) && left >= 1000) return sgMmSs(left);
  return feed && feed.working ? "running" : "due now";
}
/* a countdown: 04:59, or 1:04:59 past an hour */
const sgMmSs = (ms) => {
  const s = Math.max(0, Math.floor(num(ms) / 1000));
  const mm = `${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}` : mm;
};
/* a change in percent, its sign a true minus; a change too small to show at d places says so (−<0.01%), never −0.00% */
const sgPct = (n, d = 2) => {
  const v = num(n);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  if (v !== 0 && Math.abs(v) < 0.5 * 10 ** -d) return `${sign}<${(10 ** -d).toFixed(d)}%`;
  return `${sign}${Math.abs(v).toFixed(d)}%`;
};
/* dollars with a true minus: −$1.14 */
const sgMoney = (n) => money(n).replace(/^-/, "−");
/* a change in dollars, signed: +$4.10 · −$0.44 */
const sgSigned = (n) => `${num(n) > 0 ? "+" : num(n) < 0 ? "−" : ""}${money(Math.abs(num(n)))}`;
/* a 24-hour volume, short (Markets' own mkVol: $604M), or in dollars where Markets is not on the page */
const sgVol = (n) => (typeof mkVol === "function" ? mkVol(n) : money(n));
/* a model's id as people say it: claude-opus-5-5 → Opus 5.5; anything else as it is */
function sgModelName(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/.exec(String(id || ""));
  if (!m) return String(id || "");
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}
/* a market's one name: BTC of BTC/USDT, BTC-PERP or BTC@okx */
const sgBase = (sym) => String(sym || "").split(/[/:@-]/)[0] || String(sym || "");
/* a role as the catalog names it (its name, its tag, its charter), or its own name before the catalog is read */
const sgSpec = (role, catalog) => (catalog && Array.isArray(catalog.roles) && catalog.roles.find((r) => r.id === role)) || { id: role, name: (SG_ROLE_NAMES[role] || [String(role)])[0], tag: (SG_ROLE_NAMES[role] || [0, String(role).toUpperCase()])[1], charter: { owns: "" } };
const sgTag = (from, catalog) => (from === "you" ? "YOU" : from === "account" ? "ACCOUNT" : sgSpec(from, catalog).tag);
/* lead ids in a line, set in mono */
const sgIds = (text) => esc(text).replace(/\b(L-\d{4,})\b/g, '<span class="mono">$1</span>');
/* the newest of some leads, by when they last changed */
const sgNewest = (list) => list.slice().sort((a, b) => String(b.updatedAt || b.at || "").localeCompare(String(a.updatedAt || a.at || "")))[0] || null;
const sgLeads = (feed) => (feed && Array.isArray(feed.leads) ? feed.leads : []);

/* how a lead's close is said by the desk (account/desk.ts exits: "TP HIT at …", "stop at …", "time limit: …", "liquidation …", the
   Exit's own reason "… (Exit)") → the page's word for it */
function sgExitWhy(text) {
  const t = String(text || "").trim();
  if (/^TP HIT\b/i.test(t)) return "tp";
  if (/^stop\b/i.test(t)) return "stop";
  if (/^time limit\b/i.test(t)) return "time";
  if (/^liquidat/i.test(t)) return "liq";
  if (/\(Exit\)$/.test(t)) return "brain";
  return "other";
}

// ---- the room's lines, said for people -------------------------------------------------------------------------------------------------

/* a price as the page writes one: grouped, its own decimals */
const sgPx = (s) => (Number.isFinite(Number(s)) ? px(Number(s)) : String(s));
/* a role's name in a sentence: "→ SNIPER" is "to the Sniper" */
const SG_TO = { RISK: "Risk", SNIPER: "the Sniper", EXIT: "the Exit", HEAD: "the Head of desk", SEARCH: "Search", WATCH: "Watch", FLOW: "Flow", SENTIMENT: "Sentiment" };
/* a sentence ends once: the brain's words may bring their own full stop */
const sgStop = (t) => (/[.!?…]$/.test(String(t).trim()) ? String(t).trim() : `${String(t).trim()}.`);
/* the brain's sentence as its own sentence: its first letter up, its words as written */
const sgCap = (t) => String(t).replace(/^\s*([a-z])/, (c) => c.toUpperCase());
/** what any other line says, tidied for reading, nothing taken out: the protocol's bars as dots, "→ RISK" as "— to Risk", a minus before a
 * figure a true minus (never a lead's id: L-0006 keeps its hyphen), a long bare figure grouped (62420.7 → 62,420.7), a 24-hour volume
 * short ($603,890,041.00 → $604M) */
function sgTidy(text) {
  return String(text || "")
    .replace(/ \| /g, " · ")
    .replace(/→\s*([A-Z]{3,})\b/g, (all, r) => (SG_TO[r] ? `— to ${SG_TO[r]}` : all))
    .replace(/\$(\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?)/g, (all, n) => sgVol(Number(n.replace(/,/g, ""))))
    .replace(/(^|[\s(:])-(?=[\d$])/g, "$1−")
    // a figure is grouped as a person reads it — but never a port after a host ("localhost:11434" stays as it is)
    .replace(/(^|[^\w.,$:-]|(?<![\w\]]):)(\d{5,})(\.\d+)?(?![\w,])/g, (all, pre, i, d) => `${pre}${Number(i).toLocaleString("en-US")}${d || ""}`);
}
/* how a close was decided, as a person says it: "TP HIT at 64000 (+1.52%)" → "at the take-profit (64,000, +1.52%)" */
function sgExitWords(why) {
  const t = String(why || "").trim();
  // the desk writes the price grouped as a person reads it ("TP HIT at 61,800 (+1.00%)", desk.ts fig()): the commas are taken out before
  // the page writes it its own way
  const m = /^(TP HIT|stop) at ([\d.,]+)\s*\(([-+−]?[\d.]+%)\)$/i.exec(t);
  if (m) return `at the ${/^TP/i.test(m[1]) ? "take-profit" : "stop"} (${sgPx(m[2].replace(/,/g, ""))}, ${sgTidy(m[3])})`;
  const time = /^time limit:?\s*(.*)$/i.exec(t);
  if (time) return `at the time limit${time[1] ? ` (${sgTidy(time[1].replace(/^\((.*)\)$/, "$1"))})` : ""}`;
  if (/^liquidat/i.test(t)) return `before liquidation: ${sgTidy(t)}`;
  const own = /^(.*)\s*\(Exit\)$/.exec(t);
  if (own) return `by the Exit: ${own[1].trim()}`;
  return t ? `(${sgTidy(t)})` : "";
}
/** One room line as the page shows it to a person. The room keeps the agents' own protocol (mcp.ts reads it: "LEAD … | … → RISK"); this
 * is display only. Where the line is about a lead, it is said from that lead's record (feed.leads, by m.lead) where the line itself does
 * not say enough; the brain's own "why" and thesis are kept as written. Any line it does not know is tidied (sgTidy), never dropped:
 *   LEAD L-0006 | AVAX/USD | long | <thesis> | confidence 0.75 → RISK   L-0006 · long AVAX/USD — <thesis>. Confidence 75%. Passed to Risk.
 *   RISK CLEARANCE L-0001 | <checks> | <why> | size … | Verdict: CLEAR   L-0001 cleared at 62,420.7: spread 0.02%, 24h volume $604M, $1,250.00
 *                                                                         of the day's loss room left. <why> Size $60.00 · take-profit +0.4% ·
 *                                                                         stop −0.4% · 1 h. Passed to the Sniper.
 *   RISK CLEARANCE L-0003 | <why> | Verdict: REJECT                       L-0003 rejected: <why>.
 *   L-0001: filled 0.00094 BTC at 62425.4 at <venue> (<how>).             L-0001 filled: bought 0.00094 BTC at 62,425.4 on <venue>, placed on
 *                                                                         its own (paper), inside the Sniper's limit.
 *   L-0002 closed: stop at 2446.02 (-0.53%) · … · -$0.44 (-0.73% on $60.00)   L-0002 closed at the stop (2,446.02, −0.53%): −$0.44 (−0.73%
 *                                                                         of $60.00).
 *   Cycle 3 (the clock): 1 lead scanned, 0 cleared, 0 placed, 0 waiting   Cycle 3 (on schedule): 1 lead found, none cleared, 2 open.
 *   for you, 2 open. */
function sgPlain(m, leads) {
  const text = String((m && m.text) || "");
  const lead = m && m.lead && Array.isArray(leads) ? leads.find((l) => l && l.id === m.lead) : null;
  let x = /^LEAD (L-\d+) \| (.+?) \| (long|short) \| (.*) \| confidence ([\d.]+)\s*→\s*RISK$/.exec(text);
  if (x) return `${x[1]} · ${x[3]} ${x[2]} — ${sgStop(x[4])} Confidence ${Math.round(Number(x[5]) * 100)}%. Passed to Risk.`;
  x = /^RISK CLEARANCE (L-\d+) \| (.*) \| Verdict: REJECT$/.exec(text);
  if (x) return `${x[1]} rejected: ${sgStop(x[2])}`;
  x = /^RISK CLEARANCE (L-\d+) \| (.*) \| Verdict: CLEAR(?:\s*→\s*SNIPER)?$/.exec(text);
  if (x) {
    const parts = x[2].split(" | ");
    const size = parts.length > 1 && /^size /.test(parts[parts.length - 1]) ? parts.pop() : "";
    const checks = parts.length > 1 ? parts.shift() : "";
    const why = parts.join(" | ");
    const c = {};
    for (const bit of checks.split(" · ")) {
      const k = /^(price|spread|volume|day's loss room|size up to) (.+)$/.exec(bit.trim());
      if (k) c[k[1]] = k[2];
    }
    const said = [c.spread && c.spread !== "n/a" ? `spread ${c.spread}` : "", c.volume && c.volume !== "n/a" ? `24h volume ${sgTidy(c.volume)}` : "", c["day's loss room"] ? `${c["day's loss room"].replace(/^-/, "−")} of the day's loss room left` : ""].filter(Boolean);
    const plan = size ? /^size (\S+) · TP \+?([\d.]+)% · SL -?([\d.]+)% · ([\d.]+) h$/.exec(size) : null;
    const planWords = plan ? `Size ${plan[1]} · take-profit +${plan[2]}% · stop −${plan[3]}% · ${plan[4]} h.` : size ? sgStop(sgTidy(size)) : "";
    return `${x[1]} cleared${c.price ? ` at ${sgPx(c.price)}` : ""}${said.length ? `: ${said.join(", ")}.` : "."}${why ? ` ${sgCap(sgStop(why))}` : ""}${planWords ? ` ${planWords}` : ""} Passed to the Sniper.`;
  }
  x = /^(L-\d+): filled (\S+) (\S+) at (\S+) at (.+) \((.+)\)\.$/.exec(text);
  if (x) {
    const side = lead ? (lead.side === "sell" ? "sold" : "bought") : "";
    const how = x[6] === "on its own on paper, inside the limit" ? "placed on its own (paper), inside the Sniper's limit" : x[6] === "Beast, inside the limit" ? "placed in Beast, inside the Sniper's limit" : x[6] === "inside the limit" ? "inside the Sniper's limit" : sgTidy(x[6]);
    return `${x[1]} filled: ${side ? `${side} ` : ""}${x[2]} ${x[3]} at ${sgPx(x[4])} on ${x[5]}, ${how}.`;
  }
  x = /^(L-\d+) closed: (.*) · (\S+) (\S+) at (\S+) · (-?\$[\d,.]+) \(([-+]?[\d.]+%) on (\$[\d,.]+)\)$/.exec(text);
  if (x) {
    const how = sgExitWords(x[2]);
    return `${x[1]} closed${how ? ` ${how}` : ""}: ${x[6].startsWith("-") ? x[6].replace(/^-/, "−") : `+${x[6]}`} (${sgTidy(x[7])} of ${x[8]}).`;
  }
  x = /^Cycle (\d+) \((.+?)\): (\d+) leads? scanned, (\d+) cleared, (\d+) placed, (?:(\d+) waiting for you, )?(\d+) open\.$/.exec(text);
  const why = (w) => (w === "the clock" ? "on schedule" : w);
  if (x) {
    const [n, w, found, cleared, placed, waiting, open] = [x[1], why(x[2]), Number(x[3]), Number(x[4]), Number(x[5]), Number(x[6] || 0), Number(x[7])];
    return `Cycle ${n} (${w}): ${found ? plural(found, "lead") : "no lead"} found, ${cleared ? `${cleared} cleared` : "none cleared"}${placed ? `, ${placed} placed` : ""}${waiting ? `, ${waiting} waiting for you` : ""}, ${open} open.`;
  }
  x = /^Cycle (\d+) \((.+?)\): (.*)$/.exec(text);
  if (x) return `Cycle ${x[1]} (${why(x[2])}): ${sgTidy(x[3])}`;
  return sgTidy(text);
}

// ---- the feed, read against the one before: what happened ---------------------------------------------------------------------------------

/* one event, of the kind sgPlay plays (it reads event.type): built here so that what the page SIGNS stays the only place a `type` is written
   as a literal (review2-contracts reads every such literal as a draft the owner signs) */
const sgEv = (kind, fields = {}) => ({ type: kind, ...fields });

/** what nothing was read yet looks like */
const sgFresh = () => ({ seq: 0, leads: {}, thinking: "", halted: "", cycles: 0, primed: false });

/** What happened, from one feed against what the read before said (`prev`, sgFresh() at first): the events sgPlay plays, in the order they
 * happened, and what this read says for the next one. The first read after nothing (or after a gap: prev.primed false) only learns what is
 * there and returns no event: what was already there is drawn as state, never played as if it happened now.
 *   a role's brain call starting or ending      think {role, on}         (working with a brain call in flight: feed.inFlight > 0)
 *   a new line in the room                      say {role, text, raw, kind} (role: a seat, "you" or "account"; text in plain English,
 *                                                                         sgPlain; raw the room's line as written)
 *   a lead from Search to Risk                  handoff                  (new or scanned → cleared, rejected, or later)
 *   a lead Risk turned down                     reject                   (→ rejected)
 *   a lead from Risk to the Sniper              handoff                  (scanned or cleared → confirmed, executed, closing, closed, refused)
 *   an entry waiting for the owner              card {role: "sniper"}    (→ confirmed)
 *   an entry placed                             order {role: "sniper"}   (→ executed or later, from before it held anything)
 *   an entry filled                             fill                     (its entry appeared)
 *   a close going out                           order {role} | card      (→ closing or closed; a card where the room says the close waits)
 *   a lead closed                               exit {why, pnlUsd}       (→ closed; why from its exitWhy)
 *   a lead refused at the door                  say {role: "account"}    (→ refused, where the room's own refusal line did not come)
 *   the day's loss line crossed                 halt {why}               (a new halt)
 *   a cycle begun                               cycle {n}                (session.cycles grew)
 * Each lead's step comes right after the room line that speaks of that lead and that step (its LEAD line, its clearance, its order or
 * card, its close), and the steps it went through before that line come just before it — the packet reaches Risk, Risk says REJECT, the
 * packet goes into the shredder; a lead whose line did not come in this read has its events after the lines. */
function sgDiff(prev, feed) {
  const was = prev || sgFresh();
  const leads = sgLeads(feed);
  const room = (feed && Array.isArray(feed.room) ? feed.room : []).filter((m) => m && Number(m.seq) > was.seq).sort((a, b) => a.seq - b.seq);
  const thinking = feed && feed.working && num(feed.inFlight) > 0 ? String(feed.working.role || "") : "";
  const halted = feed && feed.session && feed.session.halted ? String(feed.session.halted.why || "halted") : "";
  const cycles = feed && feed.session ? num(feed.session.cycles) : 0;
  const next = { seq: Math.max(was.seq, num(feed && feed.seq), ...room.map((m) => num(m.seq))), leads: {}, thinking, halted, cycles, primed: true };
  for (const l of leads) next.leads[l.id] = { state: l.state, entry: !!(l.entry && Number.isFinite(Number(l.entry.price))) };
  if (!was.primed) return { events: [], next };

  // each lead's steps since the last read, each with the room kinds that speak of it
  const pending = new Map();
  for (const l of leads) {
    const before = was.leads[l.id] || { state: "new", entry: false };
    const s = l.state;
    const b = before.state;
    const base = { lead: l.id, symbol: l.symbol };
    const steps = [];
    const early = b === "new" || b === "scanned";
    if (early && s !== "scanned" && s !== "new") steps.push({ on: ["lead"], e: sgEv("handoff", { ...base, side: l.side, from: "search", to: "risk" }) });
    if (s === "rejected" && b !== "rejected") steps.push({ on: ["clearance"], e: sgEv("reject", { ...base, from: "risk", why: String(l.why || "") }) });
    if ((early || b === "cleared") && (SG_ENTERED.has(s) || s === "refused")) steps.push({ on: ["clearance"], e: sgEv("handoff", { ...base, side: l.side, from: "risk", to: "sniper" }) });
    if (s === "confirmed" && b !== "confirmed") steps.push({ on: ["card"], e: sgEv("card", { ...base, role: "sniper" }) });
    if (SG_HELD.has(s) && !SG_HELD.has(b)) steps.push({ on: ["order"], e: sgEv("order", { ...base, side: l.side, usd: num(l.sizeUsd), role: "sniper" }) });
    const filled = !!(l.entry && Number.isFinite(Number(l.entry.price)));
    if (filled && !before.entry) steps.push({ on: ["order"], e: sgEv("fill", { ...base, side: l.side, price: Number(l.entry.price), qty: num(l.entry.qty) }) });
    if ((s === "closing" || s === "closed") && b !== "closing" && b !== "closed") {
      // the close: placed at once, or waiting for the owner on a card — as the room says it in this read
      const closer = /^liquidat/i.test(String(l.exitWhy || "")) ? "watch" : "exit";
      const card = room.find((m) => m.lead === l.id && m.kind === "card" && (m.from === "exit" || m.from === "watch"));
      steps.push(card ? { on: ["card"], e: sgEv("card", { ...base, role: card.from }) } : { on: ["exit", "order"], e: sgEv("order", { ...base, side: l.side === "buy" ? "sell" : "buy", usd: num(l.sizeUsd), role: closer }) });
    }
    if (s === "closed" && b !== "closed") steps.push({ on: ["exit"], e: sgEv("exit", { ...base, why: sgExitWhy(l.exitWhy), pnlUsd: num(l.pnlUsd) }) });
    if (s === "refused" && b !== "refused" && !room.some((m) => m.lead === l.id && m.kind === "refusal")) {
      const raw = `${l.id}: ${l.why || "the door refused it"}`;
      steps.push({ on: ["refusal"], e: sgEv("say", { role: "account", text: sgTidy(raw), raw, kind: "refusal" }) });
    }
    if (steps.length) pending.set(l.id, steps);
  }

  const events = [];
  if (cycles > was.cycles) events.push(sgEv("cycle", { n: cycles }));
  if (was.thinking && was.thinking !== thinking) events.push(sgEv("think", { role: was.thinking, on: false }));
  for (const m of room) {
    // the line said for people (sgPlain); the line as the room holds it goes with it
    const say = sgEv("say", { role: String(m.from), text: sgPlain(m, leads), raw: String(m.text || ""), kind: String(m.kind || "note") });
    const steps = m.lead ? pending.get(m.lead) : null;
    const i = steps ? steps.findIndex((x) => x.on.includes(m.kind)) : -1;
    if (i < 0) {
      events.push(say);
      continue;
    }
    // what the lead went through before this line was written flies first, then the line is said, then what it says happened — with the
    // steps right after it that the same line speaks of (an order line carries the order and its fill, an exit line the close and the exit)
    let j = i + 1;
    while (j < steps.length && steps[j].on.includes(m.kind)) j++;
    const done = steps.splice(0, j).map((x) => x.e);
    events.push(...done.slice(0, i), say, ...done.slice(i));
    if (!steps.length) pending.delete(m.lead);
  }
  for (const steps of pending.values()) events.push(...steps.map((x) => x.e));
  if (halted && halted !== was.halted) events.push(sgEv("halt", { why: halted }));
  if (thinking && thinking !== was.thinking) events.push(sgEv("think", { role: thinking, on: true }));
  return { events, next };
}

/** the room's lines kept: what was kept and what came, one line per seq, oldest first, the last SG_ROOM_KEPT */
function sgMergeRoom(have, add) {
  const by = new Map();
  for (const m of [...(have || []), ...(Array.isArray(add) ? add : [])]) if (m && Number.isFinite(Number(m.seq))) by.set(Number(m.seq), m);
  return [...by.values()].sort((a, b) => a.seq - b.seq).slice(-SG_ROOM_KEPT);
}

// ---- the seats and the cards ---------------------------------------------------------------------------------------------------------

/** each of the eight seats as the desk holds it now (GET /api/account/desk's seats): filled by the house or by an outside agent, with its
 * standing at the door — or empty, and why. Null before the desk's view and the catalog are read: nothing is drawn as empty that was not
 * read as empty */
function sgSeats(view, catalog) {
  if (!view || !catalog) return null;
  const seats = Array.isArray(view.seats) ? view.seats : [];
  return SG_ROLES.map((role) => {
    const spec = sgSpec(role, catalog);
    const s = seats.find((x) => x.role === role);
    if (s) return { role, name: String(s.name || spec.name), kind: s.kind === "outside" ? "outside" : "house", status: String(s.status || "ok"), limit: s.limit || null, cards: num(s.cards), address: s.address || "" };
    return { role, name: spec.name, kind: "empty", status: "empty", limit: null, cards: 0, address: "", outside: !!spec.outsideOnly, why: spec.outsideOnly ? `Empty seat — an outside agent can take it: it ${spec.outsideOnly}.` : "Empty seat — not on this desk: fill it from the Agents pane.", reason: spec.outsideOnly ? `An outside agent can take it: it ${spec.outsideOnly}.` : "Not on this desk: fill it from the Agents pane." };
  });
}

/* a role's latest line in the room */
function sgLastLine(room, role) {
  for (let i = (room || []).length - 1; i >= 0; i--) if (room[i] && room[i].from === role) return room[i];
  return null;
}

/** one card's number: its words, a thin bar (0–1, or null: none), the bar's words. Only what the desk recorded */
function sgMetric(role, { feed, view, seat, now }) {
  // an empty seat has no number: its card says why it is empty, once
  if (seat && seat.kind === "empty") return { text: "", bar: null, word: "", none: true };
  if (!feed) return { text: "—", bar: null, word: "" };
  const leads = sgLeads(feed);
  const f = feed.funnel || {};
  if (role === "head") {
    // the Head runs the day: what the day made, and the room left before the day's loss line halts the desk (the header says the cycle) —
    // the room said once, its figure with its words: "today +$4.10" over "$487.50 of the day's loss room left"
    const t = feed.today;
    if (!t) return { text: "the day not read yet", bar: null, word: "" };
    const o = view && view.objective;
    const line = o && feed.equity ? (num(feed.equity.startUsd) * num(o.maxDailyLossPct)) / 100 : 0;
    return { text: `today ${sgSigned(t.pnlUsd)}`, bar: line > 0 ? sgClamp01(num(t.lossRoomUsd) / line) : null, word: `${money(t.lossRoomUsd)} of the day's loss room left` };
  }
  if (role === "search") {
    const scan = feed.lastScan;
    if (!scan) return { text: "no scan yet", bar: null, word: "" };
    const rows = (scan.rows || []).length;
    const k = (scan.picked || []).length;
    return { text: `${plural(rows, "market")} looked at · ${k} picked`, bar: rows ? k / rows : null, word: rows ? "the last scan" : String(scan.note || "no table was shown") };
  }
  if (role === "risk") {
    const a = num(f.cleared);
    const b = num(f.rejected);
    return { text: `${a} cleared · ${b} rejected`, bar: a + b ? a / (a + b) : null, word: a + b ? `${Math.round((a / (a + b)) * 100)}% cleared` : "" };
  }
  if (role === "sniper") {
    const last = leads.filter((l) => l.entry && Number.isFinite(Number(l.entry.price))).sort((x, y) => String(y.entry.at || "").localeCompare(String(x.entry.at || "")))[0];
    const lim = seat && seat.limit;
    return { text: last ? `last fill ${qtyOf(last.entry.qty)} ${sgBase(last.symbol)} at ${px(last.entry.price)}` : "no fill yet", bar: lim && num(lim.budgetUsd) > 0 ? num(lim.leftUsd) / num(lim.budgetUsd) : null, word: lim ? `${money(lim.leftUsd)} left of ${money(lim.budgetUsd)}${lim.renewsAt ? ` · renews ${nyTime(lim.renewsAt)} New York` : ""}` : seat ? "no trading limit" : "" };
  }
  if (role === "exit") {
    const open = leads.filter((l) => l.state === "executed" || l.state === "closing").length;
    const tape = view && view.tape;
    const closed = leads.filter((l) => l.state === "closed");
    const w = tape ? num(tape.wins) : closed.filter((l) => num(l.pnlUsd) > 0).length;
    const lo = tape ? num(tape.losses) : closed.filter((l) => num(l.pnlUsd) < 0).length;
    return { text: `${open} open · ${w} won · ${lo} lost`, bar: w + lo ? w / (w + lo) : null, word: w + lo ? `${Math.round((w / (w + lo)) * 100)}% won` : "" };
  }
  if (role === "watch") {
    const marked = leads.filter((l) => (l.state === "executed" || l.state === "closing") && l.entry && Number.isFinite(Number(l.markPrice)));
    let near = null;
    for (const l of marked) {
      if (!Number.isFinite(Number(l.slPct))) continue;
      const dir = l.side === "buy" ? 1 : -1;
      const stop = Number(l.entry.price) * (1 - (dir * Number(l.slPct)) / 100);
      const mark = Number(l.markPrice);
      const d = (dir * (mark - stop) * 100) / mark;
      if (near === null || d < near.d) near = { d, sl: Number(l.slPct) };
    }
    return { text: `${plural(marked.length, "mark")} · ${near ? `nearest stop −${Math.max(0, near.d).toFixed(2)}%` : "no stop in view"}`, bar: near ? sgClamp01(near.d / near.sl) : null, word: near ? "room to the stop" : "" };
  }
  // Flow and Sentiment, filled: by whom
  return { text: seat ? `${seat.kind === "outside" ? "an agent of yours" : "the house"} · ${seat.name}` : "—", bar: null, word: "" };
}

/** the eight cards, from the feed (who is working, the leads, the funnel, the scan, the brain's standing), the desk's view (the seats, the
 * tape) and the catalog (names, charters): each card's name, tag, charter line, standing (and why, where it is not ready), latest line and
 * number. A seat's standing, first that applies: not read yet, empty, thinking (its brain call under way), working, its key's standing at
 * the door (not let in, expired, revoked), no brain (a seat that thinks, while the brain cannot), ready */
function sgCards(feed, view, catalog, room, now = Date.now()) {
  const seats = sgSeats(view, catalog);
  const work = feed && feed.working;
  const inFlight = num(feed && feed.inFlight);
  const think = (feed && feed.lastThink) || {};
  const brain = feed && feed.brain;
  const noBrain = !!brain && !brain.ok;
  return SG_ROLES.map((role) => {
    const spec = sgSpec(role, catalog);
    const seat = seats ? seats.find((s) => s.role === role) : null;
    const working = !!work && work.role === role;
    const status = !seat ? "reading" : seat.kind === "empty" ? "empty" : working && inFlight > 0 ? "thinking" : working ? "working" : seat.status !== "ok" ? seat.status : noBrain && SG_THINKS.includes(role) ? "no brain" : "ready";
    const line = sgLastLine(room, role);
    const t = think[role];
    return {
      role,
      name: spec.name,
      tag: spec.tag,
      owns: (spec.charter && spec.charter.owns) || "",
      duty: SG_DUTIES[role] || (spec.charter && spec.charter.owns) || "",
      status,
      word: SG_STATUS_WORDS[status] || status,
      // the standing's reason, one pointer away (its light's title): the account's own sentence for why the brain cannot think (its fix's
      // words speak of "the file below", which is the fix sheet's: they are the fallback), the way to the fix in the header
      why: status === "no brain" ? `The brain cannot think: ${sgStop(brain.why || (brain.fix && brain.fix.words) || SG_NO_WHY)} Until it can, this seat waits: see the Brain, above.` : "",
      doing: working ? SG_WORK_WORDS[work.what] || String(work.what || "") : "",
      empty: seat && seat.kind === "empty" ? seat.why : "",
      reason: seat && seat.kind === "empty" ? seat.reason : "",
      line: line ? { seq: line.seq, text: sgPlain(line, sgLeads(feed)), raw: String(line.text || ""), brain: !!line.brain, at: line.at, kind: line.kind, ...(line.lead ? { lead: String(line.lead) } : {}) } : null,
      think: t ? { ms: num(t.ms), ok: !!t.ok } : null,
      metric: sgMetric(role, { feed, view, seat, now }),
    };
  });
}

// ---- the market on the chart, and the desk's leads drawn on it --------------------------------------------------------------------------

/** the market the desk is on: the newest open lead's, else the newest lead's, else the last scan's top pick; null when there is none of
 * these (nothing is picked for the page) */
function sgFocus(feed) {
  if (!feed) return null;
  const leads = sgLeads(feed);
  const open = sgNewest(leads.filter((l) => SG_OPEN.has(l.state)));
  if (open) return { symbol: open.symbol, name: open.name || open.symbol, kind: open.kind || "", why: `open lead ${open.id}`, lead: open.id };
  const last = sgNewest(leads);
  if (last) return { symbol: last.symbol, name: last.name || last.symbol, kind: last.kind || "", why: `newest lead ${last.id}`, lead: last.id };
  const scan = feed.lastScan;
  const pick = scan && (scan.picked || [])[0];
  if (!pick) return null;
  const row = (scan.rows || []).find((r) => r.symbol === pick.symbol) || {};
  return { symbol: pick.symbol, name: row.name || pick.symbol, kind: row.kind || "", why: "the last scan's top pick", confidence: pick.confidence };
}
/** the markets the chart can show, each once: the desk's open leads' (newest first), then the market it is on — at most six */
function sgMarkets(feed) {
  const out = [];
  const add = (l, why) => {
    if (l && l.symbol && !out.some((m) => m.symbol === l.symbol)) out.push({ symbol: l.symbol, name: l.name || l.symbol, kind: l.kind || "", why });
  };
  const open = sgLeads(feed).filter((l) => SG_OPEN.has(l.state)).sort((a, b) => String(b.updatedAt || b.at || "").localeCompare(String(a.updatedAt || a.at || "")));
  for (const l of open) add(l, `open lead ${l.id}`);
  const f = sgFocus(feed);
  if (f) add(f, f.why);
  return out.slice(0, 6);
}
/** the market the chart shows: the one the owner picked over it while the desk still holds it, else the one the desk is on, else — no
 * lead yet — the market a desk of its kind trades first (sgFirstMarket); null: nothing to chart */
function sgChartMarket(feed) {
  if (!feed) return null;
  const picked = SG.pick ? sgMarkets(feed).find((m) => m.symbol === SG.pick) : null;
  if (picked) return { ...picked, picked: true };
  return sgFocus(feed) || sgFirstMarket(feed);
}
/* no lead yet: the market a desk of its kind trades first, at its own paper account — a stocks desk the S&P 500's fund, any other Bitcoin —
   only where the venue is the account's own paper account or Alpaca's, which name their markets so; elsewhere none */
function sgFirstMarket(feed) {
  const v = feed && feed.venue;
  const row = v && typeof A !== "undefined" && A && Array.isArray(A.venues) ? A.venues.find((x) => x.id === v.id) : null;
  const connector = String((row && row.connector) || "");
  if (connector !== "live:paper" && connector !== "live:alpaca-paper") return null;
  const stocks = String((feed.objective && feed.objective.universe) || "") === "stocks";
  return stocks ? { symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "stock", why: "no lead yet", first: true } : { symbol: "BTC/USD", name: "Bitcoin", kind: "crypto", why: "no lead yet", first: true };
}
/** THE DESK'S LEADS ON THE CHART of `symbol` (ui/chart.js chMarks and chLines): each entry filled a dot at its moment and price with its
 * words, each close a dot with its reason and result (an entry and its exit joined); each lead held now its entry, take-profit and stop as
 * lines across. What just happened is fresh (SG.fresh, set by sgPlay): its dot rings, an exit's result floats up, the plan draws in. Only the
 * newest few and what just happened say their words; an older trade is a dot, its words on hover */
function sgChartOverlay(feed, symbol, now = Date.now()) {
  const fresh = (k) => num(SG.fresh.get(k)) > now;
  const lines = [];
  const marks = [];
  for (const l of sgLeads(feed).filter((x) => x.symbol === symbol)) {
    const e = l.entry && Number.isFinite(Number(l.entry.price)) ? Number(l.entry.price) : null;
    if (e === null) continue;
    const qty = qtyOf(l.entry.qty);
    const base = sgBase(l.symbol);
    const buy = l.side === "buy";
    const at = Date.parse(l.entry.at);
    if (Number.isFinite(at)) marks.push({ id: `${l.id}:in`, t: at, price: e, side: l.side, kind: "in", label: `${buy ? "BUY" : "SELL"} ${qty} ${base} · ${px(e)}`, short: buy ? "BUY" : "SELL", tone: buy ? "up" : "down", lead: l.id, fresh: fresh(`${l.id}|in`) });
    const x = l.exit && Number.isFinite(Number(l.exit.price)) ? l.exit : null;
    const t = x ? Date.parse(x.at) : NaN;
    if (x && Number.isFinite(t)) {
      const pnl = num(l.pnlUsd);
      const why = l.exitWhy ? SG_EXIT_SHORT[sgExitWhy(l.exitWhy)] : "closed";
      marks.push({ id: `${l.id}:out`, t, price: Number(x.price), side: buy ? "sell" : "buy", kind: "out", label: `${buy ? "SOLD" : "BOUGHT BACK"} · ${why} · ${sgSigned(pnl)}`, short: sgSigned(pnl), tone: "ink", lead: l.id, fresh: fresh(`${l.id}|out`), float: sgSigned(pnl), floatTone: pnl < 0 ? "down" : "up" });
    }
    if (l.state !== "executed" && l.state !== "closing") continue;
    const dir = buy ? 1 : -1;
    const plan = fresh(`${l.id}|plan`);
    lines.push({ id: `${l.id}:entry`, price: e, label: `${l.id} ${buy ? "long" : "short"} ${qty} · entry`, short: "Entry", kind: "entry", fresh: plan });
    if (Number.isFinite(Number(l.tpPct))) lines.push({ id: `${l.id}:tp`, price: e * (1 + (dir * Number(l.tpPct)) / 100), label: `${l.id} take-profit +${Number(l.tpPct)}%`, short: "TP", kind: "tp", fresh: plan });
    if (Number.isFinite(Number(l.slPct))) lines.push({ id: `${l.id}:sl`, price: e * (1 - (dir * Number(l.slPct)) / 100), label: `${l.id} stop −${Number(l.slPct)}%`, short: "SL", kind: "sl", fresh: plan });
  }
  // the newest three say their words, and whatever just happened; an older one is a dot, its words on hover — a busy hour stays readable
  const newest = new Set(marks.slice().sort((x, y) => y.t - x.t).slice(0, SG_MARKS_SAID).map((m) => m.id));
  for (const m of marks) if (!m.fresh && !newest.has(m.id)) m.quiet = true;
  return { lines, marks };
}
/* how many of the newest trades on the chart say their words (the rest are dots, their words on hover) */
const SG_MARKS_SAID = 3;

// ---- what the owner signs --------------------------------------------------------------------------------------------------------------

/** a control's draft: pause, resume (also a new session after the end), cycle, end, autonomy on or off — each one setDesk. `on`: for
 * autonomy, on or off; for resume, { autonomy: true } starts the new session after the end with its autonomy on paper in the same
 * signature (the desk takes it only at a paper account, else refuses the whole resume) — a plain resume's value stays "" */
function sgControlDraft(act, on) {
  const set = (change, value = "") => ({ type: "setDesk", desk: "desk", change, value });
  if (act === "autonomy") return set("autonomy", JSON.stringify({ paper: !!on }));
  if (act === "resume" && on && typeof on === "object" && on.autonomy) return set("resume", JSON.stringify({ autonomy: { paper: true } }));
  return ["pause", "resume", "cycle", "end"].includes(act) ? set(act) : null;
}

/* the per-order size a lead may be: the objective's risk per lead of what the paper account holds, in whole dollars, a dollar at least */
const sgPer = (venue, riskPct) => Math.max(1, Math.round((num(venue && venue.usd) * num(riskPct)) / 100));
/* the per-order cap a seat's trading limit is signed with: the entry size with room for a close of a lead that gained (SG_CLOSE_ROOM) */
const sgPerOrder = (per) => Math.ceil(per * SG_CLOSE_ROOM);
/* the house seats, and the ones of them that trade, as the catalog names them */
const sgHouse = (catalog) => (catalog && Array.isArray(catalog.roles) ? catalog.roles.filter((r) => r.house) : []);

/** The setup's signatures, in the order they are signed — or a sentence saying what is missing:
 *   1. approveAgent   each house seat's key let in (Head, Search, Risk, Sniper, Exit, Watch), for SG_SEAT_DAYS
 *   2. approveSpend   each house seat that trades (Sniper, Exit, Watch): scope trade, at the paper account only, per order the objective's
 *                     risk per lead of what it holds with room for a close (SG_CLOSE_ROOM; it caps entries too), SG_BUDGET_TIMES times the
 *                     risk per lead of entries a day — renewing every SG_RENEW_HOURS (renewHours, signed), closes counting against none of
 *                     it — the window SG_WINDOW_HOURS (see above)
 *   3. setDesk hire   the objective, the brain, the house seats
 *   4. setDesk autonomy {paper: true}
 * f: the form's fields; venue: the paper account (a connected one); brain: the brain as dkBrainDraft gives it, or its sentence */
function sgSetupSteps(f, catalog, venue, brain, now) {
  if (!catalog || !Array.isArray(catalog.roles)) return "What the desk offers is not read yet: a moment.";
  if (!venue) return "Pick a paper account, or open one: the superagent trades paper money only.";
  if (!venue.paper) return `${venue.name} is not a paper account: the superagent trades paper money only.`;
  if (!String(f.text || "").trim()) return "Say what the superagent is for, in a sentence.";
  // each number inside what the desk takes (catalog.bounds; the desk's own clamps where the catalog does not say): one outside is
  // refused here in words, never clamped by the desk without one
  const bounds = (catalog && catalog.bounds) || SG_BOUNDS;
  for (const k of ["targetPct", "maxRiskPct", "maxDailyLossPct", "hours", "everyMin", "maxOpen"]) {
    const v = Number(f[k]);
    if (!(v > 0)) return "Every number is more than zero.";
    const [lo, hi] = bounds[k] || SG_BOUNDS[k];
    if (v < lo || v > hi) return `${SG_BOUND_WORDS[k](lo, hi)}, not ${String(f[k]).trim()}.`;
  }
  if (!brain || typeof brain === "string") return brain || "Pick the brain.";
  const house = sgHouse(catalog);
  const seats = catalog.seats || {};
  const missing = house.find((r) => !seats[r.id]);
  if (missing) return `The ${missing.name} seat has no key yet: read the page again.`;
  const until = num(now) + SG_SEAT_DAYS * DAY;
  const per = sgPer(venue, f.maxRiskPct);
  const seatName = (r) => `Desk ${String(r.name).replace(" of desk", "")}`;
  const steps = house.map((r) => ({ say: `Let in ${seatName(r)}`, draft: { type: "approveAgent", agentAddress: seats[r.id], agentName: seatName(r), validUntil: until } }));
  for (const r of house.filter((x) => x.trades)) steps.push({ say: `${r.name}'s trading limit`, draft: { type: "approveSpend", agent: seats[r.id], scope: "trade", allow: venue.id, perPayment: String(sgPerOrder(per)), budget: String(per * SG_BUDGET_TIMES), windowHours: SG_WINDOW_HOURS, validUntil: until, renewHours: SG_RENEW_HOURS } });
  const d = catalog.defaults || {};
  const objective = { text: String(f.text).trim(), venue: venue.id, universe: d.universe || "all", targetPct: Number(f.targetPct), maxRiskPct: Number(f.maxRiskPct), maxDailyLossPct: Number(f.maxDailyLossPct), hours: Number(f.hours), everyMin: Number(f.everyMin), reportAt: d.reportAt || "21:00", maxOpen: Number(f.maxOpen) };
  // the hire carries the autonomy in the same signature (desk.ts hire `autonomy`): the desk is never hired without it, so its first cycle,
  // five seconds later, can never meet a card the setup said would not come; refused, nothing is hired at all. The desk is named for its
  // paper account ("Momentum desk"), so the room's first line reads as a sentence
  const deskName = `${sgPaperless(venue.name).replace(/\s*account$/i, "") || "Paper"} desk`;
  steps.push({ say: "Hire the desk, autonomy on paper", draft: { type: "setDesk", desk: "desk", change: "hire", value: JSON.stringify({ name: deskName, objective, brain, roles: house.map((r) => ({ role: r.id, kind: "house" })), autonomy: { paper: true } }) } });
  return steps;
}

/** the words beside "Start the superagent": exactly what signing does, with the numbers the form holds now */
function sgSetupWords(f, catalog, venue, brain) {
  if (!venue) return "Open a paper account first: the superagent trades paper money only.";
  const house = sgHouse(catalog);
  const trading = house.filter((r) => r.trades);
  const per = sgPer(venue, f.maxRiskPct);
  const brains = (catalog && (catalog.brains || [catalog.brain])) || [];
  // the brain the form names — its draft's provider, or, where the draft is a sentence (no model yet), the provider the form picked: never
  // another brain's standing said of it
  const want = brain && typeof brain === "object" ? brain.provider : f && f.provider;
  const b = brains.find((x) => x && want && x.id === want) || brains[0] || null;
  const names = (list) => list.map((r) => r.name).join(", ");
  // the brain's reason is said once, where its key goes (3 · The brain): here only that it cannot think yet. Whether it can is judged with
  // the model the form names (sgReadyWith): a server on this machine whose only want is a model is ready with one, once Start signs it
  const model = brain && typeof brain === "object" ? String(brain.model || "") : "";
  const ready = !!b && sgReadyWith(b, model);
  const named = `${b ? b.label : ""}${model ? ` · ${sgModelName(model)}` : ""}`;
  const think = !b ? "" : !ready ? "The brain cannot think yet: see 3 · The brain. Until it can, no lead is made up, and the plan's exits still run." : sgKeyOptional(b) ? `The brain (${named}) needs no key. ${sgBilledWords(b)}${b.ok ? "" : ` It is ready with ${model} once you sign.`}` : `The brain's calls (${named}) are billed to your key.`;
  return `Starting signs ${house.length + trading.length + 1} things, one after another: ${house.length} house seats let in (${names(house)}); a trading limit for ${names(trading)} at ${venue.name} — entries sized at ${num(f.maxRiskPct)}% of what the paper account holds when a session starts (${money(per)} now), any one order up to ${money(sgPerOrder(per))} so a lead that gained can still be closed, and ${money(per * SG_BUDGET_TIMES)} of entries a day (about ${SG_BUDGET_TIMES} at today's size), counted afresh every ${SG_RENEW_HOURS} hours (a close counts against none of it), for ${SG_SEAT_DAYS} days; and the desk hired with its autonomy on paper, in one signature. From then on the desk's own orders at ${venue.name} are placed at once, without a card for you — paper money — each inside its seat's limit. ${think} You can pause or end it at any time, or turn it back to cards: its orders then wait for you on this page, in the Waits for you strip, and under Portfolio.`;
}

/** a desk on a real venue moved to a paper account: each house seat whose key is not let in now let in again (the account grants a trading
 * limit only to a key authorised now), each trading house seat's limit there, the objective with its venue changed, the autonomy on — or
 * the sentence that says why not (a lead open; a house seat's key revoked, which is never let in again; nothing read yet) */
function sgMoveSteps(view, catalog, venue, now) {
  if (!view || !catalog) return "The desk is being read: a moment.";
  if (!venue || !venue.paper) return "Pick a paper account.";
  if ((view.open || []).length) return `The desk has ${plural(view.open.length, "lead")} open: it moves only with none open. Close them on the Agents pane first.`;
  const o = view.objective;
  const per = sgPer(venue, o.maxRiskPct);
  const until = num(now) + SG_SEAT_DAYS * DAY;
  const steps = [];
  const house = (view.seats || []).filter((s) => s.kind === "house");
  const revoked = house.find((s) => s.status === "revoked");
  if (revoked) return `${sgSpec(revoked.role, catalog).name}'s key was revoked, and a revoked key is never let in again: hire the seat again from the Agents pane first.`;
  for (const s of house) if (s.status !== "ok") steps.push({ say: `Let in ${s.name}`, draft: { type: "approveAgent", agentAddress: s.address, agentName: String(s.name), validUntil: until } });
  for (const s of view.seats || []) {
    const spec = sgSpec(s.role, catalog);
    if (s.kind === "house" && spec.trades) steps.push({ say: `${spec.name}'s trading limit at ${venue.name}`, draft: { type: "approveSpend", agent: s.address, scope: "trade", allow: venue.id, perPayment: String(sgPerOrder(per)), budget: String(per * SG_BUDGET_TIMES), windowHours: SG_WINDOW_HOURS, validUntil: until, renewHours: SG_RENEW_HOURS } });
  }
  steps.push({ say: `Move the desk to ${venue.name}`, draft: { type: "setDesk", desk: "desk", change: "objective", value: JSON.stringify({ text: o.text, venue: venue.id, universe: o.universe, targetPct: o.targetPct, maxRiskPct: o.maxRiskPct, maxDailyLossPct: o.maxDailyLossPct, everyMin: o.everyMin, maxOpen: o.maxOpen, reportAt: o.reportAt }) } });
  steps.push({ say: "Autonomy on paper", draft: sgControlDraft("autonomy", true) });
  return steps;
}

/* the desk's house seats that trade whose limit does not renew — none at all, or one signed without renewHours (a desk hired before the
   Superagent's limits renewed, or on the Agents pane): [] while every one renews, and before the desk and the catalog are read */
function sgUnrenewed(view, catalog) {
  if (!view || !catalog) return [];
  return (view.seats || []).filter((s) => s.kind === "house" && sgSpec(s.role, catalog).trades && !(s.limit && num(s.limit.renewHours) > 0));
}

/** A DESK WHOSE SEATS' LIMITS DO NOT RENEW (sgUnrenewed: hired before the renewing limit, like a Superagent from before it) spends its
 * budget once — about twenty entries — and then stops; Start again, Resume and the Agents pane's "Give a limit" re-use or draft limits
 * that do not renew, so nothing else gets it out short of ending the desk and hiring it again. Here each such seat is given the setup's
 * own renewing limit at the desk's paper account (the numbers sgSetupSteps signs), a seat whose key is not let in now let in again first
 * (the account grants a trading limit only to a key authorised now) — or the sentence why not. Each is signed by the owner, and replaces
 * the seat's limit now (one standing limit per seat, account/state.ts) */
function sgRenewSteps(view, catalog, venue, now) {
  if (!view || !catalog) return "The desk is being read: a moment.";
  if (!venue || !venue.paper) return "The desk's venue is not read as a paper account now: its seats' limits renew at a paper account only.";
  const stale = sgUnrenewed(view, catalog);
  if (!stale.length) return "Every trading seat's limit renews already.";
  const revoked = stale.find((s) => s.status === "revoked");
  if (revoked) return `${sgSpec(revoked.role, catalog).name}'s key was revoked, and a revoked key is never let in again: hire the seat again from the Agents pane first.`;
  const per = sgPer(venue, view.objective && view.objective.maxRiskPct);
  const until = num(now) + SG_SEAT_DAYS * DAY;
  const steps = [];
  for (const s of stale) if (s.status !== "ok") steps.push({ say: `Let in ${s.name}`, draft: { type: "approveAgent", agentAddress: s.address, agentName: String(s.name), validUntil: until } });
  for (const s of stale) steps.push({ say: `${sgSpec(s.role, catalog).name}'s trading limit, renewing`, draft: { type: "approveSpend", agent: s.address, scope: "trade", allow: venue.id, perPayment: String(sgPerOrder(per)), budget: String(per * SG_BUDGET_TIMES), windowHours: SG_WINDOW_HOURS, validUntil: until, renewHours: SG_RENEW_HOURS } });
  return steps;
}

/* the words of the renewal, before the owner says yes: exactly what signing does, with the setup's own words for the limit */
function sgRenewWords(view, catalog, venue) {
  const stale = sgUnrenewed(view, catalog);
  const per = sgPer(venue, view && view.objective && view.objective.maxRiskPct);
  const names = stale.map((s) => sgSpec(s.role, catalog).name).join(", ");
  return `Renewing signs a trading limit for ${names} at ${venue ? venue.name : "the paper account"} that renews — entries sized at ${num(view && view.objective && view.objective.maxRiskPct)}% of what the paper account holds when a session starts (${money(per)} now), any one order up to ${money(sgPerOrder(per))} so a lead that gained can still be closed, and ${money(per * SG_BUDGET_TIMES)} of entries a day (about ${SG_BUDGET_TIMES} at today's size), counted afresh every ${SG_RENEW_HOURS} hours (a close counts against none of it), for ${SG_SEAT_DAYS} days. Each replaces the seat's limit now${stale.some((s) => s.status !== "ok") ? "; a seat whose key is not let in now is let in again first" : ""}.`;
}

/** signatures one after another, each through the owner's device key (Owner.act: prepare, sign, send); the first refusal stops the rest.
 * `say(words, state)` is told where it is. Resolves { ok, at, why } — and, stopped, the reason alone and whether the account answered */
async function sgRun(steps, say) {
  for (const [i, s] of steps.entries()) {
    say(`${i + 1} of ${steps.length} · ${s.say}…`, "wait");
    let r;
    try {
      r = await Owner.act(s.draft);
    } catch (err) {
      r = { status: 0, body: { ok: false, error: String((err && err.message) || err) } };
    }
    if (refusedAt(r)) {
      // the account not answering at all (a stopped service, a dropped connection) is said as that, never as the browser's own error
      const noAnswer = !r || !r.status;
      const reason = noAnswer ? "the account did not answer" : Owner.why(r) || (r.body && (r.body.refusal && r.body.refusal.message)) || "refused";
      return { ok: false, at: i, why: `${s.say}: ${reason}`, reason, noAnswer };
    }
  }
  return { ok: true, at: steps.length, why: "" };
}

// ---- the pane --------------------------------------------------------------------------------------------------------------------------

/** the pane: the shell calls it on every read, on the route and on the lens. The frame is built once for what the desk is (no desk yet, a
 * desk on a real venue, the desk) and painted part by part */
function renderSuperagent({ el, owner, params }) {
  SG.params = params || {};
  sgWire(el);
  sgPaint(el, owner);
  sgBeat(0);
  sgSecond();
}

/* the desk's venue known to be real money: connected, and not a paper account. A venue row the account did not give this time (disconnected,
   removed, or the page's read not there) says paper: false without knowing — that is not "real", and the desk stays */
const sgRealVenue = (feed) => !!(feed && feed.venue && feed.venue.connected === true && feed.venue.paper === false);
/* the desk's venue not read as connected this time: whether it is a paper account is then not known */
const sgVenueUnread = (feed) => !!(feed && feed.venue && feed.venue.connected !== true);
/* what the pane shows: still reading, a read that failed, no desk (the setup), a desk on a venue known to be real, the desk */
const sgMode = () => (SG.desk === undefined ? (SG.err ? "error" : "wait") : SG.desk === null ? "setup" : sgRealVenue(SG.desk) ? "real" : "desk");
const sgShowing = () => ROUTE.tab === "superagent" && !document.hidden && !!A;

function sgPaint(el, owner) {
  if (!el) return;
  let root = el.firstElementChild;
  // while the owner signs, the frame on screen stays (SG.signing): the run's last words land where it asked
  const held = SG.signing && root && root.dataset && root.dataset.sg;
  const mode = held || sgMode();
  let built = false;
  if (!root || !root.dataset || root.dataset.sg !== mode) {
    sgUnmount();
    el.innerHTML = sgFrame(mode);
    root = el.firstElementChild;
    SG.setupSig = "";
    SG.typeFloor = SG.seq;
    built = true;
  }
  if (!root || !root.querySelector) return;
  const was = SG.shown;
  SG.shown = mode;
  if (mode === "error") return void paint(root.querySelector('[data-sg-p="err"]'), esc(SG.err));
  if (mode === "setup") return void sgPaintSetup(root, owner);
  if (mode === "real") return void sgPaintReal(root, owner);
  if (mode !== "desk") return;
  sgPaintDesk(root, owner);
  // the desk opening where the setup (or the real-money page) just was — Start went through: it is brought into view at its top, and its
  // name takes the focus, so neither the eye nor the keyboard is left where a form used to be
  if (built && (was === "setup" || was === "real")) sgArrive(root);
}
/* the desk brought into view at its top, its name focused (the page does not scroll a second time for the focus) */
function sgArrive(root) {
  if (typeof root.scrollIntoView === "function") root.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
  const h = root.querySelector("#sg-desk-h");
  if (h && typeof h.focus === "function") h.focus({ preventScroll: true });
}

/* the tabs under the positions, in their order: the desk's equity, its eight seats, the room, the rules. One shows at a time; the one picked
   last is kept in this browser */
const SG_TABS = [["equity", "Equity"], ["seats", "Seats"], ["room", "Room"], ["rules", "Rules"]];
const SG_TAB_KEY = "account.deskTab";
const SG_GUIDE_KEY = "account.deskGuideOff";
/* the tab showing: the one picked last in this browser (storage off, never picked, or a tab there is no more: the equity) */
function sgTabNow() {
  if (SG.tab) return SG.tab;
  let kept = "";
  try {
    kept = String(localStorage.getItem(SG_TAB_KEY) || "");
  } catch {
    kept = "";
  }
  SG.tab = SG_TABS.some(([v]) => v === kept) ? kept : "equity";
  return SG.tab;
}
/* "How to use it" put away in this browser ("Got it"); storage off: shown each visit until put away */
function sgGuideOff() {
  if (SG.guideOff !== null) return SG.guideOff;
  try {
    SG.guideOff = localStorage.getItem(SG_GUIDE_KEY) === "1";
  } catch {
    SG.guideOff = false;
  }
  return SG.guideOff;
}

/** the frame for each mode: built once, its parts painted. The desk's, top to bottom: the header (HL's market bar), the next step (only
 * while there is one), the cards waiting for the owner (only while one waits), the chart with the banner over it beside "Now", the seats'
 * line and "What it did", the open positions, then one panel of tabs — the equity, the eight seats, the room, the rules — one at a time */
function sgFrame(mode) {
  if (mode === "wait") return '<div class="sg" data-sg="wait"><div class="sg-panel sg-wait"><p class="sg-dim">Reading the desk…</p><div class="skel-rows" aria-hidden="true"><span class="skel"></span><span class="skel" style="width:60%"></span></div></div></div>';
  if (mode === "error") return '<div class="sg" data-sg="error"><div class="sg-panel sg-wait"><p class="sg-err" role="alert" data-sg-p="err"></p></div></div>';
  if (mode === "setup") return '<div class="sg" data-sg="setup"><section class="sg-panel sg-setup" aria-labelledby="sg-setup-h"><div data-sg-p="setup"></div></section></div>';
  if (mode === "real") return '<div class="sg" data-sg="real"><section class="sg-panel sg-setup" aria-labelledby="sg-real-h"><div data-sg-p="real"></div></section></div>';
  const cards = SG_ROLES.map((role) => `<article class="sg-card sg-r-${role}" data-sg-card="${role}" data-s="reading" tabindex="-1"><div class="sg-card-h" data-sg-p="h"></div><p class="sg-owns" data-sg-p="owns"></p><p class="sg-said"><q class="sg-line" data-sg-line hidden><span data-sg-txt></span><span class="sg-caret" aria-hidden="true"></span></q></p><div class="sg-said-m" data-sg-p="said"></div><div class="sg-metric" data-sg-p="m"></div></article>`).join("");
  // the tabs as Regular's tables draw theirs (terminal.css .tt-tabs, its line sliding under the tab pressed); the arrows move between them
  const tab = sgTabNow();
  const tabs = SG_TABS.map(([v, t]) => `<button type="button" role="tab" id="sg-t-${v}" aria-controls="sg-tp-${v}" aria-selected="${String(v === tab)}" tabindex="${v === tab ? "0" : "-1"}" data-sg-tab="${v}">${t}</button>`).join("");
  const pane = (v, cls, body) => `<div class="${cls}" role="tabpanel" id="sg-tp-${v}" aria-labelledby="sg-t-${v}" data-sg-tp="${v}"${v === tab ? "" : " hidden"}>${body}</div>`;
  return `<div class="sg" data-sg="desk">
    <header class="sg-head sg-panel"><div class="sg-head-a" data-sg-p="brand"></div><div class="sg-stats" data-sg-p="meta"></div><div class="sg-tools" data-sg-p="tools"></div><div class="sg-head-n" data-sg-p="note" role="status"></div></header>
    <section class="sg-next sg-panel" data-sg-p="next" aria-label="Next step" hidden></section>
    <section class="sg-waits sg-panel" data-sg-p="waits" aria-labelledby="sg-waits-h" tabindex="-1" hidden></section>
    <div class="sg-main">
      <section class="sg-chartp sg-panel" aria-labelledby="sg-chart-h"><div class="sg-chart-h" data-sg-p="chart-h"></div><div class="sg-stage"><div class="sg-chart" data-sg-chart></div><div class="sg-banner" data-sg-p="banner" role="status" aria-live="polite"></div></div></section>
      <aside class="sg-side sg-panel" aria-label="What the desk is doing"><div class="sg-now" data-sg-p="now"></div><div class="sg-relay" data-sg-p="relay"></div><div class="sg-sec-h sg-did-h"><h3 class="sg-lab" id="sg-did-h">What it did</h3><span class="sg-dim" data-sg-p="did-n"></span></div><ol class="sg-did" data-sg-p="did" aria-labelledby="sg-did-h"></ol></aside>
    </div>
    <section class="sg-pos sg-panel" data-sg-p="pos" aria-label="Open positions"></section>
    <section class="sg-low sg-panel" aria-label="The desk in detail">
      <div class="tt-tabs sg-tabs" role="tablist" aria-label="The desk in detail">${tabs}</div>
      ${pane("equity", "sg-bal", '<div data-sg-p="bal"></div>')}
      ${pane("seats", "sg-cards", cards)}
      ${pane("room", "sg-room", '<div class="sg-sec-h"><h3 class="sg-lab" id="sg-room-h">The room</h3><span class="sg-dim" data-sg-p="room-n"></span></div><div class="sg-msgs" data-sg-msgs role="log" aria-live="polite"></div>')}
      ${pane("rules", "sg-rules", '<div data-sg-p="rules"></div>')}
    </section>
  </div>`;
}

/* what was mounted on the frame let go: the chart's reads, the banners' timer and what waits to be played, the typing */
function sgUnmount() {
  const el = $("pane-superagent");
  sgLetChartGo(el && el.querySelector ? el.querySelector("[data-sg]") : null);
  clearTimeout(SG.banner.timer);
  SG.banner = { queue: [], now: null, until: 0, timer: 0, n: SG.banner.n };
  SG.typing.clear();
  SG.typed = {};
}
/* the chart let go of — its reads and timers stop — when the frame goes or it shows something else */
function sgLetChartGo(root) {
  const chart = root && root.querySelector ? root.querySelector("[data-sg-chart]") : null;
  if (chart && typeof chRelease === "function") chRelease(chart);
  SG.mounted = "";
  SG.linesSig = "";
  SG.marksSig = "";
}

/** a tab under the positions shown: its panel, its button pressed (the line sliding under it), kept for the next visit in this browser; the
 * room opens at its newest line. `focus`: the tab's button takes the focus (the arrow keys moved there) */
function sgTab(v, { focus = false } = {}) {
  if (!SG_TABS.some(([x]) => x === v)) return;
  const was = SG.tab;
  SG.tab = v;
  if (was !== v) {
    try {
      localStorage.setItem(SG_TAB_KEY, v);
    } catch {
      // storage off: kept for this visit
    }
  }
  const el = $("pane-superagent");
  const root = el && el.querySelector ? el.querySelector('[data-sg="desk"]') : null;
  if (!root || !root.querySelectorAll) return;
  for (const b of root.querySelectorAll("[data-sg-tab]")) {
    const on = b.dataset.sgTab === v;
    b.setAttribute("aria-selected", String(on));
    b.setAttribute("tabindex", on ? "0" : "-1");
    if (on && focus && typeof b.focus === "function") b.focus();
  }
  for (const p of root.querySelectorAll("[data-sg-tp]")) p.hidden = p.dataset.sgTp !== v;
  sgSlideTabs(root);
  if (v === "room") {
    const box = root.querySelector("[data-sg-msgs]");
    if (box) box.scrollTop = box.scrollHeight;
  }
}
/* the tabs' line slid under the tab pressed, once the bar has a size */
function sgSlideTabs(root) {
  if (typeof bkSlideUnder === "function") bkSlideUnder(root.querySelector(".sg-tabs"));
}
/* the "Waits for you" strip brought into view, its first answer focused (from a card's "Answer ›") */
function sgToWaits() {
  const el = $("pane-superagent");
  const strip = el && el.querySelector ? el.querySelector('[data-sg-p="waits"]') : null;
  if (!strip || strip.hidden) return;
  if (typeof strip.scrollIntoView === "function") strip.scrollIntoView({ block: "nearest", behavior: still() ? "auto" : "smooth" });
  const first = (strip.querySelector && strip.querySelector("button:not(:disabled)")) || strip;
  if (typeof first.focus === "function") first.focus({ preventScroll: true });
}

// ---- the desk's parts --------------------------------------------------------------------------------------------------------------------

/* the reads have failed SG_STALE_AFTER times in a row: since when nothing was read ({ since: ISO }), or null */
const sgStale = () => (SG.fails >= SG_STALE_AFTER && SG.downSince ? { since: new Date(SG.downSince).toISOString() } : null);

function sgPaintDesk(root, owner) {
  const feed = SG.desk;
  const now = Date.now();
  const q = (s) => root.querySelector(s);
  const stale = sgStale();
  // the read is stale: said on the frame for the styles
  if (root.classList && typeof root.classList.toggle === "function") root.classList.toggle("sg-stale", !!stale);
  paint(q('[data-sg-p="brand"]'), sgBrandHtml(feed, SG.view, now, stale));
  paint(q('[data-sg-p="meta"]'), sgMetaHtml(feed, SG.catalog, now, stale));
  // End goes once the session has ended: the focus it held moves to the run button beside it, never to the page
  const tools = q('[data-sg-p="tools"]');
  const f = typeof document !== "undefined" ? document.activeElement : null;
  const onEnd = !!(f && f.dataset && f.dataset.fk === "sg:end");
  paint(tools, sgToolsHtml(feed, owner));
  if (onEnd && tools && tools.querySelector && !tools.querySelector('[data-fk="sg:end"]')) {
    const run = tools.querySelector('[data-fk="sg:run"]');
    if (run && typeof run.focus === "function") run.focus();
  }
  paint(q('[data-sg-p="note"]'), sgNoteHtml(feed, SG.view, owner, now));
  const next = q('[data-sg-p="next"]');
  const nextHtml = sgNextHtml(feed, SG.view);
  paint(next, nextHtml);
  if (next) next.hidden = !nextHtml;
  sgPaintWaits(q('[data-sg-p="waits"]'), owner);
  sgPaintChart(root, feed, now);
  sgPaintBanner(root);
  paint(q('[data-sg-p="now"]'), sgNowHtml(feed, SG.view, SG.catalog, now, stale));
  paint(q('[data-sg-p="relay"]'), sgRelayHtml(feed, SG.view, SG.catalog, now));
  const did = sgDid(feed, SG.room, now);
  paint(q('[data-sg-p="did"]'), sgDidHtml(did, feed));
  paint(q('[data-sg-p="did-n"]'), did.length ? "newest first" : "");
  paint(q('[data-sg-p="pos"]'), sgPositionsHtml(feed));
  sgPaintCards(root, now);
  paint(q('[data-sg-p="bal"]'), sgBalanceHtml(feed, SG.view, SG.live, now));
  paint(q('[data-sg-p="rules"]'), `${sgRulesHtml(feed, SG.view)}${sgPipeHtml(feed)}`);
  sgPaintRoom(root);
  sgSlideTabs(root);
}

/* the desk's venue by its name, never its id: the venue's own while it is connected, else the name kept with the objective at hire
   (DeskObjective.venueName), else the name the account gave if it is a name */
function sgVenueName(feed, view) {
  const v = (feed && feed.venue) || {};
  const kept = view && view.objective && view.objective.venueName;
  if (v.connected === true && v.name) return String(v.name);
  if (kept) return String(kept);
  if (v.name && v.name !== v.id) return String(v.name);
  return "the desk's paper account";
}

/** the header's first part: the desk's name (the heading the focus is given after Start), Paper, its venue, the session in HL's "Online"
 * pill — Live and its clock, Paused, Halted, Ended, No session; while the reads are stale, since when nothing was read, and no clock runs */
function sgBrandHtml(feed, view, now, stale = null) {
  const s = feed.session;
  const st = s ? s.state : "none";
  const v = feed.venue || {};
  const clock = s && st === "live" ? sgClock(now - Date.parse(s.startedAt)) : "";
  const pill = stale
    ? `<span class="sg-pill sg-pill-off">Not read since ${esc(nyTime(stale.since))}</span>`
    : { live: `<span class="sg-pill sg-pill-on"><i aria-hidden="true"></i>Live <span class="tab-nums" data-sg-clock>${esc(clock)}</span> of ${esc(String(num(s && s.hours)))} h</span>`, paused: '<span class="sg-pill sg-pill-warn"><i aria-hidden="true"></i>Paused</span>', halted: '<span class="sg-pill sg-pill-bad"><i aria-hidden="true"></i>Halted</span>', ended: '<span class="sg-pill sg-pill-off">Ended</span>', none: '<span class="sg-pill sg-pill-off">No session</span>' }[st] || `<span class="sg-pill sg-pill-off">${esc(String(st))}</span>`;
  // beside the Paper chip the venue's name without its own "· paper" (Momentum · paper → Momentum): paper is said once; at the end, the way
  // to how the desk works (sgHow)
  const name = sgVenueName(feed, view);
  return `<h2 class="sg-desk-n" id="sg-desk-h" tabindex="-1">${esc((view && view.name) || "The superagent")}</h2>${v.paper ? '<span class="sg-chip">Paper</span>' : ""}<span class="sg-venue">${esc(v.paper ? sgPaperless(name) : name)}${v.connected !== true ? " · not connected" : ""}</span>${pill}<button type="button" class="sg-link sg-how-l" data-sg-act="how" data-fk="sg:how">How it works</button>`;
}
/* a paper account's name without its own "paper" where a Paper chip already says it (Regular's tkPaperless where it is on the page) */
const sgPaperless = (name) => (typeof tkPaperless === "function" ? tkPaperless(name) : String(name || "").replace(/\s*[·-]\s*paper\s*$/i, "") || String(name || ""));

/* a stat as HL's market bar draws one: its label over its value */
const sgStat = (label, value, cls = "") => `<div class="sg-stat${cls ? ` ${cls}` : ""}"><span class="sg-stat-l">${esc(label)}</span><span class="sg-stat-v tab-nums">${value}</span></div>`;
/* the desk's equity now: the open leads' fresh prices summed where they are fresh (sgLiveEquity), else the desk's own last figure */
function sgEquityNow(feed, live, now) {
  const fresh = !!live && live.usd !== null && Number.isFinite(live.usd) && now - live.at < SG_QUOTES_MS * 2 + 1_000;
  return { usd: fresh ? live.usd : num(feed && feed.equity && feed.equity.nowUsd), fresh };
}

/** the header's stats: the desk's equity with its change since the session began beside it (in the up or down colour, its sign written:
 * never colour alone), the target and what is left to it, the next cycle's countdown (stopped while the reads are stale), the brain */
function sgMetaHtml(feed, catalog, now, stale = null) {
  const eq = feed.equity || {};
  const t = feed.target || {};
  const start = num(eq.startUsd);
  const { usd: nowUsd } = sgEquityNow(feed, SG.live, now);
  const change = nowUsd - start;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const toGo = num(t.targetUsd) - change;
  const s = feed.session;
  const nextAt = feed.routines && feed.routines.nextCycleAt;
  const next = !s ? "no session" : (s.state === "live" || s.state === "halted") && nextAt ? (stale ? esc(sgNextWords(nextAt, feed, now)) : `<span data-sg-next="${esc(nextAt)}">${esc(sgNextWords(nextAt, feed, now))}</span>`) : `none while ${esc(s.state)}`;
  return [
    sgStat("Equity", `${esc(money(nowUsd))} <span class="${dir}" title="${esc(`${sgSigned(change)} since the session started`)}">${esc(sgPct(start ? (change / start) * 100 : 0))}</span>`),
    sgStat("Target", `${esc(sgPct(t.pct, num(t.pct) % 1 ? 1 : 0))} · ${toGo > 0 ? `${esc(money(toGo))} to go` : "reached"}`),
    sgStat("Next cycle", next),
    sgBrainStat(sgBrainNow(feed, SG.view), catalog),
  ].join("");
}
/** the brain as the header says it: the feed's own (its standing, its calls and spend, read every second), with the provider the desk's
 * view names where the feed does not carry one — so a scripted brain is said as the script it is, never as the model it is filed under */
function sgBrainNow(feed, view) {
  const b = feed && feed.brain;
  if (!b || b.provider) return b || null;
  const kept = view && view.brain && view.brain.provider;
  return kept ? { ...b, provider: String(kept) } : b;
}

/* the brain's fix, as the account gives it (feed.brain.fix: what is wrong in a sentence, the key file's path, a command to run — never one
   the page composes, never a sample key): a short word for the header, the whole of it in a sheet */
const SG_FIX_WORDS = { "no-key": "Not ready", example: "Not ready", unusable: "Key file unusable", rejected: "Key refused", env: "Not ready" };
/** the brain as a header stat, and always a button — drawn as one, edged, its way in written on it ("Change ›", or "Connect a key ›" in
 * amber while it cannot think) — that opens the Brains sheet on it: its model as people say it, its calls (and how many got no answer at
 * all — the account's spend.failed counts every call that came back with nothing: a key refused, a rate limit, an endpoint that could not
 * be reached; it cannot tell those apart, so neither does this: "not answered", as the account's own evening report says it, never
 * "refused"), what they cost — or, when it cannot think, a word in amber with the account's reason one pointer away; the sheet says the
 * rest, takes a key (pasted, any provider's), switches the brain */
function sgBrainStat(b, catalog) {
  if (!b) return "";
  const stat = (value, cls, go) => `<button type="button" class="sg-stat sg-brain${cls}" data-sg-act="brain" data-fk="sg:brain" title="The AI model the desk thinks with: switch it, or paste an API key from any provider"><span class="sg-stat-l">Brain</span><span class="sg-brain-go">${go} ›</span><span class="sg-stat-v tab-nums">${value}</span></button>`;
  if (!b.ok) {
    const code = b.fix && b.fix.code;
    const word = SG_FIX_WORDS[code] || "Not ready";
    const why = (b.fix && b.fix.words) || b.why || SG_NO_WHY;
    return stat(`<span class="sg-warn-t" title="${esc(why)}">${esc(word)}</span>`, " sg-no", "Connect a key");
  }
  // a scripted brain is a script whatever model it is filed under; a model is named from the catalog's list of its own provider (or of any,
  // where the provider is not known), else as people say its id
  const scripted = b.provider === "scripted";
  const brains = catalog ? [...(catalog.brains || []), catalog.brain].filter(Boolean) : [];
  const mine = b.provider ? brains.filter((x) => (x.id || x.provider) === b.provider) : brains;
  const m = scripted ? null : mine.flatMap((x) => x.models || []).find((x) => x.id === b.model);
  const name = m ? String(m.name).replace(/^Claude /, "") : scripted || !b.model ? b.label || "a script" : sgModelName(b.model);
  const sp = b.spend || {};
  const tokens = num(sp.inputTokens) + num(sp.outputTokens);
  const cost = num(sp.usd) === 0 && tokens === 0 ? "no cost recorded" : `~${money(sp.usd)}`;
  return stat(`${esc(name)} · ${esc(plural(num(sp.calls), "call"))}${num(sp.failed) > 0 ? ` · ${esc(String(num(sp.failed)))} not answered` : ""} · ${esc(cost)}${num(sp.unpricedTokens) ? ` + ${esc(String(sp.unpricedTokens))} tokens unpriced` : ""}`, "", "Change");
}

/** where a brain's key goes, said by the account (brain.fix): its sentence, the key file's path with Copy, the command (when it gives one)
 * with Copy, whether the account must restart to read it. The page composes no command and shows no sample key; with no fix given, the
 * account's own reason */
function sgFixHtml(b) {
  const fix = b && b.fix;
  if (!fix) return `<p class="sg-fix-w">${esc(sgCap(sgStop((b && b.why) || SG_NO_WHY)))}</p>`;
  const row = (label, text, copy) => `<div class="sg-fix-r"><span class="sg-fix-l">${esc(label)}</span><code class="sg-path">${esc(text)}</code><button type="button" class="sg-btn sg-btn-s" data-sg-copy="${esc(text)}">${esc(copy)}</button></div>`;
  // the command first where there is one (it makes the file the sentence speaks of), then the file itself; a restart said only where one is
  // needed (the account's sentence says when it reads the key)
  return `<div class="sg-fix"><p class="sg-fix-w">${esc(fix.words || (b && b.why) || SG_NO_WHY)}</p>${fix.command ? row("Run, in Terminal", fix.command, "Copy the command") : ""}${fix.file ? row("The key file", fix.file, "Copy the path") : ""}${fix.restart ? '<p class="sg-dim">The account reads the key when it starts: restart it once the key is in place.</p>' : ""}</div>`;
}
/** The Brains sheet (ui/brains.js) from this pane. From the desk's header: on the brain the desk thinks with, "Use this brain" signing
 * setDesk change "brain" (one signature; the feed's brain, and the header with it, say the new one at the next read). From the
 * setup (`form` given): on the brain the form names, "Pick it for the desk" putting it into the form, and a key saved there shows in the
 * checklist at once (the catalog is read again). `pick`: a provider to open on */
function sgOpenBrains(form, pick = "") {
  if (typeof openBrains !== "function") return;
  const ctx = sgBrainsCtx(form, pick);
  // opened from the desk while its brain cannot think (as the header says it): the sheet's paste row has the focus, the key the one thing
  // missing
  const b = !form && SG.desk ? sgBrainNow(SG.desk, SG.view) : null;
  openBrains(b && !b.ok ? { ...ctx, focus: "paste" } : ctx);
}
/** Where the Brains sheet opens from — and where the setup's own paste row is (sgConnectAct) — as ui/brains.js reads it: the desk (`form`
 * null: the desk's brain in use, switched by a signed setDesk) or the setup (`form`: the brain its form names, a pick put into that form —
 * where there is a form yet). After a change: the desk's reads again */
function sgBrainsCtx(form, pick = "") {
  const root = $("pane-superagent");
  const setup = () => (root && root.querySelector ? root.querySelector("form.sg-setup-f") : null);
  const brainOf = () => {
    const f = setup();
    const b = f ? sgBrainOf(formFields(f), SG.catalog) : null;
    return b && typeof b === "object" ? b : null;
  };
  return {
    where: form ? "setup" : "superagent",
    catalog: SG.catalog,
    pick,
    cur: () => (form ? brainOf() : (SG.view && SG.view.brain) || sgBrainNow(SG.desk, SG.view)),
    desk: () => !form && !!SG.desk,
    ...(form ? { form: setup } : {}),
    after: () => {
      sgAfter();
      SG.viewAt = 0;
      sgAgain([]);
    },
  };
}
/* the setup's paste row (ui/brains.js brPasteHtml, in the checklist's "A brain key"): Connect, as the Brains sheet's own row does it, with
   the pick put into the setup's form */
function sgConnectAct(act, strip) {
  if (typeof brConnectAct !== "function" || !strip) return;
  brConnectAct(act, strip, sgBrainsCtx(true));
}
/* a Copy button: its text to the clipboard, the button saying so a moment */
function sgCopyClick(e) {
  const b = e.target && e.target.closest && e.target.closest("[data-sg-copy]");
  if (b) copyText(b.dataset.sgCopy, b);
}

/** the owner's controls: one run button (Pause, Resume, or after the end "Start again · auto on paper" — at a paper account a new session
 * with its autonomy on, in one signature; elsewhere "Start a new session" — one element whatever it says, so the focus stays on it),
 * Cycle now, Autonomy Cards | Auto on paper, End. A browser that only looks sees them off, and why */
function sgToolsHtml(feed, owner) {
  const s = feed.session;
  const st = s ? s.state : "none";
  const off = owner ? "" : ' disabled title="This browser can look but not sign"';
  const btn = (act, label, cls = "sg-btn", title = "", fk = act, v = "") => `<button type="button" class="${cls}" data-sg-act="${act}"${v ? ` data-v="${esc(v)}"` : ""} data-fk="sg:${fk}"${off || (title ? ` title="${esc(title)}"` : "")}>${esc(label)}</button>`;
  const paper = !!(feed.venue && feed.venue.paper);
  const auto = !!(feed.autonomy && feed.autonomy.paper);
  const again = paper ? btn("resume", "Start again · auto on paper", "sg-btn sg-btn-p", "A new session, its autonomy on paper: one signature", "run", "auto") : btn("resume", "Start a new session", "sg-btn sg-btn-p", "", "run");
  const run = st === "live" || st === "halted" ? btn("pause", "Pause", "sg-btn", "No new cycle until you resume; the desk still follows its open orders", "run") : st === "paused" ? btn("resume", "Resume", "sg-btn sg-btn-p", "Cycles start again", "run") : st === "ended" ? again : "";
  const cycle = st === "live" || st === "halted" ? btn("cycle", "Cycle now", "sg-btn", feed.brain && feed.brain.ok ? "Run one cycle now: the brain is asked, which costs its tokens" : "The house seats have no brain to think with: a cycle now runs the plan's exits only") : "";
  // each choice says what it does where it is pointed at (a choice that cannot be made says why instead)
  const means = { off: "Cards: each order the seats want waits for your yes", on: "Auto on paper: the seats place their orders themselves, each inside its trading limit" };
  const seg = `<div class="sg-seg" role="group" aria-label="Autonomy"><span class="sg-seg-l" aria-hidden="true">Autonomy</span>${[["off", "Cards"], ["on", "Auto on paper"]].map(([v, t]) => `<button type="button" data-sg-act="autonomy" data-v="${v}" data-fk="sg:auto:${v}" aria-pressed="${String((v === "on") === auto)}"${off || (v === "on" && !paper ? ` disabled title="${sgVenueUnread(feed) ? "The desk's venue is not connected: autonomy waits until it is read as a paper account" : "Autonomy is for a paper account only"}"` : ` title="${means[v]}"`)}>${t}</button>`).join("")}</div>`;
  const end = st !== "ended" && st !== "none" ? btn("end", "End", "sg-btn sg-btn-g", "End the session: no cycle runs, and the open leads are not managed until a new one starts") : "";
  return `${run}${cycle}${seg}${end}`;
}

/* how often a cycle comes, as the feed's routines say it ("every minute", "every 5 minutes"), or "" where it does not say */
function sgEvery(feed) {
  const n = Number(feed && feed.routines && feed.routines.everyMin);
  return n > 0 ? (n === 1 ? "every minute" : `every ${plural(n, "minute")}`) : "";
}
/** the next step, between the header and the chart: while the brain cannot think, connecting one — the one thing the desk is missing (Head,
 * Search and Risk think with it) — with a button that opens the Brains sheet at its paste row; else, until "Got it" puts it away in this
 * browser, how to use the desk in three lines. Nothing once neither is wanted */
function sgNextHtml(feed, view) {
  const b = sgBrainNow(feed, view);
  const how = '<button type="button" class="sg-link" data-sg-act="how" data-fk="sg:how-next">How it works</button>';
  if (b && !b.ok) return `<div class="sg-next-t"><b>Next: connect a brain.</b> <span class="sg-dim">Head, Search and Risk think with an AI model. Paste an API key from any provider: the account tells whose it is and picks its best model. Until then no new lead is found; the open leads' take-profits, stops and time limits still run.</span></div><div class="sg-next-k">${how}<button type="button" class="sg-btn sg-btn-p" data-sg-act="brain" data-fk="sg:next">Connect a brain</button></div>`;
  if (sgGuideOff()) return "";
  const every = sgEvery(feed) || "cycle by cycle";
  return `<div class="sg-next-t"><b>How to use it.</b> <span class="sg-dim">The desk trades this paper account by itself, ${esc(every)}. <b>Brain</b> is the AI model it thinks with: change it there. <b>Autonomy</b>: Cards — each order waits for your yes; Auto on paper — the seats place their orders themselves. Each buy and sell lands on the chart, and "What it did" says why.</span></div><div class="sg-next-k">${how}<button type="button" class="sg-btn sg-btn-g" data-sg-act="guide-off" data-fk="sg:guide-off">Got it</button></div>`;
}

/** How it works, in a sheet: what the desk is and does, the brain, a cycle and the checks it passes, the autonomy, the controls, and where
 * to read it — each said as the desk does it (the duties, the cycle's minutes and the checks are this page's own: SG_DUTIES, the feed) */
function sgHow() {
  if (typeof openSheet !== "function") return;
  const feed = SG.desk;
  const every = sgCap(sgEvery(feed)) || "Each cycle";
  const item = (h, body) => `<li><b>${esc(h)}</b><span>${body}</span></li>`;
  openSheet(`<ol class="sg-how">
    ${item("It trades a paper account by itself.", "Paper money only: nothing real moves. It says Paper wherever it shows.")}
    ${item("A brain thinks for three seats.", "Head, Search and Risk ask an AI model. <b>Brain</b>, in the header, switches the model or takes a key — paste one from any provider and the account tells whose it is. Each call costs that provider's tokens, counted beside the model.")}
    ${item(`${every}, a cycle.`, "Search scans the venue's markets for a lead → Risk sizes it and sets its take-profit, stop and time limit → the Sniper places it → the Exit closes it at one of the three. Hard checks — the spread, the risk a lead may take, the leads open at once, the day's loss line — turn a lead down at the door; past the day's loss line the desk halts until the next New York day.")}
    ${item("Autonomy: Cards or Auto on paper.", "Cards: each order the seats want waits for your yes — on this page under Waits for you, and under Portfolio. Auto on paper: the seats place their orders at once, each inside its trading limit, without a card.")}
    ${item("The controls.", "Pause: no new cycle until you resume — the desk still follows its open orders. Cycle now: one cycle at once (it asks the brain). End: the session stops, and the open leads are not managed until a new one starts.")}
    ${item("Reading it.", "The chart is the market the desk trades: each entry and each close lands on it as a dot with its words, and a lead it holds draws its take-profit and stop across. As a step happens a banner over the chart says it, the lead moves along the seats' line under Now (Search → Risk → Sniper → Exit), and What it did adds a row with why. Under them: the open positions, then Equity (the desk's equity and its closes), Seats (each seat's latest words and number), Room (everything the desk said, in plain words), Rules (the numbers its checks use).")}
    ${item("Sharks for what it makes.", "Each whole 1% your paper accounts make since they started puts one more shark in the ocean behind the page (twelve at most); each 1% lost takes one away.")}
  </ol>`, { title: "How the superagent works" });
}

/** the line under the header: why the desk is halted (amber), what Start just did (for a minute), and — arrived from Regular on another
 * paper account — which account the superagent trades, with a way to move it there when no lead is open */
function sgNoteHtml(feed, view, owner, now) {
  const s = feed.session;
  const out = [];
  if (s && s.halted) out.push(`<span class="sg-warn-t">Halted: ${esc(sgTidy(s.halted.why))}</span>`);
  // what Start (or a move) said, for a minute: done in the accent — with, until the desk's first cycle has run, that it starts within
  // seconds (the feed's own count says when it has) — or stopped short, in amber
  if (SG.started && now - SG.started.at < SG_STARTED_MS) {
    const first = SG.started.tone !== "warn" && s && s.state === "live" && num(s.cycles) === 0 ? " The first cycle starts within seconds." : "";
    out.push(`<span class="${SG.started.tone === "warn" ? "sg-warn-t" : "sg-ok-t"}">${esc(SG.started.text + first)}</span>`);
  }
  // a desk whose trading seats' limits do not renew stops once a budget is spent — and a seat with no limit at all (none signed, or the one
  // signed ran out: its days, or the key it was for) places nothing: each said as it is, with the one way out that keeps the desk (sgRenew),
  // which signs the setup's own renewing limit for every such seat
  const stale = feed.venue && feed.venue.paper ? sgUnrenewed(view, SG.catalog) : [];
  if (stale.length) {
    const renew = owner ? ` <button type="button" class="sg-link" data-sg-act="renew" data-fk="sg:renew">Renew the seats' limits…</button>` : "";
    const names = (l) => esc(l.map((x) => sgSpec(x.role, SG.catalog).name).join(", "));
    const once = stale.filter((x) => x.limit);
    const none = stale.filter((x) => !x.limit);
    const said = [once.length ? `The seats' trading limits do not renew: once a budget is spent, that seat's orders stop until a new limit is signed (${names(once)}).` : "", none.length ? `${none.length > 1 ? "These seats have" : "This seat has"} no trading limit now — none was signed, or the one signed ran out — so ${none.length > 1 ? "they place" : "it places"} nothing (${names(none)}).` : ""].filter(Boolean).join(" ");
    out.push(`<span class="sg-warn-t">${said}${renew}</span>`);
  }
  const want = SG.params && SG.params.venue;
  if (want && feed.venue && want !== feed.venue.id && A) {
    const there = (A.venues || []).find((v) => v.id === want);
    if (there) {
      const open = sgLeads(feed).filter((l) => SG_OPEN.has(l.state)).length;
      const move = owner && !open && there.paper ? ` <button type="button" class="sg-link" data-sg-act="move" data-v="${esc(want)}" data-fk="sg:move">Move it there…</button>` : "";
      out.push(`<span class="sg-dim">The superagent trades ${esc(sgVenueName(feed, view))}, not ${esc(there.name)}.${move}</span>`);
    }
  }
  return out.join("");
}

// ---- now, the seats' line, what it did ---------------------------------------------------------------------------------------------------

/* a lead's plan in words — its size, take-profit, stop and time limit, as Risk cleared it — and its take-profit and stop as prices from an
   entry (written at the entry's own places) */
const sgPlanWords = (l) => [l.sizeUsd !== undefined && l.sizeUsd !== null && Number.isFinite(Number(l.sizeUsd)) ? money(l.sizeUsd) : "", Number.isFinite(Number(l.tpPct)) ? `take-profit +${Number(l.tpPct)}%` : "", Number.isFinite(Number(l.slPct)) ? `stop −${Number(l.slPct)}%` : "", Number.isFinite(Number(l.maxHours)) ? `${Number(l.maxHours)} h` : ""].filter(Boolean).join(" · ");
function sgPlanPrices(l, entry) {
  const e = Number(entry);
  if (!l || !Number.isFinite(e)) return "";
  const dir = l.side === "buy" ? 1 : -1;
  return [Number.isFinite(Number(l.tpPct)) ? `take-profit ${sgAtDecimals(e * (1 + (dir * Number(l.tpPct)) / 100), e)}` : "", Number.isFinite(Number(l.slPct)) ? `stop ${sgAtDecimals(e * (1 - (dir * Number(l.slPct)) / 100), e)}` : ""].filter(Boolean).join(" · ");
}

/** "NOW": what the desk is doing in one sentence, and its cycle with the next one's countdown — or why it does nothing: the account not read
 * lately, no brain (with the way to one), no session, paused, halted, ended — and under it, in a line, the lead it holds now (its result,
 * its take-profit and stop) or what stands */
function sgNowHtml(feed, view, catalog, now, stale = null) {
  const s = feed.session;
  const b = sgBrainNow(feed, view);
  const w = feed.working;
  const held = sgLeads(feed).filter((l) => (l.state === "executed" || l.state === "closing") && l.entry && Number.isFinite(Number(l.entry.price)));
  const nextAt = feed.routines && feed.routines.nextCycleAt;
  const running = !!s && (s.state === "live" || s.state === "halted");
  const cycle = !s ? "" : running && nextAt && !stale ? `Cycle ${num(s.cycles)} · next <span data-sg-next="${esc(nextAt)}">${esc(sgNextWords(nextAt, feed, now))}</span>` : `Cycle ${num(s.cycles)}`;
  const rejected = num(feed.funnel && feed.funnel.rejected);
  const tally = `${plural(held.length, "lead")} held · ${plural(rejected, "lead")} turned down this session`;
  let big;
  let tone = "";
  let sub;
  let act = "";
  if (stale) {
    big = `Not read since ${nyTime(stale.since)}`;
    tone = "dim";
    sub = SG.err;
  } else if (b && !b.ok) {
    // the account's own reason first (its fix's sentence, else its why), never one guessed
    big = "No AI brain: it can't look for trades";
    tone = "warn";
    sub = `${sgCap(sgStop((b.fix && b.fix.words) || b.why || SG_NO_WHY))} Head, Search and Risk think with it.${held.length ? " The leads it holds still keep their take-profits, stops and time limits." : ""}`;
    act = '<button type="button" class="sg-btn sg-btn-p" data-sg-act="brain" data-fk="sg:now-brain">Connect a brain</button>';
  } else if (!s) {
    big = "No session";
    sub = "Start one from the controls above.";
  } else if (s.state === "ended") {
    big = "Session ended";
    sub = `The desk is not running: the leads it holds are not managed until a new session starts. ${tally}.`;
  } else if (s.state === "paused") {
    big = "Paused";
    sub = `No cycle runs until you resume; the desk still follows its orders. ${tally}.`;
  } else if (s.state === "halted") {
    big = "Halted until the next New York day";
    tone = "down";
    sub = `${sgCap(sgTidy(s.halted ? s.halted.why : "the day's loss line"))}.`;
  } else {
    const lead = w && w.lead ? sgLeads(feed).find((l) => l.id === w.lead) : null;
    big = w ? `${sgSpec(w.role, catalog).name} is ${SG_WORK_WORDS[w.what] || w.what}${lead ? ` · ${sgBase(lead.symbol)} ${lead.side === "buy" ? "long" : "short"}` : ""}` : held.length ? `Exit is watching ${plural(held.length, "lead")}` : "Waiting for the next cycle";
    sub = num(feed.inFlight) > 0 ? `${plural(num(feed.inFlight), "brain call")} under way · ${tally}` : tally;
  }
  // the lead held now, newest: its result, its take-profit and stop (never in place of why the desk cannot go on)
  const l = !stale && !(b && !b.ok) ? sgNewest(held) : null;
  if (l && s && s.state !== "ended") {
    const res = l.unrealizedUsd !== undefined && l.unrealizedUsd !== null && Number.isFinite(Number(l.unrealizedUsd)) ? `${sgSigned(l.unrealizedUsd)} on ` : "";
    sub = `${res}${qtyOf(l.entry.qty)} ${sgBase(l.symbol)} ${l.side === "buy" ? "long" : "short"}${sgPlanPrices(l, l.entry.price) ? ` · ${sgPlanPrices(l, l.entry.price)}` : ""}`;
  }
  return `<div class="sg-now-h"><span class="sg-lab">Now</span><span class="sg-now-c tab-nums">${cycle}</span></div><p class="sg-now-big"${tone ? ` data-tone="${tone}"` : ""}>${esc(big)}</p><p class="sg-now-sub">${esc(sub)}</p>${act}`;
}

/** THE SEATS' LINE under "Now": Search → Risk → Sniper → Exit, each seat's face (breathing; its brain call three dots over it), its name and
 * its count this session, lit while it works or while the banner tells its step (Watch's lights the Exit's step); the bubble over the seat
 * whose words go with that step; the lead in play as a chip on its step, moving along as it goes (sgPlay) */
function sgRelayHtml(feed, view, catalog, now) {
  const cards = sgCards(feed, view, catalog, SG.room, now);
  const f = feed.funnel || {};
  const resting = sgLeads(feed).filter((l) => (l.state === "executed" || l.state === "closing") && !(l.entry && Number.isFinite(Number(l.entry.price)))).length;
  const placed = f.placed !== undefined && f.placed !== null && Number.isFinite(Number(f.placed)) ? Number(f.placed) : num(f.executed) + resting;
  const scan = feed.lastScan;
  const counts = { search: scan ? `${plural((scan.rows || []).length, "market")} looked at` : `${num(f.scanned)} found`, risk: `${num(f.cleared)} cleared · ${num(f.rejected)} out`, sniper: `${placed} placed`, exit: `${num(f.closed)} closed` };
  // lit: the seat at work — else, while a banner tells a step, the seat that took it (Watch's on the Exit's step)
  const w = feed.working;
  const at = w ? w.role : SG.banner.now ? SG.banner.now.role : "";
  const lit = at === "watch" ? "exit" : at;
  const bub = SG.bubble && SG.bubble.until > now ? SG.bubble : null;
  const steps = SG_STEPS.map(([role, word], i) => {
    const c = cards.find((x) => x.role === role);
    const on = lit === role;
    const said = bub && (bub.role === role || (role === "exit" && bub.role === "watch")) ? `<span class="sg-rs-b" data-k="b:${esc(String(bub.n))}">${esc(bub.text)}</span>` : "";
    return `<li class="sg-rs sg-r-${role}" data-k="rs:${role}" data-s="${esc(c ? c.status : "reading")}"${on ? ' data-on="1"' : ""}${c && c.why ? ` title="${esc(c.why)}"` : ""}>${said}<span class="sg-rs-a">${sgBlob(role, i)}</span><span class="sg-rs-n">${esc(sgSpec(role, catalog).name)}</span><span class="sg-rs-c tab-nums">${esc(counts[role])}</span><span class="sr"> · ${esc(word)}${on ? ", working now" : ""}</span></li>`;
  }).join("");
  const ch = SG.chip && SG.chip.until > now ? SG.chip : null;
  const chip = ch ? `<li class="sg-chipl" data-k="chip:${esc(ch.lead)}" data-tone="${esc(ch.tone)}" style="--at:${ch.step}" aria-hidden="true">${esc(ch.base)} ${ch.side === "sell" ? "▼" : "▲"}</li>` : "";
  return `<ol class="sg-relay-l" aria-label="The desk's line: Search, Risk, Sniper, Exit">${steps}${chip}</ol>`;
}

/* a row's mark in "What it did": done, turned down, waiting for the owner, a warning */
const SG_DID_ICONS = {
  ok: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="8"/><path d="M4.6 8.2l2.2 2.2 4.6-4.8"/></svg>',
  no: '<svg viewBox="0 0 16 16" width="16" height="16"><rect width="16" height="16" rx="3"/><path d="M5 5l6 6M11 5l-6 6"/></svg>',
  wait: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
  warn: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5l7 13H1z"/><path d="M8 6v4M8 12v.5"/></svg>',
};
/** "WHAT IT DID": one row a step that mattered, newest first, from the leads' own records and the room's halts and warnings — an entry filled
 * (its size and plan), a close (where, why, the result), a lead turned down by Risk or refused by the account (and why), one waiting for the
 * owner on a card — each with its moment and the seat that took it; a step that just happened is marked fresh (sgPlay) */
function sgDid(feed, room, now = Date.now()) {
  const out = [];
  const fresh = (k) => num(SG.fresh.get(k)) > now;
  for (const l of sgLeads(feed)) {
    const base = sgBase(l.symbol);
    const buy = l.side === "buy";
    const way = buy ? "long" : "short";
    if (l.entry && Number.isFinite(Number(l.entry.price))) out.push({ k: `${l.id}:in`, at: l.entry.at, icon: "ok", tone: buy ? "up" : "down", what: `${buy ? "Bought" : "Sold"} ${qtyOf(l.entry.qty)} ${base} at ${px(l.entry.price)}`, sub: sgPlanWords(l), who: "Sniper", fresh: fresh(`${l.id}|in`) });
    if (l.state === "closed" && l.exit && Number.isFinite(Number(l.exit.price))) {
      const pnl = num(l.pnlUsd);
      out.push({ k: `${l.id}:out`, at: l.exit.at, icon: "ok", tone: pnl < 0 ? "down" : "up", what: `${buy ? "Sold" : "Bought back"} ${base} at ${px(l.exit.price)} · ${l.exitWhy ? SG_EXIT_SHORT[sgExitWhy(l.exitWhy)] : "closed"}`, sub: `${sgSigned(pnl)} on the lead${Number.isFinite(Number(l.roiPct)) ? ` (${sgPct(l.roiPct)})` : ""}`, who: /^liquidat/i.test(String(l.exitWhy || "")) ? "Watch" : "Exit", fresh: fresh(`${l.id}|out`) });
    }
    if (l.state === "rejected") out.push({ k: `${l.id}:no`, at: l.updatedAt || l.at, icon: "no", what: `Turned down ${base} ${way}`, sub: sgTidy(l.why || SG_NO_WHY), who: "Risk", fresh: fresh(`${l.id}|no`) });
    if (l.state === "refused") out.push({ k: `${l.id}:no`, at: l.updatedAt || l.at, icon: "no", what: `The account refused ${base} ${way}`, sub: sgTidy(l.why || SG_NO_WHY), who: "Account", fresh: fresh(`${l.id}|no`) });
    if (l.state === "confirmed") out.push({ k: `${l.id}:card`, at: l.updatedAt || l.at, icon: "wait", what: `Waits for you: ${buy ? "buy" : "sell"} ${base}`, sub: sgPlanWords(l) || "a card to approve or reject, above", who: "Sniper", fresh: fresh(`${l.id}|card`) });
  }
  for (const m of room || []) {
    if (!m || (m.kind !== "halt" && m.kind !== "warning")) continue;
    const who = m.from === "account" || m.from === "you" ? "Account" : sgSpec(m.from, SG.catalog).name;
    out.push({ k: `room:${m.seq}`, at: m.at, icon: "warn", what: m.kind === "halt" ? "Halted for the day" : `${who} warns`, sub: sgTidy(m.text), who });
  }
  return out.filter((x) => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
}
function sgDidHtml(items, feed) {
  if (!items.length) {
    const b = feed && feed.brain;
    return `<li class="sg-di-none">${b && !b.ok ? "Nothing yet: without a brain it finds no lead to trade." : "Nothing yet: each lead it buys, sells, closes or turns down shows here, with why."}</li>`;
  }
  return items.map((x) => `<li class="sg-di" data-k="${esc(x.k)}" data-i="${x.icon}"${x.tone ? ` data-tone="${x.tone}"` : ""}${x.fresh ? ' data-new="1"' : ""}><span class="sg-di-i" aria-hidden="true">${SG_DID_ICONS[x.icon]}</span><span class="sg-di-w"><b>${esc(x.what)}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ""}</span><span class="sg-di-t tab-nums"><time datetime="${esc(x.at)}">${esc(nyTime(x.at))}</time><span>${esc(x.who)}</span></span></li>`).join("");
}

// ---- what happened, played ----------------------------------------------------------------------------------------------------------------

/** WHAT HAPPENED, PLAYED (see the head of this file): each event of sgDiff as the page shows it — a banner over the chart for each step, in
 * the order they came, and with each banner, as it shows, its seat lit on the seats' line, the lead's chip moved to its step and the line
 * that seat said about it in a bubble over it, so the three tell one step at a time; what just happened is marked fresh at once, so its dot
 * lands on the chart, the plan's lines draw in and its row in "What it did" lights. Nothing is played from no event */
function sgPlay(events) {
  if (!Array.isArray(events) || !events.length) return;
  const now = Date.now();
  const leads = sgLeads(SG.desk);
  const fresh = (k) => SG.fresh.set(k, now + SG_FRESH_MS);
  for (const [k, until] of SG.fresh) if (until <= now) SG.fresh.delete(k);
  // what each seat said in this read, for the step it then takes (sgDiff puts a lead's step right after the line that speaks of it)
  const said = {};
  for (const e of events) {
    const l = e.lead ? leads.find((x) => x.id === e.lead) || null : null;
    const base = sgBase(e.symbol || (l && l.symbol) || "");
    const side = e.side || (l && l.side) || "buy";
    const way = side === "sell" ? "short" : "long";
    const chip = (step, tone) => (base ? { lead: String(e.lead || ""), base, side, step, tone } : null);
    const banner = (role, tone, text, sub = "", c = null) => {
      SG.banner.queue.push({ id: ++SG.banner.n, role, tone, text, sub, chip: c, say: said[role] || "" });
      delete said[role];
    };
    if (e.type === "say") {
      if (SG_STEPS.some(([r]) => r === e.role) || e.role === "watch") said[e.role] = String(e.text || "").slice(0, 120);
      if (e.kind === "refusal" && e.role === "account") banner("account", "no", "Refused by the account", sgTidy(String(e.raw || e.text || "")));
    } else if (e.type === "handoff" && e.from === "search") {
      banner("search", "go", `Search picked ${base} ${way}`, l && Number.isFinite(Number(l.confidence)) ? `confidence ${Math.round(Number(l.confidence) * 100)}%` : "", chip(1, "go"));
    } else if (e.type === "handoff") {
      banner("risk", "go", `Risk cleared ${base} ${way}`, l ? sgPlanWords(l) : "", chip(2, "go"));
    } else if (e.type === "reject") {
      fresh(`${e.lead}|no`);
      banner("risk", "no", `Risk turned down ${base} ${way}`, sgTidy(String(e.why || "")), chip(1, "no"));
    } else if (e.type === "card") {
      const entry = e.role === "sniper";
      fresh(`${e.lead}|card`);
      banner(e.role, "wait", `Waits for you: ${entry ? `${side === "sell" ? "sell" : "buy"} ${base}` : `close ${base}`}`, "approve or reject it above", chip(entry ? 2 : 3, "wait"));
    } else if (e.type === "order" && e.role === "sniper") {
      banner("sniper", side === "sell" ? "down" : "up", `Sniper ${side === "sell" ? "sells" : "buys"} ${base}${num(e.usd) > 0 ? ` · ${money(e.usd)}` : ""}`, "", chip(2, "go"));
    } else if (e.type === "order") {
      banner(e.role, "ink", `${sgSpec(e.role, SG.catalog).name} closes ${base}`, "", chip(3, "go"));
    } else if (e.type === "fill") {
      fresh(`${e.lead}|in`);
      fresh(`${e.lead}|plan`);
      banner("sniper", side === "sell" ? "down" : "up", `${side === "sell" ? "Sold" : "Bought"} ${qtyOf(e.qty)} ${base} at ${px(e.price)}`, sgPlanPrices(l, e.price), chip(3, "go"));
    } else if (e.type === "exit") {
      fresh(`${e.lead}|out`);
      banner("exit", num(e.pnlUsd) < 0 ? "down" : "up", `Closed ${base} · ${SG_EXIT_SHORT[e.why] || "closed"} · ${sgSigned(e.pnlUsd)}`, "", chip(3, num(e.pnlUsd) < 0 ? "down" : "done"));
    } else if (e.type === "halt") banner("head", "down", "Halted for the day", sgTidy(String(e.why || "")));
  }
  // a long burst shows its latest eight banners
  if (SG.banner.queue.length > 8) SG.banner.queue.splice(0, SG.banner.queue.length - 8);
  sgBannerNext();
}
/* the lead's chip to a step: one new to the line starts a step before it and is moved there a moment later, so the line draws the move */
function sgChipTo(c, now = Date.now()) {
  const same = SG.chip && SG.chip.lead === c.lead && SG.chip.until > now;
  SG.chip = { ...c, step: same ? SG.chip.step : Math.max(0, c.step - 1), to: c.step, until: now + SG_CHIP_MS };
  setTimeout(() => {
    if (!SG.chip || SG.chip.lead !== c.lead || SG.chip.step === SG.chip.to) return;
    SG.chip.step = SG.chip.to;
    sgAgain([]);
  }, 90);
}
/* the next banner: the one waiting longest shows — for less time while more wait behind it — with its chip moved and its seat's words
   bubbled over it; then the next, until none waits */
function sgBannerNext() {
  const B = SG.banner;
  if (B.timer) return;
  const next = B.queue.shift();
  if (!next) {
    if (B.now) {
      B.now = null;
      sgAgain([]);
    }
    return;
  }
  const now = Date.now();
  B.now = next;
  B.until = now + (B.queue.length ? SG_BANNER_FAST_MS : SG_BANNER_MS);
  if (next.chip) sgChipTo(next.chip, now);
  if (next.say) SG.bubble = { role: next.role, text: next.say, until: now + SG_BUBBLE_MS, n: (SG.bubble ? SG.bubble.n : 0) + 1 };
  B.timer = setTimeout(() => {
    B.timer = 0;
    sgBannerNext();
  }, B.until - now);
  sgAgain([]);
}
/* the banner over the chart: the seat that took the step (its face), what it did in a line, and a few words more */
function sgPaintBanner(root) {
  const b = SG.banner.now;
  const face = b && SG_ROLES.includes(b.role) ? `<span class="sg-bn-a sg-r-${b.role}" aria-hidden="true">${sgBlob(b.role)}</span>` : "";
  paint(root.querySelector('[data-sg-p="banner"]'), b ? `<div class="sg-bn" data-k="bn:${b.id}" data-tone="${esc(b.tone)}">${face}<span class="sg-bn-w"><b>${esc(b.text)}</b>${b.sub ? `<span>${esc(b.sub)}</span>` : ""}</span></div>` : "");
}

// ---- the cards waiting for the owner ---------------------------------------------------------------------------------------------------

/** the leads of this desk waiting on the owner — an entry on a card (confirmed), or a close on a card (closing, no exit order yet) — each
 * with its card: the desk's own record of it (view.cards) and the account's full card (A.cards: its hash to sign, its answer-by). Only a
 * card the account still holds is listed: one answered or expired is gone from both */
function sgWaiting(view) {
  if (!view || !Array.isArray(view.open)) return [];
  const all = A && Array.isArray(A.cards) ? A.cards : [];
  const mine = Array.isArray(view.cards) ? view.cards : [];
  const out = [];
  for (const l of view.open) {
    if (!(l.state === "confirmed" || (l.state === "closing" && !l.exitOrder))) continue;
    const d = mine.find((c) => c.lead === l.id) || null;
    const card = all.find((c) => (d && c.id === d.id) || (l.card && c.id === l.card));
    if (card) out.push({ lead: l, desk: d, card });
  }
  return out;
}
/** What a waiting card asks, in words, with ONE amount: the card's own. The account words a card "Desk Sniper asks to PAPER · buy 0.00094
 * BTC at Momentum · paper · market · about $58.72"; the row already says who (the lead's seat) and that it is paper (the strip is the
 * superagent's), so the card is said as
 *   asks     Buy 0.00094 BTC at Momentum · paper           (what is bought or sold, how much, where — or the close it asks for)
 *   detail   market · costs at most $59.90                 (the order's type as the card words it, and the amount the card holds — what the
 *                                                           owner's yes frees: at most for a buy, about for a sale)
 * and the card's own sentence whole is one pointer away (the row's title). A card worded otherwise (an older account) is said from the
 * lead: what it asks with the card's amount, and its sentence without the "… asks to" before it */
function sgCardAsk(w, view) {
  const l = w.lead;
  const n = l.venue && A ? nameOf(l.venue) : "";
  const where = n && n !== l.venue ? n : sgVenueName(SG.desk, view);
  const usd = num(w.card.usd || (w.desk && w.desk.usd) || l.sizeUsd);
  const buy = l.side !== "sell";
  const amount = l.state === "closing" ? `worth about ${money(usd)}` : buy ? `costs at most ${money(usd)}` : `worth about ${money(usd)}`;
  const said = String(w.card.reason || (w.desk && w.desk.reason) || "").replace(/^.+? asks to (?:PAPER · )?/, "");
  if (l.state === "closing") return { asks: `Close ${l.side === "buy" ? "the long" : "the short"} in ${l.symbol} at ${where}`, detail: [sgTidy(said.replace(/^close /, "")), amount].filter(Boolean).join(" · ") };
  const m = /^(buy|sell) (\S+) (\S+)(?: at (.+?))?(?: · about \$[\d,.]+)?$/.exec(said);
  if (m) {
    // the order's type after the venue's name (the name may hold a " · " of its own: Momentum · paper)
    const rest = m[4] || "";
    const how = rest.startsWith(`${where} · `) ? rest.slice(where.length + 3) : rest.includes(" · ") ? rest.replace(/^.*? · /, "") : "";
    return { asks: `${m[1] === "sell" ? "Sell" : "Buy"} ${m[2]} ${m[3]} at ${where}`, detail: [sgTidy(how), amount].filter(Boolean).join(" · ") };
  }
  return { asks: `${buy ? "Buy" : "Sell"} ${l.symbol} at ${where}`, detail: [sgTidy(said.replace(/ · about \$[\d,.]+$/, "")), amount].filter(Boolean).join(" · ") };
}

/** the "Waits for you" strip: drawn only while a card of the desk's waits, one row a card — the lead, what it asks, why, when it must be
 * answered by, and Reject · Approve (the one signature the Agents pane and the Portfolio ask too) */
function sgPaintWaits(el, owner) {
  if (!el) return;
  const list = sgWaiting(SG.view);
  if (!list.length) {
    if (!el.hidden) el.hidden = true;
    return;
  }
  el.hidden = false;
  const off = owner ? "" : ' disabled title="This browser can look but not sign"';
  paint(el, `<div class="sg-sec-h"><h3 class="sg-lab" id="sg-waits-h">Waits for you</h3><span class="sg-dim">${esc(plural(list.length, "card"))} · also under Portfolio</span></div><ul class="sg-wl">${list.map((w) => { const a = sgCardAsk(w, SG.view); return `<li class="sg-wr" data-k="${esc(w.card.id)}" title="${esc(w.card.reason || (w.desk && w.desk.reason) || "")}"><span class="mono">${esc(w.lead.id)}</span><b>${esc(a.asks)}</b><span class="sg-dim sg-wr-why">${esc(a.detail)}</span><span class="sg-dim tab-nums">${w.card.expiresAt ? `answer by ${esc(nyTime(w.card.expiresAt))} New York` : ""}</span><span class="sg-wr-k"><button type="button" class="sg-btn" data-sg-act="card" data-card="${esc(w.card.id)}" data-v="reject" data-fk="sg:card:${esc(w.card.id)}:reject"${off}>Reject</button><button type="button" class="sg-btn sg-btn-p" data-sg-act="card" data-card="${esc(w.card.id)}" data-v="approve" data-fk="sg:card:${esc(w.card.id)}:approve"${off}>Approve</button></span></li>`; }).join("")}</ul>`);
}

// ---- the cards ---------------------------------------------------------------------------------------------------------------------------

/* a mascot: a soft blob with two eyes and feet, in its role's tint (decor: its breathing and its blink are not data) */
function sgBlob(role, i = SG_ROLES.indexOf(role)) {
  const k = Math.max(0, i);
  return `<svg class="sg-blob sg-r-${esc(role)}" viewBox="0 0 44 44" aria-hidden="true" focusable="false" style="--sg-ph:${(-k * 0.53).toFixed(2)}s;--sg-bl:${(3 + ((k * 7) % 30) / 10).toFixed(1)}s"><g class="sg-blob-g"><ellipse class="sg-blob-f" cx="16" cy="37" rx="3.6" ry="1.8"/><ellipse class="sg-blob-f" cx="28" cy="37" rx="3.6" ry="1.8"/><path class="sg-blob-b" d="M22 7C33.5 7 37 10.5 37 21.5S33.5 36 22 36 7 33 7 21.5 10.5 7 22 7Z"/><g class="sg-blob-e"><rect x="16" y="17" width="3.2" height="6.4" rx="1.6"/><rect x="24.8" y="17" width="3.2" height="6.4" rx="1.6"/></g></g><g class="sg-blob-t"><circle cx="31" cy="6" r="1.7"/><circle cx="36" cy="6" r="1.7"/><circle cx="41" cy="6" r="1.7"/></g></svg>`;
}
const sgLight = (status) => (status === "thinking" ? "think" : status === "working" || status === "ready" ? "on" : status === "empty" || status === "reading" ? "off" : "warn");
/* a card's head: its mascot, its name whole (never cut: it wraps), and under it the seat's standing — a light and always its word */
const sgCardHeadHtml = (c) => `${sgBlob(c.role)}<span class="sg-card-n"><b>${esc(c.name)}</b><span class="sg-light" data-l="${sgLight(c.status)}"${c.why ? ` title="${esc(c.why)}"` : ""}><i aria-hidden="true"></i><span class="sg-lw">${esc(c.word)}</span></span></span>`;
/* under the typed line: whether the brain said it, when, what the seat is doing now, the brain's last answer time — and, where its line is
   a card waiting for the owner, the way to answer it */
function sgCardSaidHtml(c, waits = false) {
  // an empty seat: one sentence, why (it has no number)
  if (c.empty) return `<span class="sg-empty-w">${esc(c.reason || c.empty)}</span>`;
  const parts = [];
  if (!c.line) parts.push('<span class="sg-dim">Nothing said yet.</span>');
  else {
    if (c.line.brain) parts.push('<span class="sg-btag">brain</span>');
    parts.push(`<span class="sg-dim tab-nums">${esc(nyTime(c.line.at))}</span>`);
  }
  if (waits) parts.push('<button type="button" class="sg-link" data-sg-act="answer" data-fk="sg:answer">Answer ›</button>');
  else if (c.doing) parts.push(`<span class="sg-doing">${esc(c.doing)}</span>`);
  else if (c.think) parts.push(`<span class="sg-dim">last brain call ${c.think.ms < 100 ? "under 0.1 s" : `${esc((c.think.ms / 1000).toFixed(1))} s`}${c.think.ok ? "" : ", no decision"}</span>`);
  return parts.join("");
}
function sgMetricHtml(m) {
  if (!m || m.none) return "";
  const text = m.html || esc(m.text);
  const bar = m.bar === null || m.bar === undefined ? "" : `<span class="sg-bar" aria-hidden="true"><i style="transform:scaleX(${sgClamp01(m.bar).toFixed(4)})"></i></span>`;
  return `<span class="sg-m-t tab-nums">${text}</span>${bar}${m.word ? `<span class="sg-m-w">${esc(m.word)}</span>` : ""}`;
}

function sgPaintCards(root, now) {
  const cards = sgCards(SG.desk, SG.view, SG.catalog, SG.room, now);
  // the leads waiting on the owner: a card whose latest line is one of them offers "Answer ›"
  const waiting = new Set(sgWaiting(SG.view).map((w) => w.lead.id));
  for (const c of cards) {
    const card = root.querySelector(`[data-sg-card="${c.role}"]`);
    if (!card || !card.querySelector) continue;
    if (card.dataset && card.dataset.s !== c.status) card.dataset.s = c.status;
    // the seat's full charter, as the catalog writes it, one pointer away; its duty in one line on the card
    if (typeof card.getAttribute === "function" && card.getAttribute("title") !== c.owns) card.setAttribute("title", c.owns);
    paint(card.querySelector('[data-sg-p="h"]'), sgCardHeadHtml(c));
    paint(card.querySelector('[data-sg-p="owns"]'), esc(c.duty));
    paint(card.querySelector('[data-sg-p="said"]'), sgCardSaidHtml(c, !!(c.line && c.line.kind === "card" && c.line.lead && waiting.has(c.line.lead))));
    paint(card.querySelector('[data-sg-p="m"]'), sgMetricHtml(c.metric));
    sgTypeLine(card, c);
  }
}

/* a card's latest line: typed out once as it lands (at SG_TYPE_CPS, a caret after it) — only a line that came in a read after the frame
   was drawn (SG.typeFloor); one that was already there, and any under reduced motion or while the pane is put aside, is shown whole; the
   same line is never typed twice */
function sgTypeLine(card, c) {
  const q = card.querySelector("[data-sg-line]");
  const txt = q && q.querySelector ? q.querySelector("[data-sg-txt]") : null;
  if (!q || !txt) return;
  if (!c.line || c.empty) {
    q.hidden = true;
    SG.typed[c.role] = 0;
    return;
  }
  q.hidden = false;
  // the line as the room holds it, one pointer away: nothing of it is hidden by saying it plainly
  if (typeof q.setAttribute === "function" && c.line.raw) q.setAttribute("title", c.line.raw);
  if (SG.typed[c.role] === c.line.seq) return;
  SG.typed[c.role] = c.line.seq;
  const text = c.line.text.length > 280 ? `${c.line.text.slice(0, 279)}…` : c.line.text;
  if (num(c.line.seq) <= SG.typeFloor || still() || !sgShowing() || typeof requestAnimationFrame !== "function") {
    SG.typing.delete(txt);
    if (q.classList) q.classList.remove("typing");
    return void setText(txt, text);
  }
  SG.typing.set(txt, { text, t0: -1, n: -1, q });
  if (q.classList) q.classList.add("typing");
  setText(txt, "");
  if (!SG.typeFrame) SG.typeFrame = requestAnimationFrame(sgTypeStep);
}
/* one frame of every card being typed: each writes only when a character more is due */
function sgTypeStep(ts) {
  SG.typeFrame = 0;
  for (const [el, x] of SG.typing) {
    if (x.t0 < 0) x.t0 = ts;
    const n = Math.min(x.text.length, Math.floor(((ts - x.t0) / 1000) * SG_TYPE_CPS));
    if (n !== x.n) {
      x.n = n;
      setText(el, x.text.slice(0, n));
    }
    if (n >= x.text.length || !el.isConnected) {
      SG.typing.delete(el);
      if (x.q && x.q.classList) x.q.classList.remove("typing");
    }
  }
  if (SG.typing.size) SG.typeFrame = requestAnimationFrame(sgTypeStep);
}

// ---- the balance -------------------------------------------------------------------------------------------------------------------------

/** a curve in a w × h box from [ms, usd] points, oldest first: { line, area, y(usd), x(ms), last, lo, hi } — null with fewer than two
 * points. The range is never narrower than 0.2% of the start (or a dollar), centred on the points, so a move of a few cents is drawn as
 * the few cents it is, never as a cliff from the top of the box to its foot; the start is always inside it, and `also` (the target) is
 * held in it where it is within three spans */
function sgCurve(points, w, h, also = [], start = NaN) {
  const p = (points || []).filter((x) => Array.isArray(x) && Number.isFinite(Number(x[0])) && Number.isFinite(Number(x[1]))).map(([t, u]) => [Number(t), Number(u)]);
  if (p.length < 2) return null;
  const t0 = p[0][0];
  const ts = p[p.length - 1][0] - t0 || 1;
  let lo = Math.min(...p.map((x) => x[1]));
  let hi = Math.max(...p.map((x) => x[1]));
  if (Number.isFinite(start)) [lo, hi] = [Math.min(lo, start), Math.max(hi, start)];
  const minSpan = Math.max(Math.abs(Number.isFinite(start) ? start : hi) * 0.002, 1);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const span0 = hi - lo;
  // a line drawn on the curve only where it is within three spans of it (a far target is said in words, not squashing the curve)
  for (const a of also) if (Number.isFinite(a) && a > lo - span0 * 3 && a < hi + span0 * 3) [lo, hi] = [Math.min(lo, a), Math.max(hi, a)];
  const pad = (hi - lo) * 0.12;
  const top = hi + pad;
  const span = top - (lo - pad);
  const x = (t) => Number((((t - t0) / ts) * w).toFixed(2));
  const y = (u) => Number((((top - u) / span) * h).toFixed(2));
  const pts = p.map(([t, u]) => [x(t), y(u)]);
  const line = `M${pts.map(([a, b]) => `${a},${b}`).join("L")}`;
  return { line, area: `${line}L${w},${h}L0,${h}Z`, x, y, lo: lo - pad, hi: top, last: pts[pts.length - 1] };
}

/* a figure as an odometer: each digit a column of 0–9 standing at its value (a spring when it changes), keyed from the right so a digit
   gained on the left moves nothing; the rest of the characters as they are */
function sgOdo(text) {
  const chars = [...String(text)];
  return chars.map((ch, i) => {
    const k = chars.length - i;
    if (!/\d/.test(ch)) return `<span class="sg-od-c" data-k="c${k}">${esc(ch)}</span>`;
    return `<span class="sg-od-d" data-k="d${k}"><span class="sg-od-s" style="--d:${ch}">${"0123456789".split("").map((d) => `<span>${d}</span>`).join("")}</span></span>`;
  }).join("");
}

/** the balance: the desk's equity (the session's start plus what its leads made — not the paper account's own balance, said beside it),
 * the curve of its points with a live point from the open leads' fresh prices, its closes as bars, the change since the start, the target */
function sgBalanceHtml(feed, view, live, now = Date.now()) {
  const eq = feed.equity || {};
  const start = num(eq.startUsd);
  const { usd: nowUsd, fresh } = sgEquityNow(feed, live, now);
  const change = nowUsd - start;
  const t = feed.target || {};
  const targetUsd = start + num(t.targetUsd);
  // the view's whole curve where it is longer, the feed's newer points after it, the live point last
  const tail = Array.isArray(eq.tail) ? eq.tail : [];
  const long = view && view.equity && Array.isArray(view.equity.points) && view.equity.points.length > tail.length ? view.equity.points : [];
  const lastLong = long.length ? Number(long[long.length - 1][0]) : -Infinity;
  const pts = [...long, ...tail.filter((p) => Number(p[0]) > lastLong)];
  if (fresh && pts.length && now > Number(pts[pts.length - 1][0])) pts.push([now, nowUsd]);
  const c = sgCurve(pts, 600, 150, [targetUsd], start);
  const tgtIn = c && targetUsd <= c.hi && targetUsd >= c.lo;
  // the scale in words: how far from the start the box's edges are, so a flat-looking curve and a steep one are read for what they are
  const scale = c && start ? Math.max(Math.abs(c.hi - start), Math.abs(start - c.lo)) / start * 100 : NaN;
  const curve = c ? `<svg class="sg-curve" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="${esc(`Desk equity from ${money(pts[0][1])} to ${money(nowUsd)}`)}"><path class="sg-area" d="${c.area}"/>${start <= c.hi && start >= c.lo ? `<line class="sg-sline" x1="0" x2="600" y1="${c.y(start)}" y2="${c.y(start)}"/>` : ""}${tgtIn ? `<line class="sg-tline" x1="0" x2="600" y1="${c.y(targetUsd)}" y2="${c.y(targetUsd)}"/>` : ""}<path class="sg-cline" d="${c.line}"/>${fresh ? `<circle class="sg-livept" cx="${c.last[0]}" cy="${c.last[1]}" r="3.5"/>` : ""}</svg><p class="sg-dim sg-scale">${Number.isFinite(scale) ? `±${esc(scale < 0.1 ? scale.toFixed(2) : scale.toFixed(1))}% of the start shown` : ""}${tgtIn ? " · the dashed line is the target" : ""} · the dotted line is the start</p>` : '<p class="sg-dim sg-nocurve">The curve draws as the session runs: a point when the equity moves, or every five minutes.</p>';
  const closes = (view && view.tape && Array.isArray(view.tape.closes) ? view.tape.closes : []).slice(-60);
  const maxAbs = Math.max(1e-9, ...closes.map((x) => Math.abs(num(x.pnlUsd))));
  const bw = closes.length ? Math.min(14, Math.max(3, Math.floor(600 / closes.length) - 2)) : 0;
  const bars = closes.length ? `<svg class="sg-bars" viewBox="0 0 ${Math.max(600, closes.length * (bw + 2))} 44" preserveAspectRatio="none" role="img" aria-label="${esc(`${plural(closes.length, "close")}: ${closes.filter((x) => num(x.pnlUsd) >= 0).length} won, ${closes.filter((x) => num(x.pnlUsd) < 0).length} lost`)}"><line class="sg-base" x1="0" x2="100%" y1="22" y2="22"/>${closes.map((x, i) => { const hh = Math.max(1.5, (Math.abs(num(x.pnlUsd)) / maxAbs) * 20); const up = num(x.pnlUsd) >= 0; return `<rect class="${up ? "up" : "down"}" x="${i * (bw + 2)}" y="${up ? 22 - hh : 22}" width="${bw}" height="${hh.toFixed(2)}" rx="1" data-k="${esc(x.id)}"><title>${esc(`${x.id} ${x.symbol} ${up ? "▲" : "▼"} ${money(Math.abs(num(x.pnlUsd)))} (${sgPct(x.roiPct)})`)}</title></rect>`; }).join("")}</svg>` : '<p class="sg-dim small">No close yet: the first lead the Exit closes draws the first bar.</p>';
  const v = feed.venue || {};
  const toGo = num(t.targetUsd) - change;
  const tgtWords = `Target ${money(targetUsd)} (${sgPct(t.pct, num(t.pct) % 1 ? 1 : 0)}) · ${toGo > 0 ? `${money(toGo)} to go${change < 0 ? ` (the desk is ${money(-change)} down)` : ""}` : "reached"}`;
  return `<div class="sg-sec-h"><h3 class="sg-lab" id="sg-bal-h">Balance · desk equity</h3>${fresh ? '<span class="sg-livew"><i aria-hidden="true"></i>live</span>' : ""}</div>
    <div class="sg-bal-g"><div class="sg-bal-n"><div class="sg-big" aria-hidden="true">${sgOdo(money(nowUsd))}</div><span class="sr">${esc(money(nowUsd))}</span><div class="sg-chg">${chg(change, "$")} <span class="sg-dim">(${esc(sgPct(start ? (change / start) * 100 : 0))}) since the session started at ${esc(money(start))}</span></div><div class="sg-dim">${esc(tgtWords)}</div><div class="sg-dim">Desk equity = ${esc(money(start))} start + what its leads made.${v.connected === true ? ` ${esc(v.name || "The paper account")} itself holds ${esc(money(v.usd))}.` : ""}</div></div>
    <div class="sg-bal-c">${curve}${bars}</div></div>`;
}

// ---- the chart, the positions, the rules, the room ---------------------------------------------------------------------------------------

/* THE CHART: the market sgChartMarket names, mounted once (ui/chart.js, on the area's tokens) at the desk's venue — only while the venue is
   connected: a venue the account cannot read has no bars to ask for, so none are asked for, and that is said — with the desk's leads drawn
   on it (sgChartOverlay, handed over only when they changed); over it the market's name, why it is the one shown, and the other markets
   the desk holds, one press away */
function sgPaintChart(root, feed, now) {
  const m = sgChartMarket(feed);
  const venue = feed.venue && feed.venue.id;
  const on = !!(feed.venue && feed.venue.connected === true);
  const key = m && venue && on ? `${venue}|${m.symbol}` : "";
  const chart = root.querySelector("[data-sg-chart]");
  // what is mounted: the market's key, or why none is ("off": the venue is not connected; "none": nothing to chart)
  const want = key || (m ? "off" : "none");
  if (chart && want !== SG.mounted) {
    if (SG.mounted) sgLetChartGo(root);
    SG.mounted = want;
    if (!key) paint(chart, `<p class="sg-dim sg-wait-w">${m ? `${esc(sgVenueName(feed, SG.view).replace(/^the /, "The "))} is not connected: no chart until it is.` : "Nothing to chart yet: the market of the desk's first lead shows here."}</p>`);
    else if (typeof chMount === "function") {
      const c = SG.chart;
      chMount(chart, { venue, symbol: m.symbol, kind: m.kind, fullscreen: true, range: c.range, interval: c.interval || undefined, log: c.log === true, indicators: c.ind, onRange: (r) => (c.range = r), onInterval: (iv) => (c.interval = iv), onLog: (v) => (c.log = v), onIndicators: (v) => (c.ind = v) });
    } else paint(chart, '<p class="sg-dim">The chart is not on this page.</p>');
  }
  paint(root.querySelector('[data-sg-p="chart-h"]'), sgChartHeadHtml(feed, m));
  if (!key || !chart || typeof chLines !== "function" || typeof chMarks !== "function") return;
  const { lines, marks } = sgChartOverlay(feed, m.symbol, now);
  const ls = JSON.stringify(lines);
  const ms = JSON.stringify(marks);
  if (ls !== SG.linesSig) {
    SG.linesSig = ls;
    chLines(chart, lines);
  }
  if (ms !== SG.marksSig) {
    SG.marksSig = ms;
    chMarks(chart, marks);
  }
}
/** over the chart: the market's name and why it is the one shown (the lead it holds, the newest lead, the last scan's pick, the owner's pick,
 * or — no lead yet — shown until there is one), and, where the desk holds more than one, each of them one press away ("Follow the desk"
 * once the owner picked one) */
function sgChartHeadHtml(feed, m) {
  const head = '<h3 class="sg-lab" id="sg-chart-h">Chart</h3>';
  if (!m) return head;
  const all = sgMarkets(feed);
  const why = m.first ? "no lead yet: shown until the desk has one" : m.picked ? "picked by you" : m.why;
  const chips = all.length > 1 || m.picked ? `<span class="sg-mkts" role="group" aria-label="Markets the desk holds">${all.map((x) => `<button type="button" class="sg-mkt" data-sg-act="market" data-v="${esc(x.symbol)}" data-fk="sg:mkt:${esc(x.symbol)}" aria-pressed="${String(x.symbol === m.symbol)}">${esc(sgBase(x.symbol))}</button>`).join("")}${m.picked ? '<button type="button" class="sg-link" data-sg-act="follow" data-fk="sg:follow">Follow the desk</button>' : ""}</span>` : "";
  return `${head}${avatar(sgBase(m.symbol), "sm")}<b>${esc(m.name)}</b><span class="sg-dim">${esc(m.symbol)} · ${esc(why)}${m.confidence !== undefined ? ` · Search's confidence ${esc(String(Math.round(num(m.confidence) * 100)))}%` : ""}</span>${chips}`;
}
/* why a lead went out, in a word or two */
const SG_EXIT_SHORT = { tp: "take-profit", stop: "stop", time: "time limit", liq: "liquidation", brain: "the Exit's call", other: "closed" };
/* a lead's state, as a person says it */
const SG_STATE_WORDS = { scanned: "with Risk", cleared: "cleared", confirmed: "waits for you", executed: "open", closing: "closing", closed: "closed", rejected: "rejected", refused: "refused by the account" };
/* a price at the entry's own decimals, as the entry is shown (px): a take-profit worked out from 14.091 is 14.091-ish, never 14.0911, and
   one worked out from 2,457.37 keeps both its places (2,467.20, never 2,467.2) */
const sgAtDecimals = (n, like) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  let d = Math.min(8, (px(like).split(".")[1] || "").length);
  // never written as the entry itself: an entry that filled on a round figure (5) would make its take-profit 5.02 read "5" — so the
  // places grow until the two differ
  const l = Number(like);
  while (d < 8 && Number.isFinite(l) && v !== l && Number(v.toFixed(d)) === Number(l.toFixed(d))) d++;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
/** THE OPEN POSITIONS: every lead the desk holds now, and one waiting for the owner on a card, as HL's positions table — Market · Side ·
 * Size · Entry · Mark · PNL · Take-profit · Stop · Opened · State, newest first — and over it how many, and what the day closed */
function sgPositionsHtml(feed) {
  const held = sgLeads(feed).filter((l) => SG_OPEN.has(l.state)).sort((a, b) => String(b.updatedAt || b.at || "").localeCompare(String(a.updatedAt || a.at || "")));
  const t = feed.today;
  const head = `<div class="sg-sec-h"><h3 class="sg-lab">Open positions · ${held.length}</h3>${t ? `<span class="sg-dim tab-nums">closed today ${esc(String(num(t.closed)))} · ${esc(sgSigned(t.pnlUsd))}</span>` : ""}</div>`;
  if (!held.length) return `${head}<p class="sg-dim sg-pos-none">No open position.</p>`;
  const rows = held.map((l) => {
    const dir = l.side === "buy" ? 1 : -1;
    const e = l.entry && Number.isFinite(Number(l.entry.price)) ? Number(l.entry.price) : null;
    const tp = e !== null && Number.isFinite(Number(l.tpPct)) ? e * (1 + (dir * Number(l.tpPct)) / 100) : null;
    const sl = e !== null && Number.isFinite(Number(l.slPct)) ? e * (1 - (dir * Number(l.slPct)) / 100) : null;
    const res = l.unrealizedUsd !== undefined && l.unrealizedUsd !== null ? chg(l.unrealizedUsd, "$") : '<span class="sg-dim">—</span>';
    const mark = l.markPrice !== undefined && l.markPrice !== null ? esc(px(l.markPrice)) : "—";
    return `<tr data-k="${esc(l.id)}"><td><span class="mono">${esc(l.id)}</span> ${esc(sgBase(l.symbol))}</td><td class="${l.side === "buy" ? "up" : "down"}">${l.side === "buy" ? "▲ Long" : "▼ Short"}</td><td class="r">${e !== null && l.entry.qty !== undefined ? esc(qtyOf(l.entry.qty)) : l.sizeUsd ? esc(money(l.sizeUsd)) : "—"}</td><td class="r">${e !== null ? esc(px(e)) : "—"}</td><td class="r">${mark}</td><td class="r">${res}</td><td class="r">${tp !== null ? esc(sgAtDecimals(tp, e)) : "—"}</td><td class="r">${sl !== null ? esc(sgAtDecimals(sl, e)) : "—"}</td><td>${e !== null && l.entry.at ? esc(nyTime(l.entry.at)) : "—"}</td><td>${esc(SG_STATE_WORDS[l.state] || l.state)}</td></tr>`;
  }).join("");
  return `${head}<div class="t-wrap"><table class="sg-mt"><thead><tr><th scope="col">Market</th><th scope="col">Side</th><th scope="col" class="r">Size</th><th scope="col" class="r">Entry</th><th scope="col" class="r">Mark</th><th scope="col" class="r">PNL</th><th scope="col" class="r">Take-profit</th><th scope="col" class="r">Stop</th><th scope="col">Opened</th><th scope="col">State</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** the rules: the numbers the desk's hard checks and plan use, as the objective, the day, the Sniper's limit and the leads say them */
function sgRulesHtml(feed, view) {
  const o = view && view.objective;
  const start = num(feed.equity && feed.equity.startUsd);
  const sniper = view && Array.isArray(view.seats) ? view.seats.find((s) => s.role === "sniper") : null;
  const leads = sgLeads(feed);
  const checked = sgNewest(leads.filter((l) => l.checks));
  const plan = sgNewest(leads.filter((l) => Number.isFinite(Number(l.tpPct))));
  const open = leads.filter((l) => SG_OPEN.has(l.state)).length;
  const row = (k, v, note = "") => `<div class="sg-rl"><span class="sg-rk">${esc(k)}</span><span class="sg-rv">${v}</span>${note ? `<span class="sg-rn">${note}</span>` : ""}</div>`;
  const rd = "<span class=\"sg-dim\">reading…</span>";
  const spread = checked && checked.checks.spreadPct !== null && checked.checks.spreadPct !== undefined ? `${checked.id}: ${num(checked.checks.spreadPct).toFixed(2)}%` : "";
  return `<div class="sg-sec-h"><h3 class="sg-lab" id="sg-rules-h">Rules</h3><span class="sg-dim">what the desk's checks and plan use now</span></div><div class="sg-rules-b">
    <div class="sg-rh">Hard checks</div>
    ${row("Spread", sgMaxSpread(feed) !== null ? esc(`≤ ${sgMaxSpread(feed).toFixed(2)}%`) : rd, esc(spread ? `last: ${spread}` : ""))}
    ${row("Risk a lead", o ? esc(`${o.maxRiskPct}% (${money((start * num(o.maxRiskPct)) / 100)})`) : rd)}
    ${row("Day's loss line", o ? esc(`${o.maxDailyLossPct}%`) : rd, feed.today ? esc(`room ${money(feed.today.lossRoomUsd)} left`) : "")}
    ${row("Leads open", o ? esc(`at most ${o.maxOpen}`) : rd, esc(`${open} open`))}
    ${row("Size", sniper && sniper.limit ? esc(`≤ ${money(o && start > 0 ? Math.min(num(sniper.limit.perOrderUsd), (start * num(o.maxRiskPct)) / 100) : sniper.limit.perOrderUsd)}`) : view ? "no Sniper limit" : rd, sniper && sniper.limit ? esc(`the Sniper's limit · ${money(sniper.limit.leftUsd)} left`) : "")}
    <div class="sg-rh">The plan</div>
    ${plan ? row("Exit", esc(`TP +${plan.tpPct}% · SL −${plan.slPct}% · ${plan.maxHours} h`), esc(plan.id)) : row("Exit", "<span class=\"sg-dim\">Risk sets each lead's plan: none cleared yet</span>")}
  </div>`;
}
/** The pipeline: Scan → Risk → Sniper → Exit, the stage the desk is working in lit (from who is working), each with its count this
 * session — its figures fade in from the up colour as they change. The Sniper's count is what it PLACED: the funnel's own `placed` where
 * the desk gives it, else its fills (`executed`) plus the entries resting at the venue (an order placed and not filled yet: a day limit
 * sent in extended hours, a paper venue that fills later) — with the fills beside it where the two differ.
 * What did not go through is said under it in words, each counted from what really is so: the cards waiting for the owner (the very ones
 * the "Waits for you" strip lists, sgWaiting), the entries resting at the venue, and the leads the hard checks or Risk turned down. An
 * entry the door placed is never counted as waiting for the owner */
function sgPipeHtml(feed, view = SG.view) {
  const w = feed.working;
  const f = feed.funnel || {};
  const lit = !w ? "" : w.role === "search" ? "scan" : w.role === "risk" ? "risk" : w.role === "sniper" ? "sniper" : w.role === "exit" || w.role === "watch" ? "exit" : "";
  // placed at the venue, not filled yet: the desk's open leads past the Sniper with no entry (the feed carries every open lead)
  const resting = sgLeads(feed).filter((l) => (l.state === "executed" || l.state === "closing") && !(l.entry && Number.isFinite(Number(l.entry.price)))).length;
  const filled = num(f.executed);
  const placed = f.placed !== undefined && f.placed !== null && Number.isFinite(Number(f.placed)) ? Number(f.placed) : filled + resting;
  const stages = [["scan", "Scan", num(f.scanned), "scanned"], ["risk", "Risk", num(f.cleared), "cleared"], ["sniper", "Sniper", placed, placed !== filled ? `placed · ${filled} filled` : "placed"], ["exit", "Exit", num(f.closed), "closed"]];
  const waiting = sgWaiting(view).length;
  const venue = sgVenueName(feed, view);
  const notes = [waiting > 0 ? `${plural(waiting, "card")} waiting for you` : "", resting > 0 ? `${plural(resting, "entry", "entries")} resting at ${venue}: placed, not filled yet` : "", num(f.rejected) ? `${plural(num(f.rejected), "lead")} rejected by the hard checks or Risk this session` : ""].filter(Boolean);
  return `<ol class="sg-pipe" aria-label="The pipeline">${stages.map(([id, name, n, word], i) => `${i ? '<li class="sg-pa" aria-hidden="true">→</li>' : ""}<li class="sg-ps" data-k="${id}"${lit === id ? ' data-on="1"' : ""}><span class="sg-pn">${name}</span><span class="sg-pc tab-nums"><b data-k="${id}:${n}">${esc(String(n))}</b> ${esc(word)}</span>${lit === id ? '<span class="sr"> (working now)</span>' : ""}</li>`).join("")}</ol>${notes.map((t) => `<p class="sg-dim">${esc(t)}.</p>`).join("")}`;
}

/* the room's stream: the newest line at the foot, each new one sliding in; kept at the foot while the owner reads there */
function sgPaintRoom(root) {
  const box = root.querySelector("[data-sg-msgs]");
  if (!box) return;
  const atFoot = !(box.scrollHeight > 0) || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const lines = SG.room.slice(-120);
  const leads = sgLeads(SG.desk);
  // each line said for people (sgPlain); the line as the room holds it is its title, so nothing is hidden by the plain words
  const drew = paint(box, lines.length ? lines.map((m) => `<div class="sg-msg sg-k-${esc(m.kind)}" data-k="${esc(String(m.seq))}" title="${esc(String(m.text || ""))}"><span class="sg-chip-r sg-r-${esc(SG_ROLES.includes(m.from) ? m.from : m.from === "you" ? "you" : "account")}">${esc(sgTag(m.from, SG.catalog))}</span><span class="sg-msg-t">${sgIds(sgPlain(m, leads)).replace(/\n/g, "<br>")}${m.brain ? ' <span class="sg-btag">brain</span>' : ""}</span><span class="sg-msg-at tab-nums">${esc(nyTime(m.at))}</span></div>`).join("") : '<p class="sg-dim">Nothing said yet.</p>');
  paint(root.querySelector('[data-sg-p="room-n"]'), esc(plural(SG.room.length, "line")));
  if (drew && atFoot) box.scrollTop = box.scrollHeight;
}

// ---- no desk yet: the setup; a desk on a real venue ----------------------------------------------------------------------------------------

/* the paper accounts the desk may trade: connected, paper, trading on */
const sgPaperVenues = () => (A ? connected().filter((v) => v.paper && canTrade(v)) : []);
/* the brain as the form says it (the Agents pane's own reading of its fields, ui/desk.js dkBrainDraft) — or the sentence why not */
function sgBrainOf(f, catalog) {
  const brains = (catalog && (catalog.brains || [catalog.brain])) || [];
  if (!brains.length) return "No brain is offered.";
  if (typeof dkBrainDraft === "function") return dkBrainDraft(f, brains);
  const b = brains.find((x) => x.id === f.provider) || brains[0];
  const model = String(f[`model-${b.id}`] || "").trim();
  return model ? { provider: b.id, model, effort: f.effort || "medium" } : "Name the model, as the endpoint names it.";
}
/* the brains the catalog offers, and the one the form (or, before it, the catalog's own pick) names */
const sgBrains = (c) => ((c && (c.brains || [c.brain])) || []).filter(Boolean);
/* whether a brain is a server on this machine that takes no key (its catalog entry's keyOptional, as the Brains sheet reads it) */
const sgKeyOptional = (b) => !!b && (typeof brOf === "function" ? brOf(b).keyOptional : !!b.keyOptional);
/** Whether the brain will think with the model the setup's form names — judged as the Brains sheet judges it (ui/brains.js brReadyWith):
 * ready now, or a server on this machine whose only want is a model's name, with one named (the account calls it at its usual address
 * with no key, and the model rides Start's hire). Where the sheet is not loaded, the catalog's standing alone */
const sgReadyWith = (b, model) => !!b && (!!b.ok || (typeof brReadyWith === "function" && typeof brOf === "function" && brReadyWith(brOf(b), model)));
/** a server on this machine whose only want is a model's name (ui/brains.js brOnlyModel) */
const sgOnlyModel = (b) => !!b && typeof brOnlyModel === "function" && typeof brOf === "function" && brOnlyModel(brOf(b));
/** What the setup says of who bills a brain: a model API's calls are billed to the owner's key; a server that needs no key runs on this
 * machine — nothing is billed — when the account calls it at this machine's own loopback (ui/brains.js brWhere), and is the owner's server
 * at its host when an address saved for it is another machine's: "this machine" is said of this machine only */
function sgBilledWords(b) {
  if (!sgKeyOptional(b)) return "Its calls are billed to your key.";
  const base = typeof brOf === "function" ? brOf(b).base : String(b.baseUrl || "");
  // no address of its own: its preset's, which is this machine's. One the page cannot read: never called "this machine"
  if (!base) return "It runs on this machine: nothing is billed.";
  const where = typeof brWhere === "function" ? brWhere(base) : "";
  if (where === "this machine") return "It runs on this machine: nothing is billed.";
  return where ? `It is your server at ${where}.` : "It is your server, at the address saved for it.";
}
/* the model the setup's form names for a brain (its own field, model-<id>), as Start would sign it */
const sgFormModel = (f, b) => (f && b ? String(f[`model-${b.id}`] || "").trim() : "");
const sgBrainPicked = (c, f) => {
  const all = sgBrains(c);
  return all.find((b) => f && b.id === f.provider) || all.find((b) => c && c.brain && b.id === c.brain.provider) || all[0] || null;
};
/* this browser cannot sign: why, and what to do about it */
const sgLooking = () => (typeof Owner !== "undefined" && Owner && Owner.role === "needs-code" ? "This browser can look but not sign yet: enter the pairing code the terminal printed, in the banner above." : "This browser can look but not sign: add it under Devices from the browser that owns the account.");

function sgPaintSetup(root, owner) {
  const box = root.querySelector('[data-sg-p="setup"]');
  if (!box || SG.signing) return;
  if (!SG.catalog) return void paint(box, '<p class="sg-dim">Reading what the desk offers…</p>');
  const papers = sgPaperVenues();
  // the form keeps what is typed: drawn again only when what it offers changed (the brains' standing, the paper accounts, who signs)
  const sig = JSON.stringify([owner, sgBrains(SG.catalog).map((b) => [b.id, b.ok, b.fix ? b.fix.code : ""]), papers.map((v) => v.id), SG.params.venue || ""]);
  if (SG.setupSig === sig) return;
  SG.setupSig = sig;
  // what was typed survives the form being drawn again (a key saved in the Brains sheet meanwhile flips a brain to ready). The Brain select
  // put back to the owner's choice is told so (core formKeep's change event): its block shows, its efforts are offered — the fields on show
  // are always the ones Start signs, never the block the catalog's own pick drew
  const restore = formKeep(box.querySelector && box.querySelector("form.sg-setup-f"));
  box.innerHTML = sgSetupHtml(owner, SG.catalog, papers, SG.params.venue);
  const form = box.querySelector && box.querySelector("form");
  if (form) {
    restore(form);
    sgSetupSay(form);
  }
}

/** the checklist at the setup's top, its standing read live from the first view: a paper account (✓ its name and balance, or the button
 * that opens one), a brain key (✓ ready through what, or not yet — and where the key goes, said once), Start */
function sgCheckHtml(owner, c, papers, f, form) {
  const v = papers.find((x) => f && x.id === f.venue) || papers[0] || null;
  const b = sgBrainPicked(c, f);
  const step = (ok, n, title, body) => `<li class="sg-ck" data-ok="${ok ? 1 : 0}"><span class="sg-ck-n" aria-hidden="true">${ok ? "✓" : n}</span><div class="sg-ck-b"><b>${title}<span class="sr">${ok ? ": done" : ": not yet"}</span></b><div>${body}</div></div></li>`;
  const one = v ? step(true, 1, "A paper account", `${esc(sgPaperless(v.name))} · ${esc(money(v.usd))} of paper money, not counted in your net worth.`) : step(false, 1, "A paper account", `None yet: the superagent trades paper money only.${owner ? ' <button type="button" class="sg-btn sg-btn-p sg-btn-s" data-sg-act="paper" data-fk="sg:paper">Open a paper account</button>' : ""}`);
  // a server on this machine takes no key: what it needs is the account's own words, in its block under 3 · The brain (never "type its key");
  // said in full here only where there is no form — a path in them free to break at each "/" so a narrow pane is not pushed wide. Its
  // readiness is judged with the model the form names (sgReadyWith): a server whose only want is a model is ready with one typed, once
  // Start signs it — never "not yet" with the model in its field
  const local = !!b && sgKeyOptional(b);
  const model = sgFormModel(f, b);
  const ready = sgReadyWith(b, model);
  const base = b && typeof brOf === "function" ? brOf(b).base : "";
  const two = !b
    ? step(false, 2, "A brain key", "No brain is offered by this account.")
    : b.ok
      ? // ready: through what, the key's masked tail where one is saved, and the way to replace or remove it (the Brains sheet, on it)
        step(true, 2, "A brain key", `${esc(b.label)} is ready, through ${esc(b.how || "its API")}${b.tail ? ` · key ${esc(b.tail)}` : ""}. ${esc(sgBilledWords(b))}${owner && b.tail && !sgKeyOptional(b) ? ` <button type="button" class="sg-link" data-sg-act="brains" data-v="${esc(b.id)}" data-fk="sg:brains:${esc(b.id)}">Replace or remove the key ›</button>` : ""}`)
      : ready
        ? step(true, 2, "A brain key", `${esc(b.label)} is ready with ${esc(model)} once you sign: the account calls it at ${esc(base || "its usual address")} with no key. ${esc(sgBilledWords(b))}`)
        : local && sgOnlyModel(b)
          ? step(false, 2, "A brain key", form ? `Not yet for ${esc(b.label)}: it runs on this machine and needs no key, only the name of a model it serves — type it under 3 · The brain, below.` : `Not yet for ${esc(b.label)}: it runs on this machine and needs no key, only the name of a model it serves, typed in the setup once there is a paper account.`)
          : local
            ? step(false, 2, "A brain key", form ? `Not yet for ${esc(b.label)}: it runs on this machine and needs no key — what it needs is under 3 · The brain, below.` : `Not yet for ${esc(b.label)}: it runs on this machine and needs no key. ${esc(b.why || "Not set up yet.").replace(/\//g, "/<wbr>")}`)
            : owner && typeof brPasteHtml === "function"
              ? // any provider's key, pasted here: the account tells whose it is, checks it, and puts its best model into the form below
                step(false, 2, "A brain key", `Not yet for ${esc(b.label)}. Paste a key from any provider: the account tells whose it is.${brPasteHtml("setup", sgBrainsCtx(true), "sg-btn sg-btn-p sg-btn-s")}${form ? '<span class="sg-dim">Or type its key under 3 · The brain, below.</span>' : `<details class="sg-fix-d"><summary>Or put the key in its key file</summary>${sgFixHtml(b)}</details>`}`)
              : step(false, 2, "A brain key", form ? `Not yet for ${esc(b.label)}: type its key under 3 · The brain, below.` : `Not yet for ${esc(b.label)}.${sgFixHtml(b)}`);
  const three = step(false, 3, "Start", !v ? "Once there is a paper account." : `Below: say what the superagent is for, then press Start the superagent. You sign each step; nothing starts until you do.${b && !ready ? " It can start before the brain can think: the plan's exits run, and no lead is made up until it can." : ""}`);
  return `${one}${two}${three}`;
}
/* every signature Start makes, by name, in order (the Start button's "What Start signs") */
function sgSignList(c, v) {
  const house = sgHouse(c);
  return [...house.map((r) => `Let in Desk ${String(r.name).replace(" of desk", "")}, the house seat's key, for ${SG_SEAT_DAYS} days`), ...house.filter((r) => r.trades).map((r) => `${r.name}'s trading limit at ${v ? v.name : "the paper account"}`), "Hire the desk with its autonomy on paper: the objective, the brain, the house seats — and the desk's own paper orders go without a card for you"];
}

/** The setup, laid out on purpose for the pane's width (superagent.css .sg-setup-g): a header across — what each mode is, in a sentence —
 * then, on a wide pane, two columns: the steps on the left (the form: the paper account, the objective, the numbers, the brain with where
 * its key goes when it is not ready, and the button that signs it all, with the words saying what and every signature listed), and on the
 * right what stands before it starts (the checklist, read live) over what the superagent is (its eight seats, each with its one duty). On
 * a narrow pane one column: the checklist first, the form, the seats last. With no paper account yet there is no form: the checklist,
 * which opens one, beside the seats */
function sgSetupHtml(owner, c, papers, want) {
  const d = c.defaults || {};
  const v0 = papers.find((v) => v.id === want) || papers[0];
  const brains = sgBrains(c);
  const head = `<header class="sg-setup-hd"><div class="sg-setup-top"><span class="sg-chip">Paper</span></div><h2 class="sg-h" id="sg-setup-h">Start the superagent</h2><p class="sg-lede"><b>Superagent:</b> the account's desk of six AI seats finds, sizes and places trades on a paper account by itself while you watch. <b>Regular:</b> you place your own orders.</p>${owner ? "" : `<p class="sg-warn-t">${esc(sgLooking())}</p>`}</header>`;
  const check = (form) => `<section class="sg-setup-ck" aria-labelledby="sg-ck-h"><h3 class="sg-lab" id="sg-ck-h">Before it starts</h3><ol class="sg-check" data-sg-p="check">${sgCheckHtml(owner, c, papers, v0 ? { venue: v0.id } : null, form)}</ol></section>`;
  if (!papers.length) return `<div class="sg-setup-g sg-setup-bare">${head}${check(false)}${sgAboutHtml(c)}</div>`;
  const bounds = c.bounds || SG_BOUNDS;
  const box = (name, label, val, mode = "decimal") => field(label, `<input name="${name}" inputmode="${mode}" value="${esc(String(val))}"${bounds[name] ? ` aria-describedby="sg-b-${name}"` : ""} />${bounds[name] ? `<span class="sg-range" id="sg-b-${name}">${esc(`${bounds[name][0]} to ${bounds[name][1]}`)}</span>` : ""}`);
  // the brain's fields (ui/desk.js), each brain that is not ready carrying where its key goes, once, in its own block
  // a brain that is not ready: its key typed in the Brains sheet first (one field, one paste), the key file the account names folded
  // under it for whoever would rather put it there. A server on this machine takes no key: its block says the account's own words and opens
  // the sheet on it ("Set it up ›"), never "Type its key"
  const typeKey = (b) => (owner ? `<button type="button" class="sg-btn sg-btn-p sg-btn-s" data-sg-act="brains" data-v="${esc(b.id)}" data-fk="sg:brains:${esc(b.id)}">${sgKeyOptional(b) ? "Set it up ›" : "Type its key ›"}</button>` : "");
  // a server whose only want is a model's name (sgOnlyModel): said in the setup's own words — the model field above is the way, and Start
  // carries it — rather than the account's sentence, which names the Brains sheet's button
  const localWhy = (b) => (sgOnlyModel(b) ? "Name a model it serves, above: it is ready with that model once you sign Start." : esc(b.why || "Not set up yet.").replace(/\//g, "/<wbr>"));
  const fixOf = (b) => (sgKeyOptional(b) ? `${typeKey(b)}<p class="sg-dim">Runs on this machine and needs no key. ${localWhy(b)}</p>` : `${typeKey(b)}<details class="sg-fix-d"><summary>${esc(SG_FIX_WORDS[b.fix && b.fix.code] || "Not ready")} — or put the key in its key file</summary>${sgFixHtml(b)}</details>`);
  const fields = typeof dkBrainFields === "function" ? dkBrainFields(brains, c.brain, { fix: fixOf, idp: "sg" }) : field("Brain", select("provider", brains.map((b) => [b.id, `${b.label} · ${b.ok ? "ready" : "not ready"}`]), (c.brain && c.brain.provider) || brains[0].id));
  return `<div class="sg-setup-g">${head}${check(true)}<form class="sg-setup-f" novalidate autocomplete="off">
    <div class="sg-step"><h3 class="sg-lab">1 · The paper account</h3>${field("Trades at", select("venue", papers.map((v) => [v.id, `${sgPaperless(v.name)} · ${money(v.usd)} paper`]), v0.id))}</div>
    <div class="sg-step"><h3 class="sg-lab">2 · The objective</h3>${field("Your words", '<textarea name="text" rows="2" maxlength="200" placeholder="e.g. Small, quick entries on the most traded coins; nothing I could not explain"></textarea>')}
      <div class="sg-row3">${box("targetPct", "Target this week (%)", d.targetPct ?? 3)}${box("maxRiskPct", "At most, a lead (% of equity)", d.maxRiskPct ?? 1)}${box("maxDailyLossPct", "Halt at a day's loss of (%)", d.maxDailyLossPct ?? 5)}</div>
      <div class="sg-row3">${box("hours", "Session (hours)", d.hours ?? 22, "numeric")}${box("everyMin", "A cycle every (min)", SG_EVERY_MIN, "numeric")}${box("maxOpen", "Leads open at once", d.maxOpen ?? 3, "numeric")}</div></div>
    <div class="sg-step"><div class="sg-step-h"><h3 class="sg-lab">3 · The brain</h3><button type="button" class="sg-link" data-sg-act="brains" data-fk="sg:brains">Brains: add a key, pick a model ›</button></div>${fields}</div>
    <div class="sg-go"><p class="sg-words" data-sg-words></p><details class="sg-signs"><summary>What Start signs</summary><ol data-sg-p="signs"></ol></details><div class="msg" data-sg-msg role="status"></div><button type="submit" class="sg-btn sg-btn-p sg-start"${owner ? "" : ` disabled title="${esc(sgLooking())}"`}>Start the superagent</button></div>
  </form>${sgAboutHtml(c)}</div>`;
}
/** what the superagent is, beside the steps: the desk's eight seats as the catalog names them, each with its one duty (the desk's cards
 * say the same) and whose it is — the house's six, and the two an agent of the owner's fills (each needs a feed the account does not
 * have). Then the two facts that hold whatever is chosen: paper money only, and the owner's controls */
function sgAboutHtml(c) {
  const roles = SG_ROLES.map((role) => {
    const spec = sgSpec(role, c);
    const house = c && Array.isArray(c.roles) ? !!(c.roles.find((r) => r.id === role) || {}).house : !["flow", "sentiment"].includes(role);
    return `<li class="sg-r-${role}">${sgBlob(role)}<span><b>${esc(spec.name)}</b><span class="sg-dim">${esc(SG_DUTIES[role] || (spec.charter && spec.charter.owns) || "")}${house ? "" : " · an agent of yours"}</span></span></li>`;
  }).join("");
  return `<section class="sg-about" aria-labelledby="sg-about-h"><h3 class="sg-lab" id="sg-about-h">What the superagent is</h3><ul class="sg-seats-l">${roles}</ul><p class="sg-dim">Paper money only: the account refuses its autonomy at a venue that is not a paper account. You can pause it, run a cycle, turn it back to cards or end it at any time, from its controls.</p></section>`;
}
/* the words beside the button, the checklist and the list of signatures, from the form as it stands */
function sgSetupSay(form) {
  const f = formFields(form);
  const v = sgPaperVenues().find((x) => x.id === f.venue);
  const words = form.querySelector("[data-sg-words]");
  if (words) setText(words, sgSetupWords(f, SG.catalog, v, sgBrainOf(f, SG.catalog)));
  const list = form.querySelector('[data-sg-p="signs"]');
  if (list) paint(list, sgSignList(SG.catalog, v).map((t) => `<li>${esc(t)}</li>`).join(""));
  const root = form.closest && form.closest("[data-sg-p='setup']");
  const check = root && root.querySelector ? root.querySelector('[data-sg-p="check"]') : null;
  if (check) paint(check, sgCheckHtml(owns(), SG.catalog, sgPaperVenues(), f, true));
}

/** Start the superagent: the setup's signatures one after another (sgSetupSteps), each said as it is signed; a refusal stops there and
 * says how far it got, which step, and the account's words — and what to do next: start again (what is signed stands, and signing it
 * again does no harm), or, refused at the very last step, turn autonomy on from the desk */
async function sgStart(form) {
  if (!owns() || busy || !form) return;
  const f = formFields(form);
  const msg = form.querySelector("[data-sg-msg]");
  const say = (t, cls = "") => {
    if (!msg) return;
    msg.className = `msg${cls ? ` ${cls}` : ""}`;
    msg.textContent = t;
  };
  const steps = sgSetupSteps(f, SG.catalog, sgPaperVenues().find((v) => v.id === f.venue), sgBrainOf(f, SG.catalog), nowMs());
  if (typeof steps === "string") return void say(steps, "no");
  const btn = form.querySelector("button[type=submit]");
  busy = true;
  document.body.classList.add("busy");
  if (btn) btn.disabled = true;
  let out;
  try {
    out = await sgSigning(() => sgRun(steps, say));
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    if (btn) btn.disabled = false;
  }
  if (!out.ok) {
    // the hire is the last step and carries the autonomy: a refusal anywhere leaves no desk hired, so the setup stays and says it here
    const words = sgRefusedWords(out, steps, "Start the superagent again when you are ready: what is signed stands, and signing it again does no harm.");
    say(words, "no");
  } else {
    say("Started.", "ok");
    SG.started = { at: Date.now(), text: `Started: ${sgHouse(SG.catalog).length} seats let in, their limits signed, autonomy on paper.`, tone: "ok" };
    said = "The superagent is started: its seats let in, their limits signed, the desk hired and its autonomy on paper on.";
  }
  sgAfter();
  await load().catch(() => {});
  sgAgain([]);
}
/* a run of the owner's signatures with the frame held (SG.signing) — let go however the run ends, and the pane drawn again at once: the
   frame the feed now calls for (the desk, once it is hired) comes in with the run's words already in place */
async function sgSigning(run) {
  SG.signing = true;
  try {
    return await run();
  } finally {
    SG.signing = false;
  }
}
/** a run stopped after the step that changes the frame (`turn`: hiring the desk, or moving it to paper) — the frame on screen goes at the
 * next read, so its form's words would be lost: they are said under the desk's header for a minute (amber) and as a toast */
function sgSayAfter(words, steps, out, turn) {
  const at = steps.findIndex((x) => x.say === turn || String(x.say).startsWith(turn));
  if (at < 0 || out.at <= at) return;
  SG.started = { at: Date.now(), text: words, tone: "warn" };
  flash = words;
}
/* a run of signatures stopped: how many went through and which, the step refused and why (its last full stop taken off: the sentence goes
   on), then what to do — when the account did not answer at all, only to try again once it does */
function sgRefusedWords(out, steps, then) {
  const done = steps.slice(0, out.at).map((s) => s.say);
  const step = steps[out.at] ? steps[out.at].say : "A step";
  const why = String(out.reason || out.why || "refused").replace(/\.\s*$/, "");
  const head = `${out.at} of ${steps.length} signed${done.length ? ` (${done.join(", ")})` : ""}. ${step}: ${why}.`;
  return `${head} ${out.noAnswer ? "Try again when the account answers: what is signed stands, and signing it again does no harm." : then}`;
}

/** a desk on a real venue: said so, with the move to a paper account (only with no lead open) and the way to the Agents pane */
function sgPaintReal(root, owner) {
  const box = root.querySelector('[data-sg-p="real"]');
  if (!box || SG.signing) return;
  const feed = SG.desk;
  const papers = sgPaperVenues();
  const open = sgLeads(feed).filter((l) => SG_OPEN.has(l.state)).length;
  const sig = JSON.stringify([owner, feed.venue && feed.venue.id, open, papers.map((v) => v.id), !!SG.view, !!SG.catalog]);
  if (SG.setupSig === sig) return;
  SG.setupSig = sig;
  const move = open ? `<p>It has ${esc(plural(open, "lead"))} open: it moves to a paper account only with none open.</p>` : !papers.length ? `<p>No paper account is connected to move it to.</p>${owner ? '<button type="button" class="sg-btn sg-btn-p" data-sg-act="paper" data-fk="sg:paper">Open a paper account</button>' : ""}` : sgMoveFormHtml(owner, papers, SG.params.venue);
  box.innerHTML = `<h2 class="sg-h" id="sg-real-h">The desk trades real money</h2><p class="sg-lede">The account's desk trades ${esc(sgVenueName(feed, SG.view))}, which is not a paper account. The superagent runs on paper only: there, and only there, its orders go without cards.</p>${move}<p><button type="button" class="sg-link" data-sg-act="agents">View it on the Agents pane ›</button></p>`;
}
/* the form that moves the desk to a paper account: which one, what moving signs, the button */
function sgMoveFormHtml(owner, papers, want) {
  return `<form class="sg-move-f" novalidate>${field("Move it to", select("venue", papers.map((v) => [v.id, `${sgPaperless(v.name)} · ${money(v.usd)} paper`]), (papers.find((v) => v.id === want) || papers[0]).id))}<p class="sg-words">Moving signs, one after another: each house seat whose key is not let in now, let in again for ${SG_SEAT_DAYS} days; a trading limit at that paper account for each house seat that trades (entries sized at the objective's risk per lead of what it holds when a session starts, any one order up to ${SG_CLOSE_ROOM} times that, and ${SG_BUDGET_TIMES} times it of entries a day, counted afresh every ${SG_RENEW_HOURS} hours — a close counts against none of it — for ${SG_SEAT_DAYS} days), the desk's objective with its venue changed, and its autonomy on paper — after which its orders there are placed without a card for you, each inside its seat's limit.</p><div class="msg" data-sg-msg role="status"></div><button type="submit" class="sg-btn sg-btn-p"${owner && SG.view && SG.catalog ? "" : ` disabled title="${owner ? "The desk is being read" : esc(sgLooking())}"`}>Move it to paper</button></form>`;
}
/* the move from the desk (arrived from Regular on another paper account): the same form, in a sheet */
function sgMoveSheet(want) {
  const papers = sgPaperVenues();
  if (!papers.length) return;
  const body = openSheet(sgMoveFormHtml(owns(), papers, want), { title: "Move the superagent" });
  if (body && !body.dataset.sgMove) {
    body.dataset.sgMove = "1";
    body.addEventListener("submit", (e) => {
      const form = e.target;
      if (!form || !form.classList || !form.classList.contains("sg-move-f")) return;
      e.preventDefault();
      sgMove(form).then((ok) => ok && closeSheet());
    });
  }
}
/* the move, signed; resolves whether it went through */
async function sgMove(form) {
  if (!owns() || busy || !form) return false;
  const f = formFields(form);
  const msg = form.querySelector("[data-sg-msg]");
  const say = (t, cls = "") => {
    if (!msg) return;
    msg.className = `msg${cls ? ` ${cls}` : ""}`;
    msg.textContent = t;
  };
  const steps = sgMoveSteps(SG.view, SG.catalog, sgPaperVenues().find((v) => v.id === f.venue), nowMs());
  if (typeof steps === "string") {
    say(steps, "no");
    return false;
  }
  busy = true;
  document.body.classList.add("busy");
  let out;
  try {
    out = await sgSigning(() => sgRun(steps, say));
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
  if (!out.ok) {
    // refused after the objective moved the desk to paper (its autonomy): the real-money page gives way to the desk, and the words go too
    const words = sgRefusedWords(out, steps, "Move it again when you are ready: what is signed stands.");
    say(words, "no");
    sgSayAfter(words, steps, out, "Move the desk to");
  } else said = "The desk moved to the paper account, its autonomy on paper on.";
  sgAfter();
  await load().catch(() => {});
  sgAgain([]);
  return out.ok;
}
/* the seats' limits renewed (sgRenewSteps): what signing does said first, and a yes; then signed one after another. Resolves whether
   they went through */
async function sgRenew() {
  if (!owns() || busy) return false;
  const view = SG.view;
  const venue = view && view.objective ? sgPaperVenues().find((v) => v.id === view.objective.venue) : undefined;
  const steps = sgRenewSteps(view, SG.catalog, venue, nowMs());
  if (typeof steps === "string") {
    toast(steps, "no");
    return false;
  }
  if (!(await confirmSheet(sgRenewWords(view, SG.catalog, venue), { title: "Renew the seats' limits", yes: "Sign them" }))) return false;
  busy = true;
  document.body.classList.add("busy");
  let out;
  try {
    out = await sgSigning(() => sgRun(steps, (t) => (SG.started = { at: Date.now(), text: t, tone: "ok" })));
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
  if (!out.ok) {
    const words = sgRefusedWords(out, steps, "Renew them again when you are ready: what is signed stands.");
    SG.started = { at: Date.now(), text: words, tone: "warn" };
    flash = words;
  } else {
    SG.started = { at: Date.now(), text: `Renewed: ${plural(steps.filter((x) => x.draft.type === "approveSpend").length, "trading limit")} now counted afresh every ${SG_RENEW_HOURS} hours.`, tone: "ok" };
    said = `The seats' trading limits renew now: their entries are counted afresh every ${SG_RENEW_HOURS} hours, and a close counts against none of it.`;
  }
  sgAfter();
  await load().catch(() => {});
  sgAgain([]);
  return out.ok;
}

// ---- reading -------------------------------------------------------------------------------------------------------------------------------

/* the beat: a read now (or after `wait`), then one a second while the pane shows and the page is in view; it stops by itself otherwise */
function sgBeat(wait = 0) {
  if (SG.timer || !sgShowing()) return;
  SG.timer = setTimeout(sgTick, wait);
}
async function sgTick() {
  SG.timer = -1;
  const t0 = Date.now();
  SG.tickAt = t0;
  SG.nudged = false;
  try {
    if (sgShowing()) {
      let stop = 0;
      const stalled = new Promise((r) => (stop = setTimeout(() => r("stalled"), SG_STALL_MS)));
      const out = await Promise.race([sgRead(), stalled]);
      clearTimeout(stop);
      if (out === "stalled") sgStalled();
    }
  } catch (err) {
    console.error(err);
  }
  SG.timer = 0;
  sgBeat(SG.nudged ? SG_NUDGE_MS : Math.max(150, sgWaitMs(t0) - (Date.now() - t0)));
}
/* the beat's next wait, from `from` (the tick's start): a second while the account answers; after misses in a row 1, 2, 5, then 10 s, so a
   stopped service is not asked once a second for as long as the page is open. While its stream is connected the desk's moves are pushed,
   and the beat is SG_PUSHED_SLOW seconds — but no later than the first of the slower reads that ride on it falls due (the desk's view, the
   open leads' prices: sgSlow), so those keep their own five seconds rather than wait for the next slow beat; a second at the least */
function sgWaitMs(from = Date.now()) {
  if (SG.fails) return SG_BACKOFF_MS[Math.min(SG.fails, SG_BACKOFF_MS.length) - 1];
  if (!(typeof stHealth === "function" && stHealth() === "connected")) return SG_EVERY_MS;
  const due = Math.min(num(SG.viewAt) + SG_VIEW_MS, num(SG.quotesAt) + SG_QUOTES_MS) - from;
  return Math.max(SG_EVERY_MS, Math.min(SG_EVERY_MS * SG_PUSHED_SLOW, due));
}
/* THE DESK MOVED (ui/stream.js, a `desk` event: its record written, a step begun or ended, a brain call sent or answered): the desk read
   now rather than at the beat — at most every SG_NUDGE_MS through a burst; a read on its way is followed by the next as soon as it ends */
function sgNudge() {
  if (!sgShowing()) return;
  if (SG.timer === -1) return void (SG.nudged = true);
  if (SG.timer) clearTimeout(SG.timer);
  SG.timer = 0;
  sgBeat(Math.max(0, SG_NUDGE_MS - (Date.now() - SG.tickAt)));
}
if (typeof stOn === "function") stOn("desk", sgNudge);
/** a read that did not answer (noAnswer: nothing came back — a stopped service, a dropped connection) or that the account refused: counted,
 * since when noted, and said in the page's own words — never the browser's error as it was thrown */
function sgMiss(noAnswer, refusal = "") {
  SG.fails++;
  if (!SG.downSince) SG.downSince = Date.now();
  const since = `since ${nyTime(SG.downSince)} New York`;
  const kept = SG.desk === undefined ? "nothing is read yet" : "the figures are its last read";
  const again = `Asking again every ${sgWaitMs() / 1000} s.`;
  SG.err = noAnswer ? `The account is not answering ${since} (the service may be stopped or restarting): ${kept}. ${again}` : `The account refused the desk's read ${since}: ${String(refusal).replace(/\.\s*$/, "")}. ${kept[0].toUpperCase()}${kept.slice(1)}. ${again}`;
}
/* a feed read that did not come back: let go (its answer, if it ever comes, is not used), its path dropped so the next read asks afresh,
   and said on the desk — the figures are the last read's */
function sgStalled() {
  SG.readNo++;
  if (typeof API !== "undefined" && API && typeof API.delete === "function") for (const k of [...API.keys()]) if (k.startsWith("/api/account/desk/feed")) API.delete(k);
  sgMiss(true);
  sgAgain([]);
}
/* after an action of the owner's: the desk's own view read again at once */
function sgAfter() {
  forget("/api/account/desk");
  SG.viewAt = 0;
}

/** one read of the feed, the room merged, the diff made, the slower reads asked when due, the pane drawn */
async function sgRead() {
  const no = ++SG.readNo;
  const b = await api(`/api/account/desk/feed?since=${SG.seq}`);
  forget("/api/account/desk/feed");
  if (no !== SG.readNo) return;
  const now = Date.now();
  if (!b || b.ok === false) {
    // a refusal is the account's own sentence; anything else (no body, a fetch that failed) is the account not answering
    const said = b && b.refusal ? refusalOf(b) : "";
    sgMiss(!said, said);
    return void sgAgain([]);
  }
  SG.err = "";
  SG.fails = 0;
  SG.downSince = 0;
  const feed = b.desk === null ? null : b.desk && typeof b.desk === "object" ? b.desk : b;
  if (!feed) {
    SG.desk = null;
    SG.room = [];
    SG.seq = 0;
    SG.prev = null;
    sgSlow(now);
    return void sgAgain([]);
  }
  // the room numbered afresh under this page (the account's home changed): read again from the start, nothing replayed
  if (num(feed.seq) < SG.seq) {
    SG.seq = 0;
    SG.room = [];
    SG.prev = null;
    return;
  }
  if (SG.prev && SG.feedAt && now - SG.feedAt > SG_GAP_MS) SG.prev = { ...SG.prev, primed: false };
  const fresh = !(SG.prev && SG.prev.primed);
  SG.room = sgMergeRoom(SG.room, feed.room);
  const { events, next } = sgDiff(SG.prev, feed);
  SG.prev = next;
  SG.seq = next.seq;
  // the first read, or one after a gap: its lines were already there — none is typed as if it had just landed
  if (fresh) SG.typeFloor = next.seq;
  SG.desk = feed;
  SG.feedAt = now;
  sgSlow(now);
  sgAgain(events);
}

/** the slower reads, each when it is due: the desk's view and catalog, the open leads' prices */
function sgSlow(now) {
  if (now - SG.viewAt >= SG_VIEW_MS) {
    SG.viewAt = now;
    Promise.all([api("/api/account/desk", { ttl: 2_500 }), api("/api/account/desk/catalog", { ttl: 30_000 })]).then(([d, c]) => {
      if (d && d.ok) SG.view = d.desk || null;
      if (c && c.ok) SG.catalog = c;
      sgAgain([]);
    });
  }
  if (!SG.desk) return;
  // the desk's markets followed on the push channel; the open leads' prices read only while the stream does not carry them all
  sgFollow();
  if (now - SG.quotesAt >= SG_QUOTES_MS) {
    SG.quotesAt = now;
    if (sgPushedEquity() === null) sgQuotes(now);
  }
}

/* THE MARKETS THE DESK SHOWS, FOLLOWED ON THE PUSH CHANNEL (ui/stream.js stFollow) while it shows: the chart's market whole — the chart
   moves as that market's stream moves, as the trading area's does — and each open lead's for its price alone, so the live balance follows
   every pushed quote (sgPushedEquity). The leads' prices read over REST (sgQuotes) stay the fallback while the stream does not carry them */
function sgFollow() {
  if (typeof stFollow !== "function" || ROUTE.tab !== "superagent") return;
  const feed = SG.desk;
  const shown = feed && feed.venue ? sgChartMarket(feed) : null;
  const main = shown ? [`${feed.venue.id}:${shown.symbol}`] : [];
  const view = SG.view;
  const leads = view && Array.isArray(view.open) ? view.open.filter((l) => l.entry).map((l) => `${l.venue}:${l.symbol}`) : [];
  stFollow(main, [...new Set(leads)].filter((k) => !main.includes(k)));
}
/* the balance's live point from the pushed quotes (sgLiveEquity), while the stream carries every open lead's market live; null otherwise */
function sgPushedEquity() {
  const view = SG.view;
  if (!view || !Array.isArray(view.open) || typeof stQuoteOf !== "function" || typeof stPrice !== "function") return null;
  const held = view.open.filter((l) => l.entry);
  if (!held.length) return null;
  const quotes = new Map();
  for (const l of held) {
    const q = stQuoteOf(l.venue, l.symbol);
    const p = q && q.live === true ? stPrice(q, l.kind === "perp" || l.kind === "future") : undefined;
    if (!(p > 0)) return null;
    quotes.set(`${l.venue}|${l.symbol}`, p);
  }
  return sgLiveEquity(view, quotes);
}
/* A PUSHED QUOTE OF AN OPEN LEAD'S MARKET: the live balance worked out again at it, drawn in a frame — at most every SG_PUSH_DRAW_MS
   through a burst of quotes */
const SG_PUSH_DRAW_MS = 250;
function sgQuoted(x) {
  if (!x || !sgShowing() || SG.pushDue) return;
  const view = SG.view;
  if (!view || !Array.isArray(view.open) || !view.open.some((l) => l.venue === x.venue && l.symbol === x.symbol)) return;
  SG.pushDue = true;
  setTimeout(() => {
    SG.pushDue = false;
    const usd = sgPushedEquity();
    if (usd === null) return;
    SG.live = { at: Date.now(), usd };
    sgAgain([]);
  }, Math.max(0, SG_PUSH_DRAW_MS - (Date.now() - num(SG.pushedAt))));
  SG.pushedAt = Date.now();
}
if (typeof stOn === "function") stOn("quote", sgQuoted);

/** the balance's live point: the open leads' fresh prices summed as the desk sums them at each cycle — its equity now, less the open leads'
 * unrealised results as it last marked them, plus each one's side × (fresh price − entry) × qty × contract size */
function sgLiveEquity(view, quotes) {
  if (!view || !view.equity || !Array.isArray(view.open)) return null;
  const held = view.open.filter((l) => l.entry && Number.isFinite(Number(l.entry.price)) && Number.isFinite(Number(l.entry.qty)));
  if (!held.length) return null;
  let usd = num(view.equity.nowUsd);
  for (const l of held) {
    const q = quotes.get(`${l.venue}|${l.symbol}`);
    if (!q || !Number.isFinite(q)) return null;
    usd += (l.side === "buy" ? 1 : -1) * (q - Number(l.entry.price)) * Number(l.entry.qty) * num(l.entry.contractSize || 1) - num(l.unrealizedUsd);
  }
  return Number(usd.toFixed(2));
}
function sgQuotes(now) {
  const view = SG.view;
  const held = view && Array.isArray(view.open) ? view.open.filter((l) => l.entry) : [];
  if (!held.length) return void (SG.live = { at: 0, usd: null });
  const pairs = [...new Set(held.map((l) => `${l.venue}|${l.symbol}`))].slice(0, 12);
  api(`/api/account/quotes?pairs=${encodeURIComponent(pairs.join(","))}`).then((b) => {
    if (!b || b.ok === false || !Array.isArray(b.quotes)) return;
    const quotes = new Map();
    for (const q of b.quotes) {
      const m = q && q.market;
      if (!m) continue;
      const p = Number.isFinite(Number(m.price)) ? Number(m.price) : Number.isFinite(Number(m.bid)) && Number.isFinite(Number(m.ask)) ? (Number(m.bid) + Number(m.ask)) / 2 : NaN;
      if (Number.isFinite(p)) quotes.set(`${q.venue}|${q.symbol}`, p);
    }
    const usd = sgLiveEquity(SG.view, quotes);
    SG.live = { at: usd === null ? 0 : now, usd };
    // drawn as it comes, not at the next beat (a slow one while the stream is connected)
    sgAgain([]);
  });
}

/* the pane drawn again with what came (in the next frame, once a pane coming in has come in), and what happened played (sgPlay) */
function sgAgain(events) {
  const el = $("pane-superagent");
  if (!A || ROUTE.tab !== "superagent" || !el) return;
  nextFrame(() => paneLater("superagent", () => {
    try {
      sgPaint(el, owns());
    } catch (err) {
      console.error(err);
    }
    sgPlay(events);
  }));
}

/* the pane's clocks, on the page's one clock: the session's and the next cycle's. While the reads are stale they stand still (they would
   count from a state no longer known) */
function sgSecond() {
  if (SG.stopSecond) return;
  SG.stopSecond = everySecond(() => {
    const el = $("pane-superagent");
    if (!el || ROUTE.tab !== "superagent" || !el.querySelector) {
      SG.stopSecond = null;
      return false;
    }
    const now = Date.now();
    const writes = [];
    const set = (node, t) => {
      if (node && node.textContent !== t) writes.push(() => setText(node, t));
    };
    const s = SG.desk && SG.desk.session;
    if (!sgStale()) {
      set(el.querySelector("[data-sg-clock]"), s && s.state === "live" ? sgClock(now - Date.parse(s.startedAt)) : "");
      for (const n of el.querySelectorAll("[data-sg-next]")) set(n, sgNextWords(n.dataset.sgNext, SG.desk, now));
    }
    return writes.length ? () => writes.forEach((w) => w()) : undefined;
  });
}

// ---- acting ---------------------------------------------------------------------------------------------------------------------------------

/* the pane's buttons and forms, heard once on the pane: what it draws again is the same element or a new one, never listened to itself */
function sgWire(el) {
  if (!el || !el.dataset || el.dataset.sgWired) return;
  el.dataset.sgWired = "1";
  el.addEventListener("click", (e) => {
    sgCopyClick(e);
    // the setup's paste row (ui/brains.js): its own buttons
    const c = e.target && e.target.closest && e.target.closest("[data-br-connect] [data-br-act]");
    if (c && el.contains(c) && !c.disabled) return void sgConnectAct(c.dataset.brAct, c.closest("[data-br-connect]"));
    // a tab under the positions
    const tab = e.target && e.target.closest && e.target.closest("[data-sg-tab]");
    if (tab && el.contains(tab)) return void sgTab(tab.dataset.sgTab);
    const t = e.target && e.target.closest && e.target.closest("[data-sg-act]");
    if (!t || !el.contains(t) || t.disabled) return;
    sgAct(t.dataset.sgAct, t.dataset);
  });
  // on a tab, the arrows (and Home, End) move to the next one and show it, as a tab bar does; Enter in the paste row connects
  el.addEventListener("keydown", (e) => {
    const tab = e.target && e.target.closest && e.target.closest("[data-sg-tab]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const all = SG_TABS.map(([v]) => v);
      const i = all.indexOf(tab.dataset.sgTab);
      const j = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length;
      return void sgTab(all[j], { focus: true });
    }
    if (e.key !== "Enter" || !e.target || !e.target.matches || !e.target.matches("[data-br-paste]")) return;
    e.preventDefault();
    sgConnectAct("connect", e.target.closest("[data-br-connect]"));
  });
  el.addEventListener("submit", (e) => {
    const form = e.target;
    if (!form || !form.classList) return;
    e.preventDefault();
    if (form.classList.contains("sg-setup-f")) sgStart(form);
    else if (form.classList.contains("sg-move-f")) sgMove(form);
  });
  const words = (e) => {
    const form = e.target && e.target.closest && e.target.closest("form.sg-setup-f");
    if (form) sgSetupSay(form);
  };
  el.addEventListener("input", words);
  el.addEventListener("change", words);
}

/* what the pane's buttons do: the ways out (Agents, a paper account, the Brains sheet, the cards waiting), and the owner's signatures —
   the session's controls (an ended session started again with its autonomy, after a yes where it was off), the autonomy (on after a yes),
   a card's answer */
async function sgAct(act, d) {
  if (act === "agents") return void go("desk");
  if (act === "paper") return void (typeof openConnect === "function" && typeof optionOf === "function" && openConnect(optionOf("paper"), { name: "Paper account", back: true }));
  if (act === "brain" || act === "fix") return void sgOpenBrains(null, (SG.desk && SG.desk.brain && SG.desk.brain.provider) || "");
  if (act === "brains") return void sgOpenBrains(true, (d && d.v) || "");
  if (act === "answer") return void sgToWaits();
  if (act === "how") return void sgHow();
  // a market the desk holds shown on the chart (pressed again, or "Follow the desk": back to the one the desk is on)
  if (act === "market" || act === "follow") {
    SG.pick = act === "market" && d && d.v && d.v !== SG.pick ? String(d.v) : "";
    return void sgAgain([]);
  }
  if (act === "guide-off") {
    // "How to use it" put away, in this browser
    SG.guideOff = true;
    try {
      localStorage.setItem(SG_GUIDE_KEY, "1");
    } catch {
      // storage off: put away for this visit
    }
    return void sgAgain([]);
  }
  if (!owns()) return;
  const feed = SG.desk;
  if (act === "move") return void sgMoveSheet(d.v);
  if (act === "renew") return void sgRenew();
  if (act === "card") {
    // the one signature the Agents pane and the Portfolio ask for a card: its hash, approve or reject
    const c = (A.cards || []).find((x) => x.id === d.card);
    if (c) await own({ type: "approveCard", card: c.id, action: c.hash, decision: d.v === "approve" ? "approve" : "reject" }, sgAfter);
    return;
  }
  if (act === "resume" && d && d.v === "auto") {
    // a new session after the end, its autonomy on paper in the same signature: a yes first where the autonomy is off now
    const was = !!(feed && feed.autonomy && feed.autonomy.paper);
    if (!was && !(await confirmSheet(`Start again with autonomy on? A new session starts, and the desk's own seats place their orders at ${sgVenueName(feed, SG.view)} at once, each inside its trading limit, without a card for you. Paper money only.`, { title: "Start again · auto on paper", yes: "Start it" }))) return;
    return void own(sgControlDraft("resume", { autonomy: true }), sgAfter);
  }
  if (act === "pause" || act === "resume" || act === "cycle") return void own(sgControlDraft(act), sgAfter);
  if (act === "end") {
    if (await confirmSheet("End the session? The desk stops: no cycle runs, and its open leads are not managed until a new session starts. Close them from Trade or the Agents pane, or start a new session later.", { title: "End the session", yes: "End it", danger: true })) own(sgControlDraft("end"), sgAfter);
    return;
  }
  if (act === "autonomy") {
    const on = d.v === "on";
    if (!!(feed && feed.autonomy && feed.autonomy.paper) === on) return;
    if (on && !(await confirmSheet(`Turn autonomy on? The desk's own seats then place their orders at ${sgVenueName(feed, SG.view)} at once, each inside its trading limit, without a card for you. Paper money only.`, { title: "Auto on paper", yes: "Turn it on" }))) return;
    if (!on && !(await confirmSheet("Back to cards? Each order the desk's seats want to place then waits for you as a card: on this page in the Waits for you strip, and under Portfolio. Nothing is placed until you approve it, and a card you do not answer in time lapses.", { title: "Cards", yes: "Back to cards" }))) return;
    own(sgControlDraft("autonomy", on), sgAfter);
  }
}

/* the page coming back into view: the beat starts again where the pane shows */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sgBeat(0);
});
