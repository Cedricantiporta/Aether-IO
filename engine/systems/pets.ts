// ============================================================================
// Equipped pet: small state machine on world.pet.
//   FOLLOW (0): trail behind the player.   FETCH (1): fly to a loose pickup
//   outside the magnet range and grab it.  ATTACK (2): engage a nearby enemy.
// Every pet has a base attack + fetch; petSkill adds its specialty
// (HEAL timer here, ATTACK_RANGED shoots bolts, COLLECT fetches farther/faster,
// REVIVE is handled in combat.damagePlayer). The pet is invulnerable.
// ============================================================================
import { world } from '../world';
import { useGameStore } from '../../store';
import { damageEnemy, findNearestEnemy, healPlayer, type DamageOpts } from './combat';
import { spawnProjectile } from './projectiles';
import { getMagnetRadius, petCollect } from './pickups';
import type { Pickup } from '../types';

const meleeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET' };
const FOLLOW = 0, FETCH = 1, ATTACK = 2;
const ENGAGE_R = 10;       // enemy distance from player that triggers ATTACK
const FETCH_R = 14;        // pickup distance from player that triggers FETCH
const FETCH_R_COLLECT = 24;
const LEASH = 18;
const TELEPORT = 30;
const RANGED_STOP = 7;

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
    if (o.kind === 'ITEM' && !(o.item && st.canPickUp(o.item))) continue;
    const ex = o.pos.x - wp.pos.x, ez = o.pos.z - wp.pos.z;
    const e2 = ex * ex + ez * ez;
    if (e2 < bestD) { bestD = e2; best = o; }
  }
  return best;
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
  }
  const skill = pet.petSkill;
  const lvMul = 1 + 0.25 * Math.max(0, pet.level - 1);
  const alive = pl.alive;

  if (wp.attackT > 0) wp.attackT = Math.max(0, wp.attackT - dt * 3);
  if (wp.atkCd > 0) wp.atkCd -= dt;
  if (wp.carryT > 0) { wp.carryT -= dt; if (wp.carryT <= 0) wp.carry = ''; }
  if (wp.sparkT > 0) wp.sparkT = Math.max(0, wp.sparkT - dt);

  // ---- decide state -------------------------------------------------------
  let enemy = null as ReturnType<typeof findNearestEnemy>;
  if (alive) enemy = findNearestEnemy(pl.pos.x, pl.pos.z, ENGAGE_R);
  if (enemy) { wp.state = ATTACK; target = null; }
  else {
    if (target && (!target.active || target.magnet)) target = null;
    scanT -= dt;
    if (alive && !target && scanT <= 0) {
      scanT = 0.3;
      target = findPickup(pl.pos.x, pl.pos.z, skill === 'COLLECT' ? FETCH_R_COLLECT : FETCH_R, getMagnetRadius(st));
    }
    wp.state = target ? FETCH : FOLLOW;
  }

  // ---- steering goal ------------------------------------------------------
  const sf = Math.sin(pl.facing), cf = Math.cos(pl.facing);
  let gx = pl.pos.x - sf * 1.8 + cf * 1.5;
  let gz = pl.pos.z - cf * 1.8 - sf * 1.5;
  let maxSp = Math.max(10, st.stats.moveSpeed * 1.4);
  let stopR = 0.3;
  const ranged = skill === 'ATTACK_RANGED';

  if (wp.state === ATTACK && enemy) {
    const ex = enemy.pos.x - wp.pos.x, ez = enemy.pos.z - wp.pos.z;
    const ed = Math.sqrt(ex * ex + ez * ez) || 1;
    maxSp = 16;
    if (ranged) {
      // Hold ~7 away from the enemy on our side of it.
      gx = enemy.pos.x - (ex / ed) * RANGED_STOP; gz = enemy.pos.z - (ez / ed) * RANGED_STOP;
    } else {
      gx = enemy.pos.x - (ex / ed) * 0.5; gz = enemy.pos.z - (ez / ed) * 0.5;
      stopR = 0.2;
    }
    const strikeR = ranged ? 20 : enemy.radius + 1.6;
    if (wp.atkCd <= 0 && ed < strikeR) {
      let factor = 0.45;
      if (skill === 'ATTACK_MELEE' || ranged) factor = 1; else if (skill === 'HEAL') factor = 0.3;
      const base = ((pet.petValue ?? 10) * lvMul + st.stats.damage * 0.15) * factor;
      wp.attackT = 1;
      if (ranged) {
        wp.atkCd = 1.0;
        spawnProjectile('PET_BOLT', wp.pos.x, wp.pos.z, ex / ed, ez / ed, 30, base,
          { life: 2.5, pierce: 1, radius: 1.5, homing: 6, y: wp.pos.y });
      } else {
        wp.atkCd = skill === 'ATTACK_MELEE' ? 0.6 : 0.9;
        damageEnemy(enemy, base, meleeOpts);
      }
    }
  } else if (wp.state === FETCH && target) {
    gx = target.pos.x; gz = target.pos.z;
    maxSp = skill === 'COLLECT' ? 28 : 20;
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
  let wantSp = dist > stopR ? Math.min(maxSp, dist * 4.5) : 0;
  if (wp.state === FOLLOW && dist > 8) wantSp = Math.max(wantSp, st.stats.moveSpeed * 1.6);
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
  if (l2 > TELEPORT * TELEPORT) {
    wp.pos.set(gx0(pl.pos.x, sf, cf), 1, gz0(pl.pos.z, sf, cf));
    vx = vz = 0; target = null;
  } else if (l2 > LEASH * LEASH) {
    const s = LEASH / Math.sqrt(l2);
    wp.pos.x = pl.pos.x + lx * s; wp.pos.z = pl.pos.z + lz * s;
  }

  // ---- facing -------------------------------------------------------------
  const sp2 = vx * vx + vz * vz;
  if (wp.state === ATTACK && enemy) wp.facing = turnTo(wp.facing, Math.atan2(enemy.pos.x - wp.pos.x, enemy.pos.z - wp.pos.z), Math.min(1, 14 * dt));
  else if (sp2 > 2.25) wp.facing = turnTo(wp.facing, Math.atan2(vx, vz), Math.min(1, 12 * dt));
  else wp.facing = turnTo(wp.facing, pl.facing, Math.min(1, 4 * dt));

  // ---- specialty: HEAL timer ----------------------------------------------
  if (skill !== 'HEAL' || !alive) return;
  wp.skillT += dt;
  const cd = pet.petCooldown || 10;
  if (wp.skillT >= cd) {
    if (pl.hp < st.stats.maxHealth) { wp.skillT = 0; healPlayer(pet.petValue || 10); wp.attackT = 1; }
    else wp.skillT = cd;
  }
}

const gx0 = (px: number, sf: number, cf: number): number => px - sf * 1.8 + cf * 1.5;
const gz0 = (pz: number, sf: number, cf: number): number => pz - cf * 1.8 - sf * 1.5;
