// ============================================================================
// Enemy simulation: spawning, per-kind AI state machines, status effects,
// knockback, separation, obstacle/earthwall handling, contact damage and
// enemy projectiles.
//
// State machine (Enemy.state):
//   SPAWN   0.6 s (bosses 1.6 s) rising from the ground; untargetable, harmless
//   CHASE / KITE   locomotion
//   WINDUP  telegraphed pre-attack (render shows it; stateT = elapsed)
//   ATTACK  the attack itself (charge, blink, volley ...)
//   RECOVER vulnerable cool-down after an attack
//   DYING   death animation (deathT 0..0.6) then active=false
//
// Conventions other layers rely on:
//   * Enemy.facing = atan2(dirX, dirZ)  (yaw so that +Z is "forward").
//   * Enemy.knock is a VELOCITY (units/s) decayed x0.85 per 1/60 s.
//   * SLIME / SPLITTER hop phase: s = max(0, sin(animT * 5)).
//   * BRUTE / BOSS_GOLEM charge direction lives in Enemy.dir.
//   * BOSS_LICH pattern 2 (blink): WINDUP = fading out (alpha 1 - stateT/0.5),
//     ATTACK = fading in (alpha stateT/0.4). Untargetable meanwhile.
// ============================================================================
import { Vector3 } from 'three';
import {
  world, allocEnemy, allocEnemyProjectile, allocZone, ARENA_RADIUS, MAX_ENEMIES,
} from '../world';
import { events } from '../events';
import type {
  Enemy, EnemyKind, EnemyProjectileKind, EnemyState, EliteAffix, Zone,
} from '../types';
import {
  ENEMY_DEFS, SPAWN_TIME, BOSS_SPAWN_TIME, isBossKind, armorFor, isStationary,
  waveHpMult, waveDmgMult, waveSpeedMult,
} from '../enemyDefs';
import { damagePlayer, damageEnemy, killEnemy, wallSlam, applyPlayerDebuff, combatStats } from './combat';
import { damageMinion, nearestMinion } from './minions';
import { initTrick, updateTrick, tryStartTrick, spawnHostileZone, hasTrick } from './tricks';
import { hasSpecial, initSpecial, updateSpecial, tryStartSpecial, cancelSpecial, shellBounce, updateDecoy, clearDecoys } from './bossSpecials';
import { useGameStore } from '../../store';
import { runMods } from '../runMods';
import { updateBoss } from './bosses';
import { updateBossMech, bossMechDied, tickBossStrikes } from './bossMech';
import { initBoss2, isBoss2, bossDied2, saplingDied, aiSapling, aiHydraHead } from './bosses2';
import { spawnPickup } from './pickups';
import { dropLoot } from './loot';
import '../lootExtra';
import { queryColliders, edgeLimit, bounds, pushOutOfCrates, type Collider } from '../mapgen';
import { feat, routeAround } from '../roomFeatures';
import { aiDarkHero, darkHeroDied } from './darkHero';

// ------------------------------------------------------------ tuning --------
const DEATH_TIME = 0.6;
const LEASH_DIST = 110;
const CONTACT_CD = 0.6;
const ELITE_SCALE = 1.35;
const ELITE_AFFIXES: readonly EliteAffix[] = ['HASTED', 'VAMPIRIC', 'FROZEN', 'VOLATILE', 'SHIELDED'];

const ARCHER = { minR: 12, maxR: 18, windup: 0.6, recover: 0.5, cd: 2.4, arrowSpeed: 18 };
const CULTIST = { minR: 10, maxR: 14, windup: 0.8, recover: 0.6, cd: 3.6, orbSpeed: 6, orbLife: 2.4, spread: 0.38 };
const BOMBER = { trigger: 3, fuse: 1.0, radius: 3.5 };
const BRUTE = { cd: 5, windup: 0.9, recover: 0.8, lineWidth: 2.6, chargeMul: 4, minRange: 4, maxRange: 16 };
const BOAR = { cd: 4, windup: 0.7, recover: 1.0, lineWidth: 2.0, chargeMul: 4.6, minRange: 5, maxRange: 18 };
const ZOMBIE = { grabR: 2.3, windup: 0.6, lunge: 0.3, recover: 0.7, cd: 2.6 };
const WRAITH = { windup: 0.75, lunge: 0.4, recover: 0.7, cd: 3.2, lungeMul: 5.5, range: 13 };
const BANDIT = { windup: 0.5, dash: 0.26, recover: 0.55, cd: 2.8, dashSpeed: 22, range: 8, lineW: 1.6 };
const CRAB = { frontCos: 0.5, frontMul: 0.35, turn: 1.6 };
const MINI = { hpMul: 8, scaleMul: 1.5, slamCd: 6, slamWindup: 0.9, slamR: 5.5, flag: 7, slamFlag: 8 };
const SHARDS = 8;
const FEAR_SLOW_T = 3;   // seconds of 30% slow after a fear ends

// ------------------------------------------------------------ scratch -------
const contactCd = new Float32Array(MAX_ENEMIES);
const sepOut: number[] = [];
const tmpV = new Vector3();
const bladeX: number[] = [];
const bladeZ: number[] = [];

// per-frame context (set in updateEnemies, read by AI helpers)
let px = 0;
let pz = 0;
let tdx = 0;       // vector enemy -> player (xz)
let tdz = 0;
let tdist = 0;
let desiredYaw = 0;
// necromancer minions draw aggro: a monster (not bosses / mini-bosses) within MINION_AGGRO of a risen minion goes for
// it instead of the hero (px/pz become the minion's position for that monster's update)
const MINION_AGGRO = 12;
const minTgt = new Int8Array(MAX_ENEMIES).fill(-1);
const minRe = new Float32Array(MAX_ENEMIES);
let anyMinion = false;
let curMin = -1;

/** Non-narrowing state check (killEnemy may flip state inside callees). */
function isDying(e: Enemy): boolean {
  return e.state === 'DYING';
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ------------------------------------------------------------ public helpers --
/** Change state and reset stateT. */
export function enter(e: Enemy, s: EnemyState): void {
  e.state = s;
  e.stateT = 0;
}

/** Ask the generic yaw smoother to turn this enemy toward `yaw` this frame. */
export function requestYaw(yaw: number): void {
  desiredYaw = yaw;
}

/** True while an enemy must not be hit by player attacks (kept out of enemyGrid). */
export function isUntargetable(e: Enemy): boolean {
  if (e.state === 'SPAWN' || e.hideT > 0) return true;
  if (e.kind === 'WRAITH') return e.state === 'WINDUP';
  return e.kind === 'BOSS_LICH' && e.pattern === 2 && (e.state === 'WINDUP' || e.state === 'ATTACK');
}

const spawnCols: Collider[] = [];
function blockedAt(x: number, z: number, pad: number): boolean {
  const cols = queryColliders(x, z, pad + 1, spawnCols);
  for (let i = 0; i < cols.length; i++) {
    const o = cols[i];
    const dx = x - o.x;
    const dz = z - o.z;
    const r = o.r + pad;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/** Is (x,z) a legal spawn spot (inside arena, outside obstacles)? */
export function isSpawnable(x: number, z: number): boolean {
  const r2 = x * x + z * z;
  if (r2 > bounds.checkR2) {
    const lim = edgeLimit(x, z, 3);
    if (r2 > lim * lim) return false;
  }
  return !blockedAt(x, z, 1.5);
}

/**
 * Pick a point `minD..maxD` away from the player, inside the arena and out of
 * obstacles. `baseAngle` (radians, 0 = +Z) biases the direction (+-0.5 rad).
 */
export function findSpawnPoint(minD: number, maxD: number, out: Vector3, baseAngle = NaN): boolean {
  const player = world.player.pos;
  const biased = !Number.isNaN(baseAngle);
  for (let pass = 0; pass < 3; pass++) {
    const k = pass === 0 ? 1 : pass === 1 ? 0.7 : 0.4;
    for (let t = 0; t < 10; t++) {
      const a = biased && pass === 0 ? baseAngle + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
      const d = (minD + Math.random() * (maxD - minD)) * k;
      const x = player.x + Math.sin(a) * d;
      const z = player.z + Math.cos(a) * d;
      if (isSpawnable(x, z)) { out.set(x, 0, z); return true; }
    }
  }
  return false;
}

/** True while a boss runs its AI: its telegraphs are drawn bigger and resolve sooner (harder to dodge). */
let bossTel = false;
const BOSS_TEL_R = 1.3, BOSS_TEL_T = 0.88;

export function spawnTelegraphCircle(
  x: number, z: number, radius: number, life: number, damage: number, color: number,
): Zone | null {
  if (bossTel) { radius *= BOSS_TEL_R; life *= BOSS_TEL_T; }
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = 'TELEGRAPH_CIRCLE'; zn.hostile = true;
  zn.pos.set(x, 0, z); zn.radius = radius; zn.life = life; zn.maxLife = life;
  zn.damage = damage; zn.color = color;
  events.emit('telegraph', { pos: zn.pos, radius, duration: life });
  return zn;
}

/** `width` is stored in Zone.radius, `length` in Zone.length. Damage is 0 (the charge itself hurts). */
export function spawnTelegraphLine(
  x: number, z: number, dirX: number, dirZ: number, length: number, width: number, life: number, color: number,
): Zone | null {
  if (bossTel) { width *= BOSS_TEL_R; length *= 1.12; life *= BOSS_TEL_T; }
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = 'TELEGRAPH_LINE'; zn.hostile = true;
  zn.pos.set(x, 0, z); zn.dir.set(dirX, 0, dirZ); zn.length = length; zn.radius = width;
  zn.life = life; zn.maxLife = life; zn.damage = 0; zn.color = color;
  events.emit('telegraph', { pos: zn.pos, radius: width, duration: life });
  return zn;
}

/** Cone warning: apex at (x,z), `range` in Zone.radius, half-angle (rad) in Zone.aux. Always resolves through `trick` (>= 30, see bossFx.resolveBossZone). */
export function spawnTelegraphCone(
  x: number, z: number, dirX: number, dirZ: number, range: number, half: number, life: number, color: number, trick: number, damage: number,
): Zone | null {
  if (bossTel) { range *= 1.2; half = Math.min(1.5, half * 1.15); life *= BOSS_TEL_T; }
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = 'TELEGRAPH_CONE'; zn.hostile = true;
  zn.pos.set(x, 0, z); zn.dir.set(dirX, 0, dirZ); zn.radius = range; zn.aux = half; zn.length = 0;
  zn.life = life; zn.maxLife = life; zn.damage = damage; zn.color = color; zn.trick = trick;
  events.emit('telegraph', { pos: zn.pos, radius: range * 0.4, duration: life });
  return zn;
}

function randomAffix(): EliteAffix {
  return ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)];
}

// ------------------------------------------------------------ spawning --------
export function spawnEnemy(
  kind: EnemyKind, pos: Vector3, opts?: { elite?: boolean; affix?: EliteAffix },
): Enemy | null {
  const e = allocEnemy();
  if (!e) return null;
  const def = ENEMY_DEFS[kind];
  const d = world.director;
  const wave = d.wave;
  const mods = runMods(useGameStore.getState().difficulty);
  const boss = isBossKind(kind);
  const wantsAffix = opts?.affix !== undefined && opts.affix !== 'NONE';
  const elite = !boss && (!!opts?.elite || wantsAffix);
  const affix: EliteAffix = elite ? (wantsAffix && opts?.affix ? opts.affix : randomAffix()) : 'NONE';

  const hpMul = waveHpMult(wave) * mods.hp * (elite ? 4 : 1) * (boss ? 0.25 * mods.bossHp : 1.4); // normal & elites +40%; bosses x0.25 (halved twice) (x Ascension boss hp)
  const dmgMul = waveDmgMult(wave) * mods.dmg * (elite ? 1.5 : 1);
  const sizeMul = elite ? ELITE_SCALE : 1;
  const rewardMul = 1 + 0.05 * (wave - 1);

  e.kind = kind;
  e.elite = elite;
  e.affix = affix;
  e.boss = boss;
  e.pos.set(pos.x, 0, pos.z);
  e.maxHp = Math.round(def.hp * hpMul);
  e.hp = e.maxHp;
  e.shield = affix === 'SHIELDED' ? e.maxHp * 0.5 : 0;
  e.speed = def.speed * waveSpeedMult(wave) * (affix === 'HASTED' ? 1.5 : 1) * mods.speed;
  e.radius = def.radius * sizeMul;
  e.scale = def.scale * sizeMul;
  e.contactDamage = def.contactDamage * dmgMul;
  e.projectileDamage = def.projectileDamage * dmgMul;
  // XP scales with monster strength: wave growth x tier (elite x5, mini x20 [x4 more in spawnMiniBoss], boss x60).
  e.xp = Math.round(def.xp * (1 + 0.08 * (wave - 1)) * (boss ? 60 : elite ? 5 : 1));
  e.gold = Math.round(def.gold * rewardMul * (elite ? 3 : 1));
  e.armor = armorFor(kind, wave, elite);
  e.mini = false;
  e.staggerMax = boss ? 100 : 0;
  if (!boss) initTrick(e);
  e.decoy = false; e.hideT = 0; e.shellT = 0; e.spKind = 0;
  if (boss) initSpecial(e);
  e.state = 'SPAWN';
  e.stateT = 0;
  e.phase = 0;
  e.pattern = kind === 'BOSS_GOLEM' ? 2 : kind === 'BOSS_LICH' ? 3 : 0; // so first boss pattern is index 0
  e.patternT = 0;
  e.angle = 0;
  e.attackCd = boss ? 2.5 : kind === 'BRUTE' ? 2 + Math.random() * 2 : 0.8 + Math.random() * 1.4;
  e.facing = Math.atan2(world.player.pos.x - e.pos.x, world.player.pos.z - e.pos.z);
  if (isStationary(kind)) { e.dir.set(pos.x, 0, pos.z); e.phase = 0; e.angle = 5 + Math.random() * 3; }   // home spot (towers / lakes)
  e.active = true;
  contactCd[e.id] = 0.4; meleeT[e.id] = 0;

  d.aliveCount++;
  events.emit('spawn', { pos: e.pos, kind, elite });
  if (boss && isBoss2(kind)) initBoss2(e); // wave 30-70 bosses: reset their AI state (Mire Hydra spawns its heads here)
  return e;
}

/** Wave 5/15/25... mini-boss: elite-like unique (8x hp, +50% size) of a regional kind; drives world.boss HUD. */
export function spawnMiniBoss(kind: EnemyKind, pos: Vector3, name: string, title: string): Enemy | null {
  const e = spawnEnemy(kind, pos, { elite: true });
  if (!e) return null;
  e.maxHp = Math.round(e.maxHp / (4 * 1.4) * MINI.hpMul * 0.625); // mini-bosses: half of the old +25% value
  e.hp = e.maxHp;
  e.shield = 0;
  e.affix = 'NONE';
  e.radius *= MINI.scaleMul; e.scale *= MINI.scaleMul;
  e.xp *= 4; e.gold *= 4;
  e.mini = true; initSpecial(e); e.staggerMax = 70; e.armor = Math.round(e.armor * 1.25);
  e.pattern = MINI.flag;
  e.angle = MINI.slamCd * 0.7;
  e.attackCd = Math.max(e.attackCd, 1.5);
  const b = world.boss;
  b.active = true; b.name = name; b.title = title; b.hp = e.hp; b.maxHp = e.maxHp; b.phase = 0;
  return e;
}

/** Soft-despawn every living enemy with a death poof (no loot, no xp). */
export function poofAllEnemies(): void {
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active || e.state === 'DYING') continue;
    e.state = 'DYING'; e.stateT = 0; e.deathT = 0; e.hp = 0; e.vel.set(0, 0, 0);
    events.emit('enemyDeath', { pos: e.pos, kind: e.kind, elite: e.elite, boss: e.boss, scale: e.scale, poof: true });
  }
  world.director.aliveCount = 0;
}

// ------------------------------------------------------------ death --------
export function onEnemyDeath(e: Enemy): void {
  e.state = 'DYING';
  e.stateT = 0;
  e.deathT = 0;
  e.hp = 0;
  e.vel.set(0, 0, 0);
  const d = world.director;
  if (d.aliveCount > 0) d.aliveCount--;

  if (e.kind === 'BOSS_SAPLING') saplingDied(e);
  if (e.kind === 'DARK_HERO') darkHeroDied(e);
  if (e.boss) {
    bossDied2(e);
    bossMechDied();
    clearDecoys();
    world.boss.active = false;
    world.boss.hp = 0;
    events.emit('shake', { amount: 1 });
    events.emit('explosion', { pos: e.pos, radius: e.radius * 2.5, color: ENEMY_DEFS[e.kind].color });
  }

  const hitBase = Math.max(e.projectileDamage, e.contactDamage);
  if (e.affix === 'FROZEN') {
    const r = 8;
    events.emit('frostNova', { pos: e.pos, radius: r });
    const dx = world.player.pos.x - e.pos.x;
    const dz = world.player.pos.z - e.pos.z;
    if (dx * dx + dz * dz < r * r && world.player.alive) {
      damagePlayer(hitBase * 0.5, { pos: e.pos, kind: 'ICE', slow: 0.5 });
    }
  } else if (e.affix === 'VOLATILE') {
    spawnTelegraphCircle(e.pos.x, e.pos.z, 4, 1.0, hitBase * 1.2, 0xf97316);
  }

  if (e.kind === 'CRYSTAL_GOLEMITE') {
    const off = Math.random() * Math.PI;
    const n = e.pattern === MINI.flag || e.pattern === MINI.slamFlag ? SHARDS * 2 : SHARDS;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      tmpV.set(Math.sin(a), 0, Math.cos(a));
      fireEnemyProjectile(e.pos, tmpV, 'ARROW', 9, e.projectileDamage, { life: 1.6, radius: 0.3 });
    }
    events.emit('explosion', { pos: e.pos, radius: 2.5, color: 0xe879f9 });
  }

  if (e.pattern === MINI.flag || e.pattern === MINI.slamFlag) {
    world.boss.active = false;
    world.boss.hp = 0;
    events.emit('shake', { amount: 0.6 });
    events.emit('explosion', { pos: e.pos, radius: e.radius * 2, color: ENEMY_DEFS[e.kind].color });
    const st = useGameStore.getState();
    const luck = 2 * (1 + d.wave * 0.02);
    dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
    dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
    dropLoot(e.kind, luck, e.pos.x, e.pos.z, true);
    const item = st.rollItemDrop(d.wave >= 25 ? 'LEGENDARY' : d.wave >= 15 ? 'EPIC' : 'RARE');
    if (item) { tmpV.set(e.pos.x, 0, e.pos.z); spawnPickup('ITEM', tmpV, 0, item); }
    if (e.kind === 'BANDIT' || e.kind === 'ZOMBIE') for (let i = 0; i < 6; i++) { tmpV.set(e.pos.x + (Math.random() - 0.5) * 3, 0, e.pos.z + (Math.random() - 0.5) * 3); spawnPickup('GOLD', tmpV, 8 + d.wave); } // Bandit Captain's strongbox (humanoids only)
  }

  if (e.kind === 'SPLITTER') {
    spawnHostileZone('ACID', e.pos.x, e.pos.z, 3.4, 5, Math.max(e.contactDamage, 8) * 0.3, 0x9be32a);
    events.emit('trick', { pos: e.pos, kind: 'ACID', radius: 3.4 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      tmpV.set(e.pos.x + Math.sin(a) * 1.2, 0, e.pos.z + Math.cos(a) * 1.2);
      const s = spawnEnemy('SLIME', tmpV);
      if (s) {
        s.stateT = SPAWN_TIME * 0.5; // quick pop-out
        s.knock.set(Math.sin(a) * 6, 0, Math.cos(a) * 6);
      }
    }
  }
}

// ------------------------------------------------------------ AI helpers --------
function setVel(e: Enemy, ux: number, uz: number, spd: number): void {
  e.vel.set(ux * spd, 0, uz * spd);
}

function stop(e: Enemy): void {
  e.vel.set(0, 0, 0);
}

function hopMult(e: Enemy): number {
  const s = Math.max(0, Math.sin(e.animT * 5));
  return 0.2 + 3.2 * s * s; // mean ~1
}

function aiChaser(e: Enemy, hop: boolean): void {
  if (e.state !== 'CHASE') { enter(e, 'CHASE'); }
  const inv = 1 / Math.max(tdist, 0.001);
  setVel(e, tdx * inv, tdz * inv, e.speed * (hop ? hopMult(e) : 1));
}

function aiBat(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  if (e.state === 'RECOVER') {
    // swoop away after a bite, then return
    const a = Math.atan2(-tdx, -tdz) + Math.sin(e.animT * 5) * 0.6;
    setVel(e, Math.sin(a), Math.cos(a), e.speed);
    desiredYaw = a;
    if (e.stateT >= 0.7) enter(e, 'CHASE');
    return;
  }
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const weave = Math.sin(e.animT * 3.7 + e.id) * 0.9 * Math.min(1, tdist / 6);
  const a = Math.atan2(tdx * inv, tdz * inv) + weave;
  setVel(e, Math.sin(a), Math.cos(a), e.speed);
  desiredYaw = a;
}

function aiArcher(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv;
  const uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= ARCHER.windup) {
        tmpV.set(ux, 0, uz);
        fireEnemyProjectile(e.pos, tmpV, 'ARROW', ARCHER.arrowSpeed, e.projectileDamage, { life: 2.5, radius: 0.35 });
        e.attackCd = ARCHER.cd * (0.8 + Math.random() * 0.4);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= ARCHER.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      kiteMove(e, ux, uz, ARCHER.minR, ARCHER.maxR);
      if (e.attackCd <= 0 && tdist < ARCHER.maxR + 6) enter(e, 'WINDUP');
  }
}

function aiCultist(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv;
  const uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= CULTIST.windup) {
        const base = Math.atan2(ux, uz);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * CULTIST.spread;
          tmpV.set(Math.sin(a), 0, Math.cos(a));
          fireEnemyProjectile(e.pos, tmpV, 'SLOW_ORB', CULTIST.orbSpeed, e.projectileDamage * 0.5, {
            slow: 0.4, life: CULTIST.orbLife, radius: 0.5,
          });
        }
        e.attackCd = CULTIST.cd * (0.8 + Math.random() * 0.4);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= CULTIST.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      kiteMove(e, ux, uz, CULTIST.minR, CULTIST.maxR);
      if (e.attackCd <= 0 && tdist < CULTIST.maxR + 4) enter(e, 'WINDUP');
  }
}

/** Keep the player inside [minR, maxR]; strafe while inside the band. */
function kiteMove(e: Enemy, ux: number, uz: number, minR: number, maxR: number): void {
  if (tdist < minR) setVel(e, -ux, -uz, e.speed * 1.1);
  else if (tdist > maxR) setVel(e, ux, uz, e.speed);
  else {
    const s = (e.id & 1) === 0 ? 1 : -1;
    setVel(e, uz * s, -ux * s, e.speed * 0.5);
  }
}

function aiBomber(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  if (e.state === 'WINDUP') {
    stop(e);
    if (e.stateT >= BOMBER.fuse) {
      events.emit('explosion', { pos: e.pos, radius: BOMBER.radius, color: 0xf97316 });
      events.emit('shake', { amount: 0.25 });
      spawnHostileZone('FIREPATCH', e.pos.x, e.pos.z, BOMBER.radius * 0.8, 4, e.projectileDamage * 0.3, 0xff5a1a);
      events.emit('trick', { pos: e.pos, kind: 'BOMBER_PATCH', radius: BOMBER.radius });
      killEnemy(e);
    }
    return;
  }
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  setVel(e, tdx * inv, tdz * inv, e.speed);
  if (tdist < BOMBER.trigger) {
    enter(e, 'WINDUP');
    stop(e);
    spawnTelegraphCircle(e.pos.x, e.pos.z, BOMBER.radius, BOMBER.fuse, e.projectileDamage, 0xf97316);
  }
}

type ChargeP = typeof BRUTE;
function aiBrute(e: Enemy, BRUTE: ChargeP): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const chargeSpeed = e.speed * BRUTE.chargeMul;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= BRUTE.windup) enter(e, 'ATTACK');
      return;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, chargeSpeed);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= e.patternT) enter(e, 'RECOVER');
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= BRUTE.recover) {
        e.attackCd = BRUTE.cd * (0.9 + Math.random() * 0.4);
        enter(e, 'CHASE');
      }
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, tdx * inv, tdz * inv, e.speed);
      if (e.attackCd <= 0 && tdist < BRUTE.maxRange && tdist > BRUTE.minRange) {
        e.dir.set(tdx * inv, 0, tdz * inv);
        // charge long enough to reach the target and overshoot a little
        e.patternT = Math.min(0.9, Math.max(0.35, (tdist + 3) / chargeSpeed));
        const len = chargeSpeed * e.patternT + e.radius;
        spawnTelegraphLine(e.pos.x, e.pos.z, e.dir.x, e.dir.z, len, BRUTE.lineWidth, BRUTE.windup, 0xef4444);
        enter(e, 'WINDUP');
        stop(e);
      }
  }
}

function aiZombie(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= ZOMBIE.windup) { e.dir.set(tdx * inv, 0, tdz * inv); enter(e, 'ATTACK'); }
      return;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, e.speed * 3.2);
      if (e.stateT >= ZOMBIE.lunge) enter(e, 'RECOVER');
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= ZOMBIE.recover) { e.attackCd = ZOMBIE.cd; enter(e, 'CHASE'); }
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, tdx * inv, tdz * inv, e.speed);
      if (e.attackCd <= 0 && tdist < ZOMBIE.grabR + e.radius) {
        spawnTelegraphCircle(e.pos.x + tdx * inv * 1.2, e.pos.z + tdz * inv * 1.2, 1.9, ZOMBIE.windup, 0, 0x84cc16);
        enter(e, 'WINDUP'); stop(e);
      }
  }
}

function aiWraith(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP': // phased out (untargetable), aiming
      stop(e);
      e.dir.set(tdx * inv, 0, tdz * inv);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= WRAITH.windup) enter(e, 'ATTACK');
      return;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, e.speed * WRAITH.lungeMul);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= WRAITH.lunge) enter(e, 'RECOVER');
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= WRAITH.recover) { e.attackCd = WRAITH.cd * (0.8 + Math.random() * 0.5); enter(e, 'CHASE'); }
      return;
    default: {
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      const a = Math.atan2(tdx * inv, tdz * inv) + Math.sin(e.animT * 1.6 + e.id) * 0.5;
      setVel(e, Math.sin(a), Math.cos(a), e.speed);
      if (e.attackCd <= 0 && tdist < WRAITH.range && tdist > 3) {
        const len = e.speed * WRAITH.lungeMul * WRAITH.lunge + e.radius;
        spawnTelegraphLine(e.pos.x, e.pos.z, tdx * inv, tdz * inv, len, 1.5, WRAITH.windup, 0x7dd3fc);
        enter(e, 'WINDUP'); stop(e);
      }
    }
  }
}

function aiBandit(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= BANDIT.windup) enter(e, 'ATTACK');
      return;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, BANDIT.dashSpeed);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= BANDIT.dash) enter(e, 'RECOVER');
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= BANDIT.recover) { e.attackCd = BANDIT.cd * (0.85 + Math.random() * 0.4); enter(e, 'CHASE'); }
      return;
    default: {
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      const s = (e.id & 1) === 0 ? 1 : -1;
      const w = tdist < 9 ? 0.6 : 0.15; // circle-strafe when close
      setVel(e, tdx * inv + tdz * inv * s * w, tdz * inv - tdx * inv * s * w, e.speed);
      if (e.attackCd <= 0 && tdist < BANDIT.range && tdist > 2.2) {
        e.dir.set(tdx * inv, 0, tdz * inv);
        spawnTelegraphLine(e.pos.x, e.pos.z, e.dir.x, e.dir.z, BANDIT.dashSpeed * BANDIT.dash + e.radius + 1.5, BANDIT.lineW, BANDIT.windup, 0xef4444);
        enter(e, 'WINDUP'); stop(e);
      }
    }
  }
}

function aiGolemite(e: Enemy): void {
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const inv = 1 / Math.max(tdist, 0.001);
  setVel(e, tdx * inv, tdz * inv, e.speed * (0.75 + 0.25 * Math.sin(e.animT * 3))); // lumbering gait
}

function aiCrab(e: Enemy): void {
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  // sidestep: crabs move perpendicular, flipping direction every ~2.2 s, closing in slowly
  const s = Math.sin(e.animT * 2.85 + e.id) >= 0 ? 1 : -1;
  const adv = tdist > 3 ? 0.55 : 0.1;
  setVel(e, uz * s * 0.85 + ux * adv, -ux * s * 0.85 + uz * adv, e.speed);
}

/** Rock crab: damage from the front arc is reduced. Called by combat.damageEnemy (DoTs ignore armour). */
export function crabArmor(e: Enemy, amount: number): number {
  const dx = world.player.pos.x - e.pos.x;
  const dz = world.player.pos.z - e.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const dot = (dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / d;
  return dot > CRAB.frontCos ? amount * CRAB.frontMul : amount;
}

/** Mini-boss second pattern: ground slam with a big telegraph circle. */
function miniSlam(e: Enemy): boolean {
  if (e.pattern === MINI.slamFlag) {
    stop(e);
    if (e.stateT >= MINI.slamWindup) {
      events.emit('shockwave', { pos: e.pos, radius: MINI.slamR, color: 0xfbbf24 });
      events.emit('shake', { amount: 0.45 });
      e.pattern = MINI.flag; e.angle = MINI.slamCd * (0.8 + Math.random() * 0.4);
      enter(e, 'CHASE');
    }
    return true;
  }
  if (e.angle > 0) e.angle -= frameDt;
  else if (tdist < MINI.slamR + 3 && (e.state === 'CHASE' || e.state === 'KITE')) {
    spawnTelegraphCircle(e.pos.x, e.pos.z, MINI.slamR, MINI.slamWindup, e.contactDamage * 2, 0xfbbf24);
    e.pattern = MINI.slamFlag; enter(e, 'WINDUP'); stop(e);
    return true;
  }
  return false;
}

// ------------------------------------------------------------ stage monsters + new kinds --------
const TOWER = { range: 26, windup: 0.75, recover: 0.45, cd: 2.2, arrowSpeed: 21, height: 3.7 };
const LHYDRA = { range: 20, windup: 0.8, recover: 0.6, cd: 2.9, orbSpeed: 9, up: 7.5, down: 2.2 };
const SHIELD = { blockR: 9, block: 2.6, blockCd: 2.0, windup: 0.55, bash: 0.28, bashMul: 4.2, recover: 0.9, frontCos: 0.3, turn: 2.0 };
const shotFrom = new Vector3();
let lastBlockText = 0;

/** Goblin archer on its tower: never moves; aimed arrows (every third shot a 3-arrow volley) from the tower top. */
function aiTowerArcher(e: Enemy): void {
  stop(e);
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      if (e.stateT >= TOWER.windup) {
        const volley = e.phase % 3 === 2;
        shotFrom.set(e.pos.x + ux * 0.6, TOWER.height, e.pos.z + uz * 0.6);
        const drop = (1.1 - TOWER.height) / Math.max(4, tdist);   // arc down onto the target
        for (let k = volley ? -1 : 0; k <= (volley ? 1 : 0); k++) {
          const a = Math.atan2(ux, uz) + k * 0.2;
          tmpV.set(Math.sin(a), drop, Math.cos(a)).normalize();
          fireEnemyProjectile(shotFrom, tmpV, 'ARROW', TOWER.arrowSpeed, e.projectileDamage, { life: 2.2, radius: 0.35 });
        }
        e.phase++;
        e.attackCd = TOWER.cd * (0.8 + Math.random() * 0.4);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      if (e.stateT >= TOWER.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      if (e.attackCd <= 0 && tdist < TOWER.range && (world.player.alive || curMin >= 0)) enter(e, 'WINDUP');
  }
}

/** Lurking hydra: surfaces for a while (spits venom orbs, bites the shore), then dives (untargetable) and comes back up. */
function aiLakeHydra(e: Enemy): void {
  stop(e);
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  // dive cycle on e.angle: counts down while surfaced; dives for LHYDRA.down seconds
  if (e.hideT > 0) return;
  e.angle -= frameDt;
  if (e.angle <= 0 && e.state !== 'WINDUP') {
    e.angle = LHYDRA.up * (0.85 + Math.random() * 0.3);
    e.hideT = LHYDRA.down;
    enter(e, 'RECOVER');
    return;
  }
  switch (e.state) {
    case 'WINDUP':
      if (e.stateT >= LHYDRA.windup) {
        shotFrom.set(e.pos.x + ux, 2.2, e.pos.z + uz);
        const base = Math.atan2(ux, uz);
        for (let k = -1; k <= 1; k++) {
          const a = base + k * 0.26;
          tmpV.set(Math.sin(a), -0.04, Math.cos(a));
          fireEnemyProjectile(shotFrom, tmpV, 'SLOW_ORB', LHYDRA.orbSpeed, e.projectileDamage * 0.7, { slow: 0.35, life: 2.6, radius: 0.5 });
        }
        e.attackCd = LHYDRA.cd * (0.8 + Math.random() * 0.4);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      if (e.stateT >= LHYDRA.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      if (e.attackCd <= 0 && tdist < LHYDRA.range && tdist > 3) enter(e, 'WINDUP');
  }
}

/** Sand scarab: skitters in zig-zags straight at the target (ground swarm). */
function aiScarab(e: Enemy): void {
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const inv = 1 / Math.max(tdist, 0.001);
  const zig = Math.sin(e.animT * 9 + e.id * 1.7) * 0.7 * Math.min(1, tdist / 5);
  const a = Math.atan2(tdx * inv, tdz * inv) + zig;
  setVel(e, Math.sin(a), Math.cos(a), e.speed * (0.8 + 0.35 * Math.abs(Math.sin(e.animT * 6 + e.id))));
  desiredYaw = a;
}

/**
 * Shieldbearer: plods forward; near the target it braces behind its shield (state KITE = blocking stance: frontal
 * hits deal 0, see shieldBlock), then shoves with a short telegraphed shield bash and is open for a moment after it.
 */
function aiShieldbearer(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  switch (e.state) {
    case 'KITE':   // braced
      setVel(e, ux, uz, e.speed * 0.3);
      if (e.stateT >= SHIELD.block) {
        if (tdist < 6) {
          e.dir.set(ux, 0, uz);
          spawnTelegraphLine(e.pos.x, e.pos.z, ux, uz, e.speed * SHIELD.bashMul * SHIELD.bash + e.radius + 1.2, 1.8, SHIELD.windup, 0xf2c14e);
          enter(e, 'WINDUP'); stop(e);
        } else { e.attackCd = SHIELD.blockCd * 0.5; enter(e, 'CHASE'); }
      }
      return;
    case 'WINDUP':
      stop(e);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= SHIELD.windup) enter(e, 'ATTACK');
      return;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, e.speed * SHIELD.bashMul);
      desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= SHIELD.bash) enter(e, 'RECOVER');
      return;
    case 'RECOVER':   // shield lowered: open to every hit
      stop(e);
      if (e.stateT >= SHIELD.recover) { e.attackCd = SHIELD.blockCd * (0.8 + Math.random() * 0.4); enter(e, 'CHASE'); }
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, ux, uz, e.speed);
      if (e.attackCd <= 0 && tdist < SHIELD.blockR) { enter(e, 'KITE'); }
  }
}

/** Shieldbearer block: braced (KITE) and the hit comes from the front arc -> 0 damage + a BLOCKED word. */
export function shieldBlock(e: Enemy): boolean {
  if (e.kind !== 'SHIELDBEARER' || e.state !== 'KITE' || e.stunT > 0 || e.freezeT > 0 || e.staggerT > 0) return false;
  const dx = world.player.pos.x - e.pos.x, dz = world.player.pos.z - e.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  if ((dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / d < SHIELD.frontCos) return false;
  e.hitFlash = Math.max(e.hitFlash, 0.25);
  if (world.time - lastBlockText > 0.35) {
    lastBlockText = world.time;
    events.emit('floatText', { pos: e.pos, text: 'BLOCKED', color: 0xc8d4e6, scale: 0.85, dy: 2.3 });
    events.emit('projectileImpact', { pos: e.pos, kind: 'ENEMY' });
  }
  return true;
}

// ------------------------------------------------------------ biome-unique monsters --
const SPORE = { range: 3.4, windup: 0.75, r: 3.0, cloud: 4.5, recover: 0.8, cd: 4.5 };
const WOLF = { range: 7, windup: 0.4, pounce: 0.3, mul: 3.6, recover: 0.5, cd: 2.6, orbit: 9 };
const ARMOR = { range: 3.6, windup: 0.85, r: 2.5, reach: 2.0, recover: 1.0, cd: 3.2 };
const GARG = { wake: 10, range: 7, windup: 0.4, dive: 0.38, mul: 3.2, recover: 0.8, cd: 2.4 };
const SCORP = { range: 3.0, windup: 0.55, r: 1.7, reach: 1.7, recover: 0.6, cd: 2.4 };
const MUMMY_P = { minR: 4, maxR: 11, windup: 0.65, recover: 0.6, cd: 4.5, speed: 11 };
const YETI_P = { cd: 5, windup: 0.85, recover: 1.0, lineWidth: 2.8, chargeMul: 3.8, minRange: 4, maxRange: 15 };
const WISP = { minR: 8, maxR: 13, windup: 0.6, recover: 0.5, cd: 2.8, novaR: 4, novaCd: 6, spread: 0.3 };
const HOUND = { trail: 0.55, trailR: 0.95, trailLife: 2.2 };
const SHAMAN = { minR: 9, maxR: 15, windup: 0.5, recover: 0.8, cd: 3.4, r: 2.6, fall: 1.1 };
const STALK = { range: 13, windup: 0.5, r: 1.9, recover: 0.7, cd: 4.6, behind: 2.6 };
const EYE = { minR: 9, maxR: 14, windup: 0.85, recover: 0.6, cd: 4.2, n: 10, speed: 7 };

/** Generic "wind up, then a damaging circle in front of me" melee (Haunted Armor cleave, Scorpion sting, Sporecap burst). */
function frontStrike(e: Enemy, P: { range: number; windup: number; r: number; recover: number; cd: number }, reach: number, dmg: number, color: number, onHit?: (x: number, z: number) => void): void {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP':
      stop(e); desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= P.windup) { if (onHit) onHit(e.pos.x + e.dir.x * reach, e.pos.z + e.dir.z * reach); enter(e, 'RECOVER'); }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= P.recover) { e.attackCd = P.cd * (0.85 + Math.random() * 0.3); enter(e, 'CHASE'); }
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, tdx * inv, tdz * inv, e.speed);
      if (e.attackCd <= 0 && tdist < P.range + e.radius) {
        e.dir.set(tdx * inv, 0, tdz * inv);
        spawnTelegraphCircle(e.pos.x + e.dir.x * reach, e.pos.z + e.dir.z * reach, P.r, P.windup, dmg, color);
        enter(e, 'WINDUP'); stop(e);
      }
  }
}

/** Short telegraphed pounce (wolf / hound / gargoyle dive). Returns true while busy. */
function pounce(e: Enemy, P: { range: number; windup: number; recover: number; cd: number }, dur: number, mul: number, color: number): boolean {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP':
      stop(e); desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= P.windup) enter(e, 'ATTACK');
      return true;
    case 'ATTACK':
      setVel(e, e.dir.x, e.dir.z, e.speed * mul); desiredYaw = Math.atan2(e.dir.x, e.dir.z);
      if (e.stateT >= dur) enter(e, 'RECOVER');
      return true;
    case 'RECOVER':
      setVel(e, -e.dir.x, -e.dir.z, e.speed * 0.35);
      if (e.stateT >= P.recover) { e.attackCd = P.cd * (0.85 + Math.random() * 0.3); enter(e, 'CHASE'); }
      return true;
  }
  if (e.attackCd <= 0 && tdist < P.range) {
    e.dir.set(tdx * inv, 0, tdz * inv);
    spawnTelegraphLine(e.pos.x, e.pos.z, e.dir.x, e.dir.z, e.speed * mul * dur + e.radius, 1.4, P.windup, color);
    enter(e, 'WINDUP'); stop(e);
    return true;
  }
  return false;
}

function aiSporecap(e: Enemy): void {
  frontStrike(e, SPORE, 0.4, e.projectileDamage, 0xb04ad0, (x, z) => {
    spawnHostileZone('PLAGUE', x, z, SPORE.r * 0.9, SPORE.cloud, e.projectileDamage * 0.35, 0xa05ad0);
  });
}

function aiDirewolf(e: Enemy, trail: boolean): void {
  if (trail && (e.state === 'CHASE' || e.state === 'ATTACK')) {
    e.patternT += frameDt;
    if (e.patternT >= HOUND.trail) { e.patternT = 0; spawnHostileZone('FIREPATCH', e.pos.x, e.pos.z, HOUND.trailR, HOUND.trailLife, e.projectileDamage, 0xff5a1a); }
  }
  if (pounce(e, WOLF, WOLF.pounce, WOLF.mul, trail ? 0xff6a1a : 0xd0d4dc)) return;
  if (e.state !== 'CHASE') enter(e, 'CHASE');
  const inv = 1 / Math.max(tdist, 0.001);
  // circle the prey while the pounce recharges, closing in slowly
  const s = (e.id & 1) === 0 ? 1 : -1;
  const orbit = e.attackCd > 0 && tdist < WOLF.orbit ? 0.85 : 0;
  const ux = tdx * inv, uz = tdz * inv;
  const vx = ux * (1 - orbit) + uz * s * orbit, vz = uz * (1 - orbit) - ux * s * orbit;
  const l = 1 / Math.max(0.001, Math.hypot(vx, vz));
  setVel(e, vx * l, vz * l, e.speed);
  desiredYaw = Math.atan2(vx, vz);
}

function aiHauntedArmor(e: Enemy): void { frontStrike(e, ARMOR, ARMOR.reach, e.contactDamage * 2.2, 0x9ab0ff); }

function aiGargoyle(e: Enemy): void {
  if (e.phase === 0) {   // perched statue: wakes when you come close or it is struck
    stop(e);
    if (tdist < GARG.wake || e.hp < e.maxHp) { e.phase = 1; e.attackCd = 0.3; events.emit('explosion', { pos: e.pos, radius: 1.2, color: 0x9a948a }); enter(e, 'CHASE'); }
    else if (e.state !== 'KITE') enter(e, 'KITE');
    return;
  }
  if (pounce(e, GARG, GARG.dive, GARG.mul, 0xc0b8a8)) return;
  aiBat(e);
}

function aiScorpion(e: Enemy): void {
  frontStrike(e, SCORP, SCORP.reach, e.projectileDamage, 0xd0a040, (x, z) => {
    spawnHostileZone('ACID', x, z, 1.4, 2.5, e.projectileDamage * 0.25, 0x9ad040);
  });
}

function aiMummy(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= MUMMY_P.windup) {
        tmpV.set(ux, 0, uz);
        fireEnemyProjectile(e.pos, tmpV, 'SLOW_ORB', MUMMY_P.speed, e.projectileDamage, { life: 1.6, radius: 0.55, debuff: 1 });   // binding wraps: root
        e.attackCd = MUMMY_P.cd * (0.85 + Math.random() * 0.3);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= MUMMY_P.recover) enter(e, 'CHASE');
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, ux, uz, e.speed);
      if (e.attackCd <= 0 && tdist > MUMMY_P.minR && tdist < MUMMY_P.maxR) { enter(e, 'WINDUP'); stop(e); }
  }
}

function aiYeti(e: Enemy): void {
  aiBrute(e, YETI_P);
  if (e.state === 'RECOVER' && e.phase === 0) {   // the charge ends in a ground slam
    e.phase = 1;
    spawnTelegraphCircle(e.pos.x + e.dir.x * 1.2, e.pos.z + e.dir.z * 1.2, 3.4, 0.45, e.contactDamage * 1.2, 0xbfe8ff);
    spawnHostileZone('GOO', e.pos.x, e.pos.z, 3.2, 3, 0, 0xbfe8ff);   // packed snow slows
  } else if (e.state !== 'RECOVER') e.phase = 0;
}

function aiFrostWisp(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  e.patternT -= frameDt;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= WISP.windup) {
        const base = Math.atan2(ux, uz);
        for (let i = -1; i <= 1; i++) { const a = base + i * WISP.spread; tmpV.set(Math.sin(a), 0, Math.cos(a)); fireEnemyProjectile(e.pos, tmpV, 'ORB', 12, e.projectileDamage, { slow: 0.45, life: 1.8, radius: 0.4 }); }
        e.attackCd = WISP.cd * (0.85 + Math.random() * 0.3);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= WISP.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      if (tdist < WISP.novaR && e.patternT <= 0) {   // too close: frost nova, then drift away
        e.patternT = WISP.novaCd;
        spawnTelegraphCircle(e.pos.x, e.pos.z, WISP.novaR + 0.5, 0.6, e.projectileDamage * 1.2, 0x8ae0ff);
        spawnHostileZone('GOO', e.pos.x, e.pos.z, WISP.novaR, 2.5, 0, 0x8ae0ff);
      }
      kiteMove(e, ux, uz, WISP.minR, WISP.maxR);
      if (e.attackCd <= 0 && tdist < WISP.maxR + 4) enter(e, 'WINDUP');
  }
}

function aiCinderShaman(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= SHAMAN.windup) {
        // fire rains on where you stand (and a second circle where you are heading)
        spawnTelegraphCircle(px, pz, SHAMAN.r, SHAMAN.fall, e.projectileDamage * 1.3, 0xff5a1a);
        const pv = world.player.vel;
        if (Math.abs(pv.x) + Math.abs(pv.z) > 1) spawnTelegraphCircle(px + pv.x * 0.8, pz + pv.z * 0.8, SHAMAN.r * 0.8, SHAMAN.fall + 0.3, e.projectileDamage, 0xff7a2a);
        e.attackCd = SHAMAN.cd * (0.85 + Math.random() * 0.3);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= SHAMAN.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      kiteMove(e, ux, uz, SHAMAN.minR, SHAMAN.maxR);
      if (e.attackCd <= 0 && tdist < SHAMAN.maxR + 5) enter(e, 'WINDUP');
  }
}

function aiVoidStalker(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  switch (e.state) {
    case 'WINDUP':
      stop(e); desiredYaw = Math.atan2(tdx, tdz);
      if (e.stateT >= STALK.windup) enter(e, 'RECOVER');
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= STALK.recover) { e.attackCd = STALK.cd * (0.85 + Math.random() * 0.3); enter(e, 'CHASE'); }
      return;
    default:
      if (e.state !== 'CHASE') enter(e, 'CHASE');
      setVel(e, tdx * inv, tdz * inv, e.speed);
      if (e.attackCd <= 0 && tdist < STALK.range) {
        // blink behind the target, then a telegraphed strike on it
        const f = world.player.facing;
        const bx = px - Math.sin(f) * STALK.behind, bz = pz - Math.cos(f) * STALK.behind;
        if (isSpawnable(bx, bz)) {
          events.emit('explosion', { pos: e.pos, radius: 1.1, color: 0x8a4aff });
          e.pos.set(bx, 0, bz);
          events.emit('explosion', { pos: e.pos, radius: 1.1, color: 0x8a4aff });
        }
        spawnTelegraphCircle(px, pz, STALK.r, STALK.windup, e.projectileDamage, 0xa060ff);
        enter(e, 'WINDUP'); stop(e);
      }
  }
}

function aiVoidEye(e: Enemy): void {
  const inv = 1 / Math.max(tdist, 0.001);
  const ux = tdx * inv, uz = tdz * inv;
  switch (e.state) {
    case 'WINDUP':
      stop(e);
      if (e.stateT >= EYE.windup) {
        const o = Math.random() * Math.PI * 2;
        for (let i = 0; i < EYE.n; i++) { const a = o + (i / EYE.n) * Math.PI * 2; tmpV.set(Math.sin(a), 0, Math.cos(a)); fireEnemyProjectile(e.pos, tmpV, 'ORB', EYE.speed, e.projectileDamage, { life: 3, radius: 0.45 }); }
        e.attackCd = EYE.cd * (0.85 + Math.random() * 0.3);
        enter(e, 'RECOVER');
      }
      return;
    case 'RECOVER':
      stop(e);
      if (e.stateT >= EYE.recover) enter(e, 'KITE');
      return;
    default:
      if (e.state !== 'KITE') enter(e, 'KITE');
      kiteMove(e, ux, uz, EYE.minR, EYE.maxR);
      if (e.attackCd <= 0 && tdist < EYE.maxR + 4) { spawnTelegraphCircle(e.pos.x, e.pos.z, 1.6, EYE.windup, 0, 0xc070ff); enter(e, 'WINDUP'); }
  }
}

function runAI(e: Enemy): void {
  if (e.state === 'SPAWN') {
    stop(e);
    if (e.stateT >= (e.boss ? BOSS_SPAWN_TIME : SPAWN_TIME)) {
      enter(e, e.kind === 'SKELETON_ARCHER' || e.kind === 'CULTIST' || e.kind === 'GOBLIN_ARCHER' || e.kind === 'LAKE_HYDRA' || e.kind === 'FROST_WISP' || e.kind === 'CINDER_SHAMAN' || e.kind === 'VOID_EYE' || e.kind === 'GARGOYLE' ? 'KITE' : 'CHASE');
      e.attackCd = Math.max(e.attackCd, 0.6);
    }
    return;
  }
  if ((e.pattern === MINI.flag || e.pattern === MINI.slamFlag) && miniSlam(e)) return;
  switch (e.kind) {
    case 'SLIME':
    case 'SPLITTER': aiChaser(e, true); break;
    case 'GOBLIN': aiChaser(e, false); break;
    case 'BAT': aiBat(e); break;
    case 'SKELETON_ARCHER': aiArcher(e); break;
    case 'CULTIST': aiCultist(e); break;
    case 'BOMBER': aiBomber(e); break;
    case 'BRUTE': aiBrute(e, BRUTE); break;
    case 'BOAR': aiBrute(e, BOAR); break;
    case 'ZOMBIE': aiZombie(e); break;
    case 'WRAITH': aiWraith(e); break;
    case 'BANDIT': aiBandit(e); break;
    case 'CRYSTAL_GOLEMITE': aiGolemite(e); break;
    case 'ROCK_CRAB': aiCrab(e); break;
    case 'BOSS_SAPLING': aiSapling(e); break;
    case 'BOSS_HYDRA_HEAD': aiHydraHead(e); break;
    case 'BOSS_IMP': aiChaser(e, false); break;
    case 'GOBLIN_ARCHER': aiTowerArcher(e); break;
    case 'LAKE_HYDRA': aiLakeHydra(e); break;
    case 'SCARAB': aiScarab(e); break;
    case 'SHIELDBEARER': aiShieldbearer(e); break;
    case 'SPORECAP': aiSporecap(e); break;
    case 'DIREWOLF': aiDirewolf(e, false); break;
    case 'HAUNTED_ARMOR': aiHauntedArmor(e); break;
    case 'GARGOYLE': aiGargoyle(e); break;
    case 'SCORPION': aiScorpion(e); break;
    case 'MUMMY': aiMummy(e); break;
    case 'YETI': aiYeti(e); break;
    case 'FROST_WISP': aiFrostWisp(e); break;
    case 'HELLHOUND': aiDirewolf(e, true); break;
    case 'CINDER_SHAMAN': aiCinderShaman(e); break;
    case 'VOID_STALKER': aiVoidStalker(e); break;
    case 'VOID_EYE': aiVoidEye(e); break;
    case 'BOSS_CRYSTAL': stop(e); break;
    case 'DARK_HERO': aiDarkHero(e, frameDt, px, pz, tdist); break;
    default: break; // bosses are driven by updateBoss() from updateEnemy()
  }
}

// ------------------------------------------------------------ per-enemy update --------
let frameDt = 0;
let frameDecay = 1;
let frameDotTick = false;

function separate(e: Enemy): void {
  const ids = world.enemyGrid.query(e.pos.x, e.pos.z, e.radius + 1.4, sepOut);
  const k = Math.min(0.5, 8 * frameDt);
  for (let i = 0; i < ids.length; i++) {
    const o = world.enemies[ids[i]];
    if (o === e || !o.active || o.state === 'DYING' || o.state === 'SPAWN') continue;
    let dx = e.pos.x - o.pos.x;
    let dz = e.pos.z - o.pos.z;
    const minD = (e.radius + o.radius) * 0.9;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) continue;
    let d = Math.sqrt(d2);
    if (d < 0.001) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.sqrt(dx * dx + dz * dz) + 0.001; }
    const push = (minD - d) * k * (o.boss ? 2 : 1);
    e.pos.x += (dx / d) * push;
    e.pos.z += (dz / d) * push;
  }
}

const colScratch: Collider[] = [];
const wayPt: [number, number] = [0, 0];
function pushOutOfObstacles(e: Enemy): boolean {
  let hit = false;
  const rr = e.radius * 0.8;
  const cols = queryColliders(e.pos.x, e.pos.z, rr + 0.5, colScratch);
  for (let i = 0; i < cols.length; i++) {
    const o = cols[i];
    const dx = e.pos.x - o.x;
    const dz = e.pos.z - o.z;
    const r = o.r + rr;
    if (dx > r || dx < -r || dz > r || dz < -r) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (o.liquid === 2 && e.burnT < 1) { e.burnT = 2; e.burnDps = Math.max(e.burnDps, e.maxHp * 0.06); }   // shoved into lava
    const d = Math.sqrt(d2);
    if (d < 0.001) { e.pos.x += r; continue; }
    e.pos.x = o.x + (dx / d) * r;
    e.pos.z = o.z + (dz / d) * r;
  }
  pushOutOfCrates(e.pos, rr);
  return hit;
}

/** Basic melee: touching the hero does nothing; a monster in reach winds up a short strike (MELEE_WINDUP, it flashes),
 *  then hits only if the hero is still in reach. Skill moves (state ATTACK: charges, lunges, grabs) hit on contact. */
export const meleeT = new Float32Array(MAX_ENEMIES);
const MELEE_WINDUP = 0.42, MELEE_CD = 1.1;
function contactHit(e: Enemy, locked: boolean): void {
  if (e.contactDamage <= 0 || locked || e.state === 'SPAWN' || e.state === 'DYING' || e.hideT > 0 || (!world.player.alive && curMin < 0)) { meleeT[e.id] = 0; return; }
  const dx = px - e.pos.x;
  const dz = pz - e.pos.z;
  const r = e.radius + 0.8;
  const d2 = dx * dx + dz * dz;
  if (e.state !== 'ATTACK') {
    if (e.stunT > 0 || e.freezeT > 0) { meleeT[e.id] = 0; return; }
    if (meleeT[e.id] > 0) {
      meleeT[e.id] -= frameDt;
      if (meleeT[e.id] > 0) return;
      meleeT[e.id] = 0; contactCd[e.id] = MELEE_CD;
      const d = Math.sqrt(d2) || 1;
      e.pos.x += (dx / d) * 0.35; e.pos.z += (dz / d) * 0.35;   // lunge into the strike
      if (d2 > (r + 0.7) * (r + 0.7)) return;                  // the hero stepped out of reach: whiff
    } else {
      if (contactCd[e.id] > 0 || d2 >= (r + 0.3) * (r + 0.3)) return;
      meleeT[e.id] = MELEE_WINDUP;
      return;
    }
  } else {
    if (contactCd[e.id] > 0 || d2 >= r * r) return;
  }
  const dmg = e.contactDamage * (e.state === 'ATTACK' ? 2 : 1);
  contactCd[e.id] = e.state === 'ATTACK' ? CONTACT_CD : MELEE_CD;
  if (curMin >= 0) { damageMinion(curMin, dmg); if (e.kind === 'BAT') enter(e, 'RECOVER'); return; }   // hit the skeleton
  const grab = e.kind === 'ZOMBIE';
  damagePlayer(dmg, { pos: e.pos, kind: 'PHYSICAL', slow: grab ? 0.5 : undefined });
  if (e.kind === 'BOAR' && e.state === 'ATTACK') {
    const k = 3.2 / Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
    world.player.pos.x += dx * k; world.player.pos.z += dz * k; // knockback shove
    world.player.slowT = Math.max(world.player.slowT, 0.6);
    if (applyPlayerDebuff('STUN', 0.6)) events.emit('trick', { pos: e.pos, kind: 'BOAR_KNOCKDOWN', radius: 1.5 });
  }
  if (e.affix === 'VAMPIRIC') e.hp = Math.min(e.maxHp, e.hp + dmg * 0.2);
  if (e.kind === 'BAT') enter(e, 'RECOVER');
}

function updateEnemy(e: Enemy): void {
  const dt = frameDt;
  const player = world.player;

  if (e.decoy) { if (e.state === 'DYING') return; updateDecoy(e, dt); return; }
  e.animT += dt;
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6.5);
  if (e.hideT > 0) e.hideT -= dt;

  // target: a nearby minion first, else the hero
  curMin = -1;
  if (anyMinion && !e.boss && !e.mini) {
    minRe[e.id] -= dt;
    let k = minTgt[e.id];
    if (minRe[e.id] <= 0 || k < 0 || !world.minions[k].active) { minRe[e.id] = 0.4; k = nearestMinion(e.pos.x, e.pos.z, MINION_AGGRO); minTgt[e.id] = k; }
    if (k >= 0 && world.minions[k].active) curMin = k;
  }
  if (curMin >= 0) { px = world.minions[curMin].x; pz = world.minions[curMin].z; }
  else { px = player.pos.x; pz = player.pos.z; }
  tdx = px - e.pos.x;
  tdz = pz - e.pos.z;
  tdist = Math.sqrt(tdx * tdx + tdz * tdz);
  const still = isStationary(e.kind);
  // rivers / lakes: walkers head for a bridge (or round the shore) when liquid separates them from their target
  if ((feat.river || feat.nLakes > 0) && !still && !e.boss && e.kind !== 'BAT' && e.kind !== 'WRAITH' && e.state !== 'ATTACK'
    && routeAround(e.pos.x, e.pos.z, px, pz, e.radius, wayPt)) {
    const wx = wayPt[0] - e.pos.x, wz = wayPt[1] - e.pos.z, wd = Math.sqrt(wx * wx + wz * wz);
    const rest = Math.hypot(px - wayPt[0], pz - wayPt[1]);
    tdx = wx; tdz = wz; tdist = wd + rest;
    if (wd > 1e-3) { tdx = (wx / wd) * tdist; tdz = (wz / wd) * tdist; }   // keep the direction, report the walking distance
  }

  // leash: stray enemies re-enter near the arena edge close to the player
  if (!e.boss && !still && e.kind !== 'BOSS_HYDRA_HEAD' && tdist > LEASH_DIST && findSpawnPoint(26, 34, tmpV)) {
    e.pos.copy(tmpV);
    tdx = px - e.pos.x; tdz = pz - e.pos.z; tdist = Math.sqrt(tdx * tdx + tdz * tdz);
  }

  // ---- status effects
  if (e.boss) { e.freezeT = 0; e.stunT = 0; e.knock.set(0, 0, 0); }
  if (e.mini) { e.freezeT = 0; e.stunT = 0; }
  if (e.armorBreakT > 0) e.armorBreakT -= dt;
  if (e.burnStackCd > 0) e.burnStackCd -= dt;
  if (e.slamT > 0) e.slamT -= dt;
  if (e.frostT > 0) e.frostT -= dt;
  if (e.chillT > 0) { e.chillT -= dt; if (e.chillT <= 0) e.chillStacks = 0; }
  if (e.staggerMax > 0) {
    if (e.staggerCd > 0) e.staggerCd -= dt;
    if (e.staggerT > 0) { e.staggerT -= dt; if (e.staggerT <= 0) e.stagger = 0; }
    else if (e.stagger > 0 && e.staggerCd <= 0) e.stagger = Math.max(0, e.stagger - 4 * dt);
    const b = world.boss;
    if (e.boss || e.pattern === MINI.flag || e.pattern === MINI.slamFlag) { b.stagger = e.stagger / e.staggerMax; b.staggered = e.staggerT > 0; }
  }
  if (e.freezeT > 0) e.freezeT -= dt;
  if (e.stunT > 0) e.stunT -= dt;
  if (e.fearT > 0) {   // terrified: frozen in place; when it wears off, slowed 30% for a while
    e.fearT -= dt;
    if (e.fearT <= 0) { e.slowT = Math.max(e.slowT, FEAR_SLOW_T); e.slowFactor = Math.max(e.slowFactor, 0.3); }
  }
  if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowFactor = 0; }
  if (e.burnT > 0) {
    e.burnT -= dt;
    if (frameDotTick) damageEnemy(e, e.burnDps * 0.5 * Math.max(1, e.burnStacks), { kind: 'FIRE', dot: true });
    if (e.burnT <= 0) { e.burnDps = 0; e.burnStacks = 0; }
  }
  if (e.state !== 'DYING' && e.poisonT > 0) {
    e.poisonT -= dt;
    if (frameDotTick) damageEnemy(e, e.poisonDps * 0.5, { kind: 'POISON', dot: true });
  }
  if (e.state === 'DYING') return;

  if (contactCd[e.id] > 0) contactCd[e.id] -= dt;

  // ---- AI
  const locked = e.freezeT > 0 || e.stunT > 0 || e.staggerT > 0;
  const fuseBurning = e.kind === 'BOMBER' && e.state === 'WINDUP';
  desiredYaw = Math.atan2(tdx, tdz);
  if (e.pattern === MINI.flag || e.pattern === MINI.slamFlag) { const b = world.boss; b.active = true; b.hp = e.hp; b.maxHp = e.maxHp; }
  if (e.boss) { world.boss.hp = e.hp; }
  bossTel = e.boss;   // boss telegraphs: bigger + faster (reset below)
  if (e.boss && !locked && e.state !== 'SPAWN' && updateBossMech(e, dt)) { stop(e); }   // healing channel: the boss stands still
  else if (!locked || fuseBurning) {
    e.stateT += dt;
    if (e.attackCd > 0) e.attackCd -= dt;
    if ((e.boss || e.mini) && e.state !== 'SPAWN' && hasSpecial(e) && (updateSpecial(e, dt) || tryStartSpecial(e, tdist))) { desiredYaw = Math.atan2(tdx, tdz); if (e.spKind !== 0 && e.spKind === 29) desiredYaw = e.facing; }
    else if (!e.boss && e.state !== 'SPAWN' && hasTrick(e.kind) && (updateTrick(e, dt) || (e.fearT <= 0 && tryStartTrick(e, tdist, tdx / Math.max(tdist, 0.001), tdz / Math.max(tdist, 0.001))))) { stop(e); desiredYaw = Math.atan2(tdx, tdz); }
    else if (e.boss && e.state !== 'SPAWN') updateBoss(e, dt, tdist);
    else if (e.fearT > 0 && !e.boss && e.state !== 'SPAWN') stop(e);   // cowering (stunned-like)
    else runAI(e);
  } else {
    if (e.spKind !== 0) cancelSpecial(e);
    stop(e);
  }
  bossTel = false;
  if (isDying(e)) return; // bomber exploded

  // ---- motion
  const sm = e.slowT > 0 ? Math.max(0.1, 1 - e.slowFactor) : 1;
  const kr = e.mini ? 0 : 1 - ENEMY_DEFS[e.kind].knockResist;   // bosses, mini-bosses and big monsters can't be knocked back
  e.pos.x += (e.vel.x * sm + e.knock.x * kr) * dt;
  e.pos.z += (e.vel.z * sm + e.knock.z * kr) * dt;
  e.knock.x *= frameDecay;
  e.knock.z *= frameDecay;
  if (Math.abs(e.knock.x) < 0.01 && Math.abs(e.knock.z) < 0.01) { e.knock.x = 0; e.knock.z = 0; }

  // ---- collisions
  if (still) { e.pos.x = e.dir.x; e.pos.z = e.dir.z; e.knock.set(0, 0, 0); e.vel.set(0, 0, 0); }   // towers / lakes: pinned to the home spot
  if (!e.boss && !still && e.kind !== 'BOSS_HYDRA_HEAD') separate(e);
  // never inside the hero: monsters stop a little short of its body (they still reach it with their strikes)
  if (world.player.alive && !still && e.kind !== 'BOSS_HYDRA_HEAD') {
    const hx = e.pos.x - world.player.pos.x, hz = e.pos.z - world.player.pos.z, minD = e.radius + 0.55, hd2 = hx * hx + hz * hz;
    if (hd2 < minD * minD) { const hd = Math.sqrt(hd2) || 1e-3; e.pos.x = world.player.pos.x + (hx / hd) * minD; e.pos.z = world.player.pos.z + (hz / hd) * minD; }
  }
  if (e.kind !== 'BAT' && e.kind !== 'WRAITH' && e.kind !== 'BOSS_HYDRA_HEAD' && !still) {
    const pushed = pushOutOfObstacles(e);
    if (pushed && e.slamT > 0 && Math.abs(e.knock.x) + Math.abs(e.knock.z) > 10) wallSlam(e);
    if (pushed && e.spKind === 29 && e.spStep > 0) shellBounce(e);
  }

  const ew = player.earthwall;
  if (ew.active && !e.boss) {
    const dx = e.pos.x - ew.pos.x;
    const dz = e.pos.z - ew.pos.z;
    const r = ew.radius + e.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2);
      if (d < 0.001) e.pos.x += r;
      else { e.pos.x = ew.pos.x + (dx / d) * r; e.pos.z = ew.pos.z + (dz / d) * r; }
    }
  }

  const r2 = e.pos.x * e.pos.x + e.pos.z * e.pos.z;
  if (r2 > bounds.checkR2) {
    const lim = edgeLimit(e.pos.x, e.pos.z, 1);
    if (r2 > lim * lim) {
      const s = lim / Math.sqrt(r2);
      e.pos.x *= s; e.pos.z *= s;
    }
  }
  e.pos.y = 0;

  // ---- facing
  const diff = wrapPi(desiredYaw - e.facing);
  e.facing = wrapPi(e.facing + diff * Math.min(1, (e.kind === 'ROCK_CRAB' ? CRAB.turn : e.kind === 'SHIELDBEARER' && e.state === 'KITE' ? SHIELD.turn : 12) * dt));

  // ---- contact damage
  contactHit(e, locked);
}

// ------------------------------------------------------------ main loop --------
const lodAcc = new Float32Array(MAX_ENEMIES);
let lodTick = 0;

export function updateEnemies(dt: number): void {
  const player = world.player;
  px = player.pos.x;
  pz = player.pos.z;
  frameDt = dt;
  tickBossStrikes(dt);
  if (world.boss.abilityT > 0) world.boss.abilityT -= dt;
  frameDecay = Math.pow(0.85, dt * 60);
  frameDotTick = Math.floor(world.time * 2) !== Math.floor((world.time - dt) * 2);

  anyMinion = false;
  for (const m of world.minions) if (m.active && m.rise <= 0) { anyMinion = true; break; }
  const list = world.enemies;
  let alive = 0;
  const V = world.view;
  const lodOn = V.on && V.r < 1000;
  const lodR2 = (V.r * 1.6) * (V.r * 1.6);
  const baseDecay = frameDecay, baseTick = frameDotTick;
  lodTick++;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active) continue;
    e.pullCount = 0;
    if (e.state === 'DYING') {
      e.deathT += dt;
      e.stateT += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6.5);
      if (e.deathT >= DEATH_TIME) e.active = false;
      continue;
    }
    // AI LOD: enemies well outside the visible area think every 2-4 frames with the accumulated dt
    // (movement/collisions stay correct because motion is integrated with the accumulated step).
    if (lodOn && !e.boss && e.state !== 'SPAWN') {
      const dx = e.pos.x - V.cx, dz = e.pos.z - V.cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > lodR2) {
        const stride = d2 > lodR2 * 4 ? 4 : d2 > lodR2 * 2 ? 3 : 2;
        lodAcc[i] += dt;
        if ((lodTick + i) % stride !== 0) { alive++; continue; }
        const eff = lodAcc[i]; lodAcc[i] = 0;
        frameDt = eff; frameDecay = Math.pow(0.85, eff * 60);
        frameDotTick = Math.floor(world.time * 2) !== Math.floor((world.time - eff) * 2);
        updateEnemy(e);
        frameDt = dt; frameDecay = baseDecay; frameDotTick = baseTick;
        if (e.active && !isDying(e)) alive++;
        continue;
      }
    }
    lodAcc[i] = 0;
    updateEnemy(e);
    if (e.active && !isDying(e)) alive++;
  }
  world.director.aliveCount = alive;

  // rebuild spatial hash for the rest of the frame (combat, skills, pets)
  const grid = world.enemyGrid;
  grid.clear();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.active || e.state === 'DYING' || isUntargetable(e)) continue;
    grid.insert(e.id, e.pos.x, e.pos.z);
  }
}

// ------------------------------------------------------------ enemy projectiles --------
const PROJ_DEFAULTS: Record<EnemyProjectileKind, { life: number; radius: number }> = {
  ARROW: { life: 2.5, radius: 0.35 },
  ORB: { life: 3, radius: 0.4 },
  SLOW_ORB: { life: 2.4, radius: 0.5 },
  BOSS_ORB: { life: 6, radius: 0.5 },
  ROCK: { life: 4, radius: 0.8 },
  FLAME: { life: 4.5, radius: 0.55 },
  AXE: { life: 3, radius: 0.75 },
};

export function fireEnemyProjectile(
  from: Vector3, dir: Vector3, kind: EnemyProjectileKind, speed: number, damage: number,
  opts?: { homing?: number; slow?: number; radius?: number; life?: number; debuff?: number },
): void {
  const p = allocEnemyProjectile();
  if (!p) return;
  const def = PROJ_DEFAULTS[kind];
  p.active = true;
  p.kind = kind;
  p.pos.set(from.x, from.y > 0.5 ? from.y : 1.1, from.z);
  p.vel.set(dir.x * speed, dir.y * speed, dir.z * speed);
  p.life = opts?.life ?? def.life;
  p.damage = damage;
  p.radius = opts?.radius ?? def.radius;
  p.homing = opts?.homing ?? 0;
  p.slow = opts?.slow ?? 0;
  p.debuff = opts?.debuff ?? 0;
}

export function updateEnemyProjectiles(dt: number): void {
  const player = world.player;
  const ppx = player.pos.x;
  const ppz = player.pos.z;
  const ew = player.earthwall;
  const obs = world.obstacles;

  // orbital blades (player projectiles) shoot down enemy projectiles
  let blades = 0;
  const plist = world.projectiles;
  for (let i = 0; i < plist.length; i++) {
    const b = plist[i];
    if (b.active && b.kind === 'ORBITAL_BLADE') {
      bladeX[blades] = b.pos.x; bladeZ[blades] = b.pos.z; blades++;
    }
  }

  const list = world.enemyProjectiles;
  const maxR = ARENA_RADIUS + 15;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.active) continue;

    if (p.homing > 0 && player.alive) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const cur = Math.atan2(p.vel.x, p.vel.z);
      const want = Math.atan2(ppx - p.pos.x, ppz - p.pos.z);
      const maxTurn = p.homing * dt;
      const step = Math.max(-maxTurn, Math.min(maxTurn, wrapPi(want - cur)));
      p.vel.x = Math.sin(cur + step) * speed;
      p.vel.z = Math.cos(cur + step) * speed;
    }

    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
    p.life -= dt;
    if (p.life <= 0 || p.pos.x * p.pos.x + p.pos.z * p.pos.z > maxR * maxR) { p.active = false; continue; }

    // earthwall dome
    if (ew.active) {
      const dx = p.pos.x - ew.pos.x;
      const dz = p.pos.z - ew.pos.z;
      if (dx * dx + dz * dz < ew.radius * ew.radius) {
        p.active = false;
        events.emit('projectileImpact', { pos: p.pos, kind: 'ENEMY' });
        continue;
      }
    }

    // orbital blades
    let shot = false;
    for (let b = 0; b < blades; b++) {
      const dx = p.pos.x - bladeX[b];
      const dz = p.pos.z - bladeZ[b];
      if (dx * dx + dz * dz < 1.44) { shot = true; break; }
    }
    if (shot) {
      p.active = false;
      events.emit('projectileImpact', { pos: p.pos, kind: 'ENEMY' });
      continue;
    }

    // solid obstacles
    let blocked = false;
    for (let k = 0; k < obs.length; k++) {
      const o = obs[k];
      if (!o.blocksProjectiles) continue;
      const dx = p.pos.x - o.pos.x;
      const dz = p.pos.z - o.pos.z;
      if (dx * dx + dz * dz < o.radius * o.radius) { blocked = true; break; }
    }
    if (blocked) {
      p.active = false;
      events.emit('projectileImpact', { pos: p.pos, kind: 'ENEMY' });
      continue;
    }

    // necromancer minions body-block shots
    if (anyMinion && p.damage > 0) {
      let hitM = -1;
      const M = world.minions;
      for (let k = 0; k < M.length; k++) {
        const m = M[k];
        if (!m.active || m.rise > 0) continue;
        const dx = p.pos.x - m.x, dz = p.pos.z - m.z, r = p.radius + (m.kind === 2 ? 1.9 : 0.65);
        if (dx * dx + dz * dz < r * r) { hitM = k; break; }
      }
      if (hitM >= 0) {
        p.active = false;
        damageMinion(hitM, p.damage);
        events.emit('projectileImpact', { pos: p.pos, kind: 'ENEMY' });
        continue;
      }
    }

    // player hit (dashing / i-frames let projectiles pass through)
    if (player.alive && player.invulnT <= 0 && p.damage > 0) {
      const dx = p.pos.x - ppx;
      const dz = p.pos.z - ppz;
      const r = p.radius + 0.7;
      if (dx * dx + dz * dz < r * r) {
        p.active = false;
        damagePlayer(p.damage, { pos: p.pos, kind: 'PHYSICAL', slow: p.slow });
        if (p.debuff === 1) { if (applyPlayerDebuff('ROOT', 0.8)) events.emit('trick', { pos: p.pos.clone(), kind: 'PIN_HIT', radius: 1 }); }
        else if (p.debuff === 2) applyPlayerDebuff('BURN', 2.5, Math.max(2, p.damage * 0.12));
        events.emit('projectileImpact', { pos: p.pos, kind: 'ENEMY' });
      }
    }
  }
}
