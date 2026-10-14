// ============================================================================
// ENGINE CONTRACT — the single mutable world. Engine writes, render/UI read.
// Pools are preallocated; "spawn*" helpers grab a free slot (or return null).
// Renderers iterate `world.<pool>` and skip `!active`.
// ============================================================================
import { Vector3 } from 'three';
import type {
  Enemy, Projectile, GroundFx, EnemyProjectile, Zone, Pickup, Obstacle, Crate,
  PlayerRuntime, DirectorState, RoomState, BossHud, RunStats, CameraState, InputState,
} from './types';
import { SpatialGrid } from './grid';

export const ARENA_RADIUS = 100;        // playable radius (irregular edge is visual)
export const TOWN_CENTER = new Vector3(0, 0, 6); // town centre (terrain tint region; layout in townData.ts)
export const MAX_ENEMIES = 400;
export const ROOM_MAX_ALIVE = 36;     // enemies alive at once inside a room
export const MAX_PROJECTILES = 900;
export const MAX_ENEMY_PROJECTILES = 600;
export const MAX_ZONES = 192;
export const MAX_PICKUPS = 500;
export const MAX_FX = 420;
export const MAX_CRATES = 96;
export const SHRINE_POS: [number, number, number] = [-36.5, 0, 2]; // fortune teller (summons) - the old shrine is gone
export const TRAINER_POS: [number, number, number] = [17, 0, -13]; // skill trainer
export const QUEST_POS: [number, number, number] = [7.5, 0, -13]; // quest giver + notice board (beside the castle path)

const v = () => new Vector3();

function makeEnemy(id: number): Enemy {
  return {
    id, active: false, kind: 'SLIME', elite: false, affix: 'NONE', boss: false,
    pos: v(), vel: v(), knock: v(), facing: 0, dir: v(),
    hp: 1, maxHp: 1, shield: 0, speed: 1, radius: 0.6, scale: 1,
    contactDamage: 0, projectileDamage: 0, xp: 0, gold: 0,
    state: 'SPAWN', stateT: 0, attackCd: 0, animT: 0, hitFlash: 0, deathT: 0,
    burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0, freezeT: 0, stunT: 0, fearT: 0, slowT: 0, slowFactor: 0,
    armor: 0, armorBreakT: 0, burnStacks: 0, burnStackCd: 0, mini: false, stagger: 0, staggerMax: 0, staggerT: 0, staggerCd: 0,
    trickCd: 0, trickT: 0, trickKind: 0, slamDmg: 0, slamT: 0, chillStacks: 0, chillT: 0, frostT: 0, spKind: 0, spT: 0, spStep: 0, spCd: 0, decoy: false, hideT: 0, shellT: 0,
    phase: 0, pattern: 0, patternT: 0, angle: 0, pullCount: 0,
  };
}

function makeProjectile(id: number): Projectile {
  return {
    id, active: false, kind: 'ARROW', pos: v(), vel: v(), life: 0, maxLife: 1,
    damage: 0, radius: 0.5, aoeRadius: 0, pierce: 1, bounces: 0, knockback: 0,
    effect: undefined, hitIds: [], state: 0, spin: 0, homing: 0, trailT: 0, procLv: 0, emp: false,
  };
}

function makeEnemyProjectile(id: number): EnemyProjectile {
  return { id, active: false, kind: 'ORB', pos: v(), vel: v(), life: 0, damage: 0, radius: 0.4, homing: 0, slow: 0, debuff: 0 };
}

function makeZone(id: number): Zone {
  return {
    id, active: false, kind: 'FIRE', hostile: false, pos: v(), dir: v(), radius: 1, length: 0,
    life: 0, maxLife: 1, damage: 0, tickT: 0, maxPull: 0, color: 0xffffff,
    permanent: false, period: 0, activeFor: 0, trick: 0, aux: 0,
  };
}

function makeFx(id: number): GroundFx {
  return { id, active: false, kind: 'RAIN_ARROW', x: 0, z: 0, sx: 0, sz: 0, t: 0, delay: 0, life: 1, radius: 1, dmg: 0, aux: 0, seed: 0, done: false, launch: false, color: 0xffffff };
}

function makePickup(id: number): Pickup {
  return { id, active: false, kind: 'XP', pos: v(), vel: v(), value: 0, item: null, t: 0, magnet: false };
}

function makeCrate(id: number): Crate {
  return { id, active: false, kind: 'CRATE', pos: v(), hp: 1, maxHp: 1, rot: 0, hitFlash: 0, respawnT: 0 };
}

function makePlayer(): PlayerRuntime {
  return {
    alive: true, pos: v(), vel: v(), facing: 0, aim: new Vector3(0, 0, -10),
    hp: 100, mana: 100,
    dashT: 0, dashDir: v(), dashIframes: true, dashCharges: 1, maxDashCharges: 1, dashCd: 0, dashCdMax: 4,
    cd: { q: 0, e: 0, s3: 0, s4: 0 }, cdMax: { q: 7, e: 6, s3: 9, s4: 11 },
    ult: 0, ultT: 0, cryT: 0, buffT: 0, buffDmg: 0, buffDef: 0, buffHaste: 0, titanT: 0, whirlT: 0, air: 0,
    shieldCharges: 1, maxShieldCharges: 1, shieldCd: 0, shieldCdMax: 40,
    invulnT: 0, hawkT: 0, rageT: 0, sprintT: 0, vitalityT: 0,
    earthwall: { active: false, pos: v(), t: 0, radius: 10 },
    stunT: 0, rootT: 0, silenceT: 0, defDownT: 0, blindT: 0,
    burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0, bleedT: 0, bleedDps: 0, dotAcc: 0,
    slowT: 0, hpPotCd: 0, mpPotCd: 0, petReviveCd: 0,
    fireT: 0, levelUpFx: 0, reviveFx: 0,
    anim: { moveBlend: 0, stepPhase: 0, attackT: 0, castT: 0, hurtT: 0, dashing: false },
  };
}

/** Default camera elevation (the classic 32 up / 22 back framing). */
export const CAM_PITCH0 = Math.atan2(32, 22);

export const world = {
  time: 0,              // total simulated seconds (only advances while PLAYING)
  frame: 0,
  player: makePlayer(),
  // state: 0 FOLLOW, 1 FETCH, 2 ATTACK. carry = PickupKind being carried back (cosmetic), carryT = seconds left.
  pet: { pos: new Vector3(-1.5, 1, 1.5), facing: 0, attackT: 0, skillT: 0, state: 0, carry: '' as string, carryT: 0, sparkT: 0, atkCd: 0, stage: 1, xpBuf: 0 },

  enemies: Array.from({ length: MAX_ENEMIES }, (_, i) => makeEnemy(i)),
  projectiles: Array.from({ length: MAX_PROJECTILES }, (_, i) => makeProjectile(i)),
  enemyProjectiles: Array.from({ length: MAX_ENEMY_PROJECTILES }, (_, i) => makeEnemyProjectile(i)),
  zones: Array.from({ length: MAX_ZONES }, (_, i) => makeZone(i)),
  fx: Array.from({ length: MAX_FX }, (_, i) => makeFx(i)),
  pickups: Array.from({ length: MAX_PICKUPS }, (_, i) => makePickup(i)),
  crates: Array.from({ length: MAX_CRATES }, (_, i) => makeCrate(i)),
  /** Temporary crystal wall segments (circle colliders registered in mapgen). */
  walls: Array.from({ length: 40 }, () => ({ active: false, x: 0, z: 0, r: 1.3, t: 0, life: 4, rot: 0, rock: false, collider: null as null | object })),
  obstacles: [] as Obstacle[],           // regenerated per run (mapgen)
  obstaclesVersion: 0,                   // bump when obstacles array is replaced
  itemPickupsVersion: 0,                 // bump when an ITEM pickup spawns/despawns (labels re-render)

  enemyGrid: new SpatialGrid(6, ARENA_RADIUS + 40, MAX_ENEMIES),

  director: {
    wave: 1, phase: 'FIGHT', phaseT: 0, maxAlive: ROOM_MAX_ALIVE, aliveCount: 0, bossId: -1,
  } as DirectorState,
  /** The current run room (a disc around 0,0). Only one room exists at a time; the director rebuilds it on every room change. */
  room: {
    active: false, version: 0, seed: 0, biome: 0, index: 0, plan: { type: 'COMBAT', reward: 'CARD' }, radius: 24,
    fade: 1, fadeTarget: 0, enemiesLeft: 0,
    portals: Array.from({ length: 3 }, () => ({ active: false, x: 0, z: 0, t: 0, plan: { type: 'COMBAT', reward: 'CARD' } })),
    markers: Array.from({ length: 48 }, () => ({ active: false, x: 0, z: 0, t: 0, dur: 1, kind: 'SLIME', elite: false, tag: 0 })),
    station: { kind: 'NONE', x: 0, z: 0, used: false, ready: false },
    shrineOn: false, hint: '',
  } as RoomState,
  /** Town state (harvest node cooldown). */
  village: { harvestCd: 0, area: 'TOWN' as 'TOWN' | 'CASTLE', areaVer: 0, fade: 0, pending: '' as '' | 'ENTER' | 'LEAVE', spawnFx: 0,
    // click-to-walk: follow waypoints wp[0..n) (current = i, (x, z) = the waypoint being walked to), then do `act`
    go: { on: false, x: 0, z: 0, r: 1.5, t: 0, tmax: 10, tab: '' as string, act: 'shop' as 'shop' | 'castle' | 'leave' | 'npc' | 'tower' | 'none', npc: -1, wp: new Float32Array(16), n: 0, i: 0 } },   // spawnFx: arrival light pillar 1 -> 0
  boss: { active: false, stagger: 0, staggered: false, ability: '', abilityT: 0, name: '', title: '', hp: 0, maxHp: 1, phase: 0, sx: 0, sy: 0, onScreen: false } as BossHud,
  run: { kills: 0, eliteKills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, goldEarned: 0, xpEarned: 0, time: 0, highestHit: 0 } as RunStats,
  camera: { trauma: 0, zoom: 1, yaw: 0, pitch: CAM_PITCH0, dist: 1 } as CameraState,
  input: { keys: {}, pressed: {}, pointerNdc: { x: 0, y: 0 }, mouseDown: false, joy: { x: 0, z: 0, active: false }, aimStick: { x: 0, z: 0, active: false }, touchAim: { active: false, id: '', dx: 0, dz: 0, mag: 0, cancel: false }, cancelAim: false } as InputState,
  /** Visible ground rectangle (camera frustum ∩ ground plane + margin). Written by render/CameraRig every frame; read by renderers and the AI LOD. */
  view: { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5, cx: 0, cz: 0, r: 1e5, on: false },
};

export type World = typeof world;

// ------------------------------------------------------------ pool helpers --
// Round-robin cursors so we don't rescan from 0 every spawn.
const cursors = { e: 0, p: 0, ep: 0, z: 0, pk: 0, fx: 0 };

function grab<T extends { active: boolean }>(pool: T[], key: keyof typeof cursors): T | null {
  const n = pool.length;
  let i = cursors[key];
  for (let k = 0; k < n; k++) {
    const item = pool[i];
    i = i + 1 === n ? 0 : i + 1;
    if (!item.active) { cursors[key] = i; return item; }
  }
  return null;
}

/** Returns a free enemy slot with all transient fields reset. Caller sets kind/stats and `active = true`. */
export function allocEnemy(): Enemy | null {
  const e = grab(world.enemies, 'e');
  if (!e) return null;
  const id = e.id;
  Object.assign(e, makeEnemy(id), { pos: e.pos.set(0, 0, 0), vel: e.vel.set(0, 0, 0), knock: e.knock.set(0, 0, 0), dir: e.dir.set(0, 0, 0) });
  e.animT = Math.random() * 10;
  return e;
}

export function allocProjectile(): Projectile | null {
  const p = grab(world.projectiles, 'p');
  if (!p) return null;
  p.hitIds.length = 0; p.state = 0; p.spin = 0; p.homing = 0; p.trailT = 0; p.procLv = 0; p.emp = false;
  p.bounces = 0; p.aoeRadius = 0; p.effect = undefined; p.knockback = 0; p.radius = 0.5;
  return p;
}

export function allocEnemyProjectile(): EnemyProjectile | null {
  const p = grab(world.enemyProjectiles, 'ep');
  if (!p) return null;
  p.homing = 0; p.slow = 0; p.radius = 0.4; p.debuff = 0;
  return p;
}

export function allocZone(): Zone | null {
  const z = grab(world.zones, 'z');
  if (!z) return null;
  z.tickT = 0; z.maxPull = 0; z.length = 0; z.dir.set(0, 0, 1); z.hostile = false;
  z.permanent = false; z.period = 0; z.activeFor = 0; z.trick = 0; z.aux = 0;
  return z;
}

export function allocFx(): GroundFx | null {
  const f = grab(world.fx, 'fx');
  if (!f) return null;
  f.t = 0; f.done = false; f.launch = false; f.aux = 0; f.sx = f.sz = 0; f.seed = Math.random(); f.color = 0xffffff;
  return f;
}

export function allocPickup(): Pickup | null {
  const p = grab(world.pickups, 'pk');
  if (!p) return null;
  p.item = null; p.t = 0; p.magnet = false; p.vel.set(0, 0, 0);
  return p;
}

/** Deactivate every pooled entity (run start / return to menu). */
export function clearWorld(): void {
  for (const e of world.enemies) e.active = false;
  for (const p of world.projectiles) p.active = false;
  for (const p of world.enemyProjectiles) p.active = false;
  for (const z of world.zones) z.active = false;
  for (const f of world.fx) f.active = false;
  for (const p of world.pickups) p.active = false;
  world.itemPickupsVersion++;
  Object.assign(world.player, makePlayer(), { aim: world.player.aim, pos: world.player.pos.set(0, 0, 0) });
  world.boss.active = false; world.boss.staggered = false; world.boss.stagger = 0;
  for (const w of world.walls) w.active = false;
  world.camera.trauma = 0;
  Object.assign(world.run, { kills: 0, eliteKills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, goldEarned: 0, xpEarned: 0, time: 0, highestHit: 0 });
  world.time = 0;
}
