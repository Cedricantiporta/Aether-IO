// ============================================================================
// Boss AI. Called every frame by enemies.ts for a boss that is past its SPAWN
// state (never frozen / stunned / knocked back).
//
// Shared state-machine use of Enemy fields:
//   state     CHASE (position) -> WINDUP (telegraph) -> ATTACK -> RECOVER -> CHASE
//   pattern   index of the pattern currently running / last run
//   patternT  pattern-local counter (ring index, volley index, spiral timer)
//   angle     rotating spiral angle (lich)
//   attackCd  cool-down between patterns
//   phase     0/1/2 at 66% / 33% hp
//
// GOLEM patterns: 0 SLAM, 1 ROCK_RING, 2 CHARGE
// LICH  patterns: 0 SPIRAL, 1 FAN, 2 BLINK (Malakar's final-fight rotation: see SEQ1 / SEQ2 below)
// The wave 30-70 bosses live in bosses2.ts (dispatched from updateBoss below).
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { edgeLimit } from '../mapgen';
import { events } from '../events';
import type { Enemy, Zone } from '../types';
import { KB, damagePlayer } from './combat';
import { BOSS_NAMES, type BossKind } from '../enemyDefs';
import { useGameStore } from '../../store';
import {
  enter, fireEnemyProjectile, findSpawnPoint, requestYaw,
  spawnTelegraphCircle, spawnTelegraphLine,
} from './enemies';
import { isBoss2, updateBoss2, bossView } from './bosses2';
import { bossWarded } from './bossMech';
import { spawnIllusions } from './bossSpecials';
import { mfx, queueLaser, queueMeteor, queueHole, gravityBegin, gravityBusy, meteorsBusy, holesBusy, spawnRune, tickMalakarFx, setTrailDamage } from './malakarFx';

const dirV = new Vector3();
const posV = new Vector3();

// golem
const SLAM = 0, RING = 1, CHARGE = 2;
// lich (the ordinary Lich loops SPIRAL, FAN, BLINK; Malakar has no summons at all, owner 2026-10-26)
const SPIRAL = 0, FAN = 1, BLINK = 2;

const GOLEM_CD = [2.4, 1.8, 1.3];
const LICH_CD = [1.6, 1.2, 0.9];
const CHARGE_DUR = 0.7;
const BLINK_OUT = 0.5;
const BLINK_IN = 0.4;
/** Seconds between the Lich's "don't hug me" blinks (balance pass: it used to blink EVERY time a melee hero got within
 *  6 u, so a Knight could not land hits and one fight ran ~9 min with 179 cultists summoned). */
const HUG_BLINK_CD = 4;
let hugBlinkT = 0;
const DASH_LANE_W = 5.6, DASH_HIT_R = 2.6;
let chargeHit = false;

function setVel(e: Enemy, ux: number, uz: number, spd: number): void {
  e.vel.set(ux * spd, 0, uz * spd);
}
function stop(e: Enemy): void { e.vel.set(0, 0, 0); }

function syncHud(e: Enemy): void {
  const b = world.boss;
  const names = BOSS_NAMES[e.kind as BossKind];
  b.active = e.state !== 'DYING';
  b.name = names.name;
  if (!b.final) b.title = e.kind === 'BOSS_WARLORD' && bossView.enraged ? 'The Burning Form' : e.kind === 'BOSS_HYDRA' && bossWarded(e) ? 'IMMUNE - slay the spare heads!' : e.kind === 'BOSS_HYDRA' && bossView.headsDead < 5 ? `Shielded by its heads (${5 - bossView.headsDead}/5)` : names.title;   // (the final fight keeps 'Lord of the Void'; Ignar's second form)
  b.hp = e.hp;
  b.maxHp = e.maxHp;
  b.phase = e.phase;
}

function checkPhase(e: Enemy): void {
  const r = e.hp / e.maxHp;
  const ph = r <= 0.33 ? 2 : r <= 0.66 ? 1 : 0;
  if (ph <= e.phase) return;
  e.phase = ph;
  events.emit('bossPhase', { phase: ph });
  events.emit('shake', { amount: 0.6 });
  useGameStore.getState().addNotification(
    ph === 1 ? `${BOSS_NAMES[e.kind as BossKind].name} grows furious!` : `${BOSS_NAMES[e.kind as BossKind].name} is ENRAGED!`,
    '#ef4444', 'BOSS',
  );
  e.attackCd = Math.min(e.attackCd, 0.8);
  // golem: next pattern is a slam; lich: next pattern is a summon
  if (e.state === 'CHASE' && !isBoss2(e.kind)) e.pattern = e.kind === 'BOSS_GOLEM' ? CHARGE : BLINK;
}

function clampToArena(v: Vector3, margin: number): void {
  const lim = edgeLimit(v.x, v.z, margin);
  const d2 = v.x * v.x + v.z * v.z;
  if (d2 > lim * lim) { const s = lim / Math.sqrt(d2); v.x *= s; v.z *= s; }
}

export function updateBoss(e: Enemy, dt: number, distToPlayer: number): void {
  syncHud(e);
  checkPhase(e);
  if (e.kind === 'BOSS_GOLEM') golem(e, distToPlayer);
  else if (e.kind === 'BOSS_LICH') lich(e, dt, distToPlayer);
  else updateBoss2(e, dt, distToPlayer); // Elderroot, Mire Hydra, Glacius, Ignar, Void Herald (bosses2.ts)
}

// ============================================================ GOLEM ========
function golemWindup(e: Enemy): number {
  switch (e.pattern) {
    case SLAM: return 1.2 - 0.15 * e.phase;
    case RING: return 0.8 - 0.1 * e.phase;
    default: return (0.9 - 0.1 * e.phase) * (e.patternT > 0 ? 0.6 : 1);
  }
}
function golemChargeSpeed(e: Enemy): number { return (22 + 3 * e.phase) * 0.6; }   // (owner: Gorath 40% slower)

function golem(e: Enemy, dist: number): void {
  const player = world.player.pos;
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const inv = 1 / Math.max(dist, 0.001);
  const ux = dx * inv;
  const uz = dz * inv;

  switch (e.state) {
    case 'CHASE': {   // keeps a step back so melee heroes don't end up inside the model
      if (dist > 4.5) setVel(e, ux, uz, e.speed * (1 + 0.25 * e.phase));
      else stop(e);
      if (e.attackCd <= 0) beginGolemPattern(e, ux, uz);
      return;
    }
    case 'WINDUP': {
      stop(e);
      if (e.pattern === CHARGE) requestYaw(Math.atan2(e.dir.x, e.dir.z));
      if (e.stateT >= golemWindup(e)) startGolemAttack(e);
      return;
    }
    case 'ATTACK': {
      golemAttack(e);
      return;
    }
    case 'RECOVER': {
      stop(e);
      const rec = e.pattern === CHARGE ? 1.0 : e.pattern === SLAM ? 0.7 : 0.6;
      if (e.stateT < rec) return;
      if (e.pattern === CHARGE && e.phase >= 2 && e.patternT < 1) {
        e.patternT = 1; // second charge in a row
        beginCharge(e, ux, uz);
        return;
      }
      e.attackCd = GOLEM_CD[e.phase];
      enter(e, 'CHASE');
      return;
    }
    default:
      stop(e);
  }
}

/** (owner) Gorath's slams are rock: they knock the hero down. */
function rockTel(z: Zone | null): void { if (z) { z.kb = KB.ROCK.kb; z.down = KB.ROCK.down; } }

function beginGolemPattern(e: Enemy, ux: number, uz: number): void {
  e.pattern = (e.pattern + 1) % 3;
  e.patternT = 0;
  if (e.pattern === SLAM) {
    // one circle right under the player, the rest ring around them
    const px = world.player.pos.x;
    const pz = world.player.pos.z;
    const life = golemWindup(e);
    const dmg = e.projectileDamage * 1.6;
    const n = 3 + e.phase;
    rockTel(spawnTelegraphCircle(px, pz, 5, life, dmg, 0xef4444));
    const base = Math.random() * Math.PI * 2;
    for (let i = 1; i < n; i++) {
      const a = base + (i / (n - 1)) * Math.PI * 2;
      const r = 6 + Math.random() * 3;
      posV.set(px + Math.sin(a) * r, 0, pz + Math.cos(a) * r);
      clampToArena(posV, 3);
      rockTel(spawnTelegraphCircle(posV.x, posV.z, 5, life, dmg, 0xef4444));
    }
    enter(e, 'WINDUP');
  } else if (e.pattern === RING) {
    enter(e, 'WINDUP');
  } else {
    beginCharge(e, ux, uz);
  }
}

function beginCharge(e: Enemy, ux: number, uz: number): void {
  e.dir.set(ux, 0, uz);
  enter(e, 'WINDUP');
  const len = golemChargeSpeed(e) * CHARGE_DUR + e.radius;
  chargeHit = false;
  spawnTelegraphLine(e.pos.x, e.pos.z, ux, uz, len, DASH_LANE_W, golemWindup(e), 0xef4444);   // (owner 2026-10-26) boss dashes: a wider red lane and a bigger hit area
}

function startGolemAttack(e: Enemy): void {
  if (e.pattern === SLAM) {
    events.emit('shockwave', { pos: e.pos, radius: 8, color: 0xa8a29e });
    events.emit('shake', { amount: 0.6 });
  } else if (e.pattern === RING) {
    e.patternT = 0;
  }
  enter(e, 'ATTACK');
}

function golemAttack(e: Enemy): void {
  if (e.pattern === SLAM) {
    stop(e);
    if (e.stateT >= 0.3) enter(e, 'RECOVER');
  } else if (e.pattern === RING) {
    stop(e);
    const rings = e.phase > 0 ? 2 : 1;
    if (e.patternT < rings && e.stateT >= e.patternT * 0.55) {
      fireRockRing(e);
      e.patternT++;
    }
    if (e.patternT >= rings && e.stateT >= (rings - 1) * 0.55 + 0.25) enter(e, 'RECOVER');
  } else {
    setVel(e, e.dir.x, e.dir.z, golemChargeSpeed(e));
    requestYaw(Math.atan2(e.dir.x, e.dir.z));
    const pp = world.player;
    if (!chargeHit && pp.alive && (pp.pos.x - e.pos.x) ** 2 + (pp.pos.z - e.pos.z) ** 2 < (e.radius + DASH_HIT_R) ** 2) {
      chargeHit = true; damagePlayer(e.projectileDamage * 1.5, { pos: e.pos, kind: 'PHYSICAL', ...KB.SLAM });
    }
    if (e.stateT >= CHARGE_DUR) enter(e, 'RECOVER');
  }
}

function fireRockRing(e: Enemy): void {
  const n = 16 + 4 * e.phase;
  const step = (Math.PI * 2) / n;
  e.angle += step * 0.5;
  const speed = 10 + 1.5 * e.phase;
  for (let i = 0; i < n; i++) {
    const a = e.angle + i * step;
    dirV.set(Math.sin(a), 0, Math.cos(a));
    fireEnemyProjectile(e.pos, dirV, 'ROCK', speed, e.projectileDamage, { life: 4, radius: 1.5, debuff: 3 });   // (owner) bigger boulders, 3 s knockdown
  }
  events.emit('shake', { amount: 0.3 });
}

// ============================================================ LICH =========
function lichPosition(e: Enemy, ux: number, uz: number, dist: number, mul: number): void {
  const sp = e.speed * (1 + 0.2 * e.phase) * mul;
  if (dist < 10) setVel(e, -ux, -uz, sp * 1.3);
  else if (dist > 17) setVel(e, ux, uz, sp);
  else {
    const s = (e.id & 1) === 0 ? 1 : -1;
    setVel(e, uz * s, -ux * s, sp * 0.45);
  }
}

/** Malakar (final fight) stage 2 (he rose again): faster patterns, more / bigger / faster orbs, Soul Rain and the Void Cross. */
const st2 = (): boolean => world.boss.final && world.boss.stage === 2;
/** Stage 1 of the final fight: slower patterns and orbs, fewer adds. */
const st1 = (): boolean => world.boss.final && world.boss.stage === 1;
const CROSS = 5;
// (owner 2026-10-26) Malakar's dark-violet, gravity-themed arsenal; ONE major skill at a time with a breather between them, no summons:
// GRAV gravity spell (indicator, whole-arena pull, damage core, explosion), HOLES summoned black holes that follow the hero, LASER telegraphed beams
// (aimed + sweep), RING9 nine giant dark fireballs, METEOR (stage 2) a tracking meteor, SHUFFLE (illusions: one teleport into a ring round the hero),
// CROSS (stage 2) the void cross of beams. SPIRAL / FAN are the basic volleys between the majors.
const GRAV = 6, HOLES = 7, LASER = 8, RING9 = 9, METEOR = 10, SHUFFLE = 11;
const SEQ1 = [SPIRAL, LASER, FAN, GRAV, RING9, SHUFFLE, FAN, HOLES];
const SEQ2 = [SPIRAL, METEOR, LASER, FAN, GRAV, RING9, CROSS, SHUFFLE, FAN, HOLES];
/** Pause after a basic volley / after a major skill (seconds): stage 1 slower, stage 2 faster; the ordinary Lich keeps LICH_CD. */
const MAL_GAP_BASIC = [1.5, 1.3], MAL_GAP_MAJOR = [2.4, 1.9];
const isMajor = (p: number): boolean => p >= CROSS && p !== BLINK;
let seqI = 0, gx = 0, gz = 0, sweepDir = 1;
const DARK = { dark: true } as const;

/** Malakar in the final fight: a periodic damage-absorbing shield (both fights). */
function malakar(e: Enemy, dt: number): void {
  const b = world.boss;
  if (e.state === 'DYING') return;
  b.shieldCd -= dt;
  if (b.shieldCd <= 0 && e.shield <= 0) {
    e.shield = e.maxHp * (b.stage === 2 ? 0.07 : 0.05);   // (balance pass 2: was 10% / 7%; most Lv 40 bot fights never broke through)
    b.shieldCd = b.stage === 2 ? 16 : 20;                   // (was 13 / 17 s)
    events.emit('shockwave', { pos: e.pos.clone(), radius: 5, color: 0x7c3aed });
    events.emit('floatText', { pos: e.pos, text: 'SHIELD', color: 0x93c5fd, scale: 1, dy: 4.5 });
  }
}

function lich(e: Enemy, dt: number, dist: number): void {
  if (world.boss.final) { malakar(e, dt); tickMalakarFx(dt); mfx.major = e.state !== 'CHASE' && isMajor(e.pattern); }
  const player = world.player.pos;
  const dx = player.x - e.pos.x;
  const dz = player.z - e.pos.z;
  const inv = 1 / Math.max(dist, 0.001);
  const ux = dx * inv;
  const uz = dz * inv;

  switch (e.state) {
    case 'CHASE': {
      lichPosition(e, ux, uz, dist, 1);
      hugBlinkT -= dt;
      if (dist < 6 && hugBlinkT <= 0) { hugBlinkT = HUG_BLINK_CD; startLichPattern(e, BLINK); return; } // don't let the player hug the lich (not every second)
      if (e.attackCd <= 0) {
        let next: number;
        if (world.boss.final) { const q = st2() ? SEQ2 : SEQ1; next = q[seqI++ % q.length]; }
        else next = (e.pattern + 1) % 3;
        startLichPattern(e, next);
      }
      return;
    }
    case 'WINDUP': {
      if (e.pattern === BLINK) {
        stop(e);
        if (e.stateT >= BLINK_OUT) doBlink(e);
        return;
      }
      lichPosition(e, ux, uz, dist, 0.3);
      if (e.stateT >= (e.pattern === GRAV || e.pattern === SHUFFLE ? 1.0 : e.pattern === METEOR ? 0.9 : 0.7)) {
        e.patternT = 0;
        e.angle = Math.random() * Math.PI * 2;
        enter(e, 'ATTACK');
      }
      return;
    }
    case 'ATTACK':
      lichAttack(e, dt, ux, uz, dist);
      return;
    case 'RECOVER': {
      lichPosition(e, ux, uz, dist, 0.4);
      const rec = e.pattern === BLINK ? 0.2 : 0.8;
      if (e.stateT >= rec) {
        e.attackCd = e.pattern === BLINK ? 0.3 : world.boss.final ? (isMajor(e.pattern) ? MAL_GAP_MAJOR : MAL_GAP_BASIC)[st2() ? 1 : 0] - 0.15 * e.phase : LICH_CD[e.phase];
        enter(e, 'CHASE');
      }
      return;
    }
    default:
      stop(e);
  }
}

function startLichPattern(e: Enemy, pattern: number): void {
  e.pattern = pattern;
  e.patternT = 0;
  enter(e, 'WINDUP');
  if (pattern === BLINK) {
    events.emit('shockwave', { pos: e.pos.clone(), radius: 4, color: 0xa855f7 });
    spawnRune(e.pos.x, e.pos.z);   // departure circle
  } else if (pattern === GRAV) {   // the pulsing indicator marks the gravity centre where the hero stands now
    gx = world.player.pos.x; gz = world.player.pos.z;
    gravityBegin(gx, gz, e.projectileDamage * (st2() ? 0.9 : 0.75));
  }
}

function doBlink(e: Enemy): void {
  if (findSpawnPoint(12, 16, posV)) {
    e.pos.set(posV.x, 0, posV.z);
    spawnRune(e.pos.x, e.pos.z);   // arrival circle
    events.emit('spawn', { pos: e.pos, kind: e.kind, elite: false });
  }
  enter(e, 'ATTACK'); // fading back in
}

function lichAttack(e: Enemy, dt: number, ux: number, uz: number, dist: number): void {
  switch (e.pattern) {
    case SPIRAL: {
      lichPosition(e, ux, uz, dist, 0.35);
      const s2 = st2();
      const arms = 2 + e.phase + (s2 ? 2 : 0);
      const interval = 0.12 - 0.01 * e.phase;
      e.angle += (1.7 + 0.5 * e.phase) * (s2 ? 1.3 : 1) * dt * (e.phase === 1 ? -1 : 1);
      e.patternT -= dt;
      if (e.patternT <= 0) {
        e.patternT += interval;
        for (let k = 0; k < arms; k++) {
          const a = e.angle + (k * Math.PI * 2) / arms;
          dirV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, dirV, 'BOSS_ORB', 8.5 * (s2 ? 1.35 : st1() ? 0.85 : 1), e.projectileDamage * 0.6, { life: 6, radius: world.boss.final ? (s2 ? 1.2 : 0.8) : s2 ? 0.85 : 0.5, ...DARK });
        }
      }
      if (e.stateT >= 3.4 + 0.4 * e.phase) enter(e, 'RECOVER');
      return;
    }
    case FAN: {
      lichPosition(e, ux, uz, dist, 0.35);
      const s2 = st2();
      const volleys = 2 + e.phase + (s2 ? 1 : 0);
      if (e.patternT < volleys && e.stateT >= e.patternT * (s2 ? 0.3 : 0.4)) {
        const wide = (e.phase >= 2 ? 3 : 2) + (s2 ? 1 : 0);
        const base = Math.atan2(ux, uz);
        for (let i = -wide; i <= wide; i++) {
          const a = base + i * 0.26;
          dirV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, dirV, 'BOSS_ORB', 13 * (s2 ? 1.35 : st1() ? 0.85 : 1), e.projectileDamage * 0.9, { life: 4, radius: world.boss.final ? (s2 ? 1.2 : 0.8) : s2 ? 0.85 : 0.5, ...DARK });
        }
        e.patternT++;
      }
      if (e.patternT >= volleys && e.stateT >= (volleys - 1) * 0.4 + 0.3) enter(e, 'RECOVER');
      return;
    }
    case BLINK:
      stop(e);
      if (e.stateT >= BLINK_IN) enter(e, 'RECOVER');
      return;
    case CROSS: {   // the Void Cross (stage 2): 4 long violet beams from Malakar, then 4 more turned 45 degrees
      stop(e);
      const fire = (off: number) => {
        for (let k = 0; k < 4; k++) {
          const a = e.angle + off + (k * Math.PI) / 2;
          queueLaser(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 40, 3.2, 1.1, e.projectileDamage * 1.3);
        }
      };
      if (e.patternT === 0) { e.patternT = 1; fire(0); }
      if (e.patternT === 1 && e.stateT >= 1.0) { e.patternT = 2; fire(Math.PI / 4); }
      if (e.patternT === 2 && e.stateT >= 2.4) enter(e, 'RECOVER');
      return;
    }
    case GRAV: {   // he waits while the spell runs (indicator, pull, explosion): nothing else happens meanwhile
      stop(e);
      if (e.stateT >= 0.8 && !gravityBusy()) enter(e, 'RECOVER');
      return;
    }
    case HOLES: {   // 2-3 warning circles follow the hero, each opens a black hole under them that then slowly follows
      stop(e);
      if (e.patternT === 0) {
        e.patternT = 1;
        const n = st2() ? 3 : 2;
        for (let i = 0; i < n; i++) queueHole(i * 1.0);
      }
      if (e.stateT >= 0.8 && !holesBusy()) enter(e, 'RECOVER');
      return;
    }
    case LASER: {   // 3 aimed beams (0.6 s apart), then a sweep of 9 beams across an arc; each lane is a purple telegraph, then a bright beam fires
      stop(e);
      const pl = world.player.pos, t = e.stateT, dmg = e.projectileDamage * (st2() ? 2.0 : 1.7);
      if (e.patternT < 3 && t >= e.patternT * 0.6) {
        const a = Math.atan2(pl.x - e.pos.x, pl.z - e.pos.z);
        queueLaser(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 45, 2.6, 0.95, dmg);
        e.patternT++;
      } else if (e.patternT >= 3 && e.patternT < 12 && t >= 2.3 + (e.patternT - 3) * 0.11) {
        const k = e.patternT - 3;
        if (k === 0) { e.angle = Math.atan2(pl.x - e.pos.x, pl.z - e.pos.z); sweepDir = Math.random() < 0.5 ? 1 : -1; }
        const a = e.angle + (k - 4) * 0.24 * sweepDir;
        queueLaser(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 45, 2.2, 0.9, dmg);
        e.patternT++;
      }
      if (e.patternT >= 12 && t >= 4.4) enter(e, 'RECOVER');
      return;
    }
    case RING9: {   // 9 giant dark fireballs in 360 degrees (a second, offset ring in stage 2); a rare burning patch under each
      stop(e);
      const rings = st2() ? 2 : 1;
      if (e.patternT < rings && e.stateT >= e.patternT * 1.1) {
        const base = e.angle + e.patternT * (Math.PI / 9);
        setTrailDamage(e.projectileDamage * 0.15);
        for (let i = 0; i < 9; i++) {
          const a = base + (i / 9) * Math.PI * 2;
          dirV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, dirV, 'BIG_FLAME', 8, e.projectileDamage * 0.9, { life: 2.8, radius: 1.3, dark: true, trail: 1.4 });
        }
        events.emit('shockwave', { pos: e.pos.clone(), radius: 6, color: 0x7c3aed });
        events.emit('shake', { amount: 0.3 });
        e.patternT++;
      }
      if (e.patternT >= rings && e.stateT >= (rings - 1) * 1.1 + 2.0) enter(e, 'RECOVER');
      return;
    }
    case METEOR: {   // 3 meteors 0.6 s apart: each indicator hunts the hero, locks, a meteor falls, impact (no black hole)
      stop(e);
      const dmg = e.projectileDamage * 1.4;
      if (e.patternT < 3 && e.stateT >= e.patternT * 0.6) {
        const side = e.patternT === 0 ? 0 : 5.5;
        const a = Math.random() * 6.283;
        queueMeteor(Math.sin(a) * side, Math.cos(a) * side, dmg);
        e.patternT++;
      }
      if (e.patternT >= 3 && !meteorsBusy()) enter(e, 'RECOVER');
      return;
    }
    case SHUFFLE: {   // illusions: Malakar and two copies teleport ONCE into an even ring round the hero (spawnIllusions places them)
      stop(e);
      if (e.patternT === 0) { e.patternT = 1; spawnIllusions(e, 2, st2() ? 30 : 20); }
      if (e.stateT >= 1.0) enter(e, 'RECOVER');
      return;
    }
    default: stop(e); enter(e, 'RECOVER');
  }
}
