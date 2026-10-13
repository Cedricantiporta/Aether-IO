// ============================================================================
// Equipped pet: follows the player and runs its skill timer.
// (COLLECT is handled in pickups, REVIVE in combat.damagePlayer.)
// ============================================================================
import { world } from '../world';
import { useGameStore } from '../../store';
import { damageEnemy, findNearestEnemy, healPlayer, type DamageOpts } from './combat';
import { spawnProjectile } from './projectiles';

const meleeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PET' };
let lastPetId = '';

export function resetPets(): void {
  lastPetId = '';
  const p = world.pet;
  p.pos.set(-1.5, 1, 1.5);
  p.attackT = 0;
  p.skillT = 0;
}

export function updatePets(dt: number): void {
  const st = useGameStore.getState();
  const pet = st.equipment.pet;
  const pl = world.player;
  const wp = world.pet;
  if (!pet) { lastPetId = ''; return; }

  if (pet.id !== lastPetId) { lastPetId = pet.id; wp.skillT = 0; wp.pos.set(pl.pos.x - 1.5, 1, pl.pos.z + 1.5); }

  // Follow behind-left of the facing direction.
  const sf = Math.sin(pl.facing), cf = Math.cos(pl.facing);
  const tx = pl.pos.x - sf * 1.8 + cf * 1.5;
  const tz = pl.pos.z - cf * 1.8 - sf * 1.5;
  const ty = 1.0 + Math.sin(world.time * 4) * 0.2;
  const dx0 = tx - wp.pos.x, dz0 = tz - wp.pos.z;
  if (dx0 * dx0 + dz0 * dz0 > 900) { wp.pos.set(tx, ty, tz); }
  const k = 1 - Math.exp(-4 * dt);
  wp.pos.x += dx0 * k;
  wp.pos.z += dz0 * k;
  wp.pos.y += (ty - wp.pos.y) * Math.min(1, 10 * dt);
  const fx = pl.pos.x - wp.pos.x, fz = pl.pos.z - wp.pos.z;
  if (fx * fx + fz * fz > 0.01) wp.facing = Math.atan2(fx, fz);
  if (wp.attackT > 0) wp.attackT = Math.max(0, wp.attackT - dt * 3);

  if (!pet.petSkill || !pl.alive) return;
  wp.skillT += dt;
  const power = (pet.petValue ?? 10) * (1 + 0.25 * Math.max(0, pet.level - 1));

  switch (pet.petSkill) {
    case 'HEAL': {
      const cd = pet.petCooldown || 10;
      if (wp.skillT >= cd) {
        if (pl.hp < st.stats.maxHealth) { wp.skillT = 0; healPlayer(pet.petValue || 10); wp.attackT = 1; }
        else wp.skillT = cd;
      }
      break;
    }
    case 'ATTACK_MELEE':
      if (wp.skillT >= 1.5) {
        const t = findNearestEnemy(wp.pos.x, wp.pos.z, 6);
        if (t) {
          wp.skillT = 0;
          wp.attackT = 1;
          wp.pos.x = t.pos.x; wp.pos.z = t.pos.z; // dash-hit
          damageEnemy(t, power, meleeOpts);
        } else wp.skillT = 1.5;
      }
      break;
    case 'ATTACK_RANGED':
      if (wp.skillT >= 1.2) {
        const t = findNearestEnemy(wp.pos.x, wp.pos.z, 20);
        if (t) {
          wp.skillT = 0;
          wp.attackT = 1;
          const dx = t.pos.x - wp.pos.x, dz = t.pos.z - wp.pos.z;
          const l = Math.sqrt(dx * dx + dz * dz) || 1;
          spawnProjectile('PET_BOLT', wp.pos.x, wp.pos.z, dx / l, dz / l, 30, power,
            { life: 2.5, pierce: 1, radius: 1.5, homing: 6, y: wp.pos.y });
        } else wp.skillT = 1.2;
      }
      break;
    default: break; // COLLECT / REVIVE handled elsewhere
  }
}
