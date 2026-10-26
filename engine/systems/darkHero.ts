// ============================================================================
// Dark hero champions: a shadow copy of a hero class that fights the player alone (DUEL rooms, the Gate of Shadows).
// One kind ('DARK_HERO') with five class kits. Each kit is the REAL hero kit of that class (same skill names, shapes,
// projectiles and statuses: abilityDefs.ts / systems/abilities.ts), turned into fair enemy attacks with telegraphs:
//   ARCHER      arrows (every 6th a burning / freezing arrow) | Gale Arrow (giant piercing wind arrow, tornado trail,
//               armor break) | Lightpiercer (charged white arrow down a long thin lane) | Frost Field (3 frost traps ->
//               slowing ice fields) | dash Shadow Roll (rolls away, arrow cluster explodes behind) | ult Storm of a
//               Thousand Arrows (arrows rain in a huge circle, a final volley ends it)
//   WIZARD      arcane orbs (every 6th calls Thunder) | Fireballs (3 huge slow piercing fireballs, burn + fire trail) |
//               Storm Orbs (3 lightning orbs orbit it and zap you when close) | Singularity (black hole: pull + slow +
//               damage) | dash Blink Nova (frost nova at both ends, may freeze) | ult Meteor Cataclysm (colossal
//               meteor, 2 fire rings, molten crater with lava spouts)
//   BARBARIAN   thrown boomerang axes + melee (every 6th throw a Stamp) | Cross Slash (rolling burning X) | Whirlwind
//               (spins, tugs you in, heals on hits) | Earthsplitter (fissure of stone spikes, stun) | Blood Cleave (close
//               double crescent slash) | Ground Rupture (3 lanes of erupting spikes) | dash Bloodrage Leap (slam + Rage) |
//               ult Titan's Wrath (terrifying roar, giant form with quaking steps, final slam)
// Spacing: melee champions hold ~2.2-2.8 u from the hero (their weapon reach), circle-strafe between attacks and step back
// after a combo; casters kite at range. keepApart() hard-separates the bodies so a champion never sits inside the hero.
//   KNIGHT      sword arcs (every 6th a Smite ray) | Holy Wave (wide crescent) | Shield Wall (burst, then -50% damage
//               taken + slow heal) | Judgment (holy rays strike around you one after another, stun) | dash Holy Charge
//               (invulnerable charge) | ult Divine Avatar (column of light, then 8 s radiant: faster, stronger, every
//               swing releases a Holy Wave)
//   NECROMANCER soul bolts | Raise Dead (skeleton warriors / archers / mages, hostile) | Bone Ward (bone shield on its
//               skeletons, 30% of their max HP, like the hero's) |
//               Plague Ground (cursed field: poison + slow) | dash Soul Step (blink, bone burst behind) | ult Army of
//               the Dead (a bone golem crashes down and fights for 20 s)
// The ultimate unlocks below 60% HP (long cooldown, big telegraph, its name on the boss bar). Every cast names the skill
// on the boss bar (world.boss.ability).
// State machine on the Enemy (CHASE/KITE -> WINDUP -> ATTACK -> RECOVER); e.pattern = skill id (1..3 skills, 4 dash,
// 5 ultimate, 6 a telegraphed basic swing). Only one dark hero exists at a time: its per-fight memory lives in the module
// object `S`; world effects (shots, fields, delayed strikes, rain, storm orbs) tick in tickDarkHero() even while the
// champion itself is staggered. Render reads `darkView` / `darkShots` / `darkOrbs`. Pure engine code, no per-frame
// allocations (pools + scratch vectors; Vector3 clones only for discrete events).
// ============================================================================
import { Vector3 } from 'three';
import { world, allocEnemyProjectile, allocZone, allocFx } from '../world';
import { events } from '../events';
import type { Enemy, EnemyProjectile, GroundFx, GroundFxKind, Zone, ZoneKind } from '../types';
import type { HeroClass } from '../../types';
import { ENEMY_DEFS, waveHpMult } from '../enemyDefs';
import { damagePlayer, applyPlayerDebuff, knockHero, KB, staggerView, killEnemy, playerTrickImmune, freezePlayer } from './combat';
import { enter, requestYaw, fireEnemyProjectile, spawnEnemy, rollEliteShield, levelHpMul, spawnTelegraphCircle, spawnTelegraphLine, poofAllEnemies, strikeT } from './enemies';
import { hooks } from './hooks';
import { spawnPickup, dropCrystals } from './pickups';
import { dropLoot } from './loot';
import { towerMode, towerCrystals } from './combat';
import { spawnHostileZone } from './tricks';
import { spawnWave, WAVE_FIRE, BT } from './bossFx';
import { useGameStore, rollDropPlus } from '../../store';
import { runMods } from '../runMods';
import { rarityForDepth } from '../roomDefs';
import { edgeLimit } from '../mapgen';
import type { DamageKind } from '../events';

export const DARK_CLASSES: readonly HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
export const DARK_NAMES: Record<HeroClass, { name: string; title: string }> = {
  ARCHER: { name: 'The Dark Ranger', title: 'Shadow of the Bow' },
  WIZARD: { name: 'The Dark Archmage', title: 'Shadow of the Arcane' },
  BARBARIAN: { name: 'The Dark Berserker', title: 'Shadow of the Axe' },
  KNIGHT: { name: 'The Fallen Paladin', title: 'Shadow of the Oath' },
  NECROMANCER: { name: 'The Dark Necromancer', title: 'Shadow of the Grave' },
};
const RANGED: Record<HeroClass, boolean> = { ARCHER: true, WIZARD: true, BARBARIAN: false, KNIGHT: false, NECROMANCER: true };

/** Pattern ids (e.pattern): 1..3 the class skills (keys 1-3 of the hero), then the class dash, the ultimate, a basic swing. */
const DASH = 4, ULT = 5, SWING = 6, CLEAVE = 9, RUPTURE = 10;   // (the dark berserker's signature moves. NOT 7 / 8: enemies.ts reserves e.pattern 7 / 8 for the mini-boss slam (MINI.flag / slamFlag) and hijacked the cast)
/** Cooldowns (s) per class: [basic, skill 1, skill 2, skill 3, dash, ultimate]. */
const CD: Record<HeroClass, number[]> = {
  ARCHER: [1.1, 7, 8, 11, 5, 30],
  WIZARD: [1.6, 9, 14, 12, 6, 32],
  BARBARIAN: [1.4, 6.9, 12, 10, 6, 32, 0, 0, 0, 7, 11],   // (Cross Slash +15% like the hero's)
  KNIGHT: [1.1, 5.5, 13, 9, 6, 32],
  NECROMANCER: [1.4, 11, 14, 12, 6, 34],   // (Raise Dead 11 s, Bone Ward 14 s like the hero's)
};
/** Skill names shown on the boss bar (same names as the hero's kit). */
const NAMES: Record<HeroClass, string[]> = {
  ARCHER: ['', 'Gale Arrow!', 'Lightpiercer!', 'Frost Field!', 'Shadow Roll!', 'Storm of a Thousand Arrows!'],
  WIZARD: ['', 'Fireballs!', 'Storm Orbs!', 'Singularity!', 'Blink Nova!', 'Meteor Cataclysm!'],
  BARBARIAN: ['', 'Cross Slash!', 'Whirlwind!', 'Earthsplitter!', 'Bloodrage Leap!', "Titan's Wrath!", '', '', '', 'Blood Cleave!', 'Ground Rupture!'],
  KNIGHT: ['', 'Holy Wave!', 'Shield Wall!', 'Judgment!', 'Holy Charge!', 'Divine Avatar!'],
  NECROMANCER: ['', 'Raise Dead!', 'Bone Ward!', 'Plague Ground!', 'Soul Step!', 'Bone Golem!'],
};
/** The ultimate unlocks below this share of HP (a longer fight: it opens earlier). */
const ULT_HP = 0.72;
/** Dark hero HP multiplier on top of the old 5x-elite formula (owner: they died in seconds next to bosses). */
export const DARK_HERO_HP = 3;
/** (owner 2026-10-26) the longer fight stays busy: every skill comes back in ~60% of the old time, the ultimate in 70%, with a shorter pause between casts. */
const SKILL_CD_MUL = 0.6, ULT_CD_MUL = 0.7;

// shadow palette (telegraphs / fields): violet base, class accents kept readable
const C_VIOLET = 0xa04aff, C_ICE = 0x8fd8ff, C_FIRE = 0xff6a3a, C_BLOOD = 0xff3a5a, C_HOLY = 0xe8b8ff, C_BONE = 0xc8b0ff, C_LIGHT = 0xf0e0ff;

/** Read by render/DarkHero.tsx. atk / cast / ult are pulse counters (a change = play the one-shot). */
export const darkView = {
  id: -1, cls: 'KNIGHT' as HeroClass, atk: 0, cast: 0, ult: 0, air: 0, spin: 0, spinR: 4.5, guard: 0, enraged: 0,
  dash: 0,       // a dash / roll / charge / leap is running (afterimage trail)
  slash: 0, slashX: 0, slashZ: 0, slashYaw: 0,   // (legacy crescent pulse, unused: Holy Wave is a real shot now)
  charge: 0,     // 0..1 charging a ball of light / fire in front of the hero (Lightpiercer, Fireballs, Bone Spear...)
  avatar: 0,     // Divine Avatar running
  titan: 0,      // Titan's Wrath running
  rage: 0,       // Bloodrage running
  orbR: 0,       // Storm Orbs zap radius (0 = off)
};

/** Skill shots (own pool, own collision: they pierce and hit the hero once). Tags drive the render look. */
export const SHOT_GALE = 1, SHOT_LIGHT = 2, SHOT_FIRE = 3, SHOT_XSLASH = 4, SHOT_HOLY = 5, SHOT_BONE = 6, SHOT_SLASH = 7, SHOT_CLEAVE = 8;
export interface DarkShot { active: boolean; tag: number; x: number; z: number; vx: number; vz: number; life: number; maxLife: number; r: number; dmg: number; hit: boolean; trail: number; n: number; big: boolean }
export const darkShots: DarkShot[] = Array.from({ length: 20 }, () => ({ active: false, tag: 0, x: 0, z: 0, vx: 0, vz: 0, life: 0, maxLife: 1, r: 1, dmg: 0, hit: false, trail: 0, n: 0, big: false }));
/** Storm Orbs (wizard): positions written each frame while they spin. */
export const darkOrbs = { n: 0, x: [0, 0, 0], z: [0, 0, 0] };

const S = {
  id: -1, cls: 'KNIGHT' as HeroClass,
  cd: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], gap: 0, strafe: 1, strafeT: 0, backT: 0, comboN: 0, jab: false, baseRadius: 1,
  wind: 0, act: 0, dirX: 0, dirZ: 1, fromX: 0, fromZ: 0, toX: 0, toZ: 0, tick: 0, len: 0, flag: false,
  basicN: 0, inv: 0, blockText: 0, mul: 1, baseScale: 1.2, baseSpeed: 4.6,
  rainT: 0, rainX: 0, rainZ: 0, rainAcc: 0,
  orbT: 0, orbTick: 0,
  titanT: 0, stepT: 0, avatarT: 0, guardT: 0, rageT: 0,
  golemId: -1, golemT: 0, ultArmed: false, spikeHit: false, healAcc: 0,
};
const axes: (EnemyProjectile | null)[] = [null, null, null];
const axeT = [0, 0, 0];
const rainX = [0, 0, 0], rainZ = [0, 0, 0];   // Raise Dead: the rising spots
const tmp = new Vector3(), tmp2 = new Vector3(), dirV = new Vector3(), fxPos = new Vector3();

/** Delayed effects shown by a telegraph (kind 0 strike circle, 1 fire ring wave). */
const STUN = 1, SLOW = 2, BURN = 4, FREEZE = 8, POISON = 16, KNOCK = 32;
interface Pending { active: boolean; t: number; kind: number; x: number; z: number; r: number; dmg: number; eff: number; fx: string; dk: DamageKind }
const pend: Pending[] = Array.from({ length: 24 }, () => ({ active: false, t: 0, kind: 0, x: 0, z: 0, r: 0, dmg: 0, eff: 0, fx: '', dk: 'PHYSICAL' as DamageKind }));
/** Hostile copies of the hero's fields (zones.ts skips them; their effect on the hero is applied here). */
interface Field { z: Zone | null; kind: ZoneKind; dmg: number; tick: number }
const fields: Field[] = Array.from({ length: 16 }, () => ({ z: null, kind: 'TORNADO' as ZoneKind, dmg: 0, tick: 0 }));

const pdmg = (e: Enemy) => Math.max(6, e.projectileDamage) * S.mul;
const mdmg = (e: Enemy) => Math.max(8, e.contactDamage) * S.mul;
/** The champion's power unit: projectile damage for casters, melee damage for fighters. */
const pw = (e: Enemy) => (RANGED[S.cls] ? pdmg(e) : mdmg(e));

// ------------------------------------------------------------- spawning ------
/** Spawns a dark hero of class `cls` at (x, z) with a boss bar. HP ~ 5x an elite of the current depth. */
export function spawnDarkHero(cls: HeroClass, x: number, z: number): Enemy | null {
  const e = spawnEnemy('DARK_HERO', tmp.set(x, 0, z));
  if (!e) return null;
  const st = useGameStore.getState();
  const mods = runMods(st.difficulty);
  const wave = world.director.wave;
  // (owner 2026-10-26 'dark heroes die in seconds next to bosses') x DARK_HERO_HP on the old elite-based formula (scales with the hero's level too)
  e.maxHp = Math.round(ENEMY_DEFS.DARK_HERO.hp * waveHpMult(wave) * mods.hp * 5 * DARK_HERO_HP * levelHpMul()); e.hp = e.maxHp;
  e.mini = true; e.staggerMax = 80; e.armor = Math.round(e.armor * 1.25);
  rollEliteShield(e);
  e.xp *= 20; e.pattern = 0;
  e.radius = 1.0;   // (a body that reads as the model's size: bigger standoff + melee reach, see keepApart / aiDarkHero)
  if (!RANGED[cls]) { e.contactDamage *= 1.25; e.speed *= 1.08; }
  else e.contactDamage *= 0.6;
  resetFight();
  S.id = e.id; S.cls = cls; S.baseScale = e.scale; S.baseSpeed = e.speed; S.baseRadius = e.radius;
  const c = CD[cls];
  S.cd[0] = 1.2; S.cd[1] = c[1] * 0.4; S.cd[2] = c[2] * 0.6; S.cd[3] = c[3] * 0.5; S.cd[DASH] = 2.5; S.cd[ULT] = 999; S.cd[SWING] = 0; S.gap = 1.2;
  S.strafe = Math.random() < 0.5 ? 1 : -1; S.strafeT = 2;
  if (cls === 'BARBARIAN') { S.cd[CLEAVE] = 3; S.cd[RUPTURE] = 7; }
  if (cls === 'NECROMANCER') S.cd[1] = 2.5;   // opens with Raise Dead
  if (cls === 'WIZARD') S.cd[2] = 5;
  darkView.id = e.id; darkView.cls = cls;
  const names = DARK_NAMES[cls];
  const b = world.boss;
  b.active = true; b.name = names.name; b.title = names.title; b.hp = e.hp; b.maxHp = e.maxHp; b.phase = 0; b.ability = ''; b.abilityT = 0;
  events.emit('bossSpawn', { name: names.name, title: names.title });
  events.emit('shake', { amount: 0.35 });
  return e;
}

function resetFight(): void {
  S.inv = 0; S.mul = 1; S.rainT = 0; S.orbT = 0; S.titanT = 0; S.avatarT = 0; S.guardT = 0; S.rageT = 0; S.golemId = -1; S.golemT = 0;
  S.ultArmed = false; S.basicN = 0; S.flag = false; S.healAcc = 0; wardT = 0; S.backT = 0; S.comboN = 0; S.jab = false;
  for (let i = 0; i < axes.length; i++) { const a = axes[i]; if (a && a.kind === 'AXE') a.active = false; axes[i] = null; }
  for (const s of darkShots) s.active = false;
  for (const p of pend) p.active = false;
  for (const f of fields) { if (f.z && f.z.hostile && f.z.kind === f.kind) f.z.active = false; f.z = null; }
  darkOrbs.n = 0;
  darkView.air = 0; darkView.spin = 0; darkView.guard = 0; darkView.enraged = 0; darkView.charge = 0; darkView.avatar = 0; darkView.titan = 0; darkView.rage = 0; darkView.orbR = 0; darkView.dash = 0;
}

/** Called from enemies.onEnemyDeath: rewards, raised skeletons crumble, boss bar off. */
export function darkHeroDied(e: Enemy): void {
  if (e.id !== S.id) {   // one of its raised dead (or the golem)
    if (e.id === S.golemId) S.golemId = -1;
    return;
  }
  S.id = -1;
  resetFight();
  e.scale = S.baseScale; e.radius = S.baseRadius;
  world.boss.active = false; world.boss.hp = 0; world.boss.abilityT = 0;
  poofAllEnemies();   // a duel: whatever it raised goes down with it
  events.emit('shake', { amount: 0.7 });
  events.emit('explosion', { pos: e.pos, radius: 5, color: 0x8b3dff });
  events.emit('floatText', { pos: e.pos, text: 'CHAMPION DEFEATED', color: 0xc9a2ff, scale: 1.1, dy: 2.6 });
  const st = useGameStore.getState();
  const wave = world.director.wave;
  const luck = 2.4 * (1 + wave * 0.02);
  if (towerMode()) {   // tower modes (the tower's champion floors): crystals instead of loot / gear
    dropCrystals(towerCrystals(true, false, false, wave), e.pos);
    for (let i = 0; i < 6; i++) spawnPickup('GOLD', tmp.set(e.pos.x + (Math.random() - 0.5) * 3, 0, e.pos.z + (Math.random() - 0.5) * 3), 12 + wave);
    return;
  }
  dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
  const r1 = rarityForDepth(wave, 0.5, world.run.bossKills);
  const it1 = rollDropPlus(st.rollItemDrop(r1), 1);
  if (it1) spawnPickup('ITEM', tmp.set(e.pos.x - 0.8, 0, e.pos.z), 0, it1);
  const r2 = rarityForDepth(wave, 0.8, world.run.bossKills);
  const it2 = rollDropPlus(st.rollItemDrop(r2 === 'COMMON' || r2 === 'RARE' ? 'EPIC' : r2), 1);   // a champion always leaves something good
  if (it2) spawnPickup('ITEM', tmp.set(e.pos.x + 0.8, 0, e.pos.z), 0, it2);
  for (let i = 0; i < 2; i++) spawnPickup('GEM', tmp.set(e.pos.x, 0, e.pos.z), 2 + Math.floor(wave / 8));
  for (let i = 0; i < 6; i++) spawnPickup('GOLD', tmp.set(e.pos.x + (Math.random() - 0.5) * 3, 0, e.pos.z + (Math.random() - 0.5) * 3), 12 + wave);
}

// Shadow Roll / Holy Charge are invulnerable (as for the hero); Shield Wall: -50% damage taken.
hooks.heroMul = (e: Enemy): number => {
  if (e.id !== S.id) return 1;
  if (S.inv > 0) return 0;
  if (S.guardT > 0) {
    if (world.time - S.blockText > 0.6) { S.blockText = world.time; events.emit('floatText', { pos: e.pos, text: 'GUARDED', color: 0xd8c0ff, scale: 0.75, dy: 1.4 }); }
    return 0.5;
  }
  return 1;
};

// ------------------------------------------------------------- helpers -------
function aimAt(e: Enemy, px: number, pz: number): number {
  const dx = px - e.pos.x, dz = pz - e.pos.z, l = Math.hypot(dx, dz) || 1;
  S.dirX = dx / l; S.dirZ = dz / l;
  return l;
}
function shoot(e: Enemy, dx: number, dz: number, kind: 'ARROW' | 'ORB' | 'FLAME' | 'SLOW_ORB' | 'BOSS_ORB', speed: number, dmg: number, opts?: { homing?: number; slow?: number; debuff?: number; life?: number; radius?: number }): void {
  tmp.set(e.pos.x + dx * 0.8, 1.3, e.pos.z + dz * 0.8);
  tmp2.set(dx, 0, dz);
  fireEnemyProjectile(tmp, tmp2, kind, speed, dmg, opts);
}
function shot(e: Enemy, tag: number, dx: number, dz: number, speed: number, life: number, r: number, dmg: number, ahead = 1.2, big = false): void {
  for (const s of darkShots) {
    if (s.active) continue;
    s.active = true; s.tag = tag; s.x = e.pos.x + dx * ahead; s.z = e.pos.z + dz * ahead; s.vx = dx * speed; s.vz = dz * speed;
    s.life = s.maxLife = life; s.r = r; s.dmg = dmg; s.hit = false; s.trail = 0; s.n = 0; s.big = big;
    return;
  }
}
/** A point `d` away from the player on the far side of the hero, kept inside the room. */
function retreatPoint(e: Enemy, px: number, pz: number, d: number, out: Vector3): void {
  let dx = e.pos.x - px, dz = e.pos.z - pz;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  for (let k = 0; k < 8; k++) {
    const a = Math.atan2(dx, dz) + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55);
    const x = px + Math.sin(a) * d, z = pz + Math.cos(a) * d;
    const lim = edgeLimit(x, z, 3);
    if (x * x + z * z < lim * lim) { out.set(x, 0, z); return; }
  }
  out.set(e.pos.x * 0.3, 0, e.pos.z * 0.3);   // fall back towards the middle
}
/** Keeps a ground point inside the room. */
function clampIn(out: Vector3, pad = 3): Vector3 {
  const r = Math.hypot(out.x, out.z), lim = edgeLimit(out.x, out.z, pad);
  if (r > lim) { out.x *= lim / r; out.z *= lim / r; }
  return out;
}
/** A visual-only ground mark (fills up, no effect): rising-skeleton spots, the meteor / golem shadow. */
function mark(x: number, z: number, r: number, life: number, color: number): void {
  const zn = allocZone();
  if (!zn) return;
  zn.active = true; zn.kind = 'METEOR_SHADOW'; zn.hostile = true; zn.pos.set(x, 0, z); zn.radius = r; zn.life = life; zn.maxLife = life; zn.damage = 0; zn.color = color; zn.trick = 0;
}
/** A telegraph circle that only shows the danger (the hit itself is resolved here: pend / hostile fx). */
function warnCircle(x: number, z: number, r: number, life: number, color: number): void {
  const zn = spawnTelegraphCircle(x, z, r, life, 0, color);
  if (zn) zn.trick = BT.VISUAL;
}
function warnLine(x: number, z: number, dx: number, dz: number, len: number, w: number, life: number, color: number): void {
  const zn = spawnTelegraphLine(x, z, dx, dz, len, w, life, color);
  if (zn) zn.trick = BT.VISUAL;
}
/** A telegraphed strike: the circle fills for `delay` s, then everything inside takes `dmg` (+ effects). */
function strike(x: number, z: number, r: number, delay: number, dmg: number, eff: number, fx: string, color: number, dk: DamageKind = 'PHYSICAL', show = true): void {
  for (const p of pend) {
    if (p.active) continue;
    p.active = true; p.t = delay; p.kind = 0; p.x = x; p.z = z; p.r = r; p.dmg = dmg; p.eff = eff; p.fx = fx; p.dk = dk;
    if (show) warnCircle(x, z, r, delay, color);
    return;
  }
}
/** A delayed expanding fire ring (Meteor Cataclysm). */
function ringLater(x: number, z: number, delay: number, dmg: number): void {
  for (const p of pend) {
    if (p.active) continue;
    p.active = true; p.t = delay; p.kind = 1; p.x = x; p.z = z; p.r = 0; p.dmg = dmg; p.eff = 0; p.fx = ''; p.dk = 'FIRE';
    return;
  }
}
function hostileFx(kind: GroundFxKind, x: number, z: number, delay: number, life: number, radius: number, dmg: number, aux = 0, color = 0xc08aff): GroundFx | null {
  const f = allocFx();
  if (!f) return null;
  f.active = true; f.hostile = true; f.kind = kind; f.x = x; f.z = z; f.delay = delay; f.life = life; f.radius = radius; f.dmg = dmg; f.aux = aux; f.color = color;
  return f;
}
function field(kind: ZoneKind, x: number, z: number, r: number, life: number, dmg: number, color: number): void {
  const zn = allocZone();
  if (!zn) return;
  zn.active = true; zn.kind = kind; zn.hostile = true; zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = 0; zn.color = color;
  zn.tickT = 0; zn.length = 0; zn.maxPull = 0; zn.trick = 0; zn.aux = 0;
  for (const f of fields) if (!f.z) { f.z = zn; f.kind = kind; f.dmg = dmg; f.tick = 0.25; return; }
}
function playerIn(x: number, z: number, r: number): boolean {
  const p = world.player;
  if (!p.alive) return false;
  const dx = p.pos.x - x, dz = p.pos.z - z, rr = r + 0.6;
  return dx * dx + dz * dz < rr * rr;
}
/** Pushes the hero (knockback / pull), kept inside the room. */
function shove(dx: number, dz: number, dist: number): void {
  const p = world.player;
  if (!p.alive || playerTrickImmune()) return;
  p.pos.x += dx * dist; p.pos.z += dz * dist;
  const r = Math.hypot(p.pos.x, p.pos.z), lim = edgeLimit(p.pos.x, p.pos.z, 2);
  if (r > lim) { p.pos.x *= lim / r; p.pos.z *= lim / r; }
}
/** Eased, collision-respecting push along (dx, dz) (a unit direction) via knockHero. */
function push(dx: number, dz: number, dist: number): void {
  const p = world.player.pos;
  knockHero(p.x - dx, p.z - dz, dist, 0);
}
function slowPlayer(t: number): void {
  const p = world.player;
  if (p.slowT < 0.05) applyPlayerDebuff('SLOW', t);
  else if (!playerTrickImmune()) p.slowT = Math.max(p.slowT, t);
}
function effects(eff: number, dmg: number, x: number, z: number): void {
  if (eff & STUN) applyPlayerDebuff('STUN', 0.6);
  if (eff & FREEZE && Math.random() < 0.35) { if (freezePlayer(0.7)) events.emit('floatText', { pos: world.player.pos, text: 'FROZEN', color: 0x8fe4ff, scale: 0.8, dy: 0.8 }); }
  if (eff & SLOW) slowPlayer(2);
  if (eff & BURN) applyPlayerDebuff('BURN', 3, Math.max(2, dmg * 0.1));
  if (eff & POISON) applyPlayerDebuff('POISON', 3, Math.max(2, dmg * 0.1));
  if (eff & KNOCK) knockHero(x, z, (eff & STUN) ? KB.SLAM.kb : KB.PUSH.kb, (eff & STUN) ? KB.SLAM.down : 0);   // (stunning slams = knockdown)
}
function fx(kind: string, x: number, z: number, r: number, yaw?: number): void {
  events.emit('darkFx', { pos: fxPos.set(x, 0, z), kind, radius: r, yaw });
}
/** Impact sparks on the hero (a champion's hit landed). */
function hitSpark(): void { const p = world.player.pos; fx('HIT', p.x, p.z, 1.6); }
/** Blink / Soul Step look (not the 'blink' event: that one counts the hero's own dashes). */
function blinkFx(from: Vector3, to: Vector3): void {
  events.emit('darkFx', { pos: from.clone(), kind: 'BLINK', radius: 4.5, to: to.clone() });
}
/** Bone Ward: seconds its shields last (they drop when it runs out). */
let wardT = 0;
function unwardedAdds(): number {
  let n = 0;
  for (const o of world.enemies) if (o.active && o.state !== 'DYING' && o.kind !== 'DARK_HERO' && o.shield <= 1) n++;
  return n;
}
function aliveAdds(): number {
  let n = 0;
  for (const o of world.enemies) if (o.active && o.state !== 'DYING' && o.kind !== 'DARK_HERO') n++;
  return n;
}
function announce(k: number): void {
  const b = world.boss;
  b.ability = NAMES[S.cls][k] ?? ''; b.abilityT = k === ULT ? 3 : k === DASH ? 1.3 : 2.2;
}

// ------------------------------------------------------------- skills --------
/** Can skill k start at this distance? */
function wants(k: number, d: number): boolean {
  switch (S.cls) {
    case 'ARCHER': return k === 1 ? d < 22 : k === 2 ? d < 26 : k === 3 ? d > 4 && d < 19 : d < 5.5;
    case 'WIZARD': return k === 1 ? d < 20 : k === 2 ? d < 10 && S.orbT <= 0 : k === 3 ? d < 20 : d < 5.5;
    case 'BARBARIAN': return k === 1 ? d > 3 && d < 16 : k === 2 ? d < 6 : k === 3 ? d > 4 && d < 22 : k === CLEAVE ? d < 4.5 : k === RUPTURE ? d > 3 && d < 14 : d > 6 && d < 14;
    case 'KNIGHT': return k === 1 ? d < 14 : k === 2 ? d < 7 && S.guardT <= 0 : k === 3 ? d < 20 : d > 5 && d < 15;
    default: return k === 1 ? aliveAdds() < 3 : k === 2 ? unwardedAdds() > 0 : k === 3 ? d < 20 : d < 5.5;   // NECROMANCER
  }
}

/** Starts skill k: telegraphs + windup / active durations. */
function begin(e: Enemy, k: number, px: number, pz: number): void {
  const d = aimAt(e, px, pz);
  e.pattern = k; enter(e, 'WINDUP'); e.vel.set(0, 0, 0);
  S.tick = 0; S.flag = false; S.spikeHit = false;
  const c = S.cls, P = pw(e);
  if (k !== SWING) announce(k);
  if (k === ULT) {
    darkView.ult++;
    events.emit('shake', { amount: 0.3 });
    fx('ULT', e.pos.x, e.pos.z, 6);
  }
  if (c === 'ARCHER') {
    if (k === 1) { S.wind = 0.7; S.act = 0.15; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 26, 3.6, 0.7, C_VIOLET); }
    else if (k === 2) { S.wind = 0.9; S.act = 0.15; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 36, 1.5, 0.9, C_LIGHT); }
    else if (k === 3) {   // three frost traps in a spread, landing around the hero
      S.wind = 0.4; S.act = 0.2;
      const base = Math.atan2(S.dirX, S.dirZ), r = Math.min(d, 17);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.42;
        tmp.set(e.pos.x + Math.sin(a) * r, 0, e.pos.z + Math.cos(a) * r); clampIn(tmp);
        const f = hostileFx('TRAP', tmp.x, tmp.z, S.wind + 0.6, S.wind + 0.7, 3.2, P * 1.1, 5, C_ICE);
        if (f) { f.sx = e.pos.x; f.sz = e.pos.z; }
        warnCircle(tmp.x, tmp.z, 3.2, S.wind + 0.6, C_ICE);
      }
    } else if (k === DASH) { S.wind = 0.08; S.act = 0.25; retreatPoint(e, px, pz, 9, dirV); aimAt(e, dirV.x, dirV.z); }
    else {   // ULT: the storm circle on the hero
      S.wind = 1.0; S.act = 0.2; S.rainX = px; S.rainZ = pz;
      tmp.set(px, 0, pz); clampIn(tmp, 2); S.rainX = tmp.x; S.rainZ = tmp.z;
      warnCircle(S.rainX, S.rainZ, 10, 1.0, C_VIOLET);
    }
  } else if (c === 'WIZARD') {
    if (k === 1) {
      S.wind = 0.7; S.act = 0.15;
      const base = Math.atan2(S.dirX, S.dirZ);
      for (let i = -1; i <= 1; i++) { const a = base + i * 0.26; warnLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 24, 3.4, 0.7, C_FIRE); }
    } else if (k === 2) { S.wind = 0.45; S.act = 0.15; warnCircle(e.pos.x, e.pos.z, 8, 0.45, C_ICE); }
    else if (k === 3) {   // Singularity on the hero
      S.wind = 0.8; S.act = 0.15; tmp.set(px, 0, pz); clampIn(tmp); S.toX = tmp.x; S.toZ = tmp.z;
      warnCircle(S.toX, S.toZ, 7, 0.8, 0x8a3aff);
    } else if (k === DASH) { S.wind = 0.35; S.act = 0.1; warnCircle(e.pos.x, e.pos.z, 5, 0.35, C_ICE); }
    else {   // ULT: the meteor's shadow grows on the hero
      S.wind = 1.0; S.act = 0.2;
      tmp.set(px, 0, pz); clampIn(tmp); S.toX = tmp.x; S.toZ = tmp.z;
      const T = 2.0;
      mark(S.toX, S.toZ, 8, T, 0xff5a1a);
      hostileFx('BIG_METEOR', S.toX, S.toZ, T, T + 0.3, 8, P * 3, 0, 0xff7a1a);
      strike(S.toX, S.toZ, 8, T, P * 3, STUN | BURN, '', C_FIRE, 'FIRE');
    }
  } else if (c === 'BARBARIAN') {
    if (k === 1) { S.wind = 0.6; S.act = 0.15; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 22, 4.4, 0.6, C_BLOOD); }
    else if (k === 2) { S.wind = 0.45; S.act = 2.6; warnCircle(e.pos.x, e.pos.z, 4.5, 0.45, C_BLOOD); }
    else if (k === 3) { S.wind = 0.7; S.act = 0.3; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 30, 3.2, 0.7 + 0.5, 0xd8a070); }
    else if (k === DASH) {   // Bloodrage Leap onto the hero
      S.wind = 0.3; S.act = 0.6; S.fromX = e.pos.x; S.fromZ = e.pos.z;
      const l = Math.min(Math.max(d - 2.6, 2), 14); S.toX = e.pos.x + S.dirX * l; S.toZ = e.pos.z + S.dirZ * l;   // (lands a weapon's reach short: never on top of the hero)
      strike(S.toX, S.toZ, 4.5, S.wind + S.act, P * 1.6, STUN, 'SLAM', C_BLOOD);
      warnCircle(S.toX, S.toZ, 1.6, S.wind + S.act, C_VIOLET);   // inner mark: the touchdown point
    } else if (k === CLEAVE) {   // Blood Cleave: two wide crescent slashes right in front of it
      S.wind = 0.5; S.act = 0.55;
      warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 7, 6.4, 0.5, C_BLOOD);
      warnCircle(e.pos.x, e.pos.z, 3.2, 0.5, C_VIOLET);
    } else if (k === RUPTURE) {   // Ground Rupture: three lanes of spikes fan out
      S.wind = 0.7; S.act = 0.5;
      const base = Math.atan2(S.dirX, S.dirZ);
      for (let i = -1; i <= 1; i++) { const a = base + i * 0.34; warnLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), 15, 2.4, 0.7, i === 0 ? C_BLOOD : C_VIOLET); }
    } else { S.wind = 0.8; S.act = 0.3; warnCircle(e.pos.x, e.pos.z, 9, 0.8, C_BLOOD); warnCircle(e.pos.x, e.pos.z, 4.5, 0.8, C_VIOLET); }
  } else if (c === 'KNIGHT') {
    if (k === SWING) { S.wind = 0.3; S.act = 0.15; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 6, 3.4, 0.3, C_HOLY); }
    else if (k === 1) { S.wind = 0.55; S.act = 0.2; warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 19, 6, 0.55, C_HOLY); }
    else if (k === 2) { S.wind = 0.35; S.act = 0.2; strike(e.pos.x, e.pos.z, 6.5, 0.35, P * 1.2, KNOCK, 'GUARD', C_HOLY); }
    else if (k === 3) {   // Judgment: rays fall around the hero one after another
      S.wind = 0.4; S.act = 0.3;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 2.5 + Math.random() * 4.5;
        tmp.set(px + Math.cos(a) * rr, 0, pz + Math.sin(a) * rr); clampIn(tmp);
        strike(tmp.x, tmp.z, 3, 0.9 + i * 0.22, P * 1.1, STUN, 'JUDGMENT', C_HOLY, 'MAGIC');
      }
    } else if (k === DASH) { S.wind = 0.55; S.len = Math.min(Math.max(d - 1.9, 3), 14); S.act = S.len / 26;   // (stops at the hero, never through it)
      warnLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, S.len, 2.4, 0.55, C_HOLY); }
    else { S.wind = 0.9; S.act = 0.3; strike(e.pos.x, e.pos.z, 8, 0.9, P * 1.8, STUN, 'AVATAR', C_HOLY, 'MAGIC'); }
  } else {   // NECROMANCER
    if (k === 1) {
      S.wind = 1.0; S.act = 0.2; S.len = 3;
      for (let i = 0; i < S.len; i++) {
        const a = Math.atan2(S.dirX, S.dirZ) + (i - (S.len - 1) / 2) * 0.75;
        rainX[i] = e.pos.x + Math.sin(a) * 2.6; rainZ[i] = e.pos.z + Math.cos(a) * 2.6;
        const lim = edgeLimit(rainX[i], rainZ[i], 2);
        if (rainX[i] * rainX[i] + rainZ[i] * rainZ[i] > lim * lim) { rainX[i] = e.pos.x; rainZ[i] = e.pos.z; }
        mark(rainX[i], rainZ[i], 1.3, 1.0, C_BONE);
      }
    } else if (k === 2) { S.wind = 0.6; S.act = 0.15; }   // Bone Ward: a short cast, no telegraph (it only buffs its skeletons)
    else if (k === 3) { S.wind = 0.7; S.act = 0.15; tmp.set(px, 0, pz); clampIn(tmp); S.toX = tmp.x; S.toZ = tmp.z; warnCircle(S.toX, S.toZ, 6.5, 0.7, 0x7a3ab0); }
    else if (k === DASH) { S.wind = 0.2; S.act = 0.12; }
    else {   // ULT: the golem's shadow on the hero
      S.wind = 1.0; S.act = 0.2;
      const l = Math.min(d, 12); tmp.set(e.pos.x + S.dirX * l, 0, e.pos.z + S.dirZ * l); clampIn(tmp); S.toX = tmp.x; S.toZ = tmp.z;
      const T = 1.7;
      mark(S.toX, S.toZ, 5.5, T, 0x9a6bd8);
      hostileFx('GOLEM_DROP', S.toX, S.toZ, T, T + 0.4, 5.5, P * 2.2, 0, 0x9a6bd8);
      warnCircle(S.toX, S.toZ, 5.5, T, C_VIOLET);
    }
  }
  if (k !== SWING && k !== DASH && k !== CLEAVE) darkView.cast++;
}
/** Windup over: the skill fires. */
function release(e: Enemy, px: number, pz: number): void {
  const k = e.pattern, c = S.cls, P = pw(e);
  enter(e, 'ATTACK');
  darkView.charge = 0;
  if (c === 'ARCHER') {
    if (k === 1) { shot(e, SHOT_GALE, S.dirX, S.dirZ, 17, 1.6, 1.8, P * 1.8); darkView.atk++; events.emit('shake', { amount: 0.12 }); }
    else if (k === 2) { shot(e, SHOT_LIGHT, S.dirX, S.dirZ, 52, 0.72, 0.9, P * 2.2); darkView.atk++; events.emit('shake', { amount: 0.15 }); }
    else if (k === 3) darkView.atk++;
    else if (k === DASH) {   // roll away with i-frames; the arrow cluster stays behind and explodes after 0.6 s
      S.inv = S.act + 0.05;
      hostileFx('ARROW_STICK', e.pos.x, e.pos.z, 0.6, 0.85, 4.2, P * 1.4, 0, C_VIOLET);
      for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283, dd = 0.4 + Math.random() * 1.1; hostileFx('ARROW_STICK', e.pos.x + Math.cos(a) * dd, e.pos.z + Math.sin(a) * dd, 0.6, 0.85, 0, 0); }
      warnCircle(e.pos.x, e.pos.z, 4.2, 0.6, C_VIOLET);
      fx('ROLL', e.pos.x, e.pos.z, 1.5);
    } else {   // ULT: the rain starts; the final volley lands when it ends (its circle fills the whole time)
      S.rainT = 2.4; S.rainAcc = 0;
      strike(S.rainX, S.rainZ, 10, 3.3, P * 2.4, 0, 'VOLLEY', C_VIOLET);
      events.emit('shake', { amount: 0.3 });
    }
  } else if (c === 'WIZARD') {
    if (k === 1) {
      const base = Math.atan2(S.dirX, S.dirZ);
      for (let i = -1; i <= 1; i++) { const a = base + i * 0.26; shot(e, SHOT_FIRE, Math.sin(a), Math.cos(a), 8, 3.4, 1.6, P * 1.3, 1.6); }
      darkView.atk++;
    } else if (k === 2) { S.orbT = 4.5; S.orbTick = 0.9; darkView.orbR = 8; }
    else if (k === 3) { field('BLACKHOLE', S.toX, S.toZ, 7, 2.6, P * 0.25, 0x6d28d9); events.emit('shockwave', { pos: tmp.set(S.toX, 0, S.toZ), radius: 7, color: 0x8a3aff }); }
    else if (k === DASH) {   // Blink Nova: nova where it stood, blink away, nova where it lands
      if (playerIn(e.pos.x, e.pos.z, 5)) { damagePlayer(P * 0.9, { pos: e.pos, kind: 'ICE' }); effects(FREEZE | SLOW, P, e.pos.x, e.pos.z); }
      events.emit('frostNova', { pos: e.pos, radius: 5 });
      retreatPoint(e, px, pz, 12, dirV);
      blinkFx(e.pos, dirV);
      e.pos.set(dirV.x, 0, dirV.z); e.hideT = 0.25;
      strike(dirV.x, dirV.z, 5, 0.3, P * 0.9, FREEZE | SLOW, 'NOVA', C_ICE, 'ICE');
    } else events.emit('shake', { amount: 0.25 });
  } else if (c === 'BARBARIAN') {
    if (k === 1) { shot(e, SHOT_XSLASH, S.dirX, S.dirZ, 12, 1.75, 1.65, P * 1.6, 1.6, true); darkView.atk++; events.emit('shake', { amount: 0.15 }); }   // (r 1.65: smaller like the hero's, was 2.2)
    else if (k === 2) { darkView.spin = 1; darkView.spinR = 4.5; fx('WHIRL', e.pos.x, e.pos.z, 4.5); events.emit('shake', { amount: 0.18 }); }
    else if (k === CLEAVE) { cleave(e); }
    else if (k === RUPTURE) {   // Ground Rupture: 3 lanes, spikes erupt outward one after another
      const base = Math.atan2(S.dirX, S.dirZ);
      for (let l = -1; l <= 1; l++) {
        const a = base + l * 0.34, ax = Math.sin(a), az = Math.cos(a);
        for (let i = 0; i < 9; i++) {   // (reaches the telegraphed 15: 1.6 .. 15)
          const dd = 1.6 + i * 1.675, x = e.pos.x + ax * dd, z = e.pos.z + az * dd;
          hostileFx('SPIKE', x, z, 0.05 + i * 0.06, 1.2 + i * 0.06, 1.7, P * 1.1, 0.4, 0xa03a4a);
        }
        tmp.set(e.pos.x + ax * 15, 0, e.pos.z + az * 15); tmp2.set(e.pos.x, 0, e.pos.z);
        events.emit('darkFx', { pos: tmp2.clone(), kind: 'RUPTURE', radius: 15, to: tmp.clone(), yaw: a });
      }
      darkView.atk++; events.emit('shake', { amount: 0.22 });
    }
    else if (k === 3) {   // Earthsplitter: a fissure of erupting spikes down the lane
      const L = 28, n = 14;
      for (let i = 0; i < n; i++) {
        const dd = 2.5 + (i / (n - 1)) * L, x = e.pos.x + S.dirX * dd, z = e.pos.z + S.dirZ * dd;
        hostileFx('SPIKE', x, z, 0.1 + i * 0.045, 1.5 + i * 0.045, 2.0, P * 1.4, 0.5, 0xa89a80);
        const s = i % 2 === 0 ? 1 : -1;
        hostileFx('SPIKE', x - S.dirZ * 1.6 * s, z + S.dirX * 1.6 * s, 0.2 + i * 0.045, 1.4 + i * 0.045, 1.1, 0, 0, 0xa89a80);
      }
      events.emit('fissure', { from: e.pos.clone(), dir: new Vector3(S.dirX, 0, S.dirZ), length: L + 3 });
      darkView.atk++;
    } else if (k === DASH) { tmp.set(S.fromX, 0, S.fromZ); tmp2.set(S.toX, 0, S.toZ); events.emit('leap', { from: tmp.clone(), to: tmp2.clone(), dur: S.act }); S.inv = S.act; fx('LEAP', S.fromX, S.fromZ, 4.5); }
    else {   // ULT: the roar terrifies (stun + slow), then giant form
      if (playerIn(e.pos.x, e.pos.z, 9)) { damagePlayer(P * 0.8, { pos: e.pos, kind: 'PHYSICAL', ...KB.SLAM }); if (applyPlayerDebuff('STUN', 0.9)) events.emit('floatText', { pos: world.player.pos, text: 'TERRIFIED', color: 0xff8a6a, scale: 0.8, dy: 0.9 }); slowPlayer(3); }
      fx('ROAR', e.pos.x, e.pos.z, 9);
      S.titanT = 6; S.stepT = 0.5; S.mul = 1.4; e.scale = S.baseScale * 1.8; e.radius = S.baseRadius * 1.5; e.speed = S.baseSpeed * 1.15; darkView.titan = 1;
      events.emit('shake', { amount: 0.5 });
    }
  } else if (c === 'KNIGHT') {
    if (k === SWING) {
      const av = S.avatarT > 0;
      shot(e, SHOT_SLASH, S.dirX, S.dirZ, 24, 0.28, av ? 3.2 : 2.0, P * (av ? 1.1 : 0.9), 0.8, av);
      if (av) shot(e, SHOT_HOLY, S.dirX, S.dirZ, 20, 0.95, 2.2, P * 0.7, 1.4);   // Divine Avatar: every swing releases a Holy Wave
      darkView.atk++;
      if (++S.basicN >= 6) { S.basicN = 0; strike(px, pz, 2.6, 0.7, P * 0.9, 0, 'JUDGMENT', C_HOLY, 'MAGIC'); }   // passive Smite
    } else if (k === 1) { shot(e, SHOT_HOLY, S.dirX, S.dirZ, 20, 0.95, S.avatarT > 0 ? 4.4 : 3.0, P * 1.5, 1.4, S.avatarT > 0); darkView.atk++; events.emit('shake', { amount: 0.12 }); }
    else if (k === 2) { S.guardT = 3.4; darkView.guard = 1; }   // (the burst is the strike circle set up in begin)
    else if (k === DASH) { requestYaw(Math.atan2(S.dirX, S.dirZ)); S.inv = S.act + 0.05; events.emit('shockwave', { pos: e.pos, radius: 3, color: C_HOLY }); }
    else { S.avatarT = 8; S.mul = 1.5; darkView.avatar = 1; events.emit('shockwave', { pos: e.pos, radius: 14, color: C_HOLY }); events.emit('shake', { amount: 0.5 }); }
  } else {
    if (k === 1) {
      for (let i = 0; i < S.len; i++) {
        const r3 = Math.random(), kind = r3 < 1 / 3 ? 'SKELETON_WARRIOR' : r3 < 2 / 3 ? 'SKELETON_ARCHER' : 'SKELETON_MAGE';
        const sk = spawnEnemy(kind, tmp.set(rainX[i], 0, rainZ[i]), { fixed: true });
        if (sk) { sk.maxHp = Math.round(sk.maxHp * 0.8); sk.hp = sk.maxHp; sk.xp = 0; sk.gold = 0; }
      }
      events.emit('shockwave', { pos: e.pos, radius: 4, color: C_BONE });
    } else if (k === 2) {   // Bone Ward: every skeleton gets a bone shield worth 30% of its max HP (8 s, like the hero's)
      for (const o of world.enemies) {
        if (!o.active || o.state === 'DYING' || o.kind === 'DARK_HERO') continue;
        o.shield = Math.max(o.shield, o.maxHp * 0.3);
        events.emit('shockwave', { pos: o.pos, radius: 1.6, color: C_BONE });
      }
      wardT = 8;
      events.emit('shockwave', { pos: e.pos, radius: 6, color: C_BONE });
    }
    else if (k === 3) { field('CURSE', S.toX, S.toZ, 6.5, 5, P * 0.22, 0x7a3ab0); }
    else if (k === DASH) {   // Soul Step: bone shards burst where it stood, it reappears away from the hero
      strike(e.pos.x, e.pos.z, 5, 0.4, P * 0.9, SLOW, 'SOUL', C_BONE);
      retreatPoint(e, px, pz, 11, dirV);
      blinkFx(e.pos, dirV);
      e.pos.set(dirV.x, 0, dirV.z); e.hideT = 0.2;
    }
  }
}

/** One Blood Cleave crescent (the dark berserker's wide arc slash). */
function cleave(e: Enemy): void {
  aimAt(e, world.player.pos.x, world.player.pos.z);
  requestYaw(Math.atan2(S.dirX, S.dirZ));
  shot(e, SHOT_CLEAVE, S.dirX, S.dirZ, 24, 0.3, 3.4, pw(e) * 1.5, 0.8, true);
  fx('CLEAVE', e.pos.x, e.pos.z, 4, Math.atan2(S.dirX, S.dirZ));
  darkView.atk++; events.emit('shake', { amount: 0.18 });
}

/** Skill active phase (dashes, leaps, whirlwind). */
function tickActive(e: Enemy, dt: number, px: number, pz: number): void {
  const k = e.pattern, c = S.cls;
  darkView.dash = k === DASH ? 1 : 0;
  if (c === 'BARBARIAN' && k === CLEAVE) {   // step into the first slash, then the second one cuts back
    aimAt(e, px, pz);
    const d = Math.hypot(px - e.pos.x, pz - e.pos.z), sp = d > 2.7 ? 8 : 0;
    e.vel.set(S.dirX * sp, 0, S.dirZ * sp); requestYaw(Math.atan2(S.dirX, S.dirZ));
    if (!S.flag && e.stateT >= 0.28) { S.flag = true; cleave(e); }
    return;
  }
  if (c === 'ARCHER' && k === DASH) { e.vel.set(S.dirX * 20, 0, S.dirZ * 20); requestYaw(Math.atan2(S.dirX, S.dirZ)); return; }
  if (c === 'BARBARIAN' && k === DASH) {
    const f = Math.min(1, e.stateT / S.act);
    e.vel.set(0, 0, 0);
    e.pos.x = S.fromX + (S.toX - S.fromX) * f; e.pos.z = S.fromZ + (S.toZ - S.fromZ) * f;
    darkView.air = 4 * f * (1 - f) * 3.2;
    requestYaw(Math.atan2(S.toX - S.fromX, S.toZ - S.fromZ));
    return;
  }
  if (c === 'BARBARIAN' && k === 2) {   // Whirlwind: chase at reduced speed, tug the hero in, hit every 0.3 s in r 4.5, heal on hits
    aimAt(e, px, pz);
    const wd = Math.hypot(px - e.pos.x, pz - e.pos.z), ws = wd > 2.9 ? e.speed * 0.7 : wd < 2.2 ? -e.speed * 0.4 : 0;   // (spins at melee spacing, never through the hero)
    e.vel.set(S.dirX * ws, 0, S.dirZ * ws);
    const p = world.player.pos, dx = e.pos.x - p.x, dz = e.pos.z - p.z, dd = Math.hypot(dx, dz) || 1;
    if (dd < 7 && dd > 2.5) shove(dx / dd, dz / dd, 1.4 * dt);
    S.tick -= dt;
    if (S.tick <= 0) {
      S.tick = 0.3;
      if (dd < 4.5 + 0.6 && world.player.alive) {
        damagePlayer(mdmg(e) * 0.4, { pos: e.pos, kind: 'PHYSICAL' }); hitSpark();
        if (S.healAcc < e.maxHp * 0.06) { const h = e.maxHp * 0.01; e.hp = Math.min(e.maxHp, e.hp + h); S.healAcc += h; }
      }
    }
    return;
  }
  if (c === 'KNIGHT' && k === DASH) { e.vel.set(S.dirX * 26, 0, S.dirZ * 26); requestYaw(Math.atan2(S.dirX, S.dirZ)); return; }
  e.vel.set(0, 0, 0);
}

function finish(e: Enemy): void {
  const k = e.pattern, c = S.cls;
  if (c === 'BARBARIAN' && k === DASH) {
    darkView.air = 0;
    events.emit('quake', { pos: e.pos, radius: 4.5 }); events.emit('crater', { pos: e.pos, radius: 2.4, color: 0x2a1030 }); events.emit('shake', { amount: 0.45 });
    events.emit('shockwave', { pos: e.pos, radius: 7, color: C_BLOOD }); fx('ROAR', e.pos.x, e.pos.z, 7);   // the landing warcry
    S.rageT = 3; darkView.rage = 1;   // Bloodrage: faster throws and steps
  }
  if (c === 'BARBARIAN' && k === 2) { darkView.spin = 0; S.healAcc = 0; }
  if (c === 'ARCHER' && k === DASH) { aimAt(e, world.player.pos.x, world.player.pos.z); shoot(e, S.dirX, S.dirZ, 'ARROW', 26, pdmg(e)); darkView.atk++; }
  const rate = S.avatarT > 0 ? 1.5 : 1;
  if (k === SWING) S.cd[0] = CD[c][0] * (0.85 + Math.random() * 0.3) / rate;
  else S.cd[k] = CD[c][k] * (k === ULT ? ULT_CD_MUL : SKILL_CD_MUL) * (0.85 + Math.random() * 0.3);
  S.gap = k === SWING ? 0.15 : RANGED[c] ? 0.55 : 0.6;
  if (!RANGED[c]) { if (k !== SWING || ++S.comboN >= 3) { S.comboN = 0; S.backT = k === SWING ? 0.5 : 0.6; } }   // a step back after a skill / a 3-hit combo
  darkView.dash = 0;
  e.pattern = 0; e.vel.set(0, 0, 0);
  enter(e, 'RECOVER');
}

/** Interrupts a skill in progress (the champion got staggered). */
function cancel(e: Enemy): void {
  darkView.air = 0; darkView.spin = 0; darkView.charge = 0; darkView.dash = 0; S.inv = 0; S.healAcc = 0;
  if (e.pattern > 0) { S.cd[e.pattern === SWING ? 0 : e.pattern] = 1.5; e.pattern = 0; }
  enter(e, 'RECOVER');
}

// ------------------------------------------------------------- AI ------------
/** Per-frame AI (called from enemies.runAI). (px, pz) = the hero, d = distance to it. */
export function aiDarkHero(e: Enemy, dt: number, px: number, pz: number, d: number): void {
  if (S.id !== e.id) { S.id = e.id; darkView.id = e.id; }
  if (e.phase === 0 && e.hp < e.maxHp * 0.5) {   // enrage: faster cooldowns, brighter aura
    e.phase = 1; world.boss.phase = 1; darkView.enraged = 1;
    events.emit('bossPhase', { phase: 1 });
    events.emit('floatText', { pos: e.pos, text: 'ENRAGED', color: 0xff3a5a, scale: 1, dy: 2.4 });
    fx('ENRAGE', e.pos.x, e.pos.z, 8); events.emit('shake', { amount: 0.4 });
  }
  if (!S.ultArmed && e.hp < e.maxHp * ULT_HP) { S.ultArmed = true; S.cd[ULT] = 1.5; }
  const rate = (e.phase > 0 ? 1.4 : 1) * (S.avatarT > 0 ? 1.5 : 1);
  for (let i = 0; i < S.cd.length; i++) if (S.cd[i] > 0) S.cd[i] -= dt * (i === ULT ? 1 : rate);
  if (S.gap > 0) S.gap -= dt * rate;

  switch (e.state) {
    case 'WINDUP':
      e.vel.set(0, 0, 0);
      if (S.cls === 'KNIGHT' && e.pattern === DASH) requestYaw(Math.atan2(S.dirX, S.dirZ));
      if (S.cls === 'KNIGHT' && e.pattern === SWING) { aimAt(e, px, pz); requestYaw(Math.atan2(S.dirX, S.dirZ)); }
      else requestYaw(Math.atan2(S.dirX, S.dirZ));
      if (e.pattern !== SWING && e.pattern !== DASH && e.pattern !== CLEAVE) darkView.charge = Math.min(1, e.stateT / Math.max(0.1, S.wind));
      if (e.stateT >= S.wind) release(e, px, pz);
      return;
    case 'ATTACK':
      tickActive(e, dt, px, pz);
      if (e.stateT >= S.act) finish(e);
      return;
    case 'RECOVER':
      e.vel.set(0, 0, 0);
      if (e.stateT >= 0.3) enter(e, RANGED[S.cls] ? 'KITE' : 'CHASE');
      return;
    default: break;
  }

  // ---- pick a move: the ultimate first, then the dash (evade / gap closer), then a skill
  if (S.gap <= 0 && world.player.alive) {
    if (S.ultArmed && S.cd[ULT] <= 0 && d < 22 && S.titanT <= 0 && S.avatarT <= 0 && S.rainT <= 0) { begin(e, ULT, px, pz); return; }
    if (S.cd[DASH] <= 0 && wants(DASH, d)) { begin(e, DASH, px, pz); return; }
    for (let k = 1; k <= 3; k++) {
      const kk = ((k + (world.frame % 3)) % 3) + 1;   // rotate the check order so no skill starves
      if (S.cd[kk] <= 0 && wants(kk, d)) { begin(e, kk, px, pz); return; }
    }
    if (S.cls === 'BARBARIAN') {   // signature moves
      if (S.cd[CLEAVE] <= 0 && wants(CLEAVE, d)) { begin(e, CLEAVE, px, pz); return; }
      if (S.cd[RUPTURE] <= 0 && wants(RUPTURE, d)) { begin(e, RUPTURE, px, pz); return; }
    }
  }

  // ---- move + basic attack
  const inv = 1 / Math.max(0.001, d);
  const ux = (px - e.pos.x) * inv, uz = (pz - e.pos.z) * inv;
  S.strafeT -= dt;
  if (S.strafeT <= 0) { S.strafeT = 1.2 + Math.random() * 1.6; S.strafe = -S.strafe; }
  if (!RANGED[S.cls]) {
    // melee spacing: hold ~2.2-2.8 u (the weapon's reach), circle-strafe between attacks, step back after a combo
    const spd = e.speed * (S.rageT > 0 ? 1.15 : 1), reach = e.radius + 1.25, lo = reach - 0.15, hi = reach + 0.45;
    let vx = 0, vz = 0, sp = spd;
    if (S.backT > 0) { S.backT -= dt; vx = -ux * 0.9 - uz * S.strafe * 0.5; vz = -uz * 0.9 + ux * S.strafe * 0.5; sp = spd * 0.9; if (d > reach + 1.2) S.backT = 0; }
    else if (d > hi) { vx = ux - uz * S.strafe * 0.25; vz = uz + ux * S.strafe * 0.25; }   // close in on a slight arc
    else if (d < lo) { vx = -ux * 0.8; vz = -uz * 0.8; sp = spd * 0.8; }                      // too close: give ground
    else { vx = -uz * S.strafe; vz = ux * S.strafe; sp = spd * 0.5; }                         // in reach: circle
    const lim = edgeLimit(e.pos.x + vx * 1.5, e.pos.z + vz * 1.5, 2.2);
    if ((e.pos.x + vx * 1.5) ** 2 + (e.pos.z + vz * 1.5) ** 2 > lim * lim) { S.strafe = -S.strafe; S.backT = 0; vx = ux * 0.3 - uz * S.strafe; vz = uz * 0.3 + ux * S.strafe; }
    const vl = Math.hypot(vx, vz) || 1;
    e.vel.set((vx / vl) * sp, 0, (vz / vl) * sp);
    // landed jabs (contactHit) count towards the combo, with impact sparks
    const st = strikeT[e.id];
    if (st > 0.9 && !S.jab) { S.jab = true; hitSpark(); if (++S.comboN >= 3) { S.comboN = 0; S.backT = 0.5; } }
    else if (st < 0.5) S.jab = false;
    if (!world.player.alive || S.cd[0] > 0) return;
    if (S.cls === 'KNIGHT') { if (d < 6.5) begin(e, SWING, px, pz); return; }
    if (d > 2.5 && d < 13) throwAxe(e, ux, uz);   // barbarian: the thrown boomerang axe
    return;
  }
  // casters kite: back off when the hero closes in (never into the wall: slide along it), circle at range
  const lo = S.cls === 'WIZARD' ? 8 : 9, hi = S.cls === 'WIZARD' ? 13 : 14;
  let vx = -uz * S.strafe * 0.65, vz = ux * S.strafe * 0.65, sp = e.speed * 0.85;
  if (d < lo) { vx -= ux; vz -= uz; if (d < 5) sp = e.speed * 1.1; } else if (d > hi) { vx += ux; vz += uz; }
  const lim = edgeLimit(e.pos.x + vx * 2, e.pos.z + vz * 2, 2.5);
  if ((e.pos.x + vx * 2) ** 2 + (e.pos.z + vz * 2) ** 2 > lim * lim) {   // cornered: run along the wall (tangent), away from the hero
    S.strafe = -S.strafe;
    let tx = -e.pos.z, tz = e.pos.x; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (tx * ux + tz * uz > 0) { tx = -tx; tz = -tz; }
    vx = tx; vz = tz; sp = e.speed * (d < 5 ? 1.1 : 0.85);
  }
  const vl = Math.hypot(vx, vz) || 1;
  e.vel.set((vx / vl) * sp, 0, (vz / vl) * sp);
  if (S.cd[0] <= 0 && d < 20 && world.player.alive) basic(e, ux, uz, px, pz);
}

/** Hard body separation: a champion never ends a frame inside the hero (melee: just outside its weapon-reach standoff). */
function keepApart(e: Enemy): void {
  const p = world.player;
  if (!p.alive || e.state === 'DYING' || e.state === 'SPAWN' || S.inv > 0 && darkView.air > 0) return;
  const minD = RANGED[S.cls] ? e.radius + 1.4 : e.radius + 1.0;
  const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD) return;
  const d = Math.sqrt(d2) || 1e-3, nx = d2 < 1e-6 ? 1 : dx / d, nz = d2 < 1e-6 ? 0 : dz / d;
  e.pos.x = p.pos.x + nx * minD; e.pos.z = p.pos.z + nz * minD;
  const r = Math.hypot(e.pos.x, e.pos.z), lim = edgeLimit(e.pos.x, e.pos.z, 1.2);
  if (r > lim) { e.pos.x *= lim / r; e.pos.z *= lim / r; }
}

/** Ranged basic attacks (+ the class's on-attack passive every 6th shot). */
function basic(e: Enemy, ux: number, uz: number, px: number, pz: number): void {
  S.cd[0] = CD[S.cls][0] * (0.85 + Math.random() * 0.3) * (S.rainT > 0 ? 1.6 : 1);
  const P = pdmg(e), proc = ++S.basicN >= 6;
  if (proc) S.basicN = 0;
  if (S.cls === 'ARCHER') {
    if (!proc) shoot(e, ux, uz, 'ARROW', 24, P);
    else if ((S.flag = !S.flag)) shoot(e, ux, uz, 'FLAME', 24, P * 1.2, { debuff: 2, radius: 0.45 });   // Burning Arrow
    else shoot(e, ux, uz, 'SLOW_ORB', 24, P * 1.2, { slow: 0.5, radius: 0.45 });                      // Freezing Arrow
  } else if (S.cls === 'WIZARD') {
    shoot(e, ux, uz, 'BOSS_ORB', 11, P, { radius: 0.65, life: 2.4 });   // big arcane orb
    if (proc) strike(px, pz, 2.6, 0.75, P * 0.9, 0, 'THUNDER', 0x9fb8ff, 'LIGHTNING');   // passive Thunder
  } else shoot(e, ux, uz, 'SLOW_ORB', 12, P, { homing: 0.9, slow: 0, life: 2 });   // necromancer soul bolt
  darkView.atk++;
}

/** Barbarian basic attack: a boomerang axe (flies out ~0.6 s, then curves back, hitting again on the way). */
function throwAxe(e: Enemy, ux: number, uz: number): void {
  for (let i = 0; i < axes.length; i++) {
    if (axes[i] && axes[i]!.active) continue;
    const a = allocEnemyProjectile(); if (!a) break;
    a.active = true; a.kind = 'AXE'; a.pos.set(e.pos.x + ux, 1.3, e.pos.z + uz); a.vel.set(ux * 20, 0, uz * 20);
    a.life = 3; a.damage = pdmg(e) * 1.1; a.radius = 0.75; a.homing = 0; a.slow = 0; a.debuff = 0;
    axes[i] = a; axeT[i] = 0;
    S.cd[0] = CD.BARBARIAN[0] * (0.85 + Math.random() * 0.3) * (S.rageT > 0 ? 0.6 : 1);
    darkView.atk++;
    if (++S.comboN >= 3) { S.comboN = 0; S.backT = 0.5; }
    if (++S.basicN >= 6) { S.basicN = 0; strike(e.pos.x, e.pos.z, 4.5, 0.55, mdmg(e) * 0.9, 0, 'STAMP', C_BLOOD); }   // passive Stamp
    return;
  }
}

function tickAxes(e: Enemy, dt: number): void {
  for (let i = 0; i < axes.length; i++) {
    const a = axes[i];
    if (!a) continue;
    if (!a.active || a.kind !== 'AXE') { axes[i] = null; continue; }
    axeT[i] += dt;
    if (axeT[i] < 0.6) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, l = Math.hypot(dx, dz);
    if (l < 1.4) { a.active = false; axes[i] = null; continue; }   // caught
    const sp = 21, k = Math.min(1, dt * 5);
    a.vel.x += ((dx / l) * sp - a.vel.x) * k; a.vel.z += ((dz / l) * sp - a.vel.z) * k;
    a.life = Math.max(a.life, 0.5);
  }
}

// ------------------------------------------------------------- world tick ----
/** Once per frame from enemies.updateEnemies: boss bar, shots, fields, delayed strikes, rain, orbs, timed forms. */
export function tickDarkHero(dt: number): void {
  if (S.id < 0) return;
  const e = world.enemies[S.id];
  if (!e || !e.active || e.kind !== 'DARK_HERO') { S.id = -1; resetFight(); return; }
  if (wardT > 0) { wardT -= dt; if (wardT <= 0) for (const o of world.enemies) if (o.active && o.kind !== 'DARK_HERO' && o.affix !== 'SHIELDED') o.shield = 0; }   // Bone Ward wears off
  if (e.state === 'DYING') return;
  const b = world.boss;
  b.active = true; b.hp = e.hp; b.maxHp = e.maxHp; b.stagger = staggerView(e); b.staggered = e.staggerT > 0;
  if (e.staggerT > 0 && (e.state === 'WINDUP' || e.state === 'ATTACK')) cancel(e);
  if (S.inv > 0) S.inv -= dt;
  keepApart(e);
  tickAxes(e, dt);
  tickShots(e, dt);
  tickFields(dt);
  tickPending(dt);
  const P = pw(e);
  // archer ultimate: the rain
  if (S.rainT > 0) {
    S.rainT -= dt;
    S.rainAcc += 30 * dt;
    while (S.rainAcc >= 1) {
      S.rainAcc -= 1;
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 10, fall = 0.45 + Math.random() * 0.15;
      hostileFx('RAIN_ARROW', S.rainX + Math.cos(a) * r, S.rainZ + Math.sin(a) * r, fall, fall + 0.3, 2.4, P * 0.25, 0, C_VIOLET);
    }
    if (S.rainT <= 0) {   // the final volley carpet (its damage is the strike circle that has been filling since the rain began)
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 10, fall = 0.75 + Math.random() * 0.15;
        hostileFx('RAIN_ARROW', S.rainX + Math.cos(a) * r, S.rainZ + Math.sin(a) * r, fall, fall + 0.3, 3, 0, 0, C_VIOLET);
      }
    }
  }
  // wizard Storm Orbs
  if (S.orbT > 0) {
    S.orbT -= dt;
    const n = 3; darkOrbs.n = n;
    for (let i = 0; i < n; i++) { const a = world.time * 2.6 + (i / n) * 6.283; darkOrbs.x[i] = e.pos.x + Math.sin(a) * 2.2; darkOrbs.z[i] = e.pos.z + Math.cos(a) * 2.2; }
    S.orbTick -= dt;
    if (S.orbTick <= 0) {
      S.orbTick = 0.8;
      const p = world.player;
      if (p.alive && playerIn(e.pos.x, e.pos.z, 8)) {
        const i = Math.floor(Math.random() * n);
        tmp.set(darkOrbs.x[i], 1.6, darkOrbs.z[i]); tmp2.set(p.pos.x, 1.2, p.pos.z);
        events.emit('lightning', { from: tmp.clone(), to: tmp2.clone() });
        damagePlayer(P * 0.6, { pos: e.pos, kind: 'LIGHTNING' });
        applyPlayerDebuff('DEFDOWN', 2);   // armor break, as the hero's zaps
      }
    }
    if (S.orbT <= 0) { darkOrbs.n = 0; darkView.orbR = 0; }
  }
  // barbarian Titan's Wrath: quaking steps, then the final slam
  if (S.titanT > 0) {
    S.titanT -= dt;
    if (Math.hypot(e.vel.x, e.vel.z) > 0.5 && (S.stepT -= dt) <= 0) {
      S.stepT = 0.5;
      events.emit('quake', { pos: e.pos, radius: 4.5 }); events.emit('shake', { amount: 0.12 });
      if (playerIn(e.pos.x, e.pos.z, 4.5)) damagePlayer(mdmg(e) * 0.45, { pos: e.pos, kind: 'PHYSICAL' });
    }
    if (S.titanT <= 0) {
      strike(e.pos.x, e.pos.z, 9, 0.9, mdmg(e) * 2.2, STUN | KNOCK, 'SLAM', C_BLOOD);
      for (let i = 0; i < 30; i++) { const a = (i / 30) * 6.283, r = 6 + Math.random() * 3.5; hostileFx('SPIKE', e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, 0.9 + Math.random() * 0.12, 2.2, 1.6, 0, 0); }
      S.mul = S.avatarT > 0 ? 1.5 : 1; e.scale = S.baseScale; e.radius = S.baseRadius; e.speed = S.baseSpeed; darkView.titan = 0;
    }
  }
  if (S.avatarT > 0) { S.avatarT -= dt; if (S.avatarT <= 0) { S.mul = 1; darkView.avatar = 0; events.emit('shockwave', { pos: e.pos, radius: 6, color: C_HOLY }); } }
  if (S.guardT > 0) {   // Shield Wall: -50% damage taken, slow heal
    S.guardT -= dt;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
    if (S.guardT <= 0) darkView.guard = 0;
  }
  if (S.rageT > 0) { S.rageT -= dt; if (S.rageT <= 0) darkView.rage = 0; }
  if (S.golemId >= 0) {   // Army of the Dead: the golem crumbles after 20 s
    S.golemT -= dt;
    const g = world.enemies[S.golemId];
    if (!g || !g.active || g.kind !== 'BONE_GOLEM' || g.state === 'DYING') S.golemId = -1;
    else if (S.golemT <= 0) { S.golemId = -1; killEnemy(g); }
  }
}

function hitPlayerShot(s: DarkShot, e: Enemy): void {
  const p = world.player;
  hitSpark();
  const l = Math.hypot(s.vx, s.vz) || 1, dx = s.vx / l, dz = s.vz / l;
  switch (s.tag) {
    case SHOT_GALE: damagePlayer(s.dmg, { pos: e.pos, kind: 'PHYSICAL', proj: true }); applyPlayerDebuff('DEFDOWN', 4); push(dx, dz, 1.6); break;
    case SHOT_LIGHT: damagePlayer(s.dmg, { pos: e.pos, kind: 'MAGIC', proj: true }); break;
    case SHOT_FIRE: damagePlayer(s.dmg, { pos: e.pos, kind: 'FIRE', proj: true }); applyPlayerDebuff('BURN', 3, Math.max(2, s.dmg * 0.1)); events.emit('explosion', { pos: p.pos, radius: 2.4, color: 0xff6a3a }); break;
    case SHOT_XSLASH: damagePlayer(s.dmg, { pos: e.pos, kind: 'FIRE', proj: true }); applyPlayerDebuff('BURN', 2, Math.max(2, s.dmg * 0.08)); push(dx, dz, 2.4); break;
    case SHOT_HOLY: damagePlayer(s.dmg, { pos: e.pos, kind: 'MAGIC', proj: true }); push(dx, dz, 2.6); break;
    case SHOT_CLEAVE: damagePlayer(s.dmg, { pos: e.pos, kind: 'PHYSICAL', proj: true }); applyPlayerDebuff('BURN', 2, Math.max(2, s.dmg * 0.08)); push(dx, dz, 2.0); break;   // (bleeding)
    case SHOT_BONE: damagePlayer(s.dmg, { pos: e.pos, kind: 'PHYSICAL', proj: true, slow: 0.4 }); slowPlayer(2); break;
    default: damagePlayer(s.dmg, { pos: e.pos, kind: 'PHYSICAL', proj: true }); break;
  }
}

function tickShots(e: Enemy, dt: number): void {
  const p = world.player;
  for (const s of darkShots) {
    if (!s.active) continue;
    s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
    if (s.life <= 0) { s.active = false; continue; }
    if (!s.hit && p.alive) {
      const dx = p.pos.x - s.x, dz = p.pos.z - s.z, rr = s.r + 0.6;
      if (dx * dx + dz * dz < rr * rr && p.invulnT <= 0 && !(p.dashIframes && (p.dashT > 0 || p.anim.dashing))) { s.hit = true; hitPlayerShot(s, e); }
    }
    // trails: Gale Arrow tornadoes, fireball flames
    s.trail -= dt;
    if (s.trail <= 0) {
      if (s.tag === SHOT_GALE && s.n < 5) { s.trail = 0.24; s.n++; field('TORNADO', s.x, s.z, 2.2, 2.4, pw(e) * 0.15, 0xcbb8ff); }
      else if (s.tag === SHOT_FIRE && s.n < 9) { s.trail = 0.35; s.n++; spawnHostileZone('FIREPATCH', s.x, s.z, 1.6, 2.2, Math.max(2, s.dmg * 0.08), 0xc04aff); }
      else s.trail = 99;
    }
  }
}

function tickFields(dt: number): void {
  const p = world.player;
  for (const f of fields) {
    const z = f.z;
    if (!z) continue;
    if (!z.active || !z.hostile || z.kind !== f.kind || z.life <= 0) { f.z = null; continue; }
    if (!p.alive) continue;
    const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1e-3, R = z.radius;
    f.tick -= dt;
    const tick = f.tick <= 0;
    if (tick) f.tick = f.kind === 'BLACKHOLE' ? 0.35 : 0.5;
    switch (f.kind) {
      case 'TORNADO':   // Gale Arrow tornadoes tug the hero in
        if (d < R * 1.8 && d > 0.6) shove(dx / d, dz / d, 2.6 * dt);
        if (tick && d < R + 0.5) damagePlayer(f.dmg, { pos: z.pos, kind: 'PHYSICAL' });
        break;
      case 'BLACKHOLE': {   // Singularity: pull (strongest at the edge), slow, damage
        if (d < R * 1.5 && d > 0.8) { const w = d >= R ? 1 : 0.35 + 0.65 * (d / R); shove(dx / d, dz / d, 3.4 * w * dt); }
        if (d < R) slowPlayer(0.3);
        if (tick && d < R) damagePlayer(f.dmg, { pos: z.pos, kind: 'MAGIC' });
        break;
      }
      case 'FROST_FIELD':   // slowing ice
        if (d < R) { slowPlayer(0.3); if (tick) damagePlayer(f.dmg, { pos: z.pos, kind: 'ICE' }); }
        break;
      case 'CURSE':   // Plague Ground: rot + slow
        if (d < R) { slowPlayer(0.3); if (tick) applyPlayerDebuff('POISON', 1.5, f.dmg * 2); }
        break;
      default: break;
    }
  }
}

function tickPending(dt: number): void {
  for (const p of pend) {
    if (!p.active) continue;
    p.t -= dt;
    if (p.t > 0) continue;
    p.active = false;
    if (p.kind === 1) { spawnWave(p.x, p.z, 14, 22, 1.4, p.dmg, WAVE_FIRE, 0xc04aff); events.emit('shockwave', { pos: tmp.set(p.x, 0, p.z), radius: 22, color: 0xff7a3a }); continue; }
    if (p.fx) fx(p.fx, p.x, p.z, p.r);
    else events.emit('explosion', { pos: tmp.set(p.x, 0, p.z), radius: p.r, color: C_VIOLET });
    if (playerIn(p.x, p.z, p.r)) {
      damagePlayer(p.dmg, { pos: tmp.set(p.x, 0, p.z), kind: p.dk });
      hitSpark();
      effects(p.eff, p.dmg, p.x, p.z);
    }
  }
}

// Hostile ground fx (copies of the hero's): their hits land on the hero here, in sync with the visuals.
hooks.hostileFx = (f: GroundFx): void => {
  const e = S.id >= 0 ? world.enemies[S.id] : null;
  const P = e ? pw(e) : 10;
  switch (f.kind) {
    case 'RAIN_ARROW':
      fx('RAIN', f.x, f.z, f.radius);
      if (f.dmg > 0 && playerIn(f.x, f.z, f.radius * 0.6)) damagePlayer(f.dmg, { pos: fxPos, kind: 'PHYSICAL' });
      break;
    case 'SPIKE':
      events.emit('fxImpact', { pos: fxPos.set(f.x, 0, f.z), kind: 'SPIKE', radius: f.radius });
      if (f.dmg > 0 && !S.spikeHit && playerIn(f.x, f.z, f.radius)) {
        S.spikeHit = true;   // one hit per fissure
        damagePlayer(f.dmg, { pos: fxPos, kind: 'PHYSICAL' });
        if (f.aux > 0) applyPlayerDebuff('STUN', f.aux);
      }
      break;
    case 'ARROW_STICK':
      if (f.dmg > 0) {
        events.emit('explosion', { pos: fxPos.set(f.x, 0, f.z), radius: f.radius * 0.8, color: C_VIOLET });
        if (playerIn(f.x, f.z, f.radius)) { damagePlayer(f.dmg, { pos: fxPos, kind: 'PHYSICAL' }); effects(KNOCK, f.dmg, f.x, f.z); }
      }
      break;
    case 'TRAP':   // Frost Field: burst + a slowing ice field + crystals
      events.emit('frostNova', { pos: fxPos.set(f.x, 0, f.z), radius: f.radius * 1.3 });
      if (playerIn(f.x, f.z, f.radius)) { damagePlayer(f.dmg, { pos: fxPos, kind: 'ICE' }); slowPlayer(2.5); }
      field('FROST_FIELD', f.x, f.z, f.aux, 3.6, P * 0.2, 0x9fc8ff);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283 + f.seed * 6, dd = 1.5 + (i % 2) * 1.6; const c = allocFx(); if (c) { c.active = true; c.kind = 'CRYSTAL'; c.x = f.x + Math.cos(a) * dd; c.z = f.z + Math.sin(a) * dd; c.delay = 0; c.life = 3.6; c.radius = 0; c.dmg = 0; c.hostile = true; } }
      break;
    case 'BIG_METEOR':   // Meteor Cataclysm: impact (resolved by its strike circle), 2 fire rings, molten crater with lava spouts
      events.emit('ultImpact', { pos: fxPos.set(f.x, 0, f.z), name: 'METEOR', radius: 22 });
      events.emit('crater', { pos: fxPos, radius: 8, color: 0x12061a });
      events.emit('shake', { amount: 0.9 });
      ringLater(f.x, f.z, 0.15, P * 0.8); ringLater(f.x, f.z, 0.6, P * 0.8);
      spawnHostileZone('FIREPATCH', f.x, f.z, 5.5, 2.6, Math.max(3, P * 0.25), 0xc04aff);
      for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 6; strike(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 2.2, 0.6 + i * 0.45, P * 0.8, BURN, '', C_FIRE, 'FIRE'); }
      break;
    case 'GOLEM_DROP': {   // Army of the Dead: the golem lands (stun + knock) and fights for 20 s
      fxPos.set(f.x, 0, f.z);
      events.emit('explosion', { pos: fxPos, radius: f.radius * 0.6, color: 0x6a3aa8 });
      events.emit('shockwave', { pos: fxPos, radius: f.radius * 1.8, color: 0xc8a8ff });
      events.emit('crater', { pos: fxPos, radius: f.radius * 0.6, color: 0x120a18 });
      events.emit('shake', { amount: 0.6 });
      if (playerIn(f.x, f.z, f.radius)) { damagePlayer(f.dmg, { pos: fxPos, kind: 'PHYSICAL' }); effects(STUN | KNOCK, f.dmg, f.x, f.z); }
      if (S.id >= 0) {
        const g = spawnEnemy('BONE_GOLEM', tmp.set(f.x, 0, f.z));
        if (g) { g.xp = 0; g.gold = 0; g.state = 'CHASE'; g.stateT = 0; g.attackCd = 1.5; S.golemId = g.id; S.golemT = 20; }
      }
      break;
    }
    default: break;
  }
};
