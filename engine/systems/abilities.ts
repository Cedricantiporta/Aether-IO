// ============================================================================
// Active abilities: Q (class), R (weapon), E (class special).
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone } from '../world';
import { edgeLimit } from '../mapgen';
import { events } from '../events';
import { useGameStore } from '../../store';
import {
  getAimDir, trySpendMana, damageEnemiesInRadius, type DamageOpts,
} from './combat';
import { spawnProjectile } from './projectiles';

/** Read-only-ish state for render/UI (timers of multi-frame abilities). */
export const abilityState = {
  axeSpinT: 0,       // seconds left of the AXE_SPIN barrier (ring radius AXE_RING_RADIUS)
  arrowRainWaves: 0, // volleys left
  arrowRainT: 0,
};
export const AXE_RING_RADIUS = 10.5;
const AXE_DAMAGE_RADIUS = 12;

const aim = new Vector3();
const out: number[] = [];
const axeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
let axeTick = 0;
let lastNoMana = -10;
const lastCd: Record<string, number> = {};

export function resetAbilities(): void {
  abilityState.axeSpinT = 0;
  abilityState.arrowRainWaves = 0;
  abilityState.arrowRainT = 0;
  axeTick = 0;
  lastNoMana = -10;
  for (const k in lastCd) lastCd[k] = -10;
}

/** Throttled (1 s) feedback events. */
export function notifyCooldown(slot: 'q' | 'r' | 'e' | 'dash'): void {
  const last = lastCd[slot] ?? -10;
  if (world.time - last < 1) return;
  lastCd[slot] = world.time;
  events.emit('onCooldown', { slot });
}
export function notifyNoMana(): void {
  if (world.time - lastNoMana < 1) return;
  lastNoMana = world.time;
  events.emit('noMana', {});
}

function announce(name: string): void {
  const p = world.player;
  const d = getAimDir(aim);
  events.emit('ability', { pos: p.pos.clone(), dir: d.clone(), name });
  p.anim.castT = 1;
}

/** Common gate: cooldown + mana. Returns true when the cast may proceed (mana spent). */
function gate(slot: 'q' | 'r' | 'e'): boolean {
  const p = world.player;
  if (p.cd[slot] > 0) { notifyCooldown(slot); return false; }
  const cost = useGameStore.getState().getManaCost(slot);
  if (!trySpendMana(cost)) { notifyNoMana(); return false; }
  return true;
}

const cdr = () => 1 - useGameStore.getState().stats.cooldownReduction;

export function castQ(): void {
  const st = useGameStore.getState();
  const ability = st.activeAbilityQ;
  if (!ability) return;
  if (!gate('q')) return;
  const p = world.player;
  p.cd.q = p.cdMax.q * cdr();
  const s = st.stats;
  const dir = getAimDir(aim);

  switch (ability) {
    case 'RAGE':
      p.rageT = 4;
      announce('RAGE');
      break;
    case 'PIERCING_SHOT':
      spawnProjectile('PIERCING_ARROW', p.pos.x + dir.x, p.pos.z + dir.z, dir.x, dir.z, 50,
        s.damage * 1.75 * s.skillDamage * 2.0,
        { life: 3, pierce: Infinity, knockback: 4.0, radius: 5.5, y: 1.5 });
      announce('PIERCING_SHOT');
      break;
    case 'GRAVITY_SPELL': {
      const z = allocZone();
      if (z) {
        let x = p.pos.x + dir.x * 15, zz = p.pos.z + dir.z * 15;
        const d = Math.hypot(x, zz);
        const max = edgeLimit(x, zz, 2);
        if (d > max) { x *= max / d; zz *= max / d; }
        z.active = true; z.kind = 'BLACKHOLE'; z.hostile = false;
        z.pos.set(x, 0, zz);
        z.radius = 8;
        z.life = z.maxLife = 2.6;
        z.maxPull = 8 + st.skillLevels.gravity;
        z.damage = s.damage * 5 * s.skillDamage;
        z.color = 0x6d28d9;
      }
      announce('GRAVITY_SPELL');
      break;
    }
    default: break;
  }
}

export function castR(): void {
  const st = useGameStore.getState();
  const ability = st.equipment.weapon?.ability;
  if (!ability || ability === 'NONE') return;
  const p = world.player;
  if (p.cd.r > 0) { notifyCooldown('r'); return; }
  if (!gate('r')) return;
  p.cd.r = Math.max(5, p.cdMax.r - (st.skillLevels.weapon - 1)) * cdr();
  const s = st.stats;

  switch (ability) {
    case 'ARROW_RAIN':
      abilityState.arrowRainWaves = 3;
      abilityState.arrowRainT = 0;
      announce('ARROW_RAIN');
      break;
    case 'FIREBALL': {
      const dir = getAimDir(aim);
      spawnProjectile('FIREBALL', p.pos.x + dir.x, p.pos.z + dir.z, dir.x, dir.z, 5,
        s.damage * 2.0 * 0.63 * s.skillDamage * 2.0,
        {
          life: 5, pierce: Infinity, knockback: s.knockback, radius: 3.5, y: 1.5,
          effect: { type: 'BURN', duration: 5, value: s.damage * 0.3 },
        });
      announce('FIREBALL');
      break;
    }
    case 'AXE_SPIN':
      abilityState.axeSpinT = 3;
      axeTick = 0.2;
      announce('AXE_SPIN');
      break;
    default: break;
  }
}

export function castE(): void {
  const st = useGameStore.getState();
  if (st.skillLevels.special <= 0) return;
  if (!gate('e')) return;
  const p = world.player;
  p.cd.e = p.cdMax.e * cdr();
  switch (st.hero) {
    case 'ARCHER':
      p.sprintT = 4;
      p.invulnT = Math.max(p.invulnT, 4);
      announce('SPRINT');
      break;
    case 'WIZARD': {
      const ew = p.earthwall;
      ew.active = true; ew.pos.copy(p.pos); ew.t = 4; ew.radius = 10;
      announce('EARTHWALL');
      break;
    }
    case 'BARBARIAN':
      p.vitalityT = 6;
      announce('VITALITY');
      break;
  }
}

export function updateAbilities(dt: number): void {
  const st = useGameStore.getState();
  const s = st.stats;
  const p = world.player;

  if (abilityState.arrowRainWaves > 0) {
    abilityState.arrowRainT -= dt;
    if (abilityState.arrowRainT <= 0) {
      const offset = (3 - abilityState.arrowRainWaves) * (Math.PI / 8);
      const dmg = s.damage * 1.5 * 0.63 * s.skillDamage * 2.0;
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 + offset;
        spawnProjectile('RAIN_ARROW', p.pos.x, p.pos.z, Math.cos(a), Math.sin(a), 25, dmg,
          { life: 1.0, pierce: 3, knockback: 3.0, radius: 1.5, y: 1.0 });
      }
      abilityState.arrowRainWaves--;
      abilityState.arrowRainT = 0.2;
    }
  }

  if (abilityState.axeSpinT > 0) {
    abilityState.axeSpinT -= dt;
    axeTick += dt;
    if (axeTick >= 0.2) {
      axeTick = 0;
      const tick = s.damage * 0.2 * 5 * s.skillDamage * 2.0 * 0.63;
      damageEnemiesInRadius(p.pos.x, p.pos.z, AXE_DAMAGE_RADIUS, tick, axeOpts);
    }
    // Barrier: enemies cannot get inside the ring.
    const ids = world.enemyGrid.query(p.pos.x, p.pos.z, AXE_RING_RADIUS + 4, out);
    const r2 = AXE_RING_RADIUS * AXE_RING_RADIUS;
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING') continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { e.pos.x = p.pos.x + AXE_RING_RADIUS; continue; }
      e.pos.x = p.pos.x + (dx / d) * AXE_RING_RADIUS;
      e.pos.z = p.pos.z + (dz / d) * AXE_RING_RADIUS;
    }
  }
}
