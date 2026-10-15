// ============================================================================
// Player projectiles: basic attacks + every player-fired bolt in the pool.
// Movement, obstacle/crate/enemy collision, pierce, splash, bounces, boomerang.
// ============================================================================
import { spawnMinion, minionCount, MINION_WARRIOR, MINION_MAGE, MINION_ARCHER, PERMANENT } from './minions';
import { weaponPerk, raiseEvery, raiseCap, MULTI_ARROWS, twinSlashes, axeCount, greatMul, bigMul, bleedChance, pierceChance, elementChance } from '../../weaponPerks';
import { GameStatus } from '../../types';
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone, ARENA_RADIUS } from '../world';
import { events, type DamageKind } from '../events';
import type { Projectile, ProjectileKind, Enemy } from '../types';
import type { ProjectileType } from '../../types';
import { MULTISHOT_CAP } from '../../constants';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, autoAim, applyStatus, findNearestEnemy, getAimDir, rollCrit, lastCrit,
  type DamageOpts, type StatusEffect,
} from './combat';
import { queryColliders, type Collider } from '../mapgen';
import { hitCrate } from './crates';

export interface ProjSpec {
  life: number;
  pierce?: number;
  radius?: number;
  aoe?: number;
  knockback?: number;
  effect?: Projectile['effect'];
  bounces?: number;
  homing?: number;
  y?: number;
  emp?: boolean;
}

const ORIGIN_Y = 1.2;
const CRATE_HIT_RADIUS = 1.6;
const CRATE_ID_OFFSET = 10000;

const projOut: number[] = [];
const bounceOut: number[] = [];
const colOut: Collider[] = [];
const aim = new Vector3();
const hitOpts: DamageOpts = { kind: 'PHYSICAL', crit: false, source: 'PLAYER' };
const splashOpts: DamageOpts = { kind: 'PHYSICAL', crit: false, source: 'PLAYER' };
const knockTmp = new Vector3();
const splashStatus: StatusEffect = { type: 'BURN', duration: 0 };

/** Which damage school a projectile belongs to. */
export function damageKindOf(kind: ProjectileKind): DamageKind {
  switch (kind) {
    case 'FIREBALL': case 'BURNING_ARROW': return 'FIRE';
    case 'FREEZING_ARROW': return 'ICE';
    case 'MAGIC': case 'STORM': case 'PET_BOLT': case 'SOUL_BOLT': return 'MAGIC';
    default: return 'PHYSICAL';
  }
}

/** Allocates + initialises a player projectile. Returns null when the pool is exhausted. */
export function spawnProjectile(
  kind: ProjectileKind, x: number, z: number, dx: number, dz: number, speed: number, damage: number, spec: ProjSpec,
): Projectile | null {
  const p = allocProjectile();
  if (!p) return null;
  p.active = true;
  p.kind = kind;
  p.pos.set(x, spec.y ?? ORIGIN_Y, z);
  p.vel.set(dx * speed, 0, dz * speed);
  p.life = p.maxLife = spec.life;
  p.damage = damage;
  p.pierce = spec.pierce ?? 1;
  if (spec.radius !== undefined) p.radius = spec.radius;
  p.aoeRadius = spec.aoe ?? 0;
  p.knockback = spec.knockback ?? 0;
  p.effect = spec.effect;
  p.bounces = spec.bounces ?? 0;
  p.homing = spec.homing ?? 0;
  p.emp = spec.emp === true;
  return p;
}

// ------------------------------------------------------------ proc system --
/** Per-run on-attack proc state. Reset by resetProcs() on startRun. */
export const procFlags = { stomp: 0, smite: 0 };   // set to skill level by the basic attack; consumed by skills.ts
let procCount = 0;                       // volleys since the last proc
let raiseCount = 0;                      // soul bolts since the last wand MAGES / BOWMEN raise
let archerNext = 0;                      // 0 = fire next, 1 = ice next

let procHaste = 0;
let echoCount = 0;
/** Archer burning / freezing arrows fire on every 6th attack (alternating when both are learned). */
const ARCHER_PROC = 6;
/** Shared on-hit payloads of elemental staff bolts (burn value refreshed per shot). */
const fireFx: NonNullable<Projectile['effect']> = { type: 'BURN', duration: 3, value: 0 };
const iceFx: NonNullable<Projectile['effect']> = { type: 'SLOW', duration: 2.5, value: 0.5 };
/** Piercing Shot passive: shelved for now (removed from the skill list); flip to bring it back. */
const PIERCE_SHOT_ON = false;
const procN = (lv: number): number => Math.max(6, 13 - lv - procHaste);
/** Grave Call (a summon): 30% longer between raises than the other class procs. */
const graveN = (lv: number): number => Math.round(procN(lv) * 1.3);

export function resetProcs(): void { procCount = 0; archerNext = 0; procFlags.stomp = 0; procFlags.smite = 0; echoCount = 0; }

/** HUD: attacks remaining until `skill` procs (0 when locked / not a proc skill of this hero). */
export function procHud(skill: string, out: { t: number; max: number }): void {
  const st = useGameStore.getState();
  const lv = st.skillLevels;
  procHaste = st.stats.procHaste;
  let n = 0, left = 0;
  if (st.hero === 'ARCHER' && (skill === 'burning' || skill === 'freezing')) {
    const fire = lv.burning > 0, ice = lv.freezing > 0;
    if (!fire && !ice) { out.t = 0; out.max = 0; return; }
    const nextIce = fire && ice ? archerNext === 1 : ice;
    const next = nextIce ? 'freezing' : 'burning';
    const nNext = ARCHER_PROC;
    if (skill === next) { n = nNext; left = n - procCount; }
    else {
      const l = skill === 'freezing' ? lv.freezing : lv.burning;
      if (l <= 0) { out.t = 0; out.max = 0; return; }
      n = nNext + ARCHER_PROC; left = n - procCount;
    }
  } else if (st.hero === 'WIZARD' && skill === 'thunder' && lv.thunder > 0) {
    n = procN(lv.thunder); left = n - procCount;
  } else if (st.hero === 'BARBARIAN' && skill === 'stamp' && lv.stamp > 0) {
    n = procN(lv.stamp); left = n - procCount;
  } else if (st.hero === 'NECROMANCER' && skill === 'graveCall' && lv.graveCall > 0) {
    n = graveN(lv.graveCall); left = n - procCount;
  } else if (st.hero === 'KNIGHT' && skill === 'smite' && lv.smite > 0) {
    n = procN(lv.smite); left = n - procCount;
  } else { out.t = 0; out.max = 0; return; }
  out.t = left > 0 ? left : 0; out.max = n;
}

const chainOut: number[] = [];
const chainOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER', crit: false };
const chainHit: Enemy[] = [];
/** Thundercaller proc: lightning leaps from `from` to 2 + lvl nearby enemies. */
function chainLightning(from: Enemy, lvl: number): void {
  const st = useGameStore.getState().stats;
  const dmg = st.damage * 0.585 * st.skillDamage * (1 + 0.15 * Math.max(0, lvl - 1));
  const ids = world.enemyGrid.query(from.pos.x, from.pos.z, 24, chainOut);
  chainHit.length = 0;
  chainHit.push(from);
  let cur = from;
  for (let n = 1 + lvl + (useGameStore.getState().stats.thunderChain | 0); n > 0; n--) {
    let best: Enemy | null = null, bd = 18 * 18;
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || chainHit.indexOf(e) !== -1) continue;
      const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    events.emit('lightning', { from: new Vector3(cur.pos.x, 1.2, cur.pos.z), to: new Vector3(best.pos.x, 1.2, best.pos.z) });
    damageEnemy(best, dmg, chainOpts);
    chainHit.push(best);
    cur = best;
  }
}

// ------------------------------------------------------------ basic attack --
function defaultProjectileType(): ProjectileType {
  const hero = useGameStore.getState().hero;
  return hero === 'WIZARD' ? 'MAGIC' : hero === 'BARBARIAN' ? 'AXE' : hero === 'KNIGHT' ? 'SWORD' : hero === 'NECROMANCER' ? 'SOUL' : 'ARROW';
}

/** Fires the hero's basic attack towards the aim point. Called by player.ts on its fire timer. */
export function fireBasicAttack(): void {
  const st = useGameStore.getState();
  const stats = st.stats;
  const weapon = st.equipment.weapon;
  const ptype = weapon?.projectileType ?? defaultProjectileType();
  const pl = world.player;
  const dir = getAimDir(aim);
  let count = Math.max(1, Math.min(MULTISHOT_CAP, Math.floor(stats.multishot + 1e-6)));
  procHaste = stats.procHaste;
  const extraPierce = stats.pierceBonus | 0;

  let effect: Projectile['effect'];
  if (weapon?.onHitEffect) {
    const w = weapon.onHitEffect;
    effect = {
      type: w.type, duration: w.duration, chance: w.chance,
      value: w.type === 'BURN' || w.type === 'POISON' ? stats.damage * 0.3 : w.value,
    };
  }

  let kind: ProjectileKind;
  let speed = stats.projectileSpeed;
  let life = 3;
  let pierce = 1;
  let aoe = 0;
  let radius = 1.5;
  switch (ptype) {
    case 'AXE': kind = 'AXE'; speed *= 1.8; life = 2.6; pierce = 4; break; // shorter throw: barbarian is close range
    case 'SWORD': kind = 'SLASH'; speed = 24; life = 0.26; pierce = 999; radius = world.player.avatarT > 0 ? 5 : 2.5; break;   // knight: a short wide sword arc (2x in Divine Avatar)   // knight: a short wide sword arc
    case 'MAGIC': kind = 'MAGIC'; speed *= 0.6; pierce = 4 + extraPierce; aoe = 3.2; radius = 3.4; break;   // big arcane orbs
    case 'SOUL': kind = 'SOUL_BOLT'; speed *= 0.95; life = 1.6; pierce = 1; aoe = 1.8; radius = 1.2; break;   // necromancer: one target, no pierce, a small splash (half damage)
    default: kind = 'ARROW'; speed *= 1.5; life = 2.2; pierce = 1 + extraPierce; break;
  }

  // ---- weapon perk (weaponPerks.ts): one class-specific perk per weapon, strength by rarity
  const perk = weaponPerk(weapon);
  let perkDmg = 1;
  if (perk) {
    if (perk.k === 'BIG' && kind === 'SOUL_BOLT') { const b2 = bigMul(perk.lv); radius *= b2.size; speed *= b2.speed; }
    else if (perk.k === 'MULTI' && kind === 'ARROW') count = Math.max(count, MULTI_ARROWS[perk.lv]);
    else if (perk.k === 'TWIN' && kind === 'SLASH') count = Math.max(count, twinSlashes(perk.lv));
    else if (perk.k === 'AXES' && kind === 'AXE') count = Math.max(count, axeCount(perk.lv));
    else if (perk.k === 'GREAT' && kind === 'SLASH') { const g = greatMul(perk.lv); radius *= g.size; perkDmg = g.dmg; }
    else if (perk.k === 'BIG' && kind === 'MAGIC') { const b = bigMul(perk.lv); radius *= b.size; aoe *= b.size; speed *= b.speed; }
    else if (perk.k === 'BLEED' && kind === 'AXE' && !effect) effect = { type: 'POISON', duration: 3, chance: bleedChance(perk.lv), value: stats.damage * (0.15 + 0.05 * perk.lv) };
  }
  const swordTint = kind === 'SLASH' && weapon ? (weapon.rarity === 'MYTHIC' ? 5 : weapon.rarity === 'LEGENDARY' ? 4 : 0) : 0;   // red / black blades

  // ---- on-attack procs (per-volley counter)
  const lv = st.skillLevels;
  const hero = st.hero;
  procCount++;
  let special: 'BURNING_ARROW' | 'FREEZING_ARROW' | null = null;
  let specialLv = 0;
  let thunderProc = 0;
  let graveProc = 0;
  if (hero === 'ARCHER' && kind === 'ARROW' && (lv.burning > 0 || lv.freezing > 0)) {
    const useIce = lv.burning > 0 && lv.freezing > 0 ? archerNext === 1 : lv.freezing > 0;
    specialLv = useIce ? lv.freezing : lv.burning;
    if (procCount >= ARCHER_PROC) {   // burning / freezing arrow: every 6th attack
      procCount = 0;
      special = useIce ? 'FREEZING_ARROW' : 'BURNING_ARROW';
      if (lv.burning > 0 && lv.freezing > 0) archerNext = useIce ? 0 : 1;
    }
  } else if (hero === 'WIZARD' && kind === 'MAGIC' && lv.thunder > 0) {
    if (procCount >= procN(lv.thunder)) { procCount = 0; thunderProc = lv.thunder; }
  } else if (hero === 'BARBARIAN' && kind === 'AXE' && lv.stamp > 0) {
    if (procCount >= procN(lv.stamp)) { procCount = 0; procFlags.stomp = lv.stamp; }
  } else if (hero === 'NECROMANCER' && kind === 'SOUL_BOLT' && lv.graveCall > 0) {
    if (procCount >= graveN(lv.graveCall)) { procCount = 0; graveProc = lv.graveCall; }
  } else if (hero === 'KNIGHT' && kind === 'SLASH' && lv.smite > 0) {
    if (procCount >= procN(lv.smite)) { procCount = 0; procFlags.smite = lv.smite; }
  }

  const emp = kind === 'SLASH' && pl.avatarT > 0;   // Divine Avatar: golden double-size sword arcs (render reads p.emp)
  const lowHp = stats.berserk > 0 && pl.hp < stats.maxHealth * 0.35;
  const dmgMul = perkDmg * (1 + pl.buffDmg) * (pl.avatarT > 0 ? 1.5 : 1) * (pl.cryT > 0 ? 1.3 : 1) * (pl.titanT > 0 ? 1.5 : 1) * (lowHp ? 1 + stats.berserk : 1);
  // Echo (sets / talents): every Nth attack fires a second volley.
  let echo = false;
  if (stats.echoEvery > 0 && ++echoCount >= stats.echoEvery) { echo = true; echoCount = 0; }
  const baseX = pl.pos.x + dir.x * 0.9;
  const baseZ = pl.pos.z + dir.z * 0.9;
  // Split shot = forward fan only: whole fan capped at ~50 deg (+-25 deg), however much Spread gear stacks.
  const wideBow = kind === 'ARROW' && count > 3;   // bow multishot: a wider forward fan (still never behind the hero)
  const fanStep = count > 1 ? (kind === 'SLASH' ? 0.4 : Math.min(wideBow ? Math.max(stats.spread, 0.22) : stats.spread, (wideBow ? 1.2 : 0.87) / (count - 1))) : 0;
  for (let rp = 0; rp < (echo ? 2 : 1); rp++) for (let i = 0; i < count; i++) {
    const off = i - (count - 1) / 2;
    let dx = dir.x, dz = dir.z, ox = baseX, oz = baseZ;
    if (rp === 1) { ox += -dir.z * 0.8; oz += dir.x * 0.8; }
    if (kind === 'AXE') {
      ox += -dir.z * off * 2.0;
      oz += dir.x * off * 2.0;
    } else if (off !== 0) {
      const a = off * fanStep;
      const c = Math.cos(a), s = Math.sin(a);
      dx = dir.x * c - dir.z * s;
      dz = dir.x * s + dir.z * c;
    }
    if (rp === 0 && special) {
      // Archer passive proc: EVERY arrow of this volley (multishot included) becomes the burning / freezing arrow.
        const burn = special === 'BURNING_ARROW';
        const dmg = stats.damage * dmgMul * (burn ? 1.05 : 1.2) * stats.skillDamage * (1 + 0.15 * (specialLv - 1));
        spawnProjectile(special, ox, oz, dx, dz, 30, dmg, {
          emp, life: 3, pierce: (burn ? 3 : 2) + extraPierce, aoe: burn ? 2.5 : 2, radius: 3, knockback: stats.knockback,
          effect: burn ? { type: 'BURN', duration: 4, value: stats.damage * 0.3 }
            : { type: 'SLOW', duration: 3 + 0.3 * specialLv, value: 0.6 },
        });
      continue;
    }
    if (rp === 0 && i === Math.floor((count - 1) / 2) && thunderProc) {
      const p = spawnProjectile(kind, ox, oz, dx, dz, speed, stats.damage * dmgMul, {
        life, pierce, aoe, radius, knockback: stats.knockback, effect, emp,
      });
      if (p) p.procLv = thunderProc;
      continue;
    }
    // Archer: Piercing Shot (a chance per arrow to pierce on into the enemy behind, blue) / Inspire (white arrows)
    const ps = PIERCE_SHOT_ON && kind === 'ARROW' && lv.pierceShot > 0 && Math.random() < 0.15 + 0.05 * lv.pierceShot;
    const gp = perk?.k === 'PIERCE' && kind === 'ARROW' && Math.random() < pierceChance(perk.lv);   // bow perk: green piercing arrow
    // staff perk: elemental bolt (fire burns, ice slows, lightning chains)
    const el = perk?.k === 'ELEMENT' && kind === 'MAGIC' && Math.random() < elementChance(perk.lv) ? perk.el : null;
    let fxE = effect;
    if (el === 'FIRE') { fireFx.value = stats.damage * 0.3; fxE = fireFx; } else if (el === 'ICE') fxE = iceFx;
    const np = spawnProjectile(kind, ox, oz, dx, dz, speed, stats.damage * dmgMul, {
      life, pierce: ps ? pierce + 1 + (lv.pierceShot >> 1) : gp ? pierce + 1 : pierce, aoe, radius, knockback: stats.knockback, effect: fxE, emp,
    });
    if (np && kind === 'ARROW') np.tint = gp ? 3 : ps ? 1 : hero === 'ARCHER' && pl.buffT > 0 && pl.buffHaste > 0 ? 2 : 0;
    if (np && kind === 'SLASH') np.tint = swordTint;
    if (np && el) { np.tint = el === 'FIRE' ? 6 : el === 'ICE' ? 7 : 8; if (el === 'LIGHTNING') np.procLv = perk!.lv; }
    if (np && kind === 'AXE') { np.bounces = (i + rp) & 1; np.trailT = 0; }   // boomerang: alternate curve side per axe
    if (np && kind === 'SLASH') np.bounces = (procCount + i) & 1;              // alternate swing direction (render mirror)
  }
  // Divine Avatar: every sword swing also releases a Holy Wave
  if (kind === 'SLASH' && pl.avatarT > 0) {
    spawnProjectile('HOLY_WAVE', baseX, baseZ, dir.x, dir.z, 22, stats.damage * dmgMul * 2 * stats.skillDamage, { life: 0.8, pierce: 999, knockback: 1.2, radius: 3.2, y: 1.1 });
  }
  // Grave Call: a skeleton warrior claws up beside the target
  if (graveProc) {
    const t = autoAim.id >= 0 ? world.enemies[autoAim.id] : null;
    const gx = t && t.active ? t.pos.x - dir.x * 1.5 : pl.pos.x + dir.x * 4, gz = t && t.active ? t.pos.z - dir.z * 1.5 : pl.pos.z + dir.z * 4;
    spawnMinion(MINION_WARRIOR, gx, gz, stats.damage * 0.8, PERMANENT);
  }
  // wand perk Bone Choir / Grave Archers: every Nth soul bolt a ranged skeleton rises behind you (up to a cap)
  if (kind === 'SOUL_BOLT' && perk && (perk.k === 'MAGES' || perk.k === 'BOWMEN') && ++raiseCount >= raiseEvery(perk.lv)) {
    const mk = perk.k === 'MAGES' ? MINION_MAGE : MINION_ARCHER;
    if (minionCount(mk) < raiseCap(perk.k, perk.lv)) {
      raiseCount = 0;
      const a = pl.facing + Math.PI + (Math.random() - 0.5) * 1.6;
      spawnMinion(mk, pl.pos.x + Math.sin(a) * 2.2, pl.pos.z + Math.cos(a) * 2.2, stats.damage * (mk === MINION_MAGE ? 0.9 : 0.6), PERMANENT);
    } else raiseCount = 0;   // at the cap: the count (the perk's "cooldown") only runs once one has fallen
  }
  pl.anim.attackT = 1;
  events.emit('shoot', { pos: pl.pos, dir, kind });
}

// ----------------------------------------------------------------- helpers --
function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = 0;
  if (l2 > 1e-8) {
    t = ((px - ax) * abx + (pz - az) * abz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return cx * cx + cz * cz;
}

function blockedByObstacles(kind: ProjectileKind): boolean {
  // rocks / trees / pillars stop shots; only melee arcs, waves, storms, orbiting blades and the Gale Arrow pass over them
  return !(kind === 'GALE_ARROW' || kind === 'PIERCING_ARROW' || kind === 'BONE_SPEAR' || kind === 'STORM' || kind === 'ORBITAL_BLADE' || kind === 'X_SLASH' || kind === 'SLASH' || kind === 'HOLY_WAVE');
}

function dropFireZone(p: Projectile): void {
  const z = allocZone();
  if (!z) return;
  z.active = true;
  z.kind = 'FIRE';
  z.hostile = false;
  z.pos.set(p.pos.x, 0, p.pos.z);
  z.radius = 2.2;
  z.life = z.maxLife = 3;
  z.damage = p.damage * 0.03; // dps per zone (trail zones overlap heavily)
  z.color = 0xf97316;
}

/** Fan of Flames: small, short fire patch where an arrow hits an enemy / ends. */
function fanPatch(p: Projectile, x: number, zz: number): void {
  const z = allocZone();
  if (!z) return;
  z.active = true; z.kind = 'FIRE'; z.hostile = false;
  z.pos.set(x, 0, zz); z.radius = 1.6; z.life = z.maxLife = 1.8;
  z.damage = p.damage * 0.25; z.color = 0xf97316; z.aux = 0;
}

/** Axe Storm ricochet: redirect toward the nearest un-hit enemy. Returns true when it bounced. */
function ricochet(p: Projectile, fromX: number, fromZ: number, skip: Enemy | null): boolean {
  if (p.bounces <= 0) return false;
  const ids = world.enemyGrid.query(fromX, fromZ, 40, bounceOut);
  let best: Enemy | null = null, bd = 40 * 40;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (e === skip || !e.active || e.state === 'DYING' || e.state === 'SPAWN' || p.hitIds.indexOf(e.id) !== -1) continue;
    const dx = e.pos.x - fromX, dz = e.pos.z - fromZ, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return false;
  const dx = best.pos.x - fromX, dz = best.pos.z - fromZ, l = Math.sqrt(dx * dx + dz * dz) || 1;
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 30;
  p.vel.set((dx / l) * sp, 0, (dz / l) * sp);
  p.bounces--;
  p.life = Math.max(p.life, 1.5);
  events.emit('projectileImpact', { pos: p.pos, kind: p.kind, tint: p.tint });
  events.emit('explosion', { pos: new Vector3(fromX, 1, fromZ), radius: 1.4, color: 0xffa050 });
  return true;
}

function bounceStorm(p: Projectile, from: Enemy): void {
  if (p.bounces <= 0) return;
  const ids = world.enemyGrid.query(from.pos.x, from.pos.z, 30, bounceOut);
  let best: Enemy | null = null;
  let bestD = 30 * 30;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (e === from || !e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    if (p.hitIds.indexOf(e.id) !== -1) continue;
    const dx = e.pos.x - from.pos.x, dz = e.pos.z - from.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return;
  p.bounces--;
  const dx = best.pos.x - from.pos.x, dz = best.pos.z - from.pos.z;
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  p.vel.set((dx / l) * 15, 0, (dz / l) * 15);
  p.pos.x = from.pos.x + (dx / l);
  p.pos.z = from.pos.z + (dz / l);
}

function hitEnemy(p: Projectile, e: Enemy, critRate: number, critDamage: number): void {
  if (e.shellT > 0) { // Tidal Shell reflects projectiles
    p.vel.x = -p.vel.x; p.vel.z = -p.vel.z; p.hitIds.push(e.id);
    events.emit('projectileImpact', { pos: p.pos, kind: p.kind, tint: p.tint });
    events.emit('floatText', { pos: e.pos, text: 'X', color: 0x9ad0ff, scale: 0.6, dy: 0.6 });
    return;
  }
  const mult = p.kind === 'ORBITAL_BLADE' ? 1 : rollCrit(critRate, critDamage);
  const crit = p.kind === 'ORBITAL_BLADE' ? false : lastCrit;
  let dmg = p.damage * mult;
  const dkind = damageKindOf(p.kind);
  // Archer synergy: enemies chilled by Frost Field / Chain Frost shatter under Gale Arrow (+30%)
  if (p.kind === 'GALE_ARROW' && e.frostT > 0) {
    dmg *= 1.3;
    events.emit('floatText', { pos: e.pos, text: 'SHATTER', color: 0x8fe4ff, scale: 0.7, dy: 0.5 });
  }

  const fx = p.effect;
  if (fx && (fx.chance === undefined || Math.random() < fx.chance)) applyStatusFast(e, fx);
  const petShot = p.kind === 'PET_BOLT' || (p.kind === 'ARROW' && p.tint === 10);   // pet / minion shots: no hero on-hit procs
  if (!petShot) {
    const ps = useGameStore.getState().stats;
    if (ps.onHitBurnChance > 0 && Math.random() < ps.onHitBurnChance) { fxTmp.type = 'BURN'; fxTmp.duration = 3; fxTmp.value = Math.max(3, ps.damage * 0.25); applyStatus(e, fxTmp); }
    if (ps.onHitSlowChance > 0 && Math.random() < ps.onHitSlowChance) { fxTmp.type = 'SLOW'; fxTmp.duration = 2.5; fxTmp.value = 0.4; applyStatus(e, fxTmp); }
  }

  if (p.aoeRadius > 0) {
    splashOpts.kind = dkind;
    splashOpts.knockback = 0;
    let status: StatusEffect | undefined;
    let splashMul = p.kind === 'MAGIC' ? 0.35 : 0.5;
    if (p.kind === 'FREEZING_ARROW') {
      // Much less explosive than before: small, weak splash, softer slow.
      splashMul = 0.4;
      splashStatus.type = 'SLOW'; splashStatus.duration = 2; splashStatus.value = 0.4;
      status = splashStatus;
    } else if (fx && p.kind === 'BURNING_ARROW') {
      splashStatus.type = fx.type; splashStatus.duration = fx.duration; splashStatus.value = fx.value;
      status = splashStatus;
    }
    damageEnemiesInRadius(e.pos.x, e.pos.z, p.aoeRadius, dmg * splashMul, splashOpts, status, e.id);
    if (p.kind === 'BURNING_ARROW' || p.kind === 'FREEZING_ARROW') {
      events.emit('explosion', { pos: e.pos.clone(), radius: p.aoeRadius, color: p.kind === 'BURNING_ARROW' ? 0xef4444 : 0x38bdf8 });
    }
  }

  // Knock away from the projectile.
  const kx = e.pos.x - p.pos.x, kz = e.pos.z - p.pos.z;
  const kl = Math.sqrt(kx * kx + kz * kz);
  if (kl > 1e-4) knockTmp.set(kx / kl, 0, kz / kl);
  else knockTmp.set(p.vel.x, 0, p.vel.z).normalize();
  hitOpts.kind = dkind;
  hitOpts.crit = crit;
  hitOpts.knockDir = knockTmp;
  hitOpts.knockback = p.knockback;
  hitOpts.source = petShot ? 'PET' : 'PLAYER';
  if (p.kind === 'BURNING_ARROW' && p.state === 2) fanPatch(p, e.pos.x, e.pos.z);
  damageEnemy(e, dmg, hitOpts);

  if (p.procLv > 0) { const l = p.procLv; p.procLv = 0; chainLightning(e, l); }

  p.hitIds.push(e.id);
  events.emit('projectileImpact', { pos: p.pos, kind: p.kind, tint: p.tint });

  if (p.kind === 'STORM') { bounceStorm(p, e); return; }
  if (p.kind === 'GIANT_AXE') ricochet(p, e.pos.x, e.pos.z, e);
  p.pierce -= 1;
  if (p.pierce <= 0) p.active = false;
}

// Allocation-free status application for projectile effects (same rules as combat.applyStatus).
const fxTmp: StatusEffect = { type: 'BURN', duration: 0 };
function applyStatusFast(e: Enemy, fx: NonNullable<Projectile['effect']>): void {
  fxTmp.type = fx.type; fxTmp.duration = fx.duration; fxTmp.value = fx.value;
  applyStatus(e, fxTmp);
}

// ------------------------------------------------------------------ update --
export function updateProjectiles(dt: number): void {
  const st = useGameStore.getState();
  const critRate = st.stats.critRate, critDamage = st.stats.critDamage;
  const pl = world.player;
  const pool = world.projectiles;
  const maxR = st.status === GameStatus.MENU ? 120 : ARENA_RADIUS + 20;   // the town hub is bigger than a room (hermit path monsters)
  const maxR2 = maxR * maxR;

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    // Orbiting blades are driven entirely by skills.ts until launched.
    if (p.kind === 'ORBITAL_BLADE' && p.state === 0) continue;

    // --- per-kind steering ---
    switch (p.kind) {
      case 'AXE': {
        // Boomerang: arcs out to one side (curving velocity, slowly losing speed), swings round after ~150 deg of turn,
        // then homes back to the hero with a limited turn rate (a loop, not a snap), hitting again on the way back.
        const sgn = p.bounces & 1 ? -1 : 1;
        const sp0 = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
        if (p.state === 0) {
          const age = p.maxLife - p.life;   // straight at first, then an ever tighter curve (elongated loop)
          const w = (0.3 + 6.5 * age) * sgn * dt, c = Math.cos(w), s = Math.sin(w);
          const vx = p.vel.x * c - p.vel.z * s, vz = p.vel.x * s + p.vel.z * c;
          const k = Math.exp(-1.5 * dt);
          p.vel.x = vx * k; p.vel.z = vz * k;
          p.trailT += Math.abs(w);
          if (p.trailT > 2.4) { p.state = 1; p.hitIds.length = 0; p.pierce = Math.max(p.pierce, 4); }
        } else {
          const dx = pl.pos.x - p.pos.x, dz = pl.pos.z - p.pos.z;
          const l = Math.sqrt(dx * dx + dz * dz) || 1;
          if (l < 1.5) { p.active = false; continue; }
          // turn the velocity towards the hero (max 5 rad/s), speed up to a fast return
          const want = Math.atan2(dz, dx), cur = Math.atan2(p.vel.z, p.vel.x);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const turn = Math.max(-5 * dt, Math.min(5 * dt, da)) + (l < 6 ? da * Math.min(1, 6 * dt) : 0);
          const sp = Math.min(46, sp0 + 30 * dt), a = cur + turn;
          p.vel.x = Math.cos(a) * sp; p.vel.z = Math.sin(a) * sp;
          p.trailT += dt * 10;
          if (p.trailT > 2.6 + 40) { p.active = false; continue; }   // safety: give up after ~4 s of homing
          p.life = Math.max(p.life, 0.5);   // otherwise it always comes home
        }
        p.spin += dt * 32;
        break;
      }
      case 'FIREBALL':
        p.trailT += dt;
        while (p.trailT >= 0.3) { p.trailT -= 0.3; dropFireZone(p); }   // (slow ball: sparser trail)
        p.spin += dt * 4;
        break;
      case 'GALE_ARROW':
        p.trailT += dt;
        while (p.trailT >= 0.11) {
          p.trailT -= 0.11;
          if (p.state < p.bounces && p.maxLife - p.life > 0.2) {
            p.state++;
            const z = allocZone();
            if (z) {
              z.active = true; z.kind = 'TORNADO'; z.hostile = false;
              z.pos.set(p.pos.x, 0, p.pos.z); z.radius = 4.2; z.life = z.maxLife = 1.6;
              z.damage = p.damage * 0.135; z.color = 0xa8f0d0; z.length = 10; z.maxPull = 7;   // gentle tug, few enemies
            }
          }
        }
        break;
      case 'BURNING_ARROW': break;
      case 'MAGIC': p.spin += dt * 6; break;
      case 'STORM': p.spin += dt * 15; break;
      default: break;
    }

    if (p.homing > 0) {
      const t = findNearestEnemy(p.pos.x, p.pos.z, 25);
      if (t) {
        const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z) || 1;
        const tx = t.pos.x - p.pos.x, tz = t.pos.z - p.pos.z;
        const tl = Math.sqrt(tx * tx + tz * tz) || 1;
        const k = Math.min(1, p.homing * dt);
        let nx = p.vel.x / sp + (tx / tl - p.vel.x / sp) * k;
        let nz = p.vel.z / sp + (tz / tl - p.vel.z / sp) * k;
        const nl = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= nl; nz /= nl;
        p.vel.x = nx * sp; p.vel.z = nz * sp;
      }
    }

    // --- move ---
    const px = p.pos.x, pz = p.pos.z;
    const nx = px + p.vel.x * dt, nz = pz + p.vel.z * dt;
    p.pos.x = nx; p.pos.z = nz;

    p.life -= dt;
    if (p.life <= 0 || nx * nx + nz * nz > maxR2) { if (p.kind === 'BURNING_ARROW' && p.state === 2 && p.life <= 0) fanPatch(p, nx, nz); p.active = false; continue; }

    // --- obstacles ---
    if (blockedByObstacles(p.kind)) {
      const cols = queryColliders(nx, nz, 1.2, colOut);
      let blocked = false;
      for (let c = 0; c < cols.length; c++) {
        const o = cols[c];
        if (!o.blocksProjectiles) continue;
        const dx = nx - o.x, dz = nz - o.z;
        const rr = o.r + 0.3;
        if (dx * dx + dz * dz < rr * rr) { blocked = true; break; }
      }
      if (blocked) {
        events.emit('projectileImpact', { pos: p.pos, kind: p.kind, tint: p.tint });
        if (p.kind === 'GIANT_AXE' && ricochet(p, px, pz, null)) { p.pos.x = px; p.pos.z = pz; continue; }
        p.active = false;
        continue;
      }
    }

    // --- crates ---
    const crates = world.crates;
    for (let c = 0; c < crates.length; c++) {
      const cr = crates[c];
      if (!cr.active) continue;
      const dx = cr.pos.x - nx, dz = cr.pos.z - nz;
      if (dx * dx + dz * dz > CRATE_HIT_RADIUS * CRATE_HIT_RADIUS) continue;
      const key = CRATE_ID_OFFSET + cr.id;
      if (p.hitIds.indexOf(key) !== -1) continue;
      p.hitIds.push(key);
      hitCrate(cr, p.damage);
      events.emit('projectileImpact', { pos: p.pos, kind: p.kind, tint: p.tint });
      p.pierce -= 1;
      if (p.pierce <= 0) { p.active = false; break; }
    }
    if (!p.active) continue;

    // --- enemies (swept test against the grid) ---
    const mx = (px + nx) * 0.5, mz = (pz + nz) * 0.5;
    const half = Math.sqrt((nx - px) * (nx - px) + (nz - pz) * (nz - pz)) * 0.5;
    const ids = world.enemyGrid.query(mx, mz, half + p.radius + 4, projOut);
    for (let k = 0; k < ids.length && p.active; k++) {
      const e = world.enemies[ids[k]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
      if (p.hitIds.indexOf(e.id) !== -1) continue;
      const rr = e.radius + p.radius;
      if (segDist2(px, pz, p.pos.x, p.pos.z, e.pos.x, e.pos.z) < rr * rr) hitEnemy(p, e, critRate, critDamage);
    }
  }
}
