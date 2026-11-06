// ============================================================================
// DODGE MECHANICS (owner 2026-10-31): boss attacks that cannot be beaten by "running sideways". All new attack logic of this pass lives here;
// the only hooks elsewhere are `dodgeBoss` (bosses.updateBoss), `updateDodge` (game.ts), two bossMech gap helpers and the Bomb Shroom AI case.
//
//  RING      a 360 degree shockwave, telegraphed by a converging ring + a red floor + the word DASH!. It expands from the boss (or from the
//            spot the hero stood on when it locked on) at 80 u/s over the whole arena: nothing outruns it. It is a NORMAL `pct` hit
//            (~30% max HP), so dash i-frames / dodge roll / ult / revive fx negate it, a sidestep does not. Two in a row (gap 1.1 s, a
//            slower second wave) only when the hero holds 2 dash charges; never at all when the hero cannot dash (below the dash unlock
//            level, on ice, no charge coming back inside the wind-up).
//  BEAMS     sweeping / rotating lines (Colossus flamethrower that waves back and forth, Colossus lasers, Glacius rotating frost ray, Ignar
//            fire whip). Per-hero hit timers; every hit is a normal `pct` hit, so a dash goes THROUGH a beam.
//  GATLING   10-13 round bullets a second that track the hero (lead aim, slow turn): strafing alone loses to the turn, dashing or breaking
//            line of sight wins.
//  TRAILS    snake / spiral / cross patterns of delayed ground strikes and lingering zones instead of circle clusters.
//  ICICLES   Glacius' giant icicles (3.9 u hit radius, tall) that really freeze.
//  SHROOMS   Elderroot's brood of Bomb Shrooms (the kamikaze enemy `MUSHBOMB`, see aiMushbomb below).
// Every telegraph body is RED (METEOR_SHADOW zones / red cones and lines); the bright accent colours are only the converging ring / beam fx.
// Co-op: the host simulates. Guests see the telegraph zones and projectiles through the normal snapshot and the ring / beam fx through
// 'trick' events (kinds starting with "DG_", drawn by render/DodgeFx.tsx).
// No allocations per frame: fixed pools.
// ============================================================================
import { Vector3 } from 'three';
import { world, MAX_ENEMIES } from '../world';
import { events } from '../events';
import type { Enemy, EnemyKind } from '../types';
import { damagePlayer, applyPlayerDebuff, killEnemy, KB, SLOW_BOSS } from './combat';
import { enter, requestYaw, fireEnemyProjectile, spawnTelegraphLine, spawnTelegraphCone, spawnEnemy, bossAlive } from './enemies';
import { spawnHostileZone } from './tricks';
import { firePatch, firePatchRaw, fireRoom, frostHit, burnHit, spawnProp, PROP_ICE, BT } from './bossFx';
import { bp } from './bossPhaseState';
import { hurtMinionsCircle, hurtMinionsLine, hurtMinionsRing } from './minionHurt';
import { bossWarded, bossGapOn, bossGapSet } from './bossMech';
import { forEachHero, nearestHero, isAlly } from '../heroes';
import { edgeLimit } from '../mapgen';
import { useGameStore } from '../../store';
import { DASH_UNLOCK_LV } from '../../classLevels';
import { coopRoom } from '../../net/coopRoom';

// ---- attack ids
const RING = 1, FLAME = 2, LASERS = 3, ICEBEAM = 4, WHIP = 5, MG = 6, SNAKE = 7, SPIRAL = 8, CROSS = 9, ICICLES = 10, SHROOMS = 11;
const NAMES: Record<number, string> = { 1: 'Shockwave', 2: 'Flamethrower', 3: 'Lasers', 4: 'Frost Ray', 5: 'Fire Whip', 6: 'Gatling', 7: 'Poison Snake', 8: 'Fire Spiral', 9: 'Fissure Cross', 10: 'Giant Icicles', 11: 'Spore Rush' };
/** Which dodge attacks each boss owns (the Void Herald and the human bosses are not touched). */
const KITS: Partial<Record<EnemyKind, number[]>> = {
  BOSS_GOLEM: [RING, CROSS],
  BOSS_TREANT: [SNAKE, RING, SHROOMS],
  BOSS_HYDRA: [MG, RING],
  BOSS_WYRM: [ICEBEAM, RING, ICICLES, MG],
  BOSS_WARLORD: [SPIRAL, MG, RING, WHIP],
  BOSS_WARMACH: [FLAME, RING, LASERS, FLAME, MG],   // (Overheat Core, bossKitColossus.ts: every flamethrower burst is +1 heat, so it comes twice per cycle)
  BOSS_LICH: [MG],
};
/** Per boss: the ring flavour. fx 0 push, 1 tide (slow), 2 fire (burn), 3 frost (freeze), 4 seismic (knockdown), 5 thorn (bleed). */
const RING_FX: Partial<Record<EnemyKind, { fx: number; lock: boolean; color: number; word: string; dmg: 'PHYSICAL' | 'FIRE' | 'ICE' | 'POISON' }>> = {
  BOSS_GOLEM: { fx: 4, lock: false, color: 0xffd36a, word: 'GROUND SLAM - DASH!', dmg: 'PHYSICAL' },
  BOSS_TREANT: { fx: 5, lock: false, color: 0x9be32a, word: 'THORN BURST - DASH!', dmg: 'PHYSICAL' },
  BOSS_HYDRA: { fx: 1, lock: false, color: 0x4fc3ff, word: 'TIDAL PULSE - DASH!', dmg: 'PHYSICAL' },
  BOSS_WYRM: { fx: 3, lock: false, color: 0xbff0ff, word: 'FROST NOVA - DASH!', dmg: 'ICE' },
  BOSS_WARLORD: { fx: 2, lock: true, color: 0xffa030, word: 'FIRE NOVA - DASH!', dmg: 'FIRE' },
  BOSS_WARMACH: { fx: 4, lock: false, color: 0xffd36a, word: 'SEISMIC RING - DASH!', dmg: 'PHYSICAL' },
};
/** Gatling flavour per boss: projectile kind, share of max hp per bullet, bullets / s (by phase), turn rate rad/s, bullet speed, colour word. */
const MG_FX: Partial<Record<EnemyKind, { kind: 'BOSS_ORB' | 'FIRE_BOLT' | 'POISON_ARROW' | 'ICE_SHARD'; pct: number; rate: number; turn: number; speed: number; word: string }>> = {
  BOSS_WARMACH: { kind: 'BOSS_ORB', pct: 0.017, rate: 12, turn: 1.05, speed: 26, word: 'MACHINE GUN!' },
  BOSS_WARLORD: { kind: 'FIRE_BOLT', pct: 0.017, rate: 11, turn: 1.1, speed: 24, word: 'EMBER GATLING!' },
  BOSS_HYDRA: { kind: 'POISON_ARROW', pct: 0.016, rate: 10, turn: 1.0, speed: 22, word: 'ACID SPIT STREAM!' },
  BOSS_WYRM: { kind: 'ICE_SHARD', pct: 0.016, rate: 9, turn: 1.0, speed: 24, word: 'ICE GATLING!' },
  BOSS_LICH: { kind: 'BOSS_ORB', pct: 0.016, rate: 10, turn: 1.0, speed: 22, word: 'SOUL GATLING!' },
};
const RING_PCT = 0.30, RING_PCT_2 = 0.27, RING_SPEED = 80, RING_SPEED_2 = 64, RING_GAP = 1.1, RING_MAXR = 90;
const RING_WIND = [1.2, 1.1, 1.0];
const CD = [9, 7.5, 6.5];   // seconds between two dodge attacks of one boss, by phase
const BOSS_TEL_T = 0.88;    // enemies.ts shortens boss telegraphs by this factor: the red cones / lines we spawn from inside a boss update are stretched back
const tl = (life: number): number => life / BOSS_TEL_T;
const RED = 0xff2a22;

const tv = new Vector3();
const dirV = new Vector3();
const pwr = (e: Enemy): number => Math.max(e.projectileDamage, e.contactDamage * 0.8, 8);
const wrapPi = (a: number): number => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const hex = (c: number): string => c.toString(16);
const arenaVis = (): number => Math.max(30, world.room.radius * 1.1);

// ============================================================================ pools
interface Ring { on: boolean; x: number; z: number; r: number; speed: number; pct: number; fx: number; dmg: 'PHYSICAL' | 'FIRE' | 'ICE' | 'POISON'; hit0: boolean; hit1: boolean; /** each hero's distance from the centre when the wave was released: the wave hits him when its front reaches THAT distance, so the dash window does not depend on how far his dash carried him */ d0: number; d1: number; src: number; }
const rings: Ring[] = Array.from({ length: 4 }, () => ({ on: false, x: 0, z: 0, r: 0, speed: 0, pct: 0, fx: 0, dmg: 'PHYSICAL', hit0: false, hit1: false, d0: 0, d1: 0, src: -1 }));
interface Beam { on: boolean; ox: number; oz: number; mode: number; a0: number; w: number; amp: number; per: number; t: number; dur: number; len: number; width: number; pct: number; hitCd: number; hit0: number; hit1: number; hitM: number; fx: number; dmg: 'FIRE' | 'ICE' | 'PHYSICAL'; patch: number; pt: number; src: number; }
const beams: Beam[] = Array.from({ length: 6 }, () => ({ on: false, ox: 0, oz: 0, mode: 0, a0: 0, w: 0, amp: 0, per: 1, t: 0, dur: 0, len: 40, width: 2, pct: 0.1, hitCd: 0.5, hit0: 0, hit1: 0, hitM: 0, fx: 0, dmg: 'FIRE', patch: 0, pt: 0, src: -1 }));
interface Ent { on: boolean; x: number; z: number; r: number; t: number; sh: number; shown: boolean; pct: number; fx: number; zk: number; zr: number; zl: number; zd: number; src: number; }
const ents: Ent[] = Array.from({ length: 200 }, () => ({ on: false, x: 0, z: 0, r: 2, t: 0, sh: 0, shown: false, pct: 0, fx: 0, zk: 0, zr: 2, zl: 5, zd: 0, src: -1 }));

/** Beam angle at local time `t` (rotating: a0 + w t; waving: a0 + amp x triangle(t / per), starting at the left end). Shared with render/DodgeFx.tsx. */
export function beamAngle(mode: number, a0: number, w: number, amp: number, per: number, t: number): number {
  if (mode === 0) return a0 + w * t;
  const u = t / per, f = u - Math.floor(u);
  return a0 + amp * (1 - 4 * Math.abs(f - 0.5));
}

function addBeam(e: Enemy, mode: number, a0: number, w: number, amp: number, per: number, dur: number, len: number, width: number, pct: number, hitCd: number, fx: number, dmg: Beam['dmg'], patch: number, vis: number, color: number): number {
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i]; if (b.on) continue;
    const a = beamAngle(mode, a0, w, amp, per, 0);
    live = true; b.on = true; b.ox = e.pos.x + Math.sin(a) * e.radius * 0.8; b.oz = e.pos.z + Math.cos(a) * e.radius * 0.8; b.mode = mode; b.a0 = a0; b.w = w; b.amp = amp; b.per = per; b.t = 0; b.dur = dur;
    b.len = len; b.width = width; b.pct = pct; b.hitCd = hitCd; b.hit0 = 0; b.hit1 = 0; b.hitM = 0; b.fx = fx; b.dmg = dmg; b.patch = patch; b.pt = 0.4; b.src = e.id;
    tv.set(b.ox, 0, b.oz);
    events.emit('trick', { pos: tv.clone(), kind: `DG_BEAM|${mode}|${a0.toFixed(3)}|${w.toFixed(3)}|${amp.toFixed(3)}|${per.toFixed(3)}|${dur.toFixed(2)}|${len}|${width}|${hex(color)}|${vis}`, radius: width });
    return i;
  }
  return -1;
}
function addEnt(x: number, z: number, r: number, t: number, sh: number, pct: number, fx: number, zk: number, zr: number, zl: number, zd: number, src: number): void {
  for (let i = 0; i < ents.length; i++) {
    const q = ents[i]; if (q.on) continue;
    live = true; q.on = true; q.x = x; q.z = z; q.r = r; q.t = t; q.sh = sh; q.shown = false; q.pct = pct; q.fx = fx; q.zk = zk; q.zr = zr; q.zl = zl; q.zd = zd; q.src = src;
    return;
  }
}

// ============================================================================ cast state
const D = { cast: 0, id: -1, t: 0, w: 0, dur: 0, rel: false, fin: false, yaw: 0, beam: -1, ri: 0, n: 1, cx: 0, cz: 0, aim: 0, shotT: 0, ph: 0 };
const cd = new Float32Array(MAX_ENEMIES), seen = new Float32Array(MAX_ENEMIES);
let live = false;   // anything to tick (cast, ring, beam, strike)
/** The hero is untouchable right now (dash i-frames / dodge / ult / revive fx): same test as combat.damagePlayer for a normal (non-crit) hit. */
const iframes = (h: typeof world.player): boolean => h.invulnT > 0 || (h.dashIframes && (h.anim.dashing || h.dashT > 0));
/** QA counters. */
export const dodgeStats: Record<string, number> = {};
const stat = (k: string): void => { dodgeStats[k] = (dodgeStats[k] ?? 0) + 1; };

function clearAll(): void {
  for (const r of rings) r.on = false;
  for (const b of beams) b.on = false;
  for (const q of ents) q.on = false;
  D.cast = 0; D.id = -1; D.beam = -1; live = false;
}

/** True when a hero could answer a ring right now: dash unlocked, a charge (or one back inside ~0.9 s). */
function ringFair(): boolean {
  const p = world.player;
  if (!p.alive || useGameStore.getState().level < DASH_UNLOCK_LV) return false;
  return p.dashCharges >= 1 || p.dashCd < 0.9;
}
const canDouble = (): boolean => world.player.maxDashCharges >= 2 && world.player.dashCharges >= 2;

function startRing(e: Enemy, i: number): void {
  const fx = RING_FX[e.kind]!;
  if (fx.lock) { const h = nearestHero(e.pos.x, e.pos.z); D.cx = h.pos.x; D.cz = h.pos.z; } else { D.cx = e.pos.x; D.cz = e.pos.z; }
  D.w = i === 0 ? RING_WIND[Math.min(2, e.phase | 0)] : RING_GAP;
  D.t = 0; D.rel = false;
  spawnHostileZone('METEOR_SHADOW', D.cx, D.cz, arenaVis(), D.w, 0, RED);   // the DANGER body is red; the bright converging ring is fx only
  tv.set(D.cx, 0, D.cz);
  events.emit('trick', { pos: tv.clone(), kind: `DG_RING|${D.w.toFixed(2)}|${hex(fx.color)}`, radius: 6 });
  events.emit('floatText', { pos: e.pos, text: i === 0 ? fx.word : 'DASH AGAIN!', color: fx.color, scale: 1.9, dy: 8 });
  events.emit('shake', { amount: 0.25 });
}
function releaseRing(e: Enemy, i: number): void {
  const fx = RING_FX[e.kind]!, two = D.n > 1;
  for (const r of rings) {
    if (r.on) continue;
    live = true; r.on = true; r.x = D.cx; r.z = D.cz; r.r = fx.lock ? -10 : 0.5;   // (a locked-on nova gives a hero still standing on the lock point ~0.12 s)
    r.speed = i === 0 ? RING_SPEED : RING_SPEED_2; r.pct = two ? RING_PCT_2 : RING_PCT; r.fx = fx.fx; r.dmg = fx.dmg; r.hit0 = false; r.hit1 = false; r.src = e.id; r.d0 = r.d1 = 1e9;
    forEachHero((h) => { const d = Math.hypot(h.pos.x - D.cx, h.pos.z - D.cz); if (isAlly(h)) r.d1 = d; else r.d0 = d; });
    tv.set(D.cx, 0, D.cz);
    events.emit('trick', { pos: tv.clone(), kind: `DG_GO|${r.speed}|${hex(fx.color)}|${RING_MAXR}`, radius: 8 });
    events.emit('shockwave', { pos: tv.clone(), radius: 9, color: fx.color });
    events.emit('shake', { amount: 0.7 });
    stat('Ring');
    break;
  }
}

function ringHit(r: Ring): void {
  const p = world.player;
  tv.set(r.x, 0, r.z);
  const src = r.src >= 0 ? world.enemies[r.src] : undefined;
  const safe = iframes(p);
  damagePlayer(1, { pct: r.pct, pos: tv, kind: r.dmg, ...(src && src.active ? { src } : null), ...KB.PUSH });   // (no knockdown: its get-up invulnerability would swallow the second wave of a double ring)
  if (safe) { stat('RingAvoided'); return; }   // dash i-frames / ult / revive fx / dodge roll negated it (QA)
  stat('RingHit');
  switch (r.fx) {
    case 1: applyPlayerDebuff('SLOW', 3, SLOW_BOSS); break;
    case 2: burnHit(Math.max(2, (src ? src.projectileDamage : 10) * 0.16)); break;
    case 3: frostHit(3.5, 1, 1.6); break;   // the frost nova really freezes (anti-chain inside frostHit: 4 s grace, not while stunned / down)
    case 5: applyPlayerDebuff('BLEED', 3, Math.max(2, (src ? src.projectileDamage : 10) * 0.12)); break;
    default: break;
  }
}

// ---- attack starters
function dirTo(e: Enemy): { a: number; ux: number; uz: number; d: number } {
  const h = nearestHero(e.pos.x, e.pos.z);
  const dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
  return { a: Math.atan2(dx, dz), ux: dx / d, uz: dz / d, d };
}
function word(e: Enemy, text: string, color: number): void { events.emit('floatText', { pos: e.pos, text, color, scale: 1.4, dy: 8 }); }

function begin(e: Enemy, k: number): void {
  const ph = Math.min(2, e.phase | 0), t = dirTo(e);
  live = true; D.cast = k; D.id = e.id; D.t = 0; D.rel = false; D.fin = false; D.beam = -1; D.yaw = t.a; D.ph = ph; D.n = 1; D.ri = 0; D.shotT = 0;
  enter(e, 'ATTACK'); e.vel.set(0, 0, 0);
  stat(NAMES[k]);
  switch (k) {
    case RING: D.n = canDouble() ? 2 : 1; startRing(e, 0); D.dur = 0.35; break;
    case FLAME: D.w = 1.0; D.dur = 4.5; { const amp = 1.2; spawnTelegraphCone(e.pos.x, e.pos.z, t.ux, t.uz, 50, amp + 0.28, tl(D.w), RED, BT.VISUAL, 0); } word(e, 'FLAMETHROWER!', 0xffa040); break;
    case LASERS: {
      D.w = 1.25; D.dur = 5.2; const n = 3 + ph;
      for (let i = 0; i < n; i++) { const a = t.a + (i * Math.PI * 2) / n; spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 60, 1.4, tl(D.w), RED); }
      word(e, 'LASERS!', 0xff6a6a); break;
    }
    case ICEBEAM: {
      D.w = 1.1; D.dur = 4.6; const n = ph >= 2 ? 3 : 2;
      for (let i = 0; i < n; i++) { const a = t.a + (i * Math.PI * 2) / n; spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 60, 2.4, tl(D.w), RED); }
      word(e, 'FROST RAY!', 0xbff0ff); break;
    }
    case WHIP: D.w = 0.95; D.dur = 1.4; spawnTelegraphCone(e.pos.x, e.pos.z, t.ux, t.uz, 46, 1.45, tl(D.w), RED, BT.VISUAL, 0); word(e, 'FIRE WHIP!', 0xffa030); break;
    case MG: {
      const f = MG_FX[e.kind]!;
      D.w = 0.9; D.dur = 3.0; D.aim = t.a; spawnTelegraphLine(e.pos.x, e.pos.z, t.ux, t.uz, 46, 1.5, tl(D.w), RED); word(e, f.word, 0xffe08a); break;
    }
    case SNAKE: {
      D.w = 1.3; const arms = ph >= 1 ? 2 : 1; let n = 0;
      for (let k2 = 0; k2 < arms; k2++) {
        const a = t.a + (arms === 2 ? (k2 ? 0.55 : -0.55) : 0), dx = Math.sin(a), dz = Math.cos(a), px = dz, pz = -dx, sgn = k2 ? -1 : 1;
        for (let s = e.radius + 2, i = 0; s < 56; s += 2.6, i++) {
          const off = 6.5 * Math.sin((s - t.d * (arms === 2 ? Math.cos(0.55) : 1)) * 0.34) * sgn;   // (phase chosen so the snake crosses the spot the hero stands on)
          const x = e.pos.x + dx * s + px * off, z = e.pos.z + dz * s + pz * off;
          const lim = edgeLimit(x, z, 2); if (x * x + z * z > lim * lim) continue;
          addEnt(x, z, 2.5, D.w + i * 0.05, 0, 0, 0, 1, 2.6, 7, e.projectileDamage * 0.6, e.id); n++;
        }
      }
      D.dur = Math.min(3.5, n * 0.05 + 0.6); word(e, 'POISON TRAIL!', 0x9be32a); break;
    }
    case SPIRAL: {
      D.w = 1.2; const arms = ph >= 2 ? 3 : 2; let n = 0;
      for (let k2 = 0; k2 < arms; k2++) {
        const off = t.a + (k2 * Math.PI * 2) / arms;
        for (let th = 0; th < 2.7 * Math.PI; ) {
          const r = e.radius + 2.5 + 2.7 * th;
          const x = e.pos.x + Math.sin(th + off) * r, z = e.pos.z + Math.cos(th + off) * r;
          th += 3.3 / Math.max(5, r);
          const lim = edgeLimit(x, z, 2); if (x * x + z * z > lim * lim) break;
          addEnt(x, z, 3.1, D.w + (r / 34) * 1.0, 0, 0, 0, 2, 3.0, 5, e.projectileDamage * 0.12, e.id); n++;
        }
      }
      D.dur = 2.4; word(e, 'FIRE SPIRAL!', 0xffa030); break;
    }
    case CROSS: {
      D.w = 1.2; const base = Math.random() * Math.PI;
      for (let set = 0; set < 2; set++) for (let arm = 0; arm < 4; arm++) {
        const a = base + arm * Math.PI / 2 + set * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
        for (let i = 0; i < 10; i++) {
          const r = e.radius + 2.5 + i * 3.3, x = e.pos.x + dx * r, z = e.pos.z + dz * r;
          const lim = edgeLimit(x, z, 1); if (x * x + z * z > lim * lim) break;
          addEnt(x, z, 2.5, D.w + set * 1.3 + i * 0.06, set === 0 ? 0 : D.w + set * 0.1 - 0.0, 0.13, 1, 0, 0, 0, 0, e.id);
        }
      }
      D.dur = 3.2; word(e, 'FISSURE CROSS!', 0xffd36a); break;
    }
    case ICICLES: {
      D.w = 1.4; D.dur = 0.6; const n = 6 + ph * 2, h = nearestHero(e.pos.x, e.pos.z);
      const px: number[] = [], pz: number[] = [];
      for (let i = 0, tries = 0; i < n && tries < 90; tries++) {
        let x: number, z: number;
        if (i === 0) { x = h.pos.x + h.vel.x * 0.8; z = h.pos.z + h.vel.z * 0.8; }
        else { const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 14; x = h.pos.x + Math.sin(a) * d; z = h.pos.z + Math.cos(a) * d; }
        const lim = edgeLimit(x, z, 3); if (x * x + z * z > lim * lim) continue;
        let ok = true; for (let j = 0; j < px.length; j++) if ((px[j] - x) ** 2 + (pz[j] - z) ** 2 < 7.5 * 7.5) { ok = false; break; }
        if (!ok) continue;
        px.push(x); pz.push(z); i++;
        addEnt(x, z, 3.9, D.w, 0, 0.2, 2, 0, 0, 0, 0, e.id);
        spawnProp(PROP_ICE, x, z, D.w, 1.9, 3.3, 12);   // giant icicle: 3x the old spike (tall, thick), rises as the red ring fills
      }
      word(e, 'GIANT ICICLES!', 0xbff0ff); break;
    }
    case SHROOMS: D.w = 0.9; D.dur = 0.8; word(e, 'SPORE RUSH!', 0xb8f060); events.emit('trick', { pos: e.pos.clone(), kind: 'DG_RUN', radius: 3 }); break;
    default: break;
  }
}

function release(e: Enemy): void {
  const t = dirTo(e), ph = D.ph;
  switch (D.cast) {
    case FLAME: {
      const a0 = D.yaw - 1.2;   // starts at the left end of the arc, waves right, left, right (3 passes of 1.4 s)
      D.beam = addBeam(e, 1, D.yaw, 0, 1.2, 2.8, D.dur, 46, 4.2, 0.10, 0.3, 4, 'FIRE', 1, 1, 0xff8a2a); void a0; break;
    }
    case LASERS: {
      const n = 3 + ph;
      for (let i = 0; i < n; i++) { const b = addBeam(e, 0, D.yaw + (i * Math.PI * 2) / n, (i & 1 ? -1 : 1) * (0.5 + 0.08 * ph), 0, 1, D.dur, 62, 1.3, 0.12, 0.7, 0, 'PHYSICAL', 0, 2, 0xff5050); if (i === 0) D.beam = b; }
      break;
    }
    case ICEBEAM: {
      const n = ph >= 2 ? 3 : 2, s = (e.id & 1) ? -1 : 1;
      for (let i = 0; i < n; i++) { const b = addBeam(e, 0, D.yaw + (i * Math.PI * 2) / n, s * (0.85 + 0.08 * ph), 0, 1, D.dur, 62, 2.6, 0.14, 0.8, 3, 'ICE', 0, 3, 0xbff0ff); if (i === 0) D.beam = b; }
      break;
    }
    case WHIP: { D.beam = addBeam(e, 0, D.yaw - 1.4, 2.8 / 1.05, 0, 1, D.dur - 0.3, 46, 3.4, 0.16, 0.35, 2, 'FIRE', 1, 4, 0xff7a1a); break; }
    case SHROOMS: {
      let alive = 0; for (const o of world.enemies) if (o.active && o.kind === 'MUSHBOMB' && o.state !== 'DYING') alive++;
      const n = Math.min(5 + ph, Math.max(0, 9 - alive));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random(), d = e.radius + 2 + Math.random() * 3;
        tv.set(e.pos.x + Math.sin(a) * d, 0, e.pos.z + Math.cos(a) * d);
        const lim = edgeLimit(tv.x, tv.z, 2); if (tv.x * tv.x + tv.z * tv.z > lim * lim) { const s = lim / Math.hypot(tv.x, tv.z); tv.x *= s; tv.z *= s; }
        spawnEnemy('MUSHBOMB', tv, { fixed: true });
      }
      break;
    }
    default: break;
  }
  void t;
}

function endCast(e: Enemy | null): void {
  if (e && e.active && e.state !== 'DYING') {
    enter(e, 'CHASE');
    e.attackCd = Math.max(e.attackCd, 1.5);
    bossGapSet(e, 1.2);
    cd[e.id] = CD[Math.min(2, e.phase | 0)] + Math.random() * 1.5;
  }
  D.cast = 0; D.id = -1; D.beam = -1;
}

// ============================================================================ per-frame hooks
/**
 * Called from bosses.updateBoss for a boss that is past SPAWN and not locked. Returns true when a dodge attack owns the boss this frame
 * (the boss stands still, faces the attack) so its own AI must be skipped. Starts a new attack when the boss is about to pick its next
 * skill (CHASE, no special / invulnerable phase / shared-layer breather) and its dodge timer is up.
 */
export function dodgeBoss(e: Enemy, dt: number): boolean {
  if (coopRoom.guest) return false;
  if (D.cast !== 0 && D.id === e.id) {   // hold + (gatling) shoot
    e.vel.set(0, 0, 0);
    const b = D.beam >= 0 ? beams[D.beam] : null;
    if (b && b.on) requestYaw(beamAngle(b.mode, b.a0, b.w, b.amp, b.per, b.t));
    else requestYaw(D.cast === MG ? D.aim : D.yaw);
    if (D.cast === MG && D.t >= D.w) shoot(e, dt);
    return true;
  }
  const kit = KITS[e.kind];
  if (!kit || e.decoy || world.boss.final) return false;
  if (seen[e.id] === 0 || world.time - seen[e.id] > 1) cd[e.id] = 5 + Math.random() * 2.5;   // a fresh boss (or one that was locked a while): first dodge attack after ~6 s
  seen[e.id] = world.time;
  cd[e.id] -= dt;
  if (D.cast !== 0 || cd[e.id] > 0) return false;
  if (e.state !== 'CHASE' || e.spKind !== 0 || e.attackCd > 0.6 || (bp.on && bp.id === e.id) || bossWarded(e) || bossGapOn(e)) return false;
  // pick the next attack of the kit that is fair right now
  const n = kit.length;
  let idx = (e.id + (dodgeStats.n | 0)) % n;
  for (let i = 0; i < n; i++, idx = (idx + 1) % n) {
    const k = kit[idx];
    if (k === RING && !ringFair()) continue;
    if (k === SHROOMS) { let alive = 0; for (const o of world.enemies) if (o.active && o.kind === 'MUSHBOMB' && o.state !== 'DYING') alive++; if (alive >= 6) continue; }
    dodgeStats.n = (dodgeStats.n | 0) + 1;
    begin(e, k);
    return true;
  }
  cd[e.id] = 1;   // nothing fair right now (the hero cannot dash): try again shortly
  return false;
}

function shoot(e: Enemy, dt: number): void {
  const f = MG_FX[e.kind]!, ph = Math.min(2, e.phase | 0);
  const h = nearestHero(e.pos.x, e.pos.z);
  const dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 1, T = (dist / f.speed) * 0.75;
  const want = Math.atan2(dx + h.vel.x * T, dz + h.vel.z * T), turn = (f.turn + 0.12 * ph) * dt;
  const diff = wrapPi(want - D.aim);
  D.aim += Math.max(-turn, Math.min(turn, diff));
  D.shotT -= dt;
  const rate = f.rate + ph;
  while (D.shotT <= 0) {
    D.shotT += 1 / rate;
    const a = D.aim + (Math.random() - 0.5) * 0.05;
    dirV.set(Math.sin(a), 0, Math.cos(a));
    tv.set(e.pos.x + dirV.x * e.radius * 0.9, 1.6, e.pos.z + dirV.z * e.radius * 0.9);
    fireEnemyProjectile(tv, dirV, f.kind, f.speed, Math.max(1, e.projectileDamage * 0.15), { pct: f.pct, life: 2.4, radius: 0.5 });   // (damage > 0 is required for a hit; `pct` replaces it on the hero, the number only feeds the burn / poison dps and summons)
  }
}

function tickBeam(b: Beam, dt: number): void {
  b.t += dt;
  if (b.t >= b.dur) { b.on = false; return; }
  b.hit0 -= dt; b.hit1 -= dt; b.hitM -= dt;
  const aN = beamAngle(b.mode, b.a0, b.w, b.amp, b.per, b.t), aP = beamAngle(b.mode, b.a0, b.w, b.amp, b.per, Math.max(0, b.t - dt));
  const src = b.src >= 0 ? world.enemies[b.src] : undefined;
  if (b.hitM <= 0) {   // summons in the swept beam, same hit cooldown as the hero's
    b.hitM = b.hitCd;
    hurtMinionsLine(b.ox, b.oz, Math.sin(aN), Math.cos(aN), b.len, b.width * 0.5 + 0.55, 0, b.pct);
  }
  forEachHero((h) => {
    if (!h.alive) return;
    const ally = isAlly(h);
    if ((ally ? b.hit1 : b.hit0) > 0) return;
    const rx = h.pos.x - b.ox, rz = h.pos.z - b.oz, hw = b.width * 0.5 + 0.55;
    let hit = false;
    for (let k = 0; k < 3 && !hit; k++) {
      const a = aP + ((aN - aP) * k) / 2, ux = Math.sin(a), uz = Math.cos(a);
      const along = rx * ux + rz * uz, perp = Math.abs(rx * uz - rz * ux);
      if (along > 0 && along < b.len && perp < hw) hit = true;
    }
    if (!hit) return;
    if (ally) b.hit1 = b.hitCd; else b.hit0 = b.hitCd;
    tv.set(b.ox, 0, b.oz);
    const safe = iframes(h);
    damagePlayer(1, { pct: b.pct, pos: tv, kind: b.dmg, ...(src && src.active ? { src } : null) });
    if (safe) { stat('BeamAvoided'); return; }
    stat('BeamHit');
    if (b.fx === 4) burnHit(Math.max(2, (src ? src.projectileDamage : 10) * 0.14));
    else if (b.fx === 2) burnHit(Math.max(2, (src ? src.projectileDamage : 10) * 0.16));
    else if (b.fx === 3) frostHit(3, 0.5, 1.6);
  });
  if (b.patch) {   // fire trail laid along the beam
    b.pt -= dt;
    if (b.pt <= 0) {
      b.pt = 0.22;
      const d = 8 + Math.random() * (b.len - 12);
      firePatch(b.ox + Math.sin(aN) * d, b.oz + Math.cos(aN) * d, 3.0, 4, Math.max(2, (src ? src.projectileDamage : 10) * 0.12));
    }
  }
}

function resolveEnt(q: Ent): void {
  tv.set(q.x, 0, q.z);
  const src = q.src >= 0 ? world.enemies[q.src] : undefined;
  if (q.fx === 1) events.emit('trick', { pos: tv.clone(), kind: 'RAIN_ROCK', radius: q.r });
  else if (q.fx === 2) { events.emit('trick', { pos: tv.clone(), kind: 'RAIN_ICE', radius: q.r }); events.emit('shake', { amount: 0.15 }); }
  if (q.pct > 0) {
    const rr = q.r + 0.5;
    hurtMinionsCircle(q.x, q.z, q.r, 0, q.pct);
    forEachHero((h) => {
      if (!h.alive || (h.pos.x - q.x) ** 2 + (h.pos.z - q.z) ** 2 >= rr * rr) return;
      tv.set(q.x, 0, q.z);
      const safe = iframes(h);
      damagePlayer(1, { pct: q.pct, pos: tv, kind: q.fx === 2 ? 'ICE' : 'PHYSICAL', ...(src && src.active ? { src } : null), ...(q.fx === 1 ? KB.PUSH : null) });
      if (safe) { stat('StrikeAvoided'); return; }
      stat(q.fx === 2 ? 'IcicleHit' : 'StrikeHit');
      if (q.fx === 2) frostHit(3.5, 0.5, 1.6);   // icicles: a real freeze, but only half of the hits (the 4 s grace and stun / down rules live in frostHit)
    });
  }
  if (q.zk === 1) spawnHostileZone('ACID', q.x, q.z, q.zr, q.zl, q.zd, 0x84cc16);
  else if (q.zk === 2 && fireRoom() > 0) firePatchRaw(q.x, q.z, q.zr, q.zl, q.zd);
}

/** Bomb Shroom floors: every 0.5 s a hero standing in one takes a share of his MAX hp (a normal hit: dash i-frames / ult negate it), like a ticking poison cloud. */
function tickFloors(dt: number): void {
  floorT += dt; if (floorT < 0.5) return;
  floorT -= 0.5;
  let any = false;
  for (const z of world.zones) {
    if (!z.active || z.kind !== 'PLAGUE' || z.period !== 7.77) continue;
    any = true;
    const rr = z.radius + 0.4;
    hurtMinionsCircle(z.pos.x, z.pos.z, z.radius, 0, SHROOM.tick);
    forEachHero((h) => {
      if (!h.alive || (h.pos.x - z.pos.x) ** 2 + (h.pos.z - z.pos.z) ** 2 >= rr * rr) return;
      tv.set(z.pos.x, 0, z.pos.z);
      const safe = iframes(h);
      damagePlayer(1, { pct: SHROOM.tick, pos: tv, kind: 'POISON', env: true });
      if (safe) shroomStats.tickAvoided++; else shroomStats.ticks++;
    });
  }
  if (!any) floorN = 0;
}

/** Global per-frame tick (game.ts, host only): cast timeline, rings, beams, delayed strikes. */
export function updateDodge(dt: number): void {
  if (coopRoom.guest) return;
  if (floorN > 0) tickFloors(dt);
  if (!live) return;
  if (!bossAlive()) { clearAll(); return; }

  if (D.cast !== 0) {
    const e = world.enemies[D.id];
    if (!e || !e.active || e.state === 'DYING') clearAll();
    else if (bp.on && bp.id === e.id) { D.cast = 0; D.id = -1; D.beam = -1; }   // an invulnerable phase took the boss over
    else {
      D.t += dt;
      if (D.cast === RING) {
        if (!D.rel && D.t >= D.w) {
          D.rel = true; releaseRing(e, D.ri);
          if (D.ri + 1 < D.n) { D.ri++; startRing(e, D.ri); } else { D.fin = true; D.t = 0; }
        } else if (D.fin && D.t >= 0.35) endCast(e);
      } else {
        if (!D.rel && D.t >= D.w) { D.rel = true; release(e); }
        if (D.t >= D.w + D.dur) endCast(e);
      }
    }
  }

  for (const r of rings) {
    if (!r.on) continue;
    const rPrev = r.r;
    r.r += r.speed * dt;
    if (r.r > RING_MAXR) { r.on = false; continue; }
    hurtMinionsRing(r.x, r.z, rPrev, r.r, 0, r.pct);   // the wave front hurts each summon once as it sweeps past (minionHurt.ts)
    forEachHero((h) => {
      if (!h.alive) return;
      const ally = isAlly(h);
      if (ally ? r.hit1 : r.hit0) return;
      if ((ally ? r.d1 : r.d0) > r.r) return;
      if (ally) r.hit1 = true; else r.hit0 = true;
      ringHit(r);
    });
  }
  let any = D.cast !== 0;
  for (const r of rings) if (r.on) any = true;
  for (const b of beams) if (b.on) tickBeam(b, dt);
  for (const q of ents) {
    if (!q.on) continue;
    if (!q.shown) { q.sh -= dt; if (q.sh <= 0) { q.shown = true; spawnHostileZone('METEOR_SHADOW', q.x, q.z, q.r, Math.max(0.05, q.t), 0, RED); } }
    q.t -= dt;
    if (q.t <= 0) { q.on = false; resolveEnt(q); }
  }
  for (const b of beams) if (b.on) any = true;
  for (const q of ents) if (q.on) any = true;
  live = any;
}

// ============================================================================ BOMB SHROOM (MUSHBOMB)
const SHROOM = { fuse: 0.35, trigger: 1.4, blast: 4.2, floor: 5.5, floorLife: 8, pct: 0.15, tick: 0.012 };
let floorN = 0, floorT = 0;   // live Bomb Shroom floors (tagged PLAGUE zones, `period` 7.77) / seconds to the next poison tick
/** QA counters of the kamikaze mushroom. */
export const shroomStats = { boom: 0, hit: 0, avoided: 0, lastD: 0, ticks: 0, tickAvoided: 0, floorR: SHROOM.floor, floorLife: SHROOM.floorLife };

/** Bomb Shroom AI (enemies.runAI): sprints straight at the hero, 0.35 s fuse flash + squeal when it is in reach, then bursts. */
export function aiMushbomb(e: Enemy, dx: number, dz: number, dist: number): void {
  if (e.state === 'WINDUP') {
    e.vel.set(0, 0, 0);
    if (e.stateT >= SHROOM.fuse) explodeShroom(e);
    return;
  }
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const inv = 1 / Math.max(dist, 0.001);
  e.vel.set(dx * inv * e.speed, 0, dz * inv * e.speed);
  if (e.patternT === 0 && dist < 16) { e.patternT = 1; events.emit('trick', { pos: e.pos.clone(), kind: 'DG_RUN', radius: 2 }); }   // run-up squeal (once)
  if (dist < e.radius + SHROOM.trigger) {
    enter(e, 'WINDUP'); e.vel.set(0, 0, 0);
    events.emit('trick', { pos: e.pos.clone(), kind: 'DG_FUSE', radius: 2 });
    spawnHostileZone('METEOR_SHADOW', e.pos.x, e.pos.z, SHROOM.blast, SHROOM.fuse, 0, RED);   // red fuse flash on the floor
  }
}
function explodeShroom(e: Enemy): void {
  const x = e.pos.x, z = e.pos.z;
  shroomStats.boom++; { const h0 = nearestHero(x, z); shroomStats.lastD = +Math.hypot(h0.pos.x - x, h0.pos.z - z).toFixed(2); }
  tv.set(x, 0, z);
  events.emit('explosion', { pos: tv.clone(), radius: SHROOM.blast, color: 0x9a5ad0 });
  events.emit('trick', { pos: tv.clone(), kind: 'DG_BOOM', radius: SHROOM.floor });
  events.emit('shake', { amount: 0.3 });
  const rr = SHROOM.blast + 0.5;
  hurtMinionsCircle(x, z, SHROOM.blast, 0, SHROOM.pct);
  forEachHero((h) => {
    if (!h.alive || (h.pos.x - x) ** 2 + (h.pos.z - z) ** 2 >= rr * rr) return;
    tv.set(x, 0, z);
    const safe = iframes(h);
    damagePlayer(1, { pct: SHROOM.pct, pos: tv, kind: 'POISON' });
    if (safe) { shroomStats.avoided++; return; }
    shroomStats.hit++;
    applyPlayerDebuff('POISON', 4, Math.max(2, e.projectileDamage * 0.5));
  });
  const fz = spawnHostileZone('PLAGUE', x, z, SHROOM.floor, SHROOM.floorLife, Math.max(2, e.projectileDamage * 0.5), 0x9a5ad0);   // the poison cloud (decal, sync, status)
  if (fz) { fz.period = 7.77; floorN++; }   // tagged: updateDodge ticks it for a share of max hp (tickFloors)
  spawnHostileZone('GOO', x, z, SHROOM.floor, SHROOM.floorLife, 0, 0x6fae2a);                                          // + slow
  killEnemy(e);
}

if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {   // QA: force a dodge attack on the live boss (`__dodge.cast(1)` = ring), stats, pools
  (window as unknown as Record<string, unknown>).__dodge = {
    cast: (k: number): string => { for (const e of world.enemies) if (e.active && e.boss && e.state !== 'DYING' && e.state !== 'SPAWN') { if (D.cast !== 0) return 'busy'; seen[e.id] = world.time; begin(e, k); return e.kind; } return 'none'; },
    stats: dodgeStats, shroom: shroomStats,
    busy: (): number => D.cast,
    untilRelease: (): number => (D.cast !== RING ? 99 : D.fin ? -D.t : D.w - D.t),
    rings: (): number[][] => rings.filter((r) => r.on).map((r) => [r.x, r.z, r.r, r.speed]),
    beams: (): number[][] => beams.filter((b) => b.on).map((b) => [b.ox, b.oz, beamAngle(b.mode, b.a0, b.w, b.amp, b.per, b.t), b.len]),
    live: (): number => rings.filter((r) => r.on).length + beams.filter((b) => b.on).length + ents.filter((q) => q.on).length,
    ids: { RING, FLAME, LASERS, ICEBEAM, WHIP, MG, SNAKE, SPIRAL, CROSS, ICICLES, SHROOMS },
  };
}
