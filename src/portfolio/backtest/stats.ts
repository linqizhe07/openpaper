/** THE STATISTICS A TRIAL IS JUDGED BY (backtest/lab.ts): how likely a Sharpe ratio is to be real once the number of strategies tried to
 * find it is counted.
 *
 *   the probabilistic Sharpe ratio (PSR; Bailey & López de Prado, "The Sharpe Ratio Efficient Frontier", 2012): the probability that the
 *     true Sharpe is above a benchmark, given the one measured over n returns and how far those returns are from normal (their skewness
 *     and kurtosis) — a short, skewed, fat-tailed record proves less than a long, normal one with the same Sharpe
 *   the deflated Sharpe ratio (DSR; Bailey & López de Prado, "The Deflated Sharpe Ratio", 2014): the PSR whose benchmark is the Sharpe the
 *     best of N trials would show by chance alone — the expected maximum of N Sharpes that vary as the trials' did. Every strategy tried
 *     raises the bar the one kept has to clear
 *   the probability of backtest overfitting (PBO; Bailey, Borwein, López de Prado & Zhu, "The Probability of Backtest Overfitting", 2017),
 *     by combinatorially symmetric cross-validation (CSCV): the trials' returns over the same steps cut into S blocks; for every way of
 *     taking half the blocks to pick the best trial on and the other half to test it on, where the pick ranks among the trials in the test.
 *     PBO is how often it lands in the bottom half: near 0, picking the best in-sample also picked a good one out of sample; near 1, the
 *     pick was the luckiest, not the best
 *
 * Sharpe ratios here are PER STEP (a return a bar), as the papers write them; the lab annualizes for the reader. Nothing here is fitted or
 * random: the same inputs give the same figures. */

const EULER_GAMMA = 0.5772156649015329;

/** the standard normal's cumulative distribution Φ(x), from the complementary error function (Numerical Recipes' erfcc: a fractional error
 * under 1.2e-7 everywhere) */
export function normCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const erfc = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - erfc / 2 : erfc / 2;
}

const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** its inverse Φ⁻¹(p), 0 < p < 1 (Acklam's rational approximation: a relative error under 1.2e-9) */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? Number.NEGATIVE_INFINITY : p === 1 ? Number.POSITIVE_INFINITY : Number.NaN;
  const low = 0.02425;
  if (p < low || p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(p < low ? p : 1 - p));
    const x = (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) / ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
    return p < low ? x : -x;
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r + A[5]!) * q) / (((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1);
}

/** a series' mean, its standard deviation (over n − 1), its skewness and its kurtosis — the plain kurtosis, a normal's being 3, not the
 * excess — the last two from the population moments, as the papers take them */
export function moments(xs: readonly number[]): { n: number; mean: number; sd: number; skew: number; kurt: number } {
  const n = xs.length;
  if (!n) return { n: 0, mean: 0, sd: 0, skew: 0, kurt: 3 };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  const pop = m2 / n;
  return { n, mean, sd, skew: pop > 0 ? m3 / n / pop ** 1.5 : 0, kurt: pop > 0 ? m4 / n / pop ** 2 : 3 };
}

/** THE PROBABILISTIC SHARPE RATIO: the probability that the true per-step Sharpe is above `sr0`, given `sr` measured over `n` returns with
 * skewness `skew` and kurtosis `kurt` (PSR, eq. 9 of the 2014 paper) */
export function psr(sr: number, sr0: number, n: number, skew: number, kurt: number): number {
  if (!(n > 1)) return Number.NaN;
  const den = Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  return normCdf(((sr - sr0) * Math.sqrt(n - 1)) / den);
}

/** the Sharpe the best of `trials` independent trials would show by chance alone, when their Sharpes vary with `variance` around a true
 * Sharpe of zero: the expected maximum, (1 − γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e)) standard deviations (the DSR's benchmark, eq. 2 of the
 * 2014 paper; γ is the Euler–Mascheroni constant). None for one trial, or trials that do not vary */
export function expectedMaxSharpe(trials: number, variance: number): number {
  if (!(trials >= 2) || !(variance > 0)) return 0;
  return Math.sqrt(variance) * ((1 - EULER_GAMMA) * normInv(1 - 1 / trials) + EULER_GAMMA * normInv(1 - 1 / (trials * Math.E)));
}

/** THE DEFLATED SHARPE RATIO of one trial among `trialSharpes` (every trial's per-step Sharpe, this one's among them): its PSR against the
 * expected maximum of that many trials — with the benchmark it was measured against */
export function dsr(o: { sr: number; n: number; skew: number; kurt: number; trialSharpes: readonly number[] }): { dsr: number; sr0: number; trials: number } {
  const t = o.trialSharpes.length;
  const variance = t > 1 ? moments(o.trialSharpes).sd ** 2 : 0;
  const sr0 = expectedMaxSharpe(t, variance);
  return { dsr: psr(o.sr, sr0, o.n, o.skew, o.kurt), sr0, trials: Math.max(1, t) };
}

/** the Sharpe of a stretch from its sums: 0 for a stretch that does not move (a trial that held cash), never a division by zero */
const sharpeOf = (s: number, ss: number, n: number): number => {
  if (n < 2) return 0;
  const mean = s / n;
  const v = (ss - n * mean * mean) / (n - 1);
  return v > 1e-24 ? mean / Math.sqrt(v) : 0;
};

/** every way of taking `k` of `n` items, in order */
function* choose(n: number, k: number): Generator<number[]> {
  const pick = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield pick.slice();
    let i = k - 1;
    while (i >= 0 && pick[i] === n - k + i) i--;
    if (i < 0) return;
    pick[i]!++;
    for (let j = i + 1; j < k; j++) pick[j] = pick[j - 1]! + 1;
  }
}

/** THE PROBABILITY OF BACKTEST OVERFITTING by CSCV, over the returns of N ≥ 2 trials on the same steps (`returns[trial][step]`, cut to the
 * shortest): S blocks (even, at least 2 steps each; 16 where the steps allow, else 8, 6 or 4), every one of the C(S, S/2) halves taken in
 * sample. In each, the trial with the best in-sample Sharpe is picked (the first, on a tie), and λ = ln(ω / (1 − ω)) where ω is its rank
 * among the trials' out-of-sample Sharpes (ties at their average rank) over N + 1. PBO is the share of halves with λ ≤ 0. None when there
 * are fewer than two trials, or too few steps for four blocks */
export function pbo(returns: readonly (readonly number[])[], blocks?: number): { pbo: number; blocks: number; combinations: number; trials: number; steps: number; medianLogit: number } | undefined {
  const n = returns.length;
  if (n < 2) return undefined;
  const steps = Math.min(...returns.map((r) => r.length));
  const s = blocks ?? [16, 8, 6, 4].find((b) => steps >= b * 2);
  if (!s || s % 2 || steps < s * 2) return undefined;
  // each trial's sums over each block, so a half's Sharpe is a sum of S/2 blocks, not a pass over its steps
  const edges = Array.from({ length: s + 1 }, (_, i) => Math.round((i * steps) / s));
  const sum: number[][] = [];
  const sq: number[][] = [];
  for (const r of returns) {
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k < s; k++) {
      let x = 0;
      let y = 0;
      for (let i = edges[k]!; i < edges[k + 1]!; i++) {
        x += r[i]!;
        y += r[i]! * r[i]!;
      }
      a.push(x);
      b.push(y);
    }
    sum.push(a);
    sq.push(b);
  }
  const size = edges.slice(1).map((e, k) => e - edges[k]!);
  const logits: number[] = [];
  for (const inSample of choose(s, s / 2)) {
    const isIn = new Array<boolean>(s).fill(false);
    for (const k of inSample) isIn[k] = true;
    const ins: number[] = [];
    const outs: number[] = [];
    for (let t = 0; t < n; t++) {
      let a = 0;
      let b = 0;
      let c = 0;
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < s; k++) {
        if (isIn[k]) {
          a += sum[t]![k]!;
          b += sq[t]![k]!;
          c += size[k]!;
        } else {
          x += sum[t]![k]!;
          y += sq[t]![k]!;
          z += size[k]!;
        }
      }
      ins.push(sharpeOf(a, b, c));
      outs.push(sharpeOf(x, y, z));
    }
    let best = 0;
    for (let t = 1; t < n; t++) if (ins[t]! > ins[best]!) best = t;
    const below = outs.filter((v) => v < outs[best]!).length;
    const same = outs.filter((v) => v === outs[best]!).length;
    const rank = below + (same + 1) / 2;
    const w = rank / (n + 1);
    logits.push(Math.log(w / (1 - w)));
  }
  const sorted = logits.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return { pbo: logits.filter((l) => l <= 0).length / logits.length, blocks: s, combinations: logits.length, trials: n, steps, medianLogit: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2 };
}
