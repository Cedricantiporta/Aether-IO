// ============================================================================
// Equipped pet: small state machine on world.pet.
//   FOLLOW (0): trail behind the player.   FETCH (1): fly to a loose pickup
//   outside the magnet range and grab it.  ATTACK (2): engage a nearby enemy.
// Every pet has a base attack + fetch; petSkill adds its specialty
// (HEAL timer here, ATTACK_RANGED shoots bolts, COLLECT fetches farther/faster,
// REVIVE is handled in combat.damagePlayer). The pet is invulnerable.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { useGameStore } from '../../store';
import { damageEnemy, damageEnemiesInRadius, applyStatus, findNearestEnemy, healPlayer, type DamageOpts } from './combat';
import { events } from '../events';
import { spawnPickup } from './pickups';
import type { Enemy } from '../types';
import { spawnProjectile } from './projectiles';
import { getMagnetRadius, petCollect } from './pickups';
import type { Pickup } from '../types';
import { petPower, petStage, petKillXp } from '../../petGrowth';
import { bufferPetXp, flushPetXp } from '../../petActions';

// ---- pet growth: kill XP is buffered in world.pet.xpBuf and committed to the pet item on discrete moments (level-up, room clear, death, run end).
events.on('enemyDeath', (e) => { if (!e.poof) bufferPetXp(petKillXp(e.elite, e.boss, world.director.wave)); });
events.on('waveClear', flushPetXp);
events.on('playerDeath', flushPetXp);
events.on('runEnd', flushPetXp);

const meleeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET' };
const FOLLOW = 0, FETCH = 1, ATTACK = 2;
const ENGAGE_R = 10;       // enemy distance from player that triggers ATTACK
const LEASH = 18;
const TELEPORT = 12;
const RANGED_STOP = 7;

/** Per-pet behaviour, keyed by pet name (instance ids are unique). Speeds: moveSpeed is a multiplier on the
 *  base follow/attack speed; fetchSpeed is absolute units/s. Non-attackers never ATTACK, non-fetchers never FETCH. */
export interface PetProfile {
  moveSpeed: number;
  fetches: boolean; fetchSpeed: number; fetchRange: number;
  attacks: boolean; attackMode: 'melee' | 'ranged'; dmgFactor: number; atkCd: number;
  heals: boolean;
  /** Visual/physical size multiplier (render scale + follow distance). */
  size: number;
  /** Burn applied by melee hits. */
  ignite?: boolean;
}
const NO_ATK = { attacks: false, attackMode: 'melee', dmgFactor: 0, atkCd: 1 } as const;
const NO_FETCH = { fetches: false, fetchSpeed: 0, fetchRange: 0 } as const;
export const PET_PROFILES: Record<string, PetProfile> = {
  'Green Blob':      { moveSpeed: 0.5, fetches: true, fetchSpeed: 5, fetchRange: 14, attacks: true, attackMode: 'melee', dmgFactor: 0.3, atkCd: 1.4, heals: true, size: 0.85 },
  'Vampire Bat':     { moveSpeed: 1.4, fetches: true, fetchSpeed: 30, fetchRange: 24, attacks: true, attackMode: 'melee', dmgFactor: 0.5, atkCd: 0.8, heals: false, size: 0.85 },
  'Light Fairy':     { moveSpeed: 1.0, fetches: true, fetchSpeed: 14, fetchRange: 14, ...NO_ATK, heals: true, size: 0.5 },
  'Spirit Wolf':     { moveSpeed: 1.4, fetches: true, fetchSpeed: 8, fetchRange: 14, attacks: true, attackMode: 'melee', dmgFactor: 1, atkCd: 0.45, heals: false, size: 1.1 },
  'Gold Dragon':     { moveSpeed: 1.0, fetches: true, fetchSpeed: 15, fetchRange: 14, attacks: true, attackMode: 'ranged', dmgFactor: 1, atkCd: 1.0, heals: false, size: 1.6 },
  'Pet Rock':        { moveSpeed: 0.3, ...NO_FETCH, ...NO_ATK, heals: false, size: 0.5 },
  'Iron Golem':      { moveSpeed: 0.55, ...NO_FETCH, attacks: true, attackMode: 'melee', dmgFactor: 2.5, atkCd: 2.2, heals: false, size: 1.9 },
  'Phoenix':         { moveSpeed: 1.2, fetches: true, fetchSpeed: 17, fetchRange: 14, attacks: true, attackMode: 'ranged', dmgFactor: 0.8, atkCd: 1.2, heals: false, size: 1.2 },
  'Celestial Wisp':  { moveSpeed: 1.5, fetches: true, fetchSpeed: 30, fetchRange: 24, attacks: true, attackMode: 'ranged', dmgFactor: 1, atkCd: 0.6, heals: false, size: 0.7 },
};
Object.assign(PET_PROFILES, {
  'Ember Fox':          { moveSpeed: 1.5, fetches: true, fetchSpeed: 14, fetchRange: 14, attacks: true, attackMode: 'melee', dmgFactor: 0.7, atkCd: 0.6, heals: false, size: 0.85, ignite: true },
  'Frost Owl':          { moveSpeed: 1.3, fetches: true, fetchSpeed: 22, fetchRange: 18, ...NO_ATK, heals: false, size: 0.8 },
  'Mimic Chest':        { moveSpeed: 0.9, fetches: false, fetchSpeed: 0, fetchRange: 0, attacks: true, attackMode: 'melee', dmgFactor: 1.2, atkCd: 0.9, heals: false, size: 1.0 },
  'Storm Sprite':       { moveSpeed: 1.3, fetches: true, fetchSpeed: 20, fetchRange: 16, ...NO_ATK, heals: false, size: 0.55 },
  'Shield Turtle':      { moveSpeed: 0.5, ...NO_FETCH, ...NO_ATK, heals: false, size: 1.0 },
  'Shadow Cat':         { moveSpeed: 1.6, fetches: true, fetchSpeed: 20, fetchRange: 16, attacks: true, attackMode: 'melee', dmgFactor: 1.1, atkCd: 0.4, heals: false, size: 0.9 },
  'Crystal Golemling':  { moveSpeed: 0.6, ...NO_FETCH, attacks: true, attackMode: 'melee', dmgFactor: 1.5, atkCd: 1.6, heals: false, size: 1.3 },
  'Aether Leviathan':   { moveSpeed: 1.1, fetches: true, fetchSpeed: 20, fetchRange: 16, attacks: true, attackMode: 'ranged', dmgFactor: 0.6, atkCd: 0.8, heals: false, size: 2.0 },
} as Record<string, PetProfile>);
const DEFAULT_PROFILE: PetProfile = { size: 1, moveSpeed: 1, fetches: true, fetchSpeed: 20, fetchRange: 14, attacks: true, attackMode: 'melee', dmgFactor: 0.45, atkCd: 0.9, heals: false };
export function getPetProfile(name: string | undefined | null): PetProfile {
  if (!name) return DEFAULT_PROFILE;
  if (PET_PROFILES[name]) return PET_PROFILES[name];
  for (const k in PET_PROFILES) if (name.includes(k)) return PET_PROFILES[k];
  return DEFAULT_PROFILE;
}

let lastPetId = '';
let vx = 0, vz = 0;
let scanT = 0;
let target: Pickup | null = null;

export function resetPets(): void {
  lastPetId = '';
  const p = world.pet;
  p.pos.set(-1.5, 1, 1.5);
  p.attackT = 0; p.skillT = 0; p.state = FOLLOW; p.carry = ''; p.carryT = 0; p.sparkT = 0; p.atkCd = 0;
  vx = vz = 0; scanT = 0; target = null;
  resetAbilities();
}

function turnTo(cur: number, want: number, k: number): number {
  let d = want - cur;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  return cur + d * k;
}

function findPickup(px: number, pz: number, fetchR: number, magnetR: number): Pickup | null {
  const st = useGameStore.getState();
  const pk = world.pickups, wp = world.pet;
  const fr2 = fetchR * fetchR, mr2 = magnetR * magnetR;
  let best: Pickup | null = null, bestD = 1e9;
  for (let i = 0; i < pk.length; i++) {
    const o = pk[i];
    if (!o.active || o.magnet || o.t < 0.8) continue;
    const dx = o.pos.x - px, dz = o.pos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > fr2 || d2 <= mr2) continue;
    if (o.kind === 'ITEM') continue;   // items are looted by hand (E), the pet leaves them
    const ex = o.pos.x - wp.pos.x, ez = o.pos.z - wp.pos.z;
    const e2 = ex * ex + ez * ez;
    if (e2 < bestD) { bestD = e2; best = o; }
  }
  return best;
}

/** Town: the equipped pet just trots after the hero (no skills, fetching or fighting). Allocation-free. */
export function updatePetTown(dt: number): void {
  const pet = useGameStore.getState().equipment.pet;
  const pl = world.player, wp = world.pet;
  if (!pet) return;
  wp.attackT = 0; wp.carryT = 0;
  // follow point: a little behind and to the side of the hero
  const fx = pl.pos.x - Math.sin(pl.facing) * 1.6 - Math.cos(pl.facing) * 0.9, fz = pl.pos.z - Math.cos(pl.facing) * 1.6 + Math.sin(pl.facing) * 0.9;
  const dx = fx - wp.pos.x, dz = fz - wp.pos.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 25) { wp.pos.set(fx, 1, fz); return; }   // fell far behind (teleport / area change)
  if (d > 0.3) {
    const sp = Math.min(d, (4 + d * 2.2) * dt);
    wp.pos.x += (dx / d) * sp; wp.pos.z += (dz / d) * sp;
    wp.facing = Math.atan2(dx, dz);
  }
  wp.pos.y = 1;
}

export function updatePets(dt: number): void {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  const pl = world.player;
  const wp = world.pet;
  if (!pet) { lastPetId = ''; return; }

  if (pet.id !== lastPetId) {
    lastPetId = pet.id; wp.skillT = 0; wp.pos.set(pl.pos.x - 1.5, 1, pl.pos.z + 1.5);
    vx = vz = 0; target = null; wp.state = FOLLOW;
    resetAbilities();
  }
  const skill = pet.petSkill;
  const prof = getPetProfile(pet.name);
  const grow = petPower(pet);                       // pet growth (level + evolution): scales skill power
  wp.stage = petStage(pet);
  const lvMul = (1 + 0.25 * Math.max(0, pet.level - 1)) * grow;
  const alive = pl.alive;

  if (wp.attackT > 0) wp.attackT = Math.max(0, wp.attackT - dt * 3);
  if (wp.atkCd > 0) wp.atkCd -= dt;
  if (wp.carryT > 0) { wp.carryT -= dt; if (wp.carryT <= 0) wp.carry = ''; }
  if (wp.sparkT > 0) wp.sparkT = Math.max(0, wp.sparkT - dt);

  // ---- decide state -------------------------------------------------------
  let enemy = null as ReturnType<typeof findNearestEnemy>;
  if (alive && prof.attacks) enemy = findNearestEnemy(pl.pos.x, pl.pos.z, ENGAGE_R);
  if (enemy) { wp.state = ATTACK; target = null; }
  else {
    if (target && (!target.active || target.magnet)) target = null;
    scanT -= dt;
    if (alive && prof.fetches && !target && scanT <= 0) {
      scanT = 0.3;
      target = findPickup(pl.pos.x, pl.pos.z, prof.fetchRange, getMagnetRadius(st));
    }
    wp.state = target ? FETCH : FOLLOW;
  }

  // ---- steering goal ------------------------------------------------------
  const sf = Math.sin(pl.facing), cf = Math.cos(pl.facing);
  const big = Math.max(0, prof.size - 1);          // big pets trail further back/aside so they don't clip the hero
  const fb = 1.8 + big * 1.0, fs = 1.5 + big * 0.5;
  let gx = pl.pos.x - sf * fb + cf * fs;
  let gz = pl.pos.z - cf * fb - sf * fs;
  let maxSp = Math.max(10, st.stats.moveSpeed * 1.4) * (wp.state === FOLLOW ? Math.max(1, prof.moveSpeed) : prof.moveSpeed);
  let stopR = 0.3;
  const ranged = prof.attacks && prof.attackMode === 'ranged';

  if (wp.state === ATTACK && enemy) {
    const ex = enemy.pos.x - wp.pos.x, ez = enemy.pos.z - wp.pos.z;
    const ed = Math.sqrt(ex * ex + ez * ez) || 1;
    maxSp = 16 * prof.moveSpeed;
    if (ranged) {
      // Hold ~7 away from the enemy on our side of it.
      gx = enemy.pos.x - (ex / ed) * RANGED_STOP; gz = enemy.pos.z - (ez / ed) * RANGED_STOP;
    } else {
      gx = enemy.pos.x - (ex / ed) * 0.5; gz = enemy.pos.z - (ez / ed) * 0.5;
      stopR = 0.2;
    }
    const strikeR = ranged ? 20 : enemy.radius + 1.6;
    if (wp.atkCd <= 0 && ed < strikeR) {
      const factor = prof.dmgFactor;
      const base = ((pet.petValue ?? 10) * lvMul + st.stats.damage * 0.15) * factor;
      wp.attackT = 1;
      if (ranged) {
        wp.atkCd = prof.atkCd;
        spawnProjectile('PET_BOLT', wp.pos.x, wp.pos.z, ex / ed, ez / ed, 30, base,
          { life: 2.5, pierce: 1, radius: 1.5, homing: 6, y: wp.pos.y });
      } else {
        wp.atkCd = prof.atkCd;
        damageEnemy(enemy, base, meleeOpts);
        if (prof.ignite) applyStatus(enemy, { type: 'BURN', duration: 3, value: 4 + base * 0.2 });
      }
    }
  } else if (wp.state === FETCH && target) {
    gx = target.pos.x; gz = target.pos.z;
    maxSp = prof.fetchSpeed;
    stopR = 0.1;
    const dx = gx - wp.pos.x, dz = gz - wp.pos.z;
    if (dx * dx + dz * dz < 1.4 * 1.4) {
      const kind = target.kind;
      petCollect(target);
      if (!target.active) { wp.carry = kind; wp.carryT = 1.6; wp.sparkT = 0.7; }
      target = null;
    }
  }

  // ---- move (smooth steering, arrive behaviour) ---------------------------
  const dx = gx - wp.pos.x, dz = gz - wp.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  let wantSp = dist > stopR ? Math.min(maxSp, dist * (wp.state === FOLLOW ? 8 : 4.5)) : 0;
  if (wp.state === FOLLOW && dist > 3.5) wantSp = Math.max(wantSp, Math.min(st.stats.moveSpeed * 1.8 + dist, dist * 4.5));
  const inv = dist > 1e-4 ? 1 / dist : 0;
  const k = 1 - Math.exp(-9 * dt);
  vx += (dx * inv * wantSp - vx) * k;
  vz += (dz * inv * wantSp - vz) * k;
  wp.pos.x += vx * dt;
  wp.pos.z += vz * dt;
  wp.pos.y += (1 - wp.pos.y) * Math.min(1, 10 * dt);

  // ---- leash --------------------------------------------------------------
  const lx = wp.pos.x - pl.pos.x, lz = wp.pos.z - pl.pos.z;
  const l2 = lx * lx + lz * lz;
  const lim = wp.state === FOLLOW ? TELEPORT : Math.max(LEASH, prof.fetchRange + 4);
  if (wp.state === FOLLOW && l2 > lim * lim) {
    wp.pos.set(gx, 1, gz);
    vx = vz = 0; target = null;
  } else if (l2 > lim * lim) {
    const s = lim / Math.sqrt(l2);
    wp.pos.x = pl.pos.x + lx * s; wp.pos.z = pl.pos.z + lz * s;
  }

  // ---- facing -------------------------------------------------------------
  const sp2 = vx * vx + vz * vz;
  if (wp.state === ATTACK && enemy) wp.facing = turnTo(wp.facing, Math.atan2(enemy.pos.x - wp.pos.x, enemy.pos.z - wp.pos.z), Math.min(1, 14 * dt));
  else if (sp2 > 2.25) wp.facing = turnTo(wp.facing, Math.atan2(vx, vz), Math.min(1, 12 * dt));
  else wp.facing = turnTo(wp.facing, pl.facing, Math.min(1, 4 * dt));

  // ---- specialty: unique abilities ----------------------------------------
  if (alive) petAbility(dt, skill, pet.petValue ?? 10, pet.petCooldown || 8, lvMul, st.stats.damage, st.stats.maxHealth);
  else shield = 0;

  // ---- specialty: HEAL timer ----------------------------------------------
  if (!(prof.heals && skill === 'HEAL') || !alive) return;
  wp.skillT += dt;
  const cd = pet.petCooldown || 10;
  if (wp.skillT >= cd) {
    if (pl.hp < st.stats.maxHealth) { wp.skillT = 0; healPlayer((pet.petValue || 10) * grow); wp.attackT = 1; }
    else wp.skillT = cd;
  }
}



// ============================================================================
// Unique abilities (new pets). All state is module-local; render reads the exported FX buffers.
// ============================================================================
const abOpts = (kind: DamageOpts['kind']): DamageOpts => ({ kind, source: 'PET' });
const fireOpts = abOpts('FIRE'), iceOpts = abOpts('ICE'), lightOpts = abOpts('LIGHTNING'), slamOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET', armorBreak: true, noBackstab: true };
const waterOpts = abOpts('MAGIC');
let abT = 0;            // generic ability cooldown accumulator
let trailT = 0, fireTickT = 0;
let swoopT = 0, swoopEnemy: Enemy | null = null, swoopHit = false;
let shield = 0, lastHp = -1;
let markT = 0;
let beamTick = 0;
const nearIds: number[] = [];
const tmpP = new Vector3();

/** Fire trail patches left by Ember Fox (ring buffer, read by render/Pet.tsx). */
export const FIRE_PATCHES: { x: number; z: number; t: number }[] = Array.from({ length: 8 }, () => ({ x: 0, z: 0, t: 0 }));
let patchI = 0;
/** Shadow Cat marks: enemy refs + remaining time (read by render/Pet.tsx; also +20% damage). */
export const MARKS: { e: Enemy | null; t: number }[] = [{ e: null, t: 0 }, { e: null, t: 0 }, { e: null, t: 0 }];
/** Tidal beam state (Aether Leviathan). t>0 while sweeping; (x,z) origin, (dx,dz) unit direction. */
export const BEAM = { t: 0, x: 0, z: 0, dx: 0, dz: 1, len: 20 };
/** Absorb shield HP remaining (Shield Turtle). */
export function getPetShield(): number { return shield; }

function resetAbilities(): void {
  abT = 0; trailT = 0; fireTickT = 0; swoopT = 0; swoopEnemy = null; shield = 0; lastHp = -1; markT = 0; beamTick = 0; BEAM.t = 0;
  for (const f of FIRE_PATCHES) f.t = 0;
  for (const m of MARKS) { m.e = null; m.t = 0; }
}

// +20% damage to marked targets: add an extra hit when a marked enemy takes (non-dot) damage.
let inBonus = false;
events.on('damage', (d) => {
  if (inBonus || d.toPlayer || d.dot || !(MARKS[0].t > 0 || MARKS[1].t > 0 || MARKS[2].t > 0)) return;
  for (let i = 0; i < 3; i++) {
    const m = MARKS[i];
    if (m.t > 0 && m.e && m.e.active && m.e.pos === d.pos) {
      inBonus = true;
      damageEnemy(m.e, d.amount * 0.2, { kind: d.kind, dot: true, source: 'PET' });
      inBonus = false;
      return;
    }
  }
});

function pickNearest(x: number, z: number, r: number, n: number, out: Enemy[]): number {
  out.length = 0;
  const ids = world.enemyGrid.query(x, z, r, nearIds);
  const r2 = r * r;
  const dd: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, d = dx * dx + dz * dz;
    if (d > r2) continue;
    let j = out.length;
    out.push(e); dd.push(d);
    while (j > 0 && dd[j - 1] > d) { out[j] = out[j - 1]; dd[j] = dd[j - 1]; j--; out[j] = e; dd[j] = d; }
  }
  if (out.length > n) out.length = n;
  return out.length;
}
const zapList: Enemy[] = [];
const tmpV = { x: 0, z: 0 };

function petAbility(dt: number, skill: string | undefined, value: number, cd: number, lvMul: number, statDmg: number, maxHp: number): void {
  const wp = world.pet, pl = world.player;
  const dmg = (value * lvMul + statDmg * 0.15);
  // Shield (absorbs damage by refunding hp lost since last frame).
  if (shield > 0) {
    if (lastHp >= 0 && pl.hp < lastHp && pl.hp > 0) {
      const lost = lastHp - pl.hp, ab = Math.min(shield, lost);
      pl.hp += ab; shield -= ab;
      if (shield <= 0) events.emit('floatText', { pos: pl.pos, text: 'SHIELD BROKE', color: 0x7fd8ff, scale: 0.7, dy: 1 });
    }
  }
  lastHp = pl.hp;
  // Mark timers always tick.
  for (let i = 0; i < 3; i++) { const m = MARKS[i]; if (m.t > 0) { m.t -= dt; if (m.t <= 0 || !m.e || !m.e.active || m.e.state === 'DYING') { m.t = 0; m.e = null; } } }
  if (BEAM.t > 0) BEAM.t -= dt;
  if (!skill) return;
  abT += dt;

  switch (skill) {
    case 'FIRE_TRAIL': {
      const sp2 = vx * vx + vz * vz;
      trailT -= dt;
      if (sp2 > 9 && trailT <= 0) { trailT = 0.14; const f = FIRE_PATCHES[patchI]; patchI = (patchI + 1) & 7; f.x = wp.pos.x; f.z = wp.pos.z; f.t = 2.2; }
      fireTickT -= dt;
      const tick = fireTickT <= 0; if (tick) fireTickT = 0.3;
      for (let i = 0; i < 8; i++) {
        const f = FIRE_PATCHES[i];
        if (f.t <= 0) continue;
        f.t -= dt;
        if (tick) damageEnemiesInRadius(f.x, f.z, 1.7, dmg * 0.3, fireOpts, { type: 'BURN', duration: 3, value: 4 + dmg * 0.15 });
      }
      break;
    }
    case 'CHILL_SWOOP': {
      if (swoopT > 0) {
        swoopT -= dt;
        const e = swoopEnemy;
        if (e && e.active && e.state !== 'DYING') {
          const k = 1 - Math.exp(-14 * dt);
          const tx = swoopT > 0.3 ? e.pos.x : pl.pos.x, tz = swoopT > 0.3 ? e.pos.z : pl.pos.z;
          wp.pos.x += (tx - wp.pos.x) * k; wp.pos.z += (tz - wp.pos.z) * k; vx = vz = 0;
          wp.attackT = 1;
          if (!swoopHit && swoopT < 0.5) {
            swoopHit = true;
            applyStatus(e, { type: 'CHILL', duration: 4 }); applyStatus(e, { type: 'CHILL', duration: 4 });
            applyStatus(e, { type: 'SLOW', duration: 4, value: 0.6 });
            damageEnemy(e, dmg, iceOpts);
            events.emit('frostNova', { pos: e.pos, radius: 3.5 });
          }
        } else swoopT = 0;
      } else if (abT >= cd) {
        // strongest (highest max hp) enemy near the player
        const ids = world.enemyGrid.query(pl.pos.x, pl.pos.z, 14, nearIds);
        let best: Enemy | null = null, bh = -1;
        for (let i = 0; i < ids.length; i++) { const e = world.enemies[ids[i]]; if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue; if (e.maxHp > bh) { bh = e.maxHp; best = e; } }
        if (best) { abT = 0; swoopEnemy = best; swoopT = 0.9; swoopHit = false; }
        else abT = cd;
      }
      break;
    }
    case 'LOOT_BURP': {
      if (abT >= cd) {
        abT = 0;
        const d = world.director;
        if (pl.alive && (d.aliveCount > 0 || findNearestEnemy(pl.pos.x, pl.pos.z, 40)) && Math.random() < 0.35) {
          const n = 1 + (Math.random() < 0.3 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            tmpP.set(wp.pos.x + Math.sin(wp.facing) * 0.8, 0, wp.pos.z + Math.cos(wp.facing) * 0.8);
            spawnPickup(Math.random() < 0.12 ? 'GEM' : 'GOLD', tmpP, Math.random() < 0.12 ? 1 : Math.round((10 + d.wave * 4) * lvMul));
          }
          wp.attackT = 1;
          events.emit('floatText', { pos: wp.pos, text: 'BURP!', color: 0xffd23a, scale: 0.8, dy: 1.2 });
        }
      }
      break;
    }
    case 'CHAIN_ZAP': {
      if (abT >= cd) {
        const n = pickNearest(wp.pos.x, wp.pos.z, 15, 3, zapList);
        if (n > 0) {
          abT = 0; wp.attackT = 1;
          let fx = wp.pos, i = 0;
          for (; i < n; i++) {
            const e = zapList[i];
            events.emit('lightning', { from: fx, to: e.pos });
            damageEnemy(e, dmg * (1 - i * 0.15), lightOpts);
            applyStatus(e, { type: 'STUN', duration: 0.4 });
            fx = e.pos;
          }
        } else abT = cd;
      }
      break;
    }
    case 'SHIELD': {
      if (abT >= cd) {
        abT = 0;
        shield = value * lvMul + maxHp * 0.15;
        lastHp = pl.hp; wp.attackT = 1;
        events.emit('shieldBlock', { pos: pl.pos, radius: 3 });
        events.emit('floatText', { pos: pl.pos, text: 'SHIELD', color: 0x7fd8ff, scale: 0.8, dy: 1.2 });
      }
      break;
    }
    case 'MARK': {
      markT -= dt;
      if (markT <= 0) {
        markT = 0.5;
        // refresh existing marks; add up to 3 within range, then pounce on the first fresh one
        const n = pickNearest(pl.pos.x, pl.pos.z, 16, 6, zapList);
        let fresh: Enemy | null = null;
        for (let i = 0; i < n; i++) {
          const e = zapList[i];
          let idx = -1;
          for (let j = 0; j < 3; j++) if (MARKS[j].e === e) { idx = j; break; }
          if (idx >= 0) { if (MARKS[idx].t < 2) MARKS[idx].t = 6; continue; }
          if (abT < cd) continue;
          for (let j = 0; j < 3; j++) if (MARKS[j].t <= 0) { MARKS[j].e = e; MARKS[j].t = 6; if (!fresh) fresh = e; events.emit('floatText', { pos: e.pos, text: 'MARKED', color: 0xc070ff, scale: 0.6, dy: 1 }); break; }
        }
        if (fresh) {
          abT = 0;
          tmpV.x = wp.pos.x; tmpV.z = wp.pos.z;
          events.emit('blink', { from: wp.pos.clone(), to: fresh.pos.clone() });
          wp.pos.x = fresh.pos.x - Math.sin(wp.facing) * 1.2; wp.pos.z = fresh.pos.z - Math.cos(wp.facing) * 1.2; vx = vz = 0;
        }
      }
      break;
    }
    case 'SLAM': {
      if (abT >= cd) {
        const e = findNearestEnemy(wp.pos.x, wp.pos.z, 8);
        if (e) {
          abT = 0; wp.attackT = 1;
          const r = 7;
          damageEnemiesInRadius(wp.pos.x, wp.pos.z, r, dmg * 2, slamOpts, { type: 'ARMOR_BREAK', duration: 6 });
          events.emit('slam', { pos: wp.pos, damage: dmg * 2 });
          events.emit('shockwave', { pos: wp.pos.clone(), radius: r, color: 0x8fe8ff });
          events.emit('crater', { pos: wp.pos.clone(), radius: r * 0.5, color: 0x6fd0ff });
          events.emit('shake', { amount: 0.25 });
        } else abT = cd;
      }
      break;
    }
    case 'TIDAL_BEAM': {
      if (BEAM.t > 0) {
        // sweep: rotate direction slightly, damage along the line a few times a second
        const a = Math.atan2(BEAM.dx, BEAM.dz) + dt * 0.9;
        BEAM.dx = Math.sin(a); BEAM.dz = Math.cos(a);
        BEAM.x = wp.pos.x; BEAM.z = wp.pos.z;
        beamTick -= dt;
        if (beamTick <= 0) {
          beamTick = 0.15;
          for (let d = 2; d <= BEAM.len; d += 3.4) damageEnemiesInRadius(BEAM.x + BEAM.dx * d, BEAM.z + BEAM.dz * d, 2.2, dmg * 0.55, waterOpts);
        }
      } else if (abT >= cd) {
        const e = findNearestEnemy(wp.pos.x, wp.pos.z, 20);
        if (e) {
          abT = 0; wp.attackT = 1;
          const dx = e.pos.x - wp.pos.x, dz = e.pos.z - wp.pos.z, l = Math.hypot(dx, dz) || 1;
          const a0 = Math.atan2(dx, dz) - 0.55;           // sweep ~1.1 rad across the target
          BEAM.dx = Math.sin(a0); BEAM.dz = Math.cos(a0); BEAM.x = wp.pos.x; BEAM.z = wp.pos.z; BEAM.t = 1.2; beamTick = 0;
          void l;
          events.emit('shake', { amount: 0.2 });
        } else abT = cd;
      }
      break;
    }
  }
}
