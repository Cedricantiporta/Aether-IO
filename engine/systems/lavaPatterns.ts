// ============================================================================
// Ignar's THE FLOOR IS LAVA (owner 2026-11-04: "make it sometimes unpredictable, a crazy pattern"). The arena floor is a grid of 5 m tiles
// (`bp.tx/tz`); a PATTERN decides which tiles turn dangerous and when. Every tile holds up to LAVA_K hit windows (bossPhaseState): RED warning
// [tw, te) -> lava [te, tc) -> cool. Nine generators (`PATS`), one (two at low boss HP) picked per cycle by a seeded RNG, never the same twice in a row:
//   0 SWEEPING WAVES  rows / columns turn to lava in sequence (one way, pincer in, pincer out) with a slanting safe gap
//   1 CHECKERBOARD    alternating tile classes (1 or 2 tile blocks) flip: 0.9 s warning, 1 s lava, then the other half
//   2 SPIRAL          3 spiral arms rotate round a safe hub (in or out)
//   3 RIPPLES         2-3 lava rings expand from random centres
//   4 ZIPPER          neighbouring columns sweep in opposite directions, then once more reversed
//   5 FIRE RAIN       (dynamic) random bursts of tiles around the hero, 0.7 s warning
//   6 CLOCK HANDS     two narrow hands sweep round the arena like a clock
//   7 SAFE ISLANDS    everything is lava except 4 big islands; the islands hop every ~3 s (the new ones cool 1.2 s before the old ones flash)
//   8 SNAKES          (dynamic) 3 lava snakes crawl toward the hero, leaving a burning trail
// FAIRNESS: after a pattern is scheduled `enforce()` replays it in 0.2 s steps and removes hits until, at every instant, >= 26% of the tiles are cool
// (not flashing, not lava) and every flashing / burning tile has a cool tile within one to two tiles (<= ~7 m to its edge). Dynamic patterns are checked
// per burst. All timings are phase seconds (`bp.t`). The HOST schedules (Math.random seed per cycle); the co-op guest mirrors the hit table (coopHaz).
// No allocation per frame: typed arrays, module scratch.
// ============================================================================
import { bp, MAX_TILES, LAVA_K } from './bossPhaseState';
import { edgeLimit, mulberry32 } from '../mapgen';
import { forEachHero } from '../heroes';
import type { PlayerRuntime } from '../types';

export const CELL = 5, RANGE = 10;
const W = RANGE * 2 + 1, NB_K = 12, SAFE_MIN = 0.26;
/** QA: `lavaDbg.pat` >= 0 forces the pattern of every cycle (headless tests). */
export const lavaDbg = { pat: -1 };
export const PAT_NAMES = ['SWEEPING WAVES', 'CHECKERBOARD', 'SPIRAL', 'RIPPLES', 'ZIPPER', 'FIRE RAIN', 'CLOCK HANDS', 'SAFE ISLANDS', 'SNAKES'];
export const PAT_HINT = [
  'Rows of tiles flash red then burn - slip through the gap!', 'Half the tiles flash red, then the other half - hop to the cool ones!',
  'Spiral arms of lava turn round the hub - run with them!', 'Rings of lava ripple out - cross a ring at the cool moment!',
  'Stripes zip up and down - change lanes!', 'Fire rains round you - keep moving!', 'Two clock hands sweep the floor - get behind them!',
  'Run to the cool islands - they hop!', 'Lava snakes hunt you - do not stand still!',
];
const N_PAT = PAT_NAMES.length;
const DYNAMIC = [5, 8];

// ---------------------------------------------------------------- tiles ----
const tileAt = new Int16Array(W * W);
const ixs = new Int8Array(MAX_TILES), izs = new Int8Array(MAX_TILES);
const trad = new Float32Array(MAX_TILES), tang = new Float32Array(MAX_TILES);
const nbs = new Int16Array(MAX_TILES * NB_K), nbn = new Uint8Array(MAX_TILES);
const stA = new Uint8Array(MAX_TILES), bb = new Uint8Array(MAX_TILES);

/** Index of the tile that contains (x, z), or -1. */
export function tileOf(x: number, z: number): number {
  const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
  if (ix < -RANGE || ix > RANGE || iz < -RANGE || iz > RANGE) return -1;
  return tileAt[(ix + RANGE) * W + iz + RANGE];
}
const tileIx = (ix: number, iz: number): number => (ix < -RANGE || ix > RANGE || iz < -RANGE || iz > RANGE ? -1 : tileAt[(ix + RANGE) * W + iz + RANGE]);

/** Lays the tile grid (every 5 m square that touches the arena) and clears every hit. */
export function lavaBuildTiles(): void {
  let n = 0;
  tileAt.fill(-1);
  for (let ix = -RANGE; ix <= RANGE && n < MAX_TILES; ix++) {
    for (let iz = -RANGE; iz <= RANGE && n < MAX_TILES; iz++) {
      const cx = ix * CELL, cz = iz * CELL;
      if (Math.hypot(cx, cz) - CELL * 0.75 > edgeLimit(cx, cz, 0)) continue;   // (a tile exists when ANY part of it is inside the arena)
      bp.tx[n] = cx; bp.tz[n] = cz; ixs[n] = ix; izs[n] = iz; trad[n] = Math.hypot(cx, cz); tang[n] = Math.atan2(cz, cx);
      tileAt[(ix + RANGE) * W + iz + RANGE] = n; n++;
    }
  }
  bp.nt = n; bp.tileHalf = CELL * 0.5;
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if ((dx === 0 && dz === 0) || dx * dx + dz * dz > 4) continue;
      const j = tileIx(ixs[i] + dx, izs[i] + dz);
      if (j >= 0 && c < NB_K) nbs[i * NB_K + c++] = j;
    }
    nbn[i] = c; bp.tn[i] = 0;
  }
  bp.tbuild++; bp.tver++;
}

// ---------------------------------------------------------------- hits ----
function hit(i: number, t0: number, warn: number, hold: number): void {
  if (i < 0 || i >= bp.nt) return;
  const n = bp.tn[i]; if (n >= LAVA_K) return;
  const o = i * LAVA_K + n;
  bp.tw[o] = t0; bp.te[o] = t0 + warn; bp.tc[o] = t0 + warn + hold; bp.tn[i] = n + 1;
}
function rmHit(i: number, k: number): void {
  const last = bp.tn[i] - 1, o = i * LAVA_K;
  bp.tw[o + k] = bp.tw[o + last]; bp.te[o + k] = bp.te[o + last]; bp.tc[o + k] = bp.tc[o + last]; bp.tn[i] = last;
}
/** 0 cool, 1 RED warning, 2 lava, for tile i at phase time t. */
export function tileState(i: number, t: number): number {
  let s = 0;
  const o = i * LAVA_K, n = bp.tn[i];
  for (let k = 0; k < n; k++) {
    if (t >= bp.tw[o + k] && t < bp.tc[o + k]) { if (t >= bp.te[o + k]) return 2; s = 1; }
  }
  return s;
}

// ---------------------------------------------------------------- state ----
export const LP = {
  cycle: 0, pat: -1, pat2: -1, last: -1, seed: 0, end: 0, gentle: false, tempo: 1, wk: 1, hk: 1, fixes: 0, minSafe: 1, maxLava: 0, startT: 0,
  /** dynamic patterns */
  scNext: 0, scUntil: 0, scGap: 1, scN: 6, snNext: 0, snUntil: 0, snStep: 0.5, snN: 3,
};
let rnd = mulberry32(1);
const wn = (b: number): number => Math.max(0.7, b * LP.wk);   // warning length (never under 0.7 s)
const hd = (b: number): number => b * LP.hk;                    // lava length
const sp = (b: number): number => b * LP.tempo;                 // time scale of a pattern's pace
const HX = [0, 0], HZ = [0, 0];
let nHero = 0;
function collectHero(p: PlayerRuntime): void { if (p.alive && nHero < 2) { HX[nHero] = p.pos.x; HZ[nHero] = p.pos.z; nHero++; } }
function heroes(): number { nHero = 0; forEachHero(collectHero); if (nHero === 0) { HX[0] = 0; HZ[0] = 0; nHero = 1; } return nHero; }

// ---------------------------------------------------------------- fairness ----
/** Replays [t0, t1] in 0.1 s steps; wherever a rule breaks, deletes hits scheduled since `beginBatch` until it holds. Returns the hits deleted. */
function enforce(t0: number, t1: number): number {
  let fixes = 0;
  const nt = bp.nt;
  for (let t = t0; t <= t1; t += 0.1) {
    for (let guard = 0; guard < 80; guard++) {
      let safe = 0, bad = -1;
      for (let i = 0; i < nt; i++) { const s = tileState(i, t); stA[i] = s; if (s === 0) safe++; }
      if (safe < nt * SAFE_MIN) bad = -2;
      else for (let i = 0; i < nt; i++) {
        if (stA[i] === 0) continue;
        let ok = false;
        for (let k = 0; k < nbn[i]; k++) if (stA[nbs[i * NB_K + k]] === 0) { ok = true; break; }
        if (!ok) { bad = i; break; }
      }
      const frac = nt ? safe / nt : 1;
      if (frac < LP.minSafe) LP.minSafe = frac;
      if (bad === -1) break;
      // pick a batch hit that is active now: near the offending tile, or any unsafe tile when the cool share is too small
      let pj = -1, pk = -1, seen = 0;
      const cnt = bad >= 0 ? nbn[bad] + 1 : nt;
      for (let c = 0; c < cnt; c++) {
        const j = bad >= 0 ? (c === nbn[bad] ? bad : nbs[bad * NB_K + c]) : c;
        if (stA[j] === 0) continue;
        const o = j * LAVA_K;
        for (let k = bb[j]; k < bp.tn[j]; k++) {
          if (t >= bp.tw[o + k] && t < bp.tc[o + k]) { seen++; if (rnd() * seen < 1) { pj = j; pk = k; } }
        }
      }
      if (pj < 0) break;   // (the violation comes from an older batch: nothing of this one to take back)
      rmHit(pj, pk); fixes++;
    }
  }
  LP.fixes += fixes; bp.tver++;
  return fixes;
}
function beginBatch(): void { for (let i = 0; i < bp.nt; i++) bb[i] = bp.tn[i]; }

// ---------------------------------------------------------------- generators (each returns the time its last tile cools) ----
/** SWEEPING WAVES: 2 passes along alternating axes; each is one-way, a pincer in or a pincer out, with a 2 tile safe gap that slants across the rows. */
function genSweep(T0: number): number {
  let end = T0, T = T0;
  let axis = rnd() < 0.5 ? 0 : 1;
  for (let s = 0; s < 2; s++) {
    const mode = (rnd() * 3) | 0, dir = rnd() < 0.5 ? 1 : -1, g0 = ((rnd() * 9) | 0) - 4, ph = rnd() * 6.28;
    const step = sp(mode === 0 ? 0.33 : 0.46), w = wn(0.8), h = hd(0.6);
    for (let i = 0; i < bp.nt; i++) {
      const row = axis === 0 ? izs[i] : ixs[i], col = axis === 0 ? ixs[i] : izs[i];
      const gap = g0 + Math.round(Math.sin(row * 0.45 + ph) * 2.4);
      if (col === gap || col === gap + 1) continue;
      const ord = mode === 0 ? (dir > 0 ? row + RANGE : RANGE - row) : mode === 1 ? RANGE - Math.abs(row) : Math.abs(row);
      const t = T + ord * step;
      hit(i, t, w, h); if (t + w + h > end) end = t + w + h;
    }
    T += (mode === 0 ? 14 : 9) * step * 0.78 + 1.0;
    axis = 1 - axis;
  }
  return end;
}
/** CHECKERBOARD: classes flip 4-5 times (1 or 2 tile blocks). */
function genChecker(T0: number): number {
  const sh = rnd() < 0.5 ? 0 : 1, c0 = rnd() < 0.5 ? 0 : 1, flips = LP.gentle ? 4 : 5, w = wn(0.9), h = hd(1.0);
  let end = T0;
  for (let f = 0; f < flips; f++) {
    const t = T0 + f * (w + h), cls = (c0 + f) & 1;
    for (let i = 0; i < bp.nt; i++) {
      if ((((ixs[i] >> sh) + (izs[i] >> sh)) & 1) !== cls) continue;
      hit(i, t, w, h);
    }
    end = t + w + h;
  }
  return end;
}
/** SPIRAL (k != 0, 3 arms) and CLOCK HANDS (k = 0, 2 arms): arms rotate round a safe hub; a tile burns while an arm (half width ~5 m) passes. */
function genArms(T0: number, k: number, hands: number, omega: number, dur: number): number {
  const dir = rnd() < 0.5 ? 1 : -1, a0 = rnd() * 6.283, w = wn(0.85);
  let end = T0;
  for (let i = 0; i < bp.nt; i++) {
    const r = trad[i];
    if (r < 7) continue;   // (the hub stays cool)
    const hw = Math.min(2.0, Math.max(0.5, 5 / (omega * Math.max(r, 6))));
    for (let j = 0; j < hands; j++) {
      let d = dir * (tang[i] - k * r - a0 - (6.2832 * j) / hands);
      d -= Math.floor(d / 6.2832) * 6.2832;
      const tc = T0 + 1.8 + d / omega;
      if (tc > T0 + dur) continue;
      hit(i, tc - hw - w, w, hw * 2); if (tc + hw > end) end = tc + hw;
    }
  }
  return end;
}
/** RIPPLES: 2-3 rings expand from random centres; the lava band is ~2 tiles thick. */
function genRings(T0: number): number {
  const n = LP.gentle ? 2 : 3, v = 7.5 / LP.tempo, w = wn(0.8), h = hd(0.7);
  let end = T0;
  for (let j = 0; j < n; j++) {
    const Tj = T0 + j * sp(2.7), a = rnd() * 6.283, cr = rnd() * 22, cx = Math.cos(a) * cr, cz = Math.sin(a) * cr;
    for (let i = 0; i < bp.nt; i++) {
      const d = Math.hypot(bp.tx[i] - cx, bp.tz[i] - cz);
      if (d > 48) continue;
      const te = Tj + 1.3 + d / v;
      hit(i, te - w, w, h); if (te + h > end) end = te + h;
    }
  }
  return end;
}
const zOff = new Float32Array(W);
/** ZIPPER: neighbouring columns sweep in opposite directions (2 passes, the second reversed). */
function genZipper(T0: number): number {
  const v = 16 / LP.tempo, w = wn(0.8), h = hd(0.6), sg = rnd() < 0.5 ? 1 : -1;
  let end = T0;
  for (let c = 0; c < W; c++) zOff[c] = rnd() * 0.6;
  for (let p = 0; p < 2; p++) {
    const Tp = T0 + p * 4.0 * LP.tempo;
    for (let i = 0; i < bp.nt; i++) {
      const dir = ((ixs[i] & 1) ? 1 : -1) * (p ? -1 : 1) * sg;
      const te = Tp + 1.2 + (bp.tz[i] * dir + 46) / v + zOff[ixs[i] + RANGE];
      hit(i, te - w, w, h); if (te + h > end) end = te + h;
    }
  }
  return end;
}
/** SAFE ISLANDS: lava everywhere except 4 islands (radius 2.5 tiles) that hop every ~3.3 s. */
const isl = new Float32Array(8), safeE = [new Uint8Array(MAX_TILES), new Uint8Array(MAX_TILES), new Uint8Array(MAX_TILES), new Uint8Array(MAX_TILES)];
function genIslands(T0: number, hx: number, hz: number): number {
  const n = 3, D = sp(3.4), w = wn(1.0);
  // island centres (tile units): the first one holds the hero
  const hi = tileOf(hx, hz);
  isl[0] = hi >= 0 ? ixs[hi] : 0; isl[1] = hi >= 0 ? izs[hi] : 0;
  for (let q = 1; q < 4; q++) {
    for (let tries = 0; tries < 40; tries++) {
      const a = rnd() * 6.283, r = (0.25 + rnd() * 0.55) * (edgeLimit(Math.cos(a) * 10, Math.sin(a) * 10, 8) / CELL), x = Math.cos(a) * r, z = Math.sin(a) * r;
      let ok = true;
      for (let o = 0; o < q; o++) if (Math.hypot(x - isl[o * 2], z - isl[o * 2 + 1]) < 5.5) ok = false;
      if (ok || tries === 39) { isl[q * 2] = x; isl[q * 2 + 1] = z; break; }
    }
  }
  for (let e = 0; e < n; e++) {
    if (e > 0) for (let q = 0; q < 4; q++) {   // hop 2.3-3.4 tiles, inside the arena
      for (let tries = 0; tries < 12; tries++) {
        const a = rnd() * 6.283, d = 2.3 + rnd() * 1.1, x = isl[q * 2] + Math.cos(a) * d, z = isl[q * 2 + 1] + Math.sin(a) * d;
        if (Math.hypot(x, z) * CELL < edgeLimit(x * CELL, z * CELL, 8) || tries === 11) { isl[q * 2] = x; isl[q * 2 + 1] = z; break; }
      }
    }
    for (let i = 0; i < bp.nt; i++) {
      let s = 0;
      for (let q = 0; q < 4; q++) if ((ixs[i] - isl[q * 2]) ** 2 + (izs[i] - isl[q * 2 + 1]) ** 2 <= 6.3) { s = 1; break; }
      safeE[e][i] = s;
    }
  }
  const Tend = T0 + (n - 1) * D + D;
  for (let i = 0; i < bp.nt; i++) {
    let prevSafe = true, gapStart = T0;
    for (let e = 0; e < n; e++) {
      const s = safeE[e][i] === 1, Te = T0 + e * D;
      if (!s && prevSafe) gapStart = e === 0 ? T0 : Te - w;
      else if (s && !prevSafe) { const ge = Te - 1.2; if (ge > gapStart + w) hit(i, gapStart, w, ge - gapStart - w); }
      prevSafe = s;
    }
    if (!prevSafe) hit(i, gapStart, w, Math.max(0.1, Tend - 0.4 - gapStart - w));
  }
  return Tend;
}

// ---- dynamic: FIRE RAIN + SNAKES (extra hits are added while the phase runs: `lavaTick`)
const snI = new Int16Array(4), snP = new Int16Array(4);
function scatterBurst(t: number): void {
  heroes();
  const w = wn(0.7), h = hd(1.1), n = LP.scN;
  beginBatch();
  for (let k = 0; k < n; k++) {
    const hh = (rnd() * nHero) | 0, a = rnd() * 6.283, d = Math.sqrt(rnd()) * 17;
    let i = tileOf(HX[hh] + Math.cos(a) * d, HZ[hh] + Math.sin(a) * d);
    if (k === 0 && rnd() < 0.75) i = tileOf(HX[hh], HZ[hh]);   // (one tile right under the hero most bursts)
    hit(i, t, w, h);
  }
  enforce(t, t + w + h);
}
function snakeStart(): void {
  heroes();
  for (let s = 0; s < LP.snN; s++) {
    let best = -1;
    for (let tries = 0; tries < 24; tries++) {
      const i = (rnd() * bp.nt) | 0;
      if (trad[i] < 22) continue;
      let ok = true; for (let q = 0; q < nHero; q++) if (Math.hypot(bp.tx[i] - HX[q], bp.tz[i] - HZ[q]) < 28) ok = false;
      if (ok) { best = i; break; }
    }
    if (best < 0) best = (rnd() * bp.nt) | 0;
    snI[s] = best; snP[s] = -1;
  }
}
const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
function snakeStep(t: number): void {
  heroes();
  const w = wn(0.75), h = hd(1.4);
  beginBatch();
  for (let s = 0; s < LP.snN; s++) {
    const cur = snI[s], tg = (rnd() * nHero) | 0;
    let bestJ = -1, bestC = 1e9;
    for (let d = 0; d < 4; d++) {
      const j = tileIx(ixs[cur] + DX[d], izs[cur] + DZ[d]);
      if (j < 0 || j === snP[s]) continue;
      const c = Math.hypot(bp.tx[j] - HX[tg], bp.tz[j] - HZ[tg]) + rnd() * 5;
      if (c < bestC) { bestC = c; bestJ = j; }
    }
    if (bestJ < 0) bestJ = snP[s] >= 0 ? snP[s] : cur;
    snP[s] = cur; snI[s] = bestJ;
    hit(bestJ, t, w, h);
  }
  enforce(t, t + w + h);
}
/** Host, every frame while the phase runs (bp.t = phase seconds): drives the dynamic patterns. */
export function lavaTick(t: number): void {
  if (LP.pat !== 5 && LP.pat2 !== 5 && LP.pat !== 8 && LP.pat2 !== 8) return;
  if ((LP.pat === 5 || LP.pat2 === 5) && t >= LP.scNext && t < LP.scUntil) { scatterBurst(t); LP.scNext = t + LP.scGap; }
  if ((LP.pat === 8 || LP.pat2 === 8) && t >= LP.snNext && t < LP.snUntil) { snakeStep(t); LP.snNext = t + LP.snStep; }
}

function genPattern(id: number, T0: number, hx: number, hz: number): number {
  beginBatch();
  let end = T0;
  switch (id) {
    case 0: end = genSweep(T0); break;
    case 1: end = genChecker(T0); break;
    case 2: end = genArms(T0, (rnd() < 0.5 ? 1 : -1) * 0.07, 3, 0.27 / LP.tempo, 9); break;
    case 3: end = genRings(T0); break;
    case 4: end = genZipper(T0); break;
    case 5: LP.scNext = T0; LP.scUntil = T0 + (LP.gentle ? 8 : 9.5); LP.scGap = sp(LP.gentle ? 1.25 : 1.0); LP.scN = LP.gentle ? 8 : 12; end = LP.scUntil + 2; break;
    case 6: end = genArms(T0, 0, 2, 0.32 / LP.tempo, 9.5); break;
    case 7: end = genIslands(T0, hx, hz); break;
    case 8: snakeStart(); LP.snNext = T0; LP.snUntil = T0 + (LP.gentle ? 8.5 : 10.5); LP.snStep = sp(0.5); LP.snN = LP.gentle ? 3 : 4; end = LP.snUntil + 2.2; break;
    default: break;
  }
  if (DYNAMIC.indexOf(id) < 0) enforce(T0 - 1.5, end);
  return end;
}

/**
 * Starts a Floor-is-Lava cycle. `cycle` = how many have run this fight (0 = the first: gentler), `hpFrac` the boss's HP (a second pattern joins below 40%).
 * `forced` >= 0 picks the pattern (QA). Returns the phase length in seconds.
 */
export function lavaStart(cycle: number, hpFrac: number, forced = -1, seed = -1): number {
  LP.cycle = cycle; LP.gentle = cycle === 0;
  LP.seed = seed >= 0 ? seed >>> 0 : (Math.random() * 4294967296) >>> 0;
  rnd = mulberry32(LP.seed);
  LP.tempo = 0.88 + rnd() * 0.3;                       // tempo variation: 0.88 (fast) .. 1.18 (slow)
  if (LP.gentle) LP.tempo = Math.max(1.05, LP.tempo);
  LP.wk = (LP.gentle ? 1.3 : 1) * (0.95 + rnd() * 0.15);
  LP.hk = (LP.gentle ? 0.85 : 1) * (0.95 + rnd() * 0.25);
  LP.fixes = 0; LP.minSafe = 1; LP.maxLava = 0;
  lavaBuildTiles();
  // pick: never the same as the last cycle; the first cycle only draws from the gentler ones
  let id = forced >= 0 ? forced : lavaDbg.pat;
  if (id < 0) {
    for (let tries = 0; tries < 30; tries++) {
      id = (rnd() * N_PAT) | 0;
      if (id === LP.last) continue;
      if (LP.gentle && (id === 4 || id === 6 || id === 8)) continue;
      break;
    }
  }
  LP.pat = id; LP.last = id; LP.pat2 = -1;
  heroes();
  const LEAD = 1.7;
  let end = genPattern(id, LEAD, HX[0], HZ[0]);
  if (!LP.gentle && hpFrac < 0.4 && forced < 0) {   // a second pattern, lighter and later, joins the first when the boss is low
    const pool = [3, 5, 8, 1];
    let id2 = pool[(rnd() * pool.length) | 0];
    if (id2 === id) id2 = pool[(pool.indexOf(id2) + 1) % pool.length];
    LP.pat2 = id2;
    const e2 = genPattern(id2, LEAD + 3.2, HX[0], HZ[0]);
    if (e2 > end) end = e2;
  }
  bp.pat = LP.pat; bp.pat2 = LP.pat2;
  LP.end = end + 0.5; bp.tver++;
  return LP.end;
}

/** Room change / run end: forget the last pattern (the 'never twice in a row' memory). */
export function lavaReset(): void { LP.last = -1; LP.cycle = 0; LP.pat = LP.pat2 = -1; }

/** QA (dev console `__bossPhase.lavaDry(pat, seed, cycle)`): schedules a cycle and replays it at 0.1 s with the hero where he stands; returns the worst numbers. */
export function lavaDry(pat: number, seed: number, cycle = 1): { end: number; tiles: number; minSafe: number; maxLava: number; maxUnsafe: number; noNeighbour: number; fixes: number; tempo: number; series: number[] } {
  const end = lavaStart(cycle, 1, pat, seed);
  let minSafe = 1, maxLava = 0, maxUnsafe = 0, noNb = 0;
  const series: number[] = [];
  for (let t = 0; t <= end; t += 0.1) {
    lavaTick(t);
    let safe = 0, lava = 0;
    for (let i = 0; i < bp.nt; i++) { const s = tileState(i, t); stA[i] = s; if (s === 0) safe++; else if (s === 2) lava++; }
    for (let i = 0; i < bp.nt; i++) {
      if (stA[i] === 0) continue;
      let ok = false;
      for (let k = 0; k < nbn[i]; k++) if (stA[nbs[i * NB_K + k]] === 0) { ok = true; break; }
      if (!ok) noNb++;
    }
    const n = bp.nt || 1;
    minSafe = Math.min(minSafe, safe / n); maxLava = Math.max(maxLava, lava / n); maxUnsafe = Math.max(maxUnsafe, 1 - safe / n);
    if (Math.round(t * 10) % 10 === 0) series.push(Math.round((lava / n) * 100));
  }
  return { end, tiles: bp.nt, minSafe, maxLava, maxUnsafe, noNeighbour: noNb, fixes: LP.fixes, tempo: LP.tempo, series };
}
