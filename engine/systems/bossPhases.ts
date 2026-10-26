// ============================================================================
// Boss INVULNERABLE PHASES. At set hp thresholds (70% and 35%; the Slime King once at 50%) a boss turns invulnerable (glowing
// bubble, banner, 'IMMUNE' on hits) and runs ITS OWN signature mechanic; when it resolves the boss is vulnerable again on its own
// (about 6-9 s in all). Nothing needs destroying any more. One mechanic per boss:
//   Glacius  AVALANCHE  the floor turns red except 3 small safe circles near the edges; cold slows you while you run there
//   Slime K. SPLIT       he bursts into 5 slimes that run off: kill them in 8 s, survivors merge back and heal him
//   Gorath   PINBALL     rolls as a boulder along telegraphed lines and bounces off the walls; hit a pillar to crack him
//   Elderroot SPORES     4 spore pods swell: pop them (touch / hit) before they burst (heals him + poison); roots grab you
//   Hydra    TIDAL       a wave from one side: hide behind a raised rock (line-of-sight cover) or take 70% max hp + knockback
//   Ignar    LAVA        the floor is tiles; 4 sweeps (random directions) erupt half the floor each so EVERY tile erupts twice: keep moving
//   Colossus SAND        a sandstorm from one direction, shifting once: hide behind a pillar / wreck or take ticking damage
//   Void H.  DARK        lights out: only a lantern round you; telegraphed void hands erupt under you
//   Malakar  REAL        he + 2 illusions run around you: hitting a fake pops it (damage), hitting the real one ends the phase
// Human mini bosses (Varn / Sable / Rook) have their own small versions in humanBosses.ts.
// State is `bp` (bossPhaseState.ts); render/BossPhaseFx.tsx + ui/hud/BossPhaseHud.tsx draw it. No allocations per frame.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events, type DamageKind } from '../events';
import { edgeLimit } from '../mapgen';
import type { Enemy } from '../types';
import { damagePlayer, applyPlayerDebuff, knockHero, playerTrickImmune } from './combat';
import { damageMinion } from './minions';
import { spawnEnemy, onEnemyDeath, spawnTelegraphLine, fireEnemyProjectile } from './enemies';
import { bossStrike, bossPwr } from './bossMech';
import { BT } from './bossFx';
import { spawnHostileZone } from './tricks';
import { spawnIllusions, popDecoy, clearDecoys, isSlimeKing, countIllusions } from './bossSpecials';
import { mfx, queueBomb, queueHole, tickMalakarFx } from './malakarFx';
import { hooks } from './hooks';
import { bp, MAX_PROPS, MAX_TILES, MAX_HANDS, LAVA_HITS, type PhaseKind } from './bossPhaseState';
import { useGameStore } from '../../store';

const MECH: Record<string, PhaseKind> = {
  BOSS_WYRM: 'AVALANCHE', BOSS_GOLEM: 'PINBALL', BOSS_TREANT: 'SPORES', BOSS_HYDRA: 'TIDAL', BOSS_WARLORD: 'LAVA',
  BOSS_WARMACH: 'SAND', BOSS_VOID: 'DARK', BOSS_LICH: 'REAL',
};
const TH_BOSS = [0.7, 0.35], TH_SLIME = [0.5];
const INFO: Record<string, { name: string; sub: string; color: number }> = {
  AVALANCHE: { name: 'AVALANCHE', sub: 'Run into a glowing circle - the cold slows you!', color: 0x9fe4ff },
  SPLIT: { name: 'SLIME SPLIT', sub: 'Pop the slimes before they merge back!', color: 0x86efac },
  PINBALL: { name: 'BOULDER PINBALL', sub: 'Bait him into a stone pillar!', color: 0xd9a066 },
  SPORES: { name: 'SPORE GARDEN', sub: 'Pop the spore pods before they burst!', color: 0x84cc16 },
  TIDAL: { name: 'TIDAL WAVE', sub: 'Hide behind a rock!', color: 0x38bdf8 },
  LAVA: { name: 'THE FLOOR IS LAVA', sub: 'Every tile erupts twice - keep moving to one that is not flashing!', color: 0xff7a1a },
  SAND: { name: 'SANDSTORM', sub: 'Hide behind a pillar, out of the wind!', color: 0xe0b060 },
  DARK: { name: 'LIGHTS OUT', sub: 'Watch for faint purple circles!', color: 0xa060ff },
  REAL: { name: 'FIND THE REAL ONE', sub: 'A FAKE bursts on you and opens a black hole - only the real one ends this!', color: 0xc084fc },
};

const tv = new Vector3();
const D = { id: -1, n: 0, since: -1, lastEnd: -99, frameDt: 0.016 };
// per-mechanic scratch
const G = {
  stage: 0, t0: 0, hit: false, tick: 0,
  // pinball
  dx: 0, dz: 1, windT: 0, rollT: 0, legs: 0, legHit: false, dust: 0,
  // pods
  podId: [-1, -1, -1, -1, -1, -1, -1, -1], podT: [0, 0, 0, 0, 0, 0, 0, 0], rootT: 0,
  // slimes
  scale0: 1,
  // lava
  hitCd: 0,
  // darkness
  handT: 0,
  // real one
  pulseOn: false, spawnT: 0, volleyT: 0, tries: 0, px: 0, pz: 0,
};

const heroSpeed = (): number => useGameStore.getState().stats.moveSpeed * 0.8;
const rimAt = (a: number, m: number): number => edgeLimit(Math.cos(a) * 10, Math.sin(a) * 10, m);
const pick = (a: number, b: number): number => a + Math.random() * (b - a);

function hitHero(pct: number, kind: DamageKind, fx: number, fz: number, kb = 0, down = 0): void {
  tv.set(fx, 0, fz);
  damagePlayer(1, { pct, pos: tv, kind, kb, down });
}
function banner(kind: string): void {
  const i = INFO[kind];
  bp.name = i.name; bp.sub = i.sub; bp.color = i.color; bp.bannerT = 3.4;
}
function say(e: Enemy, text: string, color: number, scale = 1.2): void {
  events.emit('floatText', { pos: e.pos, text, color, scale, dy: 5 });
}

/** Fills bp.props[0..n) with spread-out props (rocks, circles, pillars); the first one within `nearHero` of the hero when > 0. */
function placeProps(n: number, r: number, minF: number, maxF: number, gap: number, nearHero: number, e: Enemy | null): void {
  const hp = world.player.pos;
  let cnt = 0, g = gap;
  for (let tries = 0; cnt < n && tries < 240; tries++) {
    if (tries % 50 === 49) g *= 0.75;
    let x: number, z: number;
    if (cnt === 0 && nearHero > 0) {
      const a = Math.random() * 6.283, d = nearHero * (0.45 + Math.random() * 0.55);
      x = hp.x + Math.cos(a) * d; z = hp.z + Math.sin(a) * d;
      const lim = rimAt(Math.atan2(z, x), r + 1.5) * maxF, l = Math.hypot(x, z);
      if (l > lim) { x *= lim / l; z *= lim / l; }
    } else {
      const a = Math.random() * 6.283, f = pick(minF, maxF), rim = rimAt(a, r + 1.5);
      x = Math.cos(a) * rim * f; z = Math.sin(a) * rim * f;
    }
    if (e && Math.hypot(x - e.pos.x, z - e.pos.z) < e.radius + r + 2.5) continue;
    let ok = true;
    for (let i = 0; i < cnt; i++) { const q = bp.props[i]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < g * g) { ok = false; break; } }
    if (!ok) continue;
    const q = bp.props[cnt++]; q.x = x; q.z = z; q.r = r; q.h = 0; q.on = true;
  }
  for (; cnt < n; cnt++) { const a = Math.random() * 6.283, rim = rimAt(a, r + 1.5) * 0.5, q = bp.props[cnt]; q.x = Math.cos(a) * rim; q.z = Math.sin(a) * rim; q.r = r; q.h = 0; q.on = true; }
  for (let i = n; i < MAX_PROPS; i++) bp.props[i].on = false;
}

/** Is (x, z) in the lee of a rock / pillar for wind / wave travelling along (dx, dz)? (behind it, inside its shadow strip) */
const SHADOW_LEN = 17;
function covered(x: number, z: number, dx: number, dz: number): boolean {
  for (let i = 0; i < MAX_PROPS; i++) {
    const q = bp.props[i]; if (!q.on) continue;
    const vx = x - q.x, vz = z - q.z, along = vx * dx + vz * dz, perp = Math.abs(vx * dz - vz * dx);
    if (along > -q.r * 0.6 && along < SHADOW_LEN && perp < q.r + 0.35) return true;
  }
  return false;
}

// ----------------------------------------------------------------- start / end ----
function begin(e: Enemy, kind: PhaseKind): void {
  bp.on = true; bp.id = e.id; bp.kind = kind; bp.t = 0; bp.immune = true; bp.tail = 9;
  bp.count = -1; bp.flash = 0; bp.floor = 0; bp.windOn = false; bp.wave = 2; bp.shiftT = 0; bp.nt = 0;
  bp.dark = false; bp.ball = false; bp.crackT = 0; bp.realId = -1; bp.slimes.length = 0;
  for (let i = 0; i < MAX_PROPS; i++) bp.props[i].on = false;
  for (let i = 0; i < MAX_HANDS; i++) bp.hands[i].on = false;
  G.spawnT = 0; G.volleyT = 1.0; G.tries = 0; G.px = 0; G.pz = 0;
  G.stage = 0; G.t0 = 0; G.hit = false; G.tick = 0; G.legs = 0; G.legHit = false; G.windT = 0; G.rootT = 0; G.hitCd = 0; G.handT = 0; G.pulseOn = false; G.dust = 0;
  banner(kind);
  if (kind === 'REAL') realHint();
  e.vel.set(0, 0, 0);
  events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 3 + 4, color: bp.color });
  events.emit('shake', { amount: 0.45 });
  say(e, 'INVULNERABLE', bp.color, 1.3);
  useGameStore.getState().addNotification(`${INFO[kind].name}! ${INFO[kind].sub}`, '#' + bp.color.toString(16).padStart(6, '0'), 'BOSS');
}

const REAL_KEY = 'aether_real_hint';
let realSeen = false;
/** The first time ever: the banner teaches the tell (his solid shadow); afterwards it just states the stakes. */
function realHint(): void {
  try { realSeen = localStorage.getItem(REAL_KEY) === '1'; } catch { /* private mode: the hint just repeats */ }
  bp.sub = realSeen ? 'Hit the REAL one. A fake bursts on you and opens a black hole!' : 'The real Malakar casts a solid shadow - fakes flicker!';
  if (!realSeen) bp.bannerT = 5.5;
  try { localStorage.setItem(REAL_KEY, '1'); } catch { /* ignore */ }
}

function end(e: Enemy | null, text = 'VULNERABLE!'): void {
  const kind = bp.kind;
  bp.on = false; bp.immune = false; bp.count = -1; bp.dark = false; bp.ball = false; bp.crackT = 0; bp.windOn = false; bp.shiftT = 0; bp.wave = 2;
  bp.realId = -1; bp.slimes.length = 0;
  for (let i = 0; i < MAX_HANDS; i++) bp.hands[i].on = false;
  mfx.major = false; bp.tail = 0;
  D.n++; D.lastEnd = world.time; D.since = -1;
  if (e && e.active && e.state !== 'DYING') {
    if (kind === 'SPLIT') e.scale = G.scale0;
    events.emit('explosion', { pos: e.pos.clone(), radius: e.radius * 2, color: INFO[kind]?.color ?? 0xffffff });
    if (text) say(e, text, 0xfff1a8, 1.2);
  }
}

/** Reset on room change / run end (hooks.phaseReset, called by bossMech.resetBossMech). */
hooks.phaseReset = (): void => {
  bp.on = false; bp.immune = false; bp.kind = ''; bp.count = -1; bp.dark = false; bp.ball = false; bp.floor = 0; bp.flash = 0; bp.tint = 0; bp.bannerT = 0;
  bp.windOn = false; bp.wave = 2; bp.nt = 0; bp.slimes.length = 0; bp.id = -1; bp.crackT = 0; bp.shiftT = 0; bp.tail = 9;
  for (let i = 0; i < MAX_PROPS; i++) bp.props[i].on = false;
  for (let i = 0; i < MAX_HANDS; i++) bp.hands[i].on = false;
  D.id = -1; D.n = 0; D.since = -1; D.lastEnd = -99; mfx.major = false;
};

// ---------------------------------------------------------------- the trigger ----
hooks.phaseCheck = (e: Enemy): void => {
  if (bp.on || e.state === 'SPAWN' || e.state === 'DYING' || e.decoy) return;
  const kind: PhaseKind = isSlimeKing(e) ? 'SPLIT' : e.boss ? (MECH[e.kind] ?? '') : '';
  if (!kind) return;
  if (D.id !== e.id) { D.id = e.id; D.n = 0; D.since = -1; D.lastEnd = -99; }
  const th = kind === 'SPLIT' ? TH_SLIME : TH_BOSS;
  if (D.n >= th.length || e.hp >= e.maxHp * th[D.n] || world.time - D.lastEnd < 3.5) return;
  if (D.since < 0) D.since = world.time;
  const busy = e.state === 'WINDUP' || e.state === 'ATTACK' || e.spKind !== 0 || (kind === 'REAL' && mfx.major) || e.freezeT > 0;
  if (busy && world.time - D.since < 6) return;   // let the current attack resolve (up to 6 s), then cut in
  if (e.state === 'WINDUP' || e.state === 'ATTACK') { e.state = 'CHASE'; e.stateT = 0; }
  begin(e, kind);
};
hooks.phaseMul = (e: Enemy): number => (bp.kind === 'PINBALL' && bp.crackT > 0 && e.id === bp.id ? 1.5 : 1);

/** The hero hit something during a phase (decoy / the real Malakar; Sable is in humanBosses.ts). */
const FAKE_PCT = 0.30, FAKE_R = 4.5, FAKE_WARN = 0.9;
hooks.phaseHit = (e: Enemy): void => {
  if (!bp.on || bp.kind !== 'REAL') return;
  const p = world.player;
  if (e.decoy) {
    if (e.state === 'DYING') return;
    popDecoy(e); say(e, 'A FAKE!', 0xc084fc, 1.1);
    if (G.stage >= 1 && G.hitCd <= 0) {   // the punish: a telegraphed explosion on the hero (30% max hp) + a black hole that opens on them and drifts after them
      G.hitCd = 0.6;
      if (p.alive) { queueBomb(p.pos.x, p.pos.z, FAKE_R, FAKE_WARN, FAKE_PCT); queueHole(0.4); }
      events.emit('floatText', { pos: p.pos, text: 'WRONG ONE!', color: 0xff6a8a, scale: 1.2, dy: 4 });
    }
    return;
  }
  if (e.id !== bp.id || G.stage < 1 || bp.t - G.t0 < 0.8) return;   // hits in flight while he turns immune / the fakes appear do not count (that was the "no illusions" bug)
  clearDecoys();
  const boss = world.enemies[bp.id];
  end(boss, 'FOUND HIM!');
  if (boss) { boss.staggerT = Math.max(boss.staggerT, 2.6); events.emit('shockwave', { pos: boss.pos.clone(), radius: 10, color: 0xfff1a8 }); }
};

// ----------------------------------------------------------------- mechanics ----
const AVA_R = 2.6, AVA_COUNT = 4.5;
function avaPlace(e: Enemy): void {
  const base = Math.random() * 6.283, hp = world.player.pos;
  for (let k = 0; k < 3; k++) {
    const a = base + k * 2.094 + pick(-0.25, 0.25), q = bp.props[k];
    const rim = rimAt(a, AVA_R + 1.2) * 0.84;
    q.x = Math.cos(a) * rim; q.z = Math.sin(a) * rim; q.r = AVA_R; q.on = true; q.h = 0;
    const bd = Math.hypot(q.x - e.pos.x, q.z - e.pos.z), need = e.radius + AVA_R + 1.5;   // never inside the boss body (it sits at the rim)
    if (bd < need) { q.x = e.pos.x + (q.x - e.pos.x) / Math.max(0.1, bd) * need; q.z = e.pos.z + (q.z - e.pos.z) / Math.max(0.1, bd) * need; }
  }
  for (let i = 3; i < MAX_PROPS; i++) bp.props[i].on = false;
  // fairness: the nearest circle must be reachable while slowed (hero walks ~heroSpeed * 0.6)
  const reach = heroSpeed() * 0.6 * (AVA_COUNT - 0.9);
  let bi = 0, bd = 1e9;
  for (let k = 0; k < 3; k++) { const q = bp.props[k], d = Math.hypot(q.x - hp.x, q.z - hp.z); if (d < bd) { bd = d; bi = k; } }
  if (bd > reach) { const q = bp.props[bi], f = reach * 0.8 / bd; q.x = hp.x + (q.x - hp.x) * f; q.z = hp.z + (q.z - hp.z) * f; }
}
function outsideCircles(x: number, z: number, pad: number): boolean {
  for (let i = 0; i < MAX_PROPS; i++) { const q = bp.props[i]; if (q.on && (q.x - x) ** 2 + (q.z - z) ** 2 < (q.r + pad) ** 2) return false; }
  return true;
}
function avaHit(e: Enemy): void {
  const p = world.player;
  bp.flash = 1; bp.floor = 0.6;
  events.emit('shake', { amount: 0.9 });
  events.emit('explosion', { pos: e.pos.clone(), radius: 10, color: 0xdff6ff });
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.283, rim = rimAt(a, 3) * Math.random() * 0.9;
    events.emit('shockwave', { pos: new Vector3(Math.cos(a) * rim, 0, Math.sin(a) * rim), radius: 9, color: 0xe8f8ff });
  }
  if (p.alive && outsideCircles(p.pos.x, p.pos.z, 0.2)) {
    hitHero(0.75, 'ICE', e.pos.x, e.pos.z, 4, 0.8);
    applyPlayerDebuff('SLOW', 2.5, 0.4);
  }
  const M = world.minions;
  for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && outsideCircles(m.x, m.z, 0.2)) damageMinion(i, m.maxHp * 0.8); }
}

function rayLen(x: number, z: number, dx: number, dz: number, m: number): number {
  let s = 0;
  while (s < 90) { const nx = x + dx * s, nz = z + dz * s; if (nx * nx + nz * nz > edgeLimit(nx, nz, m) ** 2) break; s += 1.5; }
  return s;
}
function startLeg(e: Enemy): void {
  const p = world.player.pos;
  let dx = p.x - e.pos.x, dz = p.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  if (G.legs > 0) {   // after a bounce: half the reflected direction, half toward the hero
    dx = dx * 0.5 + G.dx * 0.5; dz = dz * 0.5 + G.dz * 0.5; l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  }
  G.dx = dx; G.dz = dz; bp.rx = dx; bp.rz = dz; G.windT = 0.9; G.rollT = 0; G.legHit = false; bp.ball = false;
  const len = rayLen(e.pos.x, e.pos.z, dx, dz, e.radius * 0.6);
  const z0 = spawnTelegraphLine(e.pos.x, e.pos.z, dx, dz, len, Math.min(6, e.radius * 1.6), 0.9, 0xff8a3a);
  if (z0) z0.trick = BT.VISUAL;
  events.emit('shake', { amount: 0.2 });
}
const ROLL_SPEED = 21;
function tickPinball(e: Enemy, dt: number): void {
  const p = world.player;
  if (G.stage === 0) {   // wind-up: pillars rise, he crouches
    if (G.t0 === 0) { G.t0 = 1; placeProps(3, 1.9, 0.22, 0.7, 12, 0, e); }
    if (bp.t >= 1.1) { G.stage = 1; G.t0 = 0; startLeg(e); }
    return;
  }
  if (G.stage === 1) {
    if (G.windT > 0) { G.windT -= dt; if (G.windT <= 0) { bp.ball = true; events.emit('floatText', { pos: e.pos, text: 'ROLL!', color: 0xffb070, scale: 1.1, dy: 4 }); } return; }
    // rolling
    G.rollT += dt;
    e.pos.x += G.dx * ROLL_SPEED * dt; e.pos.z += G.dz * ROLL_SPEED * dt;
    bp.spin += dt * ROLL_SPEED / Math.max(1, e.radius);
    G.dust -= dt; if (G.dust <= 0) { G.dust = 0.22; events.emit('shockwave', { pos: e.pos.clone(), radius: e.radius * 1.3, color: 0xb8a890 }); }
    if (!G.legHit && p.alive && (p.pos.x - e.pos.x) ** 2 + (p.pos.z - e.pos.z) ** 2 < (e.radius + 1.7) ** 2) {
      G.legHit = true; hitHero(0.3, 'PHYSICAL', e.pos.x - G.dx, e.pos.z - G.dz, 5, 0.8);
      if (++G.legs >= 3) { G.stage = 3; G.t0 = bp.t; bp.ball = false; say(e, 'DIZZY...', 0xffe9a8, 1.0); return; }
      startLeg(e); return;   // he bonks off the hero and lines up again
    }
    for (let i = 0; i < MAX_PROPS; i++) {   // a pillar: he cracks
      const q = bp.props[i]; if (!q.on) continue;
      if ((q.x - e.pos.x) ** 2 + (q.z - e.pos.z) ** 2 < (e.radius * 0.8 + q.r) ** 2) {
        q.on = false; G.stage = 2; bp.ball = false; bp.immune = false; bp.crackT = 4.4;
        e.staggerT = Math.max(e.staggerT, 4.4);
        events.emit('explosion', { pos: new Vector3(q.x, 1, q.z), radius: 6, color: 0xd9a066 });
        events.emit('shake', { amount: 0.9 });
        say(e, 'CRACKED!', 0xffe08a, 1.5);
        useGameStore.getState().addNotification('He cracked! Hit him now!', '#ffe08a', 'BOSS');
        return;
      }
    }
    const r = Math.hypot(e.pos.x, e.pos.z), lim = edgeLimit(e.pos.x, e.pos.z, e.radius * 0.6);
    if (G.rollT > 1.9) {   // stuck against something: count it as a bounce
      if (++G.legs >= 3) { G.stage = 3; G.t0 = bp.t; bp.ball = false; say(e, 'DIZZY...', 0xffe9a8, 1.0); return; }
      startLeg(e); return;
    }
    if (r > lim) {   // a wall: bounce
      const nx = -e.pos.x / r, nz = -e.pos.z / r, dn = G.dx * nx + G.dz * nz;
      e.pos.x *= lim / r; e.pos.z *= lim / r;
      G.dx -= 2 * dn * nx; G.dz -= 2 * dn * nz; bp.rx = G.dx; bp.rz = G.dz;
      events.emit('shake', { amount: 0.5 }); events.emit('explosion', { pos: e.pos.clone(), radius: 4, color: 0xb8a890 });
      if (++G.legs >= 3) { G.stage = 3; G.t0 = bp.t; bp.ball = false; say(e, 'DIZZY...', 0xffe9a8, 1.0); return; }
      startLeg(e);
    }
    return;
  }
  if (G.stage === 2) { bp.crackT -= dt; if (bp.crackT <= 0) end(e, ''); return; }
  if (bp.t - G.t0 > 1.3) end(e);   // tired out without a crack: the phase just ends
}

function tickSplit(e: Enemy, dt: number): void {
  if (G.stage === 0) {
    if (bp.t >= 0.9) {
      G.stage = 1; G.t0 = bp.t; G.scale0 = e.scale;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + Math.random() * 0.5;
        tv.set(e.pos.x + Math.cos(a) * e.radius * 0.8, 0, e.pos.z + Math.sin(a) * e.radius * 0.8);
        const w = spawnEnemy('SLIME', tv);
        if (!w) continue;
        w.maxHp = Math.max(40, Math.round(e.maxHp * 0.022)); w.hp = w.maxHp; w.shield = 0; w.contactDamage = 0; w.projectileDamage = 0; w.elite = false;
        bp.slimes.push(w.id);
      }
      e.scale = G.scale0 * 0.5;
      bp.count = 8; bp.countMax = 8;
      events.emit('explosion', { pos: e.pos.clone(), radius: 8, color: 0x86efac });
      say(e, 'SPLIT!', 0x86efac, 1.4);
    }
    return;
  }
  const left = 8 - (bp.t - G.t0);
  bp.count = Math.max(0, left);
  let alive = 0;
  for (let i = 0; i < bp.slimes.length; i++) { const w = world.enemies[bp.slimes[i]]; if (w && w.active && w.state !== 'DYING' && w.kind === 'SLIME') alive++; }
  if (alive === 0) { end(e, 'SLIMES SLAIN!'); e.staggerT = Math.max(e.staggerT, 2.0); return; }
  if (left <= 0) {   // the survivors merge back and heal him a little
    let healed = 0;
    for (let i = 0; i < bp.slimes.length; i++) {
      const w = world.enemies[bp.slimes[i]];
      if (w && w.active && w.state !== 'DYING' && w.kind === 'SLIME') { events.emit('explosion', { pos: w.pos.clone(), radius: 2, color: 0x86efac }); onEnemyDeath(w); healed++; }
    }
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * healed);
    end(e, healed > 0 ? `MERGED +${healed * 3}%` : '');
  }
}

const POD_N = 4, POD_FUSE = 7.0;
function popPod(e: Enemy, i: number, burst: boolean): void {
  const q = bp.props[i]; if (!q.on) return;
  q.on = false;
  const w = world.enemies[G.podId[i]];
  if (w && w.active && w.state !== 'DYING' && w.kind === 'BOSS_CRYSTAL') onEnemyDeath(w);
  G.podId[i] = -1;
  if (!burst) { events.emit('explosion', { pos: new Vector3(q.x, 0.8, q.z), radius: 2.4, color: 0xbef264 }); events.emit('floatText', { pos: new Vector3(q.x, 0, q.z), text: 'POP!', color: 0xbef264, scale: 1.0, dy: 2.4 }); return; }
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.035);
  events.emit('explosion', { pos: new Vector3(q.x, 0.8, q.z), radius: 5, color: 0x84cc16 });
  events.emit('floatText', { pos: new Vector3(q.x, 0, q.z), text: 'BURST!', color: 0x84cc16, scale: 1.2, dy: 2.6 });
  spawnHostileZone('POISON_POOL', q.x, q.z, 4, 6, bossPwr(e) * 0.3, 0x84cc16);
}
function tickSpores(e: Enemy, dt: number): void {
  const p = world.player;
  if (G.stage === 0) {
    if (bp.t >= 0.8) {
      G.stage = 1;
      placeProps(POD_N, 1.3, 0.3, 0.7, 14, 0, e);
      for (let i = 0; i < MAX_PROPS; i++) G.podId[i] = -1;
      for (let i = 0; i < POD_N; i++) {
        const q = bp.props[i]; tv.set(q.x, 0, q.z);
        const w = spawnEnemy('BOSS_CRYSTAL', tv);
        if (w) { w.maxHp = Math.max(30, Math.round(e.maxHp * 0.008)); w.hp = w.maxHp; w.shield = 0; G.podId[i] = w.id; }
        G.podT[i] = POD_FUSE + i * 0.45;
      }
      G.rootT = 1.2;
    }
    return;
  }
  const t = bp.t - 0.8;
  let open = 0;
  for (let i = 0; i < POD_N; i++) {
    const q = bp.props[i]; if (!q.on) continue;
    const w = world.enemies[G.podId[i]];
    if (!w || !w.active || w.state === 'DYING') { popPod(e, i, false); continue; }   // popped by a hit
    q.h = Math.min(1, t / G.podT[i]);
    if (p.alive && (p.pos.x - q.x) ** 2 + (p.pos.z - q.z) ** 2 < (q.r + 0.7) ** 2) { popPod(e, i, false); continue; }   // popped by touch
    if (t >= G.podT[i]) { popPod(e, i, true); continue; }
    open++;
  }
  G.rootT -= dt;
  if (G.rootT <= 0 && p.alive) {   // roots reach for the hero (a telegraphed ring, a brief root on touch)
    G.rootT = 2.6;
    bossStrike(p.pos.x, p.pos.z, 2.3, 1.2, bossPwr(e) * 0.5, 0, 'ROOT', 1.0, 0x84cc16);
  }
  if (open === 0) end(e);
}

function tickTidal(e: Enemy, dt: number): void {
  const p = world.player;
  if (G.stage === 0) {
    if (bp.t >= 0.9) {
      G.stage = 1; G.t0 = bp.t;
      const a = Math.random() * 6.283; bp.wx = Math.cos(a); bp.wz = Math.sin(a);
      placeProps(4, 2.3, 0.12, 0.62, 9, 12, e);
      bp.count = 4.2; bp.countMax = 4.2; G.hit = false;
    }
    return;
  }
  if (G.stage === 1) {
    bp.count = Math.max(0, 4.2 - (bp.t - G.t0));
    if (bp.count <= 0) { G.stage = 2; G.t0 = bp.t; bp.wave = -1.1; events.emit('shake', { amount: 0.5 }); say(e, 'WAVE!', 0x7dd3fc, 1.5); }
    return;
  }
  if (G.stage === 2) {
    bp.wave = -1.1 + 2.3 * (bp.t - G.t0) / 1.6;
    const R = 40, f = bp.wave * R, h = p.pos.x * bp.wx + p.pos.z * bp.wz;
    if (!G.hit && p.alive && f >= h) {
      G.hit = true;
      if (!covered(p.pos.x, p.pos.z, bp.wx, bp.wz)) hitHero(0.7, 'PHYSICAL', p.pos.x - bp.wx * 6, p.pos.z - bp.wz * 6, 6, 1.0);
      else events.emit('floatText', { pos: p.pos, text: 'SAFE!', color: 0x86efac, scale: 1.0, dy: 2.6 });
    }
    const M = world.minions;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.active && m.x * bp.wx + m.z * bp.wz <= f && m.x * bp.wx + m.z * bp.wz > f - 60 * dt && !covered(m.x, m.z, bp.wx, bp.wz)) damageMinion(i, m.maxHp * 0.6); }
    if (bp.wave >= 1.1) { G.stage = 3; G.t0 = bp.t; bp.wave = 2; }
    return;
  }
  if (bp.t - G.t0 > 0.9) end(e);
}

const SAND_A = 1.2, SAND_SHIFT = 3.8, SAND_B = 4.6, SAND_END = 7.2;
function tickSand(e: Enemy, dt: number): void {
  const p = world.player;
  if (G.stage === 0) {
    G.stage = 1;
    const a = Math.random() * 6.283; bp.wx = Math.cos(a); bp.wz = Math.sin(a);
    placeProps(4, 2.4, 0.15, 0.7, 11, 13, e);
    bp.count = SAND_END + 0.2; bp.countMax = bp.count; bp.windOn = false;
  }
  bp.count = Math.max(0, SAND_END + 0.2 - bp.t);
  if (G.stage === 1 && bp.t >= SAND_A) { G.stage = 2; bp.windOn = true; events.emit('shake', { amount: 0.3 }); }
  if (G.stage === 2 && bp.t >= SAND_SHIFT) {   // the wind drops, then swings round (once)
    G.stage = 3; bp.windOn = false;
    const a = Math.atan2(bp.wz, bp.wx) + (Math.random() < 0.5 ? 1 : -1) * pick(1.9, 2.3);
    bp.nx = Math.cos(a); bp.nz = Math.sin(a); bp.shiftT = SAND_B - SAND_SHIFT;
    say(e, 'THE WIND SHIFTS!', 0xf5d28a, 1.3);
  }
  if (G.stage === 3) {
    bp.shiftT = Math.max(0, SAND_B - bp.t);
    if (bp.t >= SAND_B) { G.stage = 4; bp.wx = bp.nx; bp.wz = bp.nz; bp.windOn = true; bp.shiftT = 0; events.emit('shake', { amount: 0.3 }); }
  }
  if (bp.windOn && p.alive) {
    G.tick -= dt;
    if (!covered(p.pos.x, p.pos.z, bp.wx, bp.wz)) {
      if (!playerTrickImmune()) {   // pushed along the wind (a dash resists)
        const k = (p.dashT > 0 ? 0.3 : 1) * 4.5 * dt;
        p.pos.x += bp.wx * k; p.pos.z += bp.wz * k;
        const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
        if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
      }
      if (G.tick <= 0) { G.tick = 0.4; hitHero(0.032, 'PHYSICAL', p.pos.x - bp.wx * 5, p.pos.z - bp.wz * 5); }
    } else if (G.tick <= 0) G.tick = 0.4;
  }
  if (bp.t >= SAND_END) end(e);
}

const CELL = 5.0, LAVA_LEAD = 1.6, LAVA_GAP = 2.0, LAVA_SWEEP = 1.0, LAVA_WARN = 1.05, LAVA_END = LAVA_LEAD + 3 * LAVA_GAP + LAVA_SWEEP + 0.7;
const LAVA_PCT = 0.28, LAVA_HIT_CD = 0.5, LAVA_RANGE = 10;
/** Tile class 0..3 = (ix & 1) + 2 * (iz & 1) (a 2x2 repeating pattern). Wave w erupts the two classes of PAIRS[order[w]]; the four pairs
 *  {0,1} {1,2} {2,3} {3,0} (in a random order) cover every class exactly twice, so EVERY tile erupts exactly twice (lavaVerify proves it),
 *  while half the floor is always cool: a tile is safe against a wave when its class is not in the pair, and every tile touches tiles
 *  of other classes, so there is always a cooled tile one step away. Each wave sweeps in from its own random direction (1 s across the arena),
 *  and every tile flashes for ~1 s before it erupts. */
const PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0]];
const lavaOrder = [0, 1, 2, 3];
function lavaBuild(): void {
  let n = 0;
  for (let w = 0; w < 4; w++) { const a = Math.random() * 6.283; waveDx[w] = Math.cos(a); waveDz[w] = Math.sin(a); }   // every wave sweeps in from its own direction
  for (let i = 3; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const x = lavaOrder[i]; lavaOrder[i] = lavaOrder[j]; lavaOrder[j] = x; }
  for (let ix = -LAVA_RANGE; ix <= LAVA_RANGE && n < MAX_TILES; ix++) {
    for (let iz = -LAVA_RANGE; iz <= LAVA_RANGE && n < MAX_TILES; iz++) {
      const cx = ix * CELL, cz = iz * CELL;
      // a tile exists when ANY part of it is inside the arena (a hero hugging the wall must not find a tile-less safe strip)
      if (Math.hypot(cx, cz) - CELL * 0.75 > edgeLimit(cx, cz, 0)) continue;
      bp.tx[n] = cx; bp.tz[n] = cz;
      const cls = (ix & 1) + 2 * (iz & 1);
      let k = 0;
      for (let w = 0; w < 4; w++) {
        const pr = PAIRS[lavaOrder[w]];
        if (pr[0] !== cls && pr[1] !== cls) continue;
        bp.te[n * LAVA_HITS + k++] = w;   // wave index for now; time below
      }
      n++;
    }
  }
  // sweep times: projection of the tile on the wave direction, normalised over the arena diameter
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < LAVA_HITS; k++) {
      const w = bp.te[i * LAVA_HITS + k] | 0;
      const f = Math.min(1, Math.max(0, ((bp.tx[i] * waveDx[w] + bp.tz[i] * waveDz[w]) / 48 + 1) * 0.5));
      bp.te[i * LAVA_HITS + k] = LAVA_LEAD + w * LAVA_GAP + f * LAVA_SWEEP;
    }
  }
  bp.nt = n; bp.tileHalf = CELL * 0.5;
  lavaVerify();
}
const waveDx = [0, 0, 0, 0], waveDz = [0, 0, 0, 0];
/** Proof that no spot is safe for the whole phase: (1) every tile has LAVA_HITS finite eruption times, (2) the times are at least a
 *  warning apart, (3) every point of the arena (1 m grid) lies inside some tile (+ the 0.3 m hit margin) so no strip is tile-less.
 *  Returns the problems found (0 = proven). Dev builds log it. */
export function lavaVerify(): number {
  let bad = 0;
  for (let i = 0; i < bp.nt; i++) {
    const a = bp.te[i * LAVA_HITS], b = bp.te[i * LAVA_HITS + 1];
    if (!(a > 0) || !(b > 0) || Math.abs(a - b) < 0.9 || b > LAVA_END || a > LAVA_END) bad++;
  }
  for (let x = -50; x <= 50; x++) {
    for (let z = -50; z <= 50; z++) {
      if (Math.hypot(x, z) > edgeLimit(x, z, 0)) continue;
      const ix = Math.round(x / CELL), iz = Math.round(z / CELL);
      let found = false;
      for (let i = 0; i < bp.nt; i++) if (bp.tx[i] === ix * CELL && bp.tz[i] === iz * CELL) { found = true; break; }
      if (!found) bad++;
    }
  }
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) console.log(`[lava] ${bp.nt} tiles, ${bad} problems (0 = every tile erupts ${LAVA_HITS}x, whole arena covered)`);
  return bad;
}
function tickLava(e: Enemy, dt: number): void {
  const p = world.player;
  if (G.stage === 0) { G.stage = 1; lavaBuild(); bp.count = LAVA_END; bp.countMax = LAVA_END; }
  bp.count = Math.max(0, LAVA_END - bp.t);
  G.hitCd -= dt;
  const t0 = bp.t - dt;
  for (let i = 0; i < bp.nt; i++) {
    for (let k = 0; k < LAVA_HITS; k++) {
      const te = bp.te[i * LAVA_HITS + k];
      if (!(te > t0 && te <= bp.t)) continue;   // this tile erupts now
      tv.set(bp.tx[i], 0.4, bp.tz[i]);
      events.emit('explosion', { pos: tv.clone(), radius: 1.8, color: 0xff7a1a });
      if (p.alive && G.hitCd <= 0 && Math.abs(p.pos.x - bp.tx[i]) < bp.tileHalf + 0.3 && Math.abs(p.pos.z - bp.tz[i]) < bp.tileHalf + 0.3) {
        G.hitCd = LAVA_HIT_CD; hitHero(LAVA_PCT, 'FIRE', bp.tx[i], bp.tz[i], 2.5, 0);
      }
    }
  }
  if (bp.t >= LAVA_END) end(e);
}

function tickDark(e: Enemy, dt: number): void {
  const p = world.player;
  if (!bp.dark && bp.t >= 0.4) { bp.dark = true; events.emit('shake', { amount: 0.3 }); }
  if (bp.t >= 1.7 && bp.t < 7.4) {
    G.handT -= dt;
    if (G.handT <= 0) {
      G.handT = bp.t < 4.5 ? 1.1 : 0.85;
      for (let i = 0; i < MAX_HANDS; i++) {
        const h = bp.hands[i]; if (h.on) continue;
        const a = Math.random() * 6.283, d = Math.random() * 3.2;
        h.x = p.pos.x + Math.cos(a) * d + p.vel.x * 0.5; h.z = p.pos.z + Math.sin(a) * d + p.vel.z * 0.5;
        const l = Math.hypot(h.x, h.z), lim = edgeLimit(h.x, h.z, 2.5);
        if (l > lim) { h.x *= lim / l; h.z *= lim / l; }
        h.t = 0; h.T = 1.15; h.on = true; break;
      }
    }
  }
  for (let i = 0; i < MAX_HANDS; i++) {
    const h = bp.hands[i]; if (!h.on) continue;
    h.t += dt;
    if (h.t >= h.T) {
      h.on = false;
      events.emit('explosion', { pos: new Vector3(h.x, 0.6, h.z), radius: 3.2, color: 0xa060ff });
      if (p.alive && (p.pos.x - h.x) ** 2 + (p.pos.z - h.z) ** 2 < 2.7 * 2.7) { hitHero(0.22, 'MAGIC', h.x, h.z, 2.5, 0); applyPlayerDebuff('SLOW', 1.2, 0.3); }
    }
  }
  bp.count = Math.max(0, 8.0 - bp.t);
  if (bp.t >= 8.0) end(e);
}

const REAL_LEN = 10.0, REAL_WARN = 8.0, PULSE_T = 2.0, PULSE_R = 19, PULSE_PCT = 0.40;
/** Find the Real One: Malakar + 2 illusions strafe round the hero (all cast orbs; the real one's are bigger and his floor shadow is solid, the
 *  fakes' flicker). Hitting a FAKE pops it and punishes (30% max hp explosion + a black hole on you); hitting the REAL one ends the phase.
 *  Not found in 10 s: a huge gravity pulse (40% max hp). BUG FIXED (2026-10-26): the illusions were spawned with the shuffle cap (old
 *  shuffle copies counted / expired mid-phase) and hits in flight on the still-immune real one ended the phase before they appeared; now old
 *  copies are cleared, two fresh ones are forced in (retried if the pool was full) and the real one ignores hits for 0.8 s after. */
function tickReal(e: Enemy, dt: number): void {
  const p = world.player;
  tickMalakarFx(dt);   // Malakar's own AI is replaced during the phase: keep his lasers / bombs / holes ticking
  mfx.major = true;
  G.hitCd -= dt;
  if (G.stage === 0) {
    if (bp.t < 0.05) clearDecoys();
    if (bp.t >= 0.7) {
      G.stage = 1; G.t0 = bp.t; bp.realId = e.id; spawnIllusions(e, 2, 60, true);
      say(e, 'WHICH ONE?', 0xc084fc, 1.3); bp.count = REAL_LEN; bp.countMax = REAL_LEN;
    }
    return;
  }
  const t = bp.t - G.t0;
  if (t < 1.5 && countIllusions() < 2 && !G.hit) {   // the pool was full / a copy failed: top up (no second teleport)
    const had = countIllusions();
    spawnIllusions(e, 2 - had, 60, true, false);
    if (countIllusions() === had && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV && t > 1.4) console.warn('[real one] could not spawn the illusions (enemy pool full?)');
  }
  bp.count = Math.max(0, REAL_LEN - t);
  if (!G.pulseOn && t >= REAL_WARN) {   // nothing found: a big gravity pulse charges (2 s warning), you are drawn toward him
    G.pulseOn = true; G.px = e.pos.x; G.pz = e.pos.z;
    queueBomb(G.px, G.pz, PULSE_R, PULSE_T, PULSE_PCT);
    say(e, 'GRAVITY PULSE!', 0xc084fc, 1.3);
    events.emit('shake', { amount: 0.4 });
  }
  if (G.pulseOn && p.alive && !playerTrickImmune()) {
    const dx = G.px - p.pos.x, dz = G.pz - p.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d > 2) { const k = 5.5 * (p.dashT > 0 ? 0.3 : 1) * dt; p.pos.x += dx / d * k; p.pos.z += dz / d * k; }
  }
  if (t >= REAL_LEN + 0.3) { clearDecoys(); events.emit('shockwave', { pos: e.pos.clone(), radius: 16, color: 0xa855f7 }); events.emit('shake', { amount: 0.7 }); end(e, ''); }
}

// ----------------------------------------------------------------- per frame ----
/** Global tick (enemies.updateEnemies, every frame). */
export function tickPhase(dt: number): void {
  D.frameDt = dt;
  if (bp.bannerT > 0) bp.bannerT -= dt;
  if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 0.9);
  if (!bp.on) {
    bp.tail += dt;
    if (bp.floor > 0) bp.floor = Math.max(0, bp.floor - dt * 0.8);
    bp.tint = Math.max(0, bp.tint - dt * 1.5);
    return;
  }
  const e = world.enemies[bp.id];
  if (!e || !e.active || e.state === 'DYING') { end(null, ''); bp.tint = 0; return; }
  bp.t += dt;
  const wantTint = bp.kind === 'AVALANCHE' || bp.kind === 'TIDAL' || bp.kind === 'SAND' ? (bp.count >= 0 ? 0.5 : 0.25) : 0.22;
  bp.tint += (wantTint - bp.tint) * Math.min(1, dt * 3);
  switch (bp.kind) {
    case 'AVALANCHE': {
      if (G.stage === 0) { if (bp.t >= 1.0) { G.stage = 1; G.t0 = bp.t; avaPlace(e); bp.floor = 1; bp.count = AVA_COUNT; bp.countMax = AVA_COUNT; events.emit('shake', { amount: 0.4 }); } }
      else if (G.stage === 1) {
        bp.count = Math.max(0, AVA_COUNT - (bp.t - G.t0));
        const p = world.player; if (p.alive) p.slowT = Math.max(p.slowT, 0.25);   // the cold: ~40% slower while the countdown runs
        if (bp.count <= 0) { G.stage = 2; G.t0 = bp.t; bp.count = -1; avaHit(e); }
      } else if (bp.t - G.t0 > 1.4) end(e);
      break;
    }
    case 'SPLIT': tickSplit(e, dt); break;
    case 'PINBALL': tickPinball(e, dt); break;
    case 'SPORES': tickSpores(e, dt); break;
    case 'TIDAL': tickTidal(e, dt); break;
    case 'LAVA': tickLava(e, dt); break;
    case 'SAND': tickSand(e, dt); break;
    case 'DARK': tickDark(e, dt); break;
    case 'REAL': tickReal(e, dt); break;
    default: end(e); break;
  }
}

/** Does this enemy belong to the running phase (its AI is replaced by phaseDrive)? */
export function phaseOwns(e: Enemy): boolean {
  if (!bp.on) return false;
  if (e.id === bp.id) return true;
  if (bp.kind === 'SPLIT') { for (let i = 0; i < bp.slimes.length; i++) if (bp.slimes[i] === e.id) return true; return false; }
  return bp.kind === 'TIDAL' && e.kind === 'BOSS_HYDRA_HEAD' && !e.decoy;
}

/** Replaces the AI of a phase owner for this frame; returns the yaw it wants. */
export function phaseDrive(e: Enemy, dt: number): number {
  const p = world.player.pos;
  const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
  if (e.id !== bp.id) {
    if (e.kind === 'SLIME') {   // flee: away from the hero, bending along the wall instead of into it
      const r = Math.hypot(e.pos.x, e.pos.z), lim = edgeLimit(e.pos.x, e.pos.z, 2.5);
      let vx = -dx / d, vz = -dz / d;
      if (r > lim - 7) { const k = Math.min(1, (r - (lim - 7)) / 5), tx = -e.pos.z / (r || 1), tz = e.pos.x / (r || 1), s = (vx * tx + vz * tz) >= 0 ? 1 : -1; vx = vx * (1 - k) + (-e.pos.x / (r || 1)) * 0.5 * k + tx * s * k; vz = vz * (1 - k) + (-e.pos.z / (r || 1)) * 0.5 * k + tz * s * k; }
      const l = Math.hypot(vx, vz) || 1, sp = 5.4;
      e.vel.set(vx / l * sp, 0, vz / l * sp);
      return Math.atan2(vx, vz);
    }
    e.vel.set(0, 0, 0); return e.facing;   // spare hydra heads stand still
  }
  if (bp.kind === 'PINBALL' && G.stage === 1) { e.vel.set(0, 0, 0); return Math.atan2(G.dx, G.dz); }
  if (bp.kind === 'REAL' && G.stage >= 1) {   // the real Malakar moves exactly like his illusions (strafing round the hero at 9-15 m)
    const ux = dx / d, uz = dz / d, side = (e.id & 1) ? 1 : -1, sp = e.speed * 0.8;
    const mx = d < 9 ? -ux : d > 15 ? ux : uz * side * 0.5, mz = d < 9 ? -uz : d > 15 ? uz : -ux * side * 0.5;
    e.pos.x += mx * sp * dt; e.pos.z += mz * sp * dt;
    const r = Math.hypot(e.pos.x, e.pos.z), lim = edgeLimit(e.pos.x, e.pos.z, 3);
    if (r > lim) { e.pos.x *= lim / r; e.pos.z *= lim / r; }
    G.volleyT -= dt;
    if (G.volleyT <= 0) {   // the real one's volley: 5 big fast orbs (the fakes cast thin fans of small weak ones)
      G.volleyT = 2.3;
      const b = Math.atan2(ux, uz);
      for (let i = -2; i <= 2; i++) { tv.set(Math.sin(b + i * 0.2), 0, Math.cos(b + i * 0.2)); fireEnemyProjectile(e.pos, tv, 'BOSS_ORB', 11, 1, { pct: 0.1, life: 4, radius: 1.1, dark: true }); }
    }
    e.vel.set(0, 0, 0); return Math.atan2(dx, dz);
  }
  e.vel.set(0, 0, 0);
  return bp.kind === 'SPLIT' || bp.kind === 'PINBALL' ? e.facing : Math.atan2(dx, dz);
}

if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {   // QA: force the running boss's phase from the console
  (window as unknown as Record<string, unknown>).__bossPhase = {
    start: (): string => {
      for (const e of world.enemies) {
        if (!e.active || e.state === 'DYING' || e.decoy) continue;
        const kind: PhaseKind = isSlimeKing(e) ? 'SPLIT' : e.boss ? (MECH[e.kind] ?? '') : '';
        if (kind) { if (bp.on) end(null, ''); begin(e, kind); return kind; }
      }
      return 'none';
    },
    lavaCheck: (): number => { lavaBuild(); return lavaVerify(); },
    illusions: (): number => countIllusions(),
    state: (): string => `${bp.on}|${bp.kind}|${bp.t.toFixed(1)}|stage ${G.stage}`,
  };
}
