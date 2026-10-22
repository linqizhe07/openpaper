// openpaper — the page's instruments. One frame loop drives every canvas (a dotted globe with live quotes in orbit, the airport radar, the
// door); the departures board flips its digits when a quote changes; headings decode into place; the tool list boots. Everything shown
// as a number is real: quotes read by this browser from the venues' public APIs, pull requests from GitHub, counts computed from the
// repository. With prefers-reduced-motion nothing moves: each canvas is drawn once.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.dataset.motion = reduced ? "off" : "on";
// canvases draw at the device's pixel ratio on a wide screen; a phone-sized screen, or any machine whose frames start to drag, gets
// half the pixels and fewer points, so the instruments stay at 60 fps rather than stay sharp
let DPR = Math.min(2, window.devicePixelRatio || 1);
let quality = innerWidth < 720 ? 0 : 1;
const lite = () => { quality = 0; DPR = 1; document.documentElement.classList.add("lite"); };
if (quality === 0) lite();
const MINT = [151, 252, 227];
const mint = (a) => `rgba(151,252,227,${a})`;
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ============ the frame loop and the scenes on it ============ */
const scenes = [];
function scene(canvas, setup, draw, fps = 60) {
  const ctx = canvas.getContext("2d");
  const s = { canvas, ctx, w: 0, h: 0, visible: true, setup, draw, fps, last: 0, state: null };
  const size = () => {
    const r = canvas.getBoundingClientRect();
    s.w = Math.max(1, Math.round(r.width));
    s.h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(s.w * DPR);
    canvas.height = Math.round(s.h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    s.state = setup(s);
    if (reduced) draw(ctx, s, 0, 16);
  };
  s.resize = size;
  size();
  new ResizeObserver(() => size()).observe(canvas);
  new IntersectionObserver((es) => (s.visible = es[0].isIntersecting), { rootMargin: "60px" }).observe(canvas);
  scenes.push(s);
  return s;
}
const frames = [];
let lastT = performance.now();
const decoders = [];
let slowSince = 0;
function degrade(t) {
  // after four seconds of frames that mostly miss 60 fps, and never in the first six seconds (decoders, counters and the instruments'
  // power-on all land together then), drop to the lighter setting once; never back up, flapping would show
  if (quality === 0 || frames.length < 60 || t < 6000) return;
  const d = [...frames].sort((a, b) => a - b);
  if (d[Math.floor(d.length * 0.75)] > 22) { if (!slowSince) slowSince = t; else if (t - slowSince > 4000) { lite(); for (const s of scenes) s.resize(); } }
  else slowSince = 0;
}
function loop(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t;
  // a hidden tab is given a frame a second or so by the browser: not this page's doing, so neither measured nor punished
  if (!document.hidden) {
    frames.push(dt);
    if (frames.length > 120) frames.shift();
    degrade(t);
  }
  for (const s of scenes) {
    if (!s.visible) continue;
    const fps = quality ? s.fps : Math.min(s.fps, 8);
    if (fps < 60 && t - s.last < 1000 / fps) continue;
    s.last = t;
    s.draw(s.ctx, s, t, dt);
  }
  decodeTick(t);
  requestAnimationFrame(loop);
}
if (!reduced) requestAnimationFrame(loop);

/* ============ the globe: a dotted sphere, a scan, flights, and the live quotes in orbit ============ */
const sats = [];
const satsEl = $("[data-sats]");
function syncSats(items) {
  const keys = new Set(items.map((q) => `${q.venue}:${q.sym}`));
  for (let i = sats.length - 1; i >= 0; i--) if (!keys.has(sats[i].key)) { sats[i].el.remove(); sats.splice(i, 1); }
  const rand = rng(5);
  items.slice(0, quality ? 12 : 6).forEach((q, i) => {
    const key = `${q.venue}:${q.sym}`;
    let sat = sats.find((x) => x.key === key);
    if (!sat) {
      const el = document.createElement("span");
      el.className = "sat";
      el.innerHTML = "<i></i><span class=\"who\"></span><b></b>";
      satsEl.appendChild(el);
      // orbits spread by index so labels seldom meet: five inclinations, the golden angle between tilts, phases a step apart
      sat = { key, el, inc: 0.3 + (i % 5) * 0.52, tilt: i * 2.399, phase: i * 0.57, speed: 0.00019 + (i % 3) * 0.00007, radius: 1.2 + (i % 4) * 0.09 };
      sats.push(sat);
    }
    $(".who", sat.el).textContent = `${q.venue} · ${q.sym.length > 22 ? q.sym.slice(0, 21) + "…" : q.sym} `;
    $("b", sat.el).textContent = q.px;
  });
}
const hover = matchMedia("(hover: hover)").matches;
const par = { tx: 0, ty: 0, x: 0, y: 0 };
if (hover) $(".hero")?.addEventListener("mousemove", (e) => { par.tx = (e.clientX / innerWidth - 0.5) * 2; par.ty = (e.clientY / innerHeight - 0.5) * 2; });
scene($("[data-scene=globe]"), (s) => {
  const N = quality ? 1500 : 800;
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  const rand = rng(9);
  const arcs = [];
  for (let k = 0; k < 7; k++) {
    const a = pts[Math.floor(rand() * N)], b = pts[Math.floor(rand() * N)];
    const seg = [];
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const lift = 1 + 0.35 * Math.sin(u * Math.PI);
      const x = (a[0] * (1 - u) + b[0] * u), y = (a[1] * (1 - u) + b[1] * u), z = (a[2] * (1 - u) + b[2] * u);
      const l = Math.hypot(x, y, z) || 1;
      seg.push([x / l * lift, y / l * lift, z / l * lift]);
    }
    arcs.push({ seg, phase: rand(), period: 5000 + rand() * 4000 });
  }
  const rings = [];
  for (const lat of [-0.5, 0, 0.5]) {
    const ring = [];
    const r = Math.sqrt(1 - lat * lat);
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * 6.2832; ring.push([Math.cos(a) * r, lat, Math.sin(a) * r]); }
    rings.push(ring);
  }
  return { pts, arcs, rings };
}, (ctx, s, t) => {
  const { pts, arcs, rings } = s.state;
  // a phone-sized box keeps the orbits inside its frame
  const R = Math.min(s.w, s.h) * (s.w < 520 ? 0.28 : 0.32), cx = s.w / 2, cy = s.h / 2;
  if (quality && hover) { par.x += (par.tx - par.x) * 0.04; par.y += (par.ty - par.y) * 0.04; }
  const rot = t * 0.00012 + par.x * 0.35, tilt = 0.42 + par.y * 0.22;
  const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
  const pr = (p) => {
    const x = p[0] * cr - p[2] * sr, z0 = p[0] * sr + p[2] * cr;
    const y = p[1] * ct - z0 * st, z = p[1] * st + z0 * ct;
    return [cx + x * R, cy + y * R, z];
  };
  ctx.clearRect(0, 0, s.w, s.h);
  // the disc, a breath of light behind the sphere
  if (quality) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.05);
    g.addColorStop(0, mint(0.07));
    g.addColorStop(1, mint(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 6.2832); ctx.fill();
  }
  // the atmosphere: a thin rim of light just outside the sphere
  if (quality) {
    const atm = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.16);
    atm.addColorStop(0, mint(0));
    atm.addColorStop(0.3, mint(0.18));
    atm.addColorStop(1, mint(0));
    ctx.fillStyle = atm;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 6.2832); ctx.fill();
  }
  // rings
  ctx.lineWidth = 1;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = pr(ring[i - 1]), b = pr(ring[i]);
      ctx.strokeStyle = mint(0.05 + 0.22 * ((a[2] + 1) / 2));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  // the scan: a band of latitude sweeping pole to pole
  const scan = Math.sin(t / 2600);
  for (const p of pts) {
    const q = pr(p);
    const depth = (q[2] + 1) / 2;
    const hot = Math.abs(p[1] - scan) < 0.05;
    if (hot) {
      ctx.fillStyle = mint(0.55 + 0.45 * depth);
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.6 + 1.2 * depth, 0, 6.2832); ctx.fill();
    } else {
      const sz = 0.9 + 1.3 * depth;
      ctx.fillStyle = mint(0.08 + 0.5 * depth);
      ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz);
    }
  }
  // flights along lifted arcs
  for (const arc of arcs) {
    const P = arc.seg.map(pr);
    ctx.beginPath();
    for (let i = 0; i < P.length; i++) i ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]);
    ctx.strokeStyle = mint(0.16);
    ctx.stroke();
    const u = ((t / arc.period) + arc.phase) % 1;
    const i = Math.min(P.length - 1, Math.floor(u * P.length));
    const f = P[i];
    // the trail behind the flight
    for (let k = 1; k <= 6 && i - k >= 0; k++) {
      const a0 = P[i - k], a1 = P[i - k + 1];
      ctx.strokeStyle = mint(0.55 * (1 - k / 7) * ((a1[2] + 1) / 2 + 0.2));
      ctx.lineWidth = 2.2 - k * 0.3;
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
    }
    ctx.lineWidth = 1;
    const a = 0.3 + 0.7 * ((f[2] + 1) / 2);
    ctx.fillStyle = mint(0.16 * a); ctx.beginPath(); ctx.arc(f[0], f[1], 7, 0, 6.2832); ctx.fill();
    ctx.fillStyle = mint(a); ctx.beginPath(); ctx.arc(f[0], f[1], 2.2, 0, 6.2832); ctx.fill();
  }
  // the quotes in orbit, each on its own faint ring
  const orbit = (sat, a, r) => {
    let x = Math.cos(a) * r, y = 0, z = Math.sin(a) * r;
    const ci = Math.cos(sat.inc), si = Math.sin(sat.inc);
    [y, z] = [y * ci - z * si, y * si + z * ci];
    const cz = Math.cos(sat.tilt), sz = Math.sin(sat.tilt);
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return pr([x, y, z]);
  };
  for (const sat of sats) {
    const a = t * sat.speed + sat.phase;
    const r = s.w < 520 ? 1.02 + (sat.radius - 1.2) * 0.6 : 1.1 + (sat.radius - 1.2) * 0.8;
    if (quality) {
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) { const o = orbit(sat, (k / 48) * 6.2832, r); k ? ctx.lineTo(o[0], o[1]) : ctx.moveTo(o[0], o[1]); }
      ctx.strokeStyle = mint(0.09); ctx.stroke();
    }
    const q = orbit(sat, a, r);
    const depth = (q[2] + 1) / 2;
    const behind = q[2] < 0 && Math.hypot(q[0] - cx, q[1] - cy) < R;
    ctx.fillStyle = mint(behind ? 0.15 : 0.9);
    ctx.beginPath(); ctx.arc(q[0], q[1], 2.4, 0, 6.2832); ctx.fill();
    const half = Math.min(s.w * 0.22, 6 + sat.el.textContent.length * 3.6);
    const lx = Math.max(half + 10, Math.min(s.w - half - 10, q[0])), ly = Math.max(30, Math.min(s.h - 30, q[1]));
    sat.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -50%) scale(${(0.8 + 0.3 * depth).toFixed(3)})`;
    sat.el.style.opacity = behind ? "0.28" : (0.55 + 0.45 * depth).toFixed(2);
  }
});

/* ============ the airport: hub, gates on three rings, flights, a sweep ============ */
const GATES = [
  { name: "OKX", ring: 1 }, { name: "Kraken", ring: 1 }, { name: "Coinbase", ring: 1 }, { name: "Binance", ring: 1 }, { name: "Bybit", ring: 1 }, { name: "KuCoin", ring: 1 }, { name: "+87 exchanges", ring: 1, many: true },
  { name: "Alpaca", ring: 2 }, { name: "Robinhood", ring: 2 }, { name: "Kalshi", ring: 2 }, { name: "Polymarket US", ring: 2 }, { name: "Polymarket", ring: 2 },
  { name: "MetaMask", ring: 3 }, { name: "OKX Wallet", ring: 3 }, { name: "Hyperliquid", ring: 3 }, { name: "Ondo", ring: 3 },
];
scene($("[data-scene=radar]"), (s) => {
  const cx = s.w / 2, cy = s.h / 2, Rmax = Math.min(s.w, s.h) * 0.47;
  const radii = { 1: Rmax * 0.4, 2: Rmax * 0.68, 3: Rmax * 0.94 };
  const byRing = { 1: [], 2: [], 3: [] };
  GATES.forEach((g, i) => byRing[g.ring].push({ ...g, i }));
  const gates = [];
  for (const ring of [1, 2, 3]) {
    const list = byRing[ring];
    list.forEach((g, k) => {
      const a = -Math.PI / 2 + (k / list.length) * 6.2832 + ring * 0.37;
      gates.push({ ...g, x: cx + Math.cos(a) * radii[ring], y: cy + Math.sin(a) * radii[ring], r: radii[ring], a, pulse: 0 });
    });
  }
  const host = $("[data-gates]");
  host.replaceChildren();
  const hub = document.createElement("span");
  hub.className = "gate hub";
  hub.textContent = "Account";
  hub.style.left = `${cx}px`; hub.style.top = `${cy + 34}px`;
  host.appendChild(hub);
  for (const g of gates) {
    const el = document.createElement("span");
    el.className = `gate${g.many ? " many" : ""}`;
    el.textContent = g.name;
    el.style.left = `${g.x}px`; el.style.top = `${g.y + 16}px`;
    host.appendChild(el);
  }
  const rand = rng(13);
  const flights = Array.from({ length: 14 }, (_, i) => ({ g: gates[Math.floor(rand() * gates.length)], u: rand(), dir: rand() < 0.5 ? 1 : -1, speed: 0.00012 + rand() * 0.00012, bend: (rand() - 0.5) * 0.35, hold: 0, trail: [] }));
  return { cx, cy, Rmax, radii, gates, flights };
}, (ctx, s, t, dt) => {
  const { cx, cy, Rmax, radii, gates, flights } = s.state;
  ctx.clearRect(0, 0, s.w, s.h);
  // rings and spokes
  ctx.lineWidth = 1;
  for (const r of Object.values(radii)) {
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -(t / 60) % 9;
    ctx.strokeStyle = mint(0.18);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const g of gates) {
    ctx.strokeStyle = mint(0.07);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(g.x, g.y); ctx.stroke();
  }
  // the compass: ticks on the outer ring, turning slowly
  const spin = t / 60000;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * 6.2832 + spin;
    const long = k % 6 === 0;
    const r0 = Rmax * (long ? 0.985 : 0.995), r1 = Rmax * 1.02;
    ctx.strokeStyle = mint(long ? 0.5 : 0.22);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
  }
  // the sweep
  const sw = (t / 4200) % 1 * 6.2832;
  const grad = quality && ctx.createConicGradient ? ctx.createConicGradient(sw, cx, cy) : null;
  if (grad) {
    grad.addColorStop(0, mint(0.14));
    grad.addColorStop(0.1, mint(0));
    grad.addColorStop(1, mint(0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rmax, sw - 0.02, sw + 0.65); ctx.closePath(); ctx.fill();
  }
  // hub
  ctx.strokeStyle = mint(0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 14 + Math.sin(t / 500) * 1.5, 0, 6.2832); ctx.stroke();
  ctx.fillStyle = mint(0.9);
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.2832); ctx.fill();
  ctx.lineWidth = 1;
  // flights: hub → gate → hub, bending a little, trailing
  for (const f of flights) {
    if (f.hold > 0) { f.hold -= dt; }
    else {
      f.u += f.dir * f.speed * dt;
      if (f.u >= 1) { f.u = 1; f.dir = -1; f.hold = 500; f.g.pulse = 1; }
      if (f.u <= 0) { f.u = 0; f.dir = 1; f.hold = 300; f.g = gates[Math.floor(Math.random() * gates.length)]; f.trail.length = 0; }
    }
    const ax = f.g.x - cx, ay = f.g.y - cy;
    const nx = -ay, ny = ax;
    const bend = Math.sin(f.u * Math.PI) * f.bend;
    const x = cx + ax * f.u + nx * bend, y = cy + ay * f.u + ny * bend;
    f.trail.push([x, y]); if (f.trail.length > 10) f.trail.shift();
    for (let i = 1; i < f.trail.length; i++) {
      ctx.strokeStyle = mint(0.08 + 0.5 * (i / f.trail.length));
      ctx.beginPath(); ctx.moveTo(f.trail[i - 1][0], f.trail[i - 1][1]); ctx.lineTo(f.trail[i][0], f.trail[i][1]); ctx.stroke();
    }
    // a chevron pointing where the flight goes
    const prev = f.trail[f.trail.length - 2] ?? [x - ax, y - ay];
    const h = Math.atan2(y - prev[1], x - prev[0]) + (f.hold > 0 && f.u >= 1 ? Math.PI : 0);
    ctx.fillStyle = mint(0.95);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(h) * 5, y + Math.sin(h) * 5);
    ctx.lineTo(x + Math.cos(h + 2.5) * 4, y + Math.sin(h + 2.5) * 4);
    ctx.lineTo(x + Math.cos(h - 2.5) * 4, y + Math.sin(h - 2.5) * 4);
    ctx.closePath(); ctx.fill();
  }
  // gates, pulsing when a flight lands
  for (const g of gates) {
    if (g.pulse > 0) {
      ctx.strokeStyle = mint(0.7 * g.pulse);
      ctx.beginPath(); ctx.arc(g.x, g.y, 6 + (1 - g.pulse) * 22, 0, 6.2832); ctx.stroke();
      g.pulse = Math.max(0, g.pulse - dt / 900);
    }
    ctx.fillStyle = mint(g.many ? 0.5 : 0.85);
    ctx.beginPath(); ctx.arc(g.x, g.y, 3, 0, 6.2832); ctx.fill();
  }
});

/* ============ one door: instructions as lights, refusals turned back, Guard held in a card ============ */
const doorVenue = $("[data-door-venue]");
scene($("[data-scene=door]"), (s) => {
  // the rail starts already in use: a few instructions part-way along, so the first look is not an empty line
  const rand = rng(17);
  const xs = [0.06, 0.37, 0.64, 0.94].map((f) => s.w * f);
  const packets = Array.from({ length: 6 }, (_, i) => {
    const stage = i % 3;
    const from = xs[stage], to = xs[stage + 1];
    return { x: from + (to - from) * (0.15 + rand() * 0.7), v: 0.14 + rand() * 0.06, refuse: stage === 0 && rand() < 0.28, guard: rand() < 0.5, stage, hold: 0, dir: 1, life: 1, label: 0 };
  });
  return { packets, nextAt: 0, rand, passed: 0, carded: 0, refused: 0 };
}, (ctx, s, t, dt) => {
  const st = s.state;
  const y = s.h * 0.5, xs = [0.06, 0.37, 0.64, 0.94].map((f) => s.w * f);
  ctx.clearRect(0, 0, s.w, s.h);
  // the rail
  ctx.strokeStyle = mint(0.2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xs[0], y); ctx.lineTo(xs[3], y); ctx.stroke();
  // stations
  xs.forEach((x, i) => {
    ctx.strokeStyle = mint(0.8); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.stroke();
    if (i === 1) { ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y + 30); ctx.strokeStyle = mint(0.35); ctx.lineWidth = 1; ctx.stroke(); }
    if (i === 2) { ctx.strokeStyle = mint(0.3); ctx.lineWidth = 1; ctx.strokeRect(x - 22, y - 46, 44, 28); }
    ctx.fillStyle = mint(0.9); ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.2832); ctx.fill();
  });
  ctx.lineWidth = 1;
  // spawn
  if (t > st.nextAt) {
    st.nextAt = t + 520 + st.rand() * 600;
    st.packets.push({ x: xs[0], v: 0.14 + st.rand() * 0.06, refuse: st.rand() < 0.28, guard: st.rand() < 0.5, stage: 0, hold: 0, dir: 1, life: 1, label: 0, trail: [] });
  }
  for (const p of st.packets) {
    if (p.hold > 0) { p.hold -= dt; }
    else {
      p.x += p.dir * p.v * dt;
      if (p.dir > 0 && p.stage === 0 && p.x >= xs[1]) {
        p.x = xs[1]; p.stage = 1; p.hold = 220;
        if (p.refuse) { p.dir = -1; p.label = 900; st.refused++; }
      } else if (p.dir > 0 && p.stage === 1 && p.x >= xs[2]) {
        p.x = xs[2]; p.stage = 2; p.hold = p.guard ? 1100 : 180;
        if (p.guard) st.carded++;
      } else if (p.dir > 0 && p.x >= xs[3]) {
        p.x = xs[3]; p.stage = 3; p.hold = 400; p.life = 0.999; st.passed++;
      }
    }
    if (p.stage === 3 && p.hold <= 0) p.dead = true;
    if (p.dir < 0 && p.x <= xs[0] + 4) p.dead = true;
    const refusedLook = p.refuse && p.stage >= 1;
    const col = refusedLook ? (a) => `rgba(255,154,116,${a})` : mint;
    if (!(p.trail = p.trail ?? []).length || Math.abs(p.trail[p.trail.length - 1] - p.x) > 2) p.trail.push(p.x);
    if (p.trail.length > 9) p.trail.shift();
    p.trail.forEach((tx, k) => { ctx.fillStyle = col(0.08 + 0.5 * (k / p.trail.length)); ctx.beginPath(); ctx.arc(tx, y, 1.2 + 1.6 * (k / p.trail.length), 0, 6.2832); ctx.fill(); });
    // glow + dot
    ctx.fillStyle = col(0.18); ctx.beginPath(); ctx.arc(p.x, y, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = col(0.95); ctx.beginPath(); ctx.arc(p.x, y, 3, 0, 6.2832); ctx.fill();
    if (p.stage === 2 && p.guard && p.hold > 0) {
      ctx.strokeStyle = mint(0.9); ctx.strokeRect(xs[2] - 22, y - 46, 44, 28);
      ctx.fillStyle = mint(0.9); ctx.font = "500 9px IBM Plex Mono, monospace"; ctx.textAlign = "center"; ctx.fillText("CARD", xs[2], y - 28);
    }
    if (p.label > 0) {
      p.label -= dt;
      ctx.fillStyle = `rgba(255,154,116,${Math.min(1, p.label / 300)})`; ctx.font = "500 9px IBM Plex Mono, monospace"; ctx.textAlign = "center";
      ctx.fillText("REFUSED", xs[1], y + 46);
    }
    if (p.stage === 3) {
      const k = 1 - p.hold / 400;
      ctx.strokeStyle = mint(0.8 * (1 - k)); ctx.beginPath(); ctx.arc(xs[3], y, 11 + k * 26, 0, 6.2832); ctx.stroke();
    }
  }
  st.packets = st.packets.filter((p) => !p.dead);
  ctx.fillStyle = mint(0.55); ctx.font = "500 9px IBM Plex Mono, monospace"; ctx.textAlign = "right";
  ctx.fillText(`PASSED ${st.passed} · CARDED ${st.carded} · REFUSED ${st.refused} · DRAWN`, s.w - 8, 12);
});

/* ============ live quotes: each source on its own; a source that fails is not shown ============ */
const money = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 4;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const pct = (last, open) => {
  const a = Number(last), b = Number(open);
  if (!(a > 0 && b > 0)) return null;
  return ((a - b) / b) * 100;
};
const get = async (url, init) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};
const SOURCES = [
  { venue: "Hyperliquid", every: 45, async read() {
    const mids = await get("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }) });
    return ["BTC", "ETH", "SOL", "HYPE"].map((sym) => ({ sym, px: money(mids[sym]) })).filter((q) => q.px);
  } },
  { venue: "Kraken", every: 45, async read() {
    const r = await get("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD");
    const pick = (key, sym) => { const t = r.result?.[key]; return t ? { sym, px: money(t.c?.[0]), chg: pct(t.c?.[0], t.o) } : null; };
    return [pick("XXBTZUSD", "BTC"), pick("XETHZUSD", "ETH")].filter((q) => q && q.px);
  } },
  { venue: "Coinbase", every: 45, async read() {
    const out = [];
    for (const sym of ["BTC", "ETH"]) { const r = await get(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`); const px = money(r.data?.amount); if (px) out.push({ sym, px }); }
    return out;
  } },
  { venue: "OKX", every: 45, async read() {
    const r = await get("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
    const t = r.data?.[0];
    return t ? [{ sym: "BTC", px: money(t.last), chg: pct(t.last, t.open24h) }].filter((q) => q.px) : [];
  } },
  { venue: "Polymarket", every: 120, async read() {
    const events = await get("https://gamma-api.polymarket.com/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=2&exclude_tag_id=1");
    const yesOf = (m) => { try { return Number(JSON.parse(m?.outcomePrices ?? "[]")[0]); } catch { return NaN; } };
    return events.flatMap((e) => {
      const m = [...(e.markets ?? [])].filter((x) => Number.isFinite(yesOf(x))).sort((a, b) => yesOf(b) - yesOf(a))[0];
      const title = String(e.title ?? "").trim();
      if (!m || !title) return [];
      const who = (e.markets ?? []).length > 1 ? String(m.groupItemTitle ?? "").trim() : "";
      const label = who ? `${title} · ${who}` : title;
      return [{ sym: label.length > 48 ? label.slice(0, 47) + "…" : label, px: `${Math.round(yesOf(m) * 100)}¢ yes` }];
    });
  } },
];
const quotes = new Map();
const seenAt = new Map();
const board = $("[data-board]");
const rows = $("[data-board-rows]");
const hudQuotes = $("[data-hud=quotes]");
const hhmmss = (d = new Date()) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** split-flap: each character its own cell; a changed one flips */
function flap(cell, text) {
  const chars = [...text];
  while (cell.children.length > chars.length) cell.lastChild.remove();
  while (cell.children.length < chars.length) { const c = document.createElement("span"); c.className = "ch"; cell.appendChild(c); }
  chars.forEach((ch, i) => {
    const c = cell.children[i];
    if (c.textContent !== ch) {
      c.textContent = ch;
      if (!reduced) { c.classList.remove("flip"); void c.offsetWidth; c.classList.add("flip"); c.addEventListener("animationend", () => c.classList.remove("flip"), { once: true }); }
    }
  });
}
function renderBoard() {
  const items = [...quotes.values()].flat();
  hudQuotes.textContent = items.length ? `${items.length} · ${quotes.size}/${SOURCES.length} venues` : "—";
  syncSats(items);
  if (items.length === 0) { board.hidden = true; return; }
  const seen = new Set();
  for (const q of items) {
    const key = `${q.venue}:${q.sym}`;
    seen.add(key);
    let tr = $(`[data-key="${CSS.escape(key)}"]`, rows);
    if (!tr) {
      tr = document.createElement("tr");
      tr.dataset.key = key;
      tr.innerHTML = `<td class="v"></td><td class="m"></td><td class="n"></td><td class="c"></td><td class="when"></td>`;
      $(".v", tr).textContent = q.venue;
      $(".m", tr).textContent = q.sym;
      rows.appendChild(tr);
      if (!reduced) { tr.classList.add("new"); tr.addEventListener("animationend", () => tr.classList.remove("new"), { once: true }); }
    }
    const was = $(".n", tr).textContent;
    flap($(".n", tr), q.px);
    if (was && was !== q.px && !reduced) { tr.classList.remove("hit"); void tr.offsetWidth; tr.classList.add("hit"); }
    const c = $(".c", tr);
    if (typeof q.chg === "number") { flap(c, `${q.chg >= 0 ? "+" : ""}${q.chg.toFixed(2)}%`); c.className = `c ${q.chg >= 0 ? "up" : "down"}`; }
    else { c.textContent = "—"; c.className = "c"; }
    $(".when", tr).textContent = seenAt.get(q.venue) ?? "";
  }
  for (const tr of $$("tr", rows)) if (!seen.has(tr.dataset.key)) tr.remove();
  board.hidden = false;
}
async function poll(src) {
  try {
    const got = await src.read();
    if (got.length) { quotes.set(src.venue, got.map((q) => ({ ...q, venue: src.venue }))); seenAt.set(src.venue, hhmmss()); }
    else quotes.delete(src.venue);
  } catch { quotes.delete(src.venue); }
  renderBoard();
}
for (const src of SOURCES) { poll(src); setInterval(() => !document.hidden && poll(src), src.every * 1000); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { frames.length = 0; lastT = performance.now(); SOURCES.forEach(poll); } });
// the venue station of the door shows one live quote at a time
let doorIdx = 0;
setInterval(() => {
  const items = [...quotes.values()].flat();
  if (!items.length || !doorVenue) return;
  const q = items[doorIdx++ % items.length];
  doorVenue.textContent = `${q.venue} · ${q.sym.length > 16 ? q.sym.slice(0, 15) + "…" : q.sym} ${q.px}`;
}, 2400);

/* ============ HUD: the clock and the measured frame ============ */
const hudClock = $("[data-hud=clock]");
const tickClock = () => (hudClock.textContent = new Date().toISOString().slice(11, 19));
tickClock(); setInterval(tickClock, 1000);
const hudFrame = $("[data-hud=frame]");
setInterval(() => {
  if (reduced) { hudFrame.textContent = "motion off"; return; }
  if (frames.length < 30) return;
  const d = [...frames].sort((a, b) => a - b);
  const p95 = d[Math.floor(d.length * 0.95)];
  hudFrame.textContent = quality ? `${p95.toFixed(1)} ms · ${Math.round(1000 / Math.max(1, d[Math.floor(d.length * 0.5)]))} fps` : `${p95.toFixed(1)} ms · lite`;
}, 500);

/* ============ counters, decoders, the boot of the tool list, the fade ============ */
const ease = (x) => 1 - Math.pow(1 - x, 3);
function count(el) {
  const target = Number(el.textContent.replace(/[^0-9]/g, ""));
  if (reduced || !Number.isFinite(target)) return;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 1400);
    el.textContent = Math.round(target * ease(k)).toLocaleString("en-US");
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const GLYPHS = "01<>/\\|#$%&*+=?@";
function decode(el) {
  if (reduced) return;
  const text = el.dataset.text ?? (el.dataset.text = el.textContent);
  decoders.push({ el, text, t0: performance.now(), ms: 520 + text.length * 14 });
}
function decodeTick(t) {
  for (let i = decoders.length - 1; i >= 0; i--) {
    const d = decoders[i];
    const k = (t - d.t0) / d.ms;
    if (k >= 1) { d.el.textContent = d.text; decoders.splice(i, 1); continue; }
    const n = Math.floor(d.text.length * ease(k));
    let out = d.text.slice(0, n);
    for (let j = n; j < d.text.length; j++) out += d.text[j] === " " ? " " : GLYPHS[(j * 7 + Math.floor(t / 50)) % GLYPHS.length];
    d.el.textContent = out;
  }
}
const once = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    once.unobserve(e.target);
    const el = e.target;
    if (el.classList.contains("count")) count(el);
    if (el.classList.contains("decode")) decode(el);
    if (el.classList.contains("fade")) el.classList.add("in");
  }
}, { threshold: 0.35 });
$$(".count, .decode, .fade").forEach((el) => once.observe(el));
if (reduced) $$(".fade").forEach((el) => el.classList.add("in"));
const power = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    power.unobserve(e.target);
    const el = e.target;
    if (el.classList.contains("instrument")) { el.classList.add("on"); if (!reduced) el.classList.add("powering"); }
    if (el.classList.contains("wordmark")) el.classList.add("on");
    if (el.classList.contains("term")) bootTerm(el);
  }
}, { threshold: 0.2 });
$$(".instrument, .wordmark").forEach((el) => power.observe(el));
function bootTerm(term) {
  const lines = $$("[data-boot] li", term);
  const last = $("[data-boot-last]", term);
  const real = $('[data-stat="mcpTools.real"]')?.textContent ?? "";
  if (last && real) last.textContent = `tools · ${real} registered`;
  if (reduced) { term.classList.add("on-tools"); return; }
  $("[data-boot]", term).classList.add("typing");
  const texts = lines.map((li) => li.textContent);
  lines.forEach((li) => (li.textContent = ""));
  let i = 0;
  const typeLine = () => {
    if (i >= lines.length) { term.classList.add("on-tools"); return; }
    const li = lines[i], text = texts[i];
    li.classList.add("typed");
    let n = 0;
    const tick = () => { li.textContent = text.slice(0, ++n); if (n < text.length) setTimeout(tick, 14); else { i++; setTimeout(typeLine, 160); } };
    tick();
  };
  typeLine();
}
// the pill of the section in view
const pillFor = new Map($$(".nav .pills .pill").map((a) => [a.getAttribute("href").slice(1), a]));
const seen = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { pillFor.forEach((a) => a.classList.remove("active")); pillFor.get(e.target.id)?.classList.add("active"); }
}, { rootMargin: "-40% 0px -50% 0px" });
pillFor.forEach((_, id) => { const sec = document.getElementById(id); if (sec) seen.observe(sec); });
// a spot of light under the pointer inside each instrument
if (quality && hover) for (const inst of $$(".instrument")) {
  let pending = null;
  inst.addEventListener("mousemove", (e) => {
    pending = e;
    if (inst.raf) return;
    inst.raf = requestAnimationFrame(() => {
      inst.raf = 0;
      const r = inst.getBoundingClientRect();
      inst.style.setProperty("--mx", `${((pending.clientX - r.left) / r.width * 100).toFixed(1)}%`);
      inst.style.setProperty("--my", `${((pending.clientY - r.top) / r.height * 100).toFixed(1)}%`);
    });
  });
}

(async () => {
  try {
    const n = await get("./data/numbers.json");
    const list = $("[data-tools]");
    const WRITE = /_(order|batch|amend|cancel|close|leverage|move|earn|pay|remember|forget)$/;
    n.mcpTools.names.forEach((name, i) => {
      const li = document.createElement("li");
      li.textContent = name;
      if (WRITE.test(name)) li.classList.add("write");
      li.style.transitionDelay = `${i * 45}ms`;
      list.appendChild(li);
    });
    $("[data-tools-note]").textContent = `${n.mcpTools.real} tools on a real account · mint ones move money`;
  } catch { /* the paragraph above already says what matters */ }
})();

/* ============ progress: merged pull requests, the committed copy first, the live list when GitHub answers ============ */
const prs = $("[data-progress]");
const prNote = $("[data-progress-note]");
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
function renderPrs(list, note) {
  prs.replaceChildren(...list.slice(0, 5).map((p) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = p.url;
    a.innerHTML = `<span class="n"></span><span class="d"></span><span class="t"></span><span class="arr">↗</span>`;
    $(".n", a).textContent = `#${p.number}`;
    $(".d", a).textContent = day(p.mergedAt);
    $(".t", a).textContent = p.title;
    li.appendChild(a);
    return li;
  }));
  prNote.textContent = note;
}
(async () => {
  try { const baked = await get("./data/progress.json"); renderPrs(baked.merged, `As of ${baked.asOf}, from GitHub.`); } catch { /* the link below */ }
  try {
    const key = "openpaper.prs";
    const cached = JSON.parse(sessionStorage.getItem(key) || "null");
    let live = cached && Date.now() - cached.at < 600_000 ? cached.list : null;
    if (!live) {
      const r = await get("https://api.github.com/repos/linqizhe07/openpaper/pulls?state=closed&sort=updated&direction=desc&per_page=10");
      live = r.filter((p) => p.merged_at).map((p) => ({ number: p.number, title: p.title, mergedAt: p.merged_at, url: p.html_url }));
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list: live })); } catch { /* private window */ }
    }
    if (live.length) renderPrs(live, "Live from GitHub.");
  } catch { /* GitHub did not answer: the baked list stays */ }
})();

/* ============ the mark, as dots along its own path ============ */
for (const svg of $$("[data-art=glyph]")) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M43 20v23c0 8-5 12-13 12M43 25a12 12 0 1 0 0 12");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
  const len = path.getTotalLength();
  const rand = rng(11);
  for (let i = 0; i < 70; i++) {
    const p = path.getPointAtLength((i / 70) * len);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", (p.x + (rand() - 0.5) * 1.2).toFixed(1)); c.setAttribute("cy", (p.y + (rand() - 0.5) * 1.2).toFixed(1));
    c.setAttribute("r", (1.1 + rand() * 0.9).toFixed(2)); c.setAttribute("fill", "#97fce3"); c.setAttribute("fill-opacity", (0.55 + rand() * 0.45).toFixed(2));
    svg.appendChild(c);
  }
  path.remove();
}
