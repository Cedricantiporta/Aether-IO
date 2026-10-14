// ============================================================================
// Passive hero skills (blizzard, storm, orbital blades; burning/freezing/thunder/stamp
// are on-attack procs driven by projectiles.fireBasicAttack). Numbers follow the original SkillManager.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone } from '../world';
import { events } from '../events';
import type { Projectile, Zone } from '../types';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, findNearestEnemy, applyStatus, getAimDir, rollCrit, lastCrit, trySpendMana,
  type DamageOpts, type StatusEffect,
} from './combat';
import { spawnProjectile, procFlags, procHud, resetProcs } from './projectiles';

/**
 * HUD progress. kind 'time': `t` = seconds remaining, `max` = full cooldown.
 * kind 'hits' (on-attack procs): `t` = attacks remaining, `max` = attacks per proc.
 * Mutated in place every frame.
 */
export const passiveCooldowns: Record<string, { t: number; max: number; kind: 'time' | 'hits' }> = {
  burning: { t: 0, max: 10, kind: 'hits' },
  freezing: { t: 0, max: 10, kind: 'hits' },
  freezeSpell: { t: 0, max: 14, kind: 'time' },
  storm: { t: 0, max: 15, kind: 'time' },
  thunder: { t: 0, max: 10, kind: 'hits' },
  stamp: { t: 0, max: 10, kind: 'hits' },
  orbital: { t: 0, max: 2, kind: 'time' },
  warcry: { t: 0, max: 12, kind: 'time' },
  inspire: { t: 0, max: 12, kind: 'time' },
};

const aim = new Vector3();
const stormZones: (Zone | null)[] = [null, null];
const lvScale = (lv: number): number => 1 + 0.15 * Math.max(0, lv - 1);
const cdrMul = (): number => 1 - useGameStore.getState().stats.cooldownReduction;
const blades: Projectile[] = [];
const blizzSlow: StatusEffect = { type: 'SLOW', duration: 3, value: 0.7 };
const blizzFreeze: StatusEffect = { type: 'FREEZE', duration: 1.2 };
const blizOut: number[] = [];
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const bladeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const bladeOut: number[] = [];

let blizzT = 0, stormT = 0, rallyT = 0;
let orbState = 2, orbT = 2, orbTick = 0;

export function resetSkills(): void {
  blizzT = stormT = rallyT = 0; stormZones[0] = stormZones[1] = null;
  orbState = 2; orbT = 2; orbTick = 0;
  blades.length = 0;
  for (const k in passiveCooldowns) { passiveCooldowns[k].t = 0; }
  resetProcs();
}

function setCd(key: string, remaining: number, max: number): void {
  const c = passiveCooldowns[key];
  c.t = remaining > 0 ? remaining : 0;
  c.max = max;
}

function blockEnemyProjectiles(x: number, z: number, r: number): void {
  const eps = world.enemyProjectiles;
  for (let i = 0; i < eps.length; i++) {
    const b = eps[i];
    if (!b.active) continue;
    const dx = b.pos.x - x, dz = b.pos.z - z;
    const rr = r + b.radius;
    if (dx * dx + dz * dz < rr * rr) {
      b.active = false;
      events.emit('projectileImpact', { pos: b.pos, kind: 'ENEMY' });
    }
  }
}

/** AXE STORM: 3 giant spinning axes in a ~40 degree fan; each ricochets off the first enemy / obstacle toward the next enemy. */
function axeStorm(level: number): void {
  const st = useGameStore.getState().stats;
  const pl = world.player;
  const dir = getAimDir(aim);
  const n = 3 + (st.axeCount | 0);
  const size = 1 + st.axeSize;
  const dmg = st.damage * 2.2 * st.skillDamage * lvScale(level) * (1 + st.stompPower);
  const spread = 0.35; // half-angle (~40 deg total)
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
    const c = Math.cos(a), s = Math.sin(a);
    const vx = dir.x * c - dir.z * s, vz = dir.x * s + dir.z * c;
    const p = spawnProjectile('GIANT_AXE', pl.pos.x + vx * 1.2, pl.pos.z + vz * 1.2, vx, vz, 30, dmg,
      { life: 2.4, pierce: 6, radius: 2.3 * size, knockback: 0.8, y: 1.3, effect: { type: 'ARMOR_BREAK', duration: 6 } });
    if (p) { p.bounces = 1 + (st.axeBounce | 0); p.spin = size; }
  }
  events.emit('shockwave', { pos: pl.pos.clone(), radius: 1.5, color: 0xff5a3a });
  pl.anim.castT = 1;
}

function updateOrbitals(dt: number, level: number, chargeMul: number): void {
  const st = useGameStore.getState().stats;
  const pl = world.player;
  const dmg = st.damage * 1.5 * (1 + level * 0.1);

  if (orbState === 2) {
    orbT += dt * chargeMul;
    setCd('orbital', 2 - orbT, 2);
    if (orbT < 2) return;
    const count = 1 + level;
    blades.length = 0;
    for (let i = 0; i < count; i++) {
      const p = allocProjectile();
      if (!p) break;
      p.active = true; p.kind = 'ORBITAL_BLADE'; p.state = 0;
      p.pos.set(pl.pos.x, 1.0, pl.pos.z); p.vel.set(0, 0, 0);
      p.life = p.maxLife = 99; p.damage = dmg * 3; p.radius = 1.5; p.pierce = 1;
      blades.push(p);
    }
    orbState = 0; orbT = 0; orbTick = 0.2;
    return;
  }

  if (orbState === 0) {
    orbT += dt;
    orbTick += dt;
    setCd('orbital', 4 - orbT, 4);
    const n = blades.length;
    const base = world.time * 3;
    const doTick = orbTick >= 0.2;
    if (doTick) orbTick = 0;
    for (let i = 0; i < n; i++) {
      const b = blades[i];
      if (!b.active) continue;
      const a = base + (i * Math.PI * 2) / n;
      b.pos.set(pl.pos.x + Math.cos(a) * 4, 1.0, pl.pos.z + Math.sin(a) * 4);
      b.spin = -a;
      blockEnemyProjectiles(b.pos.x, b.pos.z, 1.0);
      if (!doTick) continue;
      const ids = world.enemyGrid.query(b.pos.x, b.pos.z, 6, bladeOut);
      for (let k = 0; k < ids.length; k++) {
        const e = world.enemies[ids[k]];
        if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
        const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z;
        const rr = 2.0 + e.radius * 0.5;
        if (dx * dx + dz * dz < rr * rr) damageEnemy(e, dmg, bladeOpts);
      }
    }
    if (orbT >= 4) {
      for (let i = 0; i < n; i++) {
        const b = blades[i];
        if (!b.active) continue;
        const t = findNearestEnemy(b.pos.x, b.pos.z, 50);
        let dx: number, dz: number;
        if (t) { dx = t.pos.x - b.pos.x; dz = t.pos.z - b.pos.z; }
        else { dx = b.pos.x - pl.pos.x; dz = b.pos.z - pl.pos.z; }
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        b.vel.set((dx / l) * 11, 0, (dz / l) * 11);
        b.state = 1; b.life = 2; b.hitIds.length = 0;
      }
      orbState = 1; orbT = 0;
    }
    return;
  }

  // launched
  orbT += dt;
  setCd('orbital', 2 - orbT, 2);
  let alive = 0;
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i];
    if (!b.active) continue;
    alive++;
    blockEnemyProjectiles(b.pos.x, b.pos.z, 1.5);
  }
  if (alive === 0 || orbT > 2) {
    for (let i = 0; i < blades.length; i++) blades[i].active = false;
    blades.length = 0;
    orbState = 2; orbT = 0;
  }
}

export function updateSkills(dt: number): void {
  const st = useGameStore.getState();
  const lv = st.skillLevels;
  const stats = st.stats;
  const pl = world.player;
  if (!pl.alive) return;
  // Timed auto skills charge at 30% speed while the hero is moving.
  const chargeMul = pl.vel.x * pl.vel.x + pl.vel.z * pl.vel.z > 0.25 || pl.dashT > 0 ? 0.3 : 1;

  // On-attack procs: HUD counters (logic lives in projectiles.fireBasicAttack).
  for (const k of ['burning', 'freezing', 'thunder', 'stamp'] as const) procHud(k, passiveCooldowns[k]);

  if (lv.freezeSpell > 0) {
    blizzT += dt * chargeMul;
    const max = Math.max(7, 14 - lv.freezeSpell * 0.2) * 1.3 * cdrMul();
    setCd('freezeSpell', max - blizzT, max);
    if (blizzT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 16) && trySpendMana(st.getManaCost('freezeSpell'))) {
        blizzT = 0;
        const bR = 16 + stats.blizzardRadius;
        blizzSlow.duration = 3 + stats.blizzFreeze; blizzSlow.value = Math.min(0.85, 0.65 + 0.03 * lv.freezeSpell);
        damageEnemiesInRadius(pl.pos.x, pl.pos.z, bR, stats.damage * 0.75 * stats.skillDamage * lvScale(lv.freezeSpell), iceOpts, blizzSlow);
        // small chance to freeze each normal enemy caught in the blizzard (bosses / mini-bosses immune)
        const chance = 0.12 + 0.02 * (lv.freezeSpell - 1);
        const ids = world.enemyGrid.query(pl.pos.x, pl.pos.z, bR + 2, blizOut);
        for (let i = 0; i < ids.length; i++) {
          const e = world.enemies[ids[i]];
          if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || e.boss || e.mini) continue;
          if ((e.pos.x - pl.pos.x) ** 2 + (e.pos.z - pl.pos.z) ** 2 > bR * bR || Math.random() >= chance) continue;
          applyStatus(e, blizzFreeze);
          events.emit('floatText', { pos: e.pos, text: 'FREEZE', color: 0x8fe4ff, scale: 0.7, dy: 0.4 });
        }
        const z = allocZone();
        if (z) {
          z.active = true; z.kind = 'FROST_NOVA'; z.hostile = false;
          z.pos.set(pl.pos.x, 0, pl.pos.z); z.radius = bR; z.life = z.maxLife = 1.5; z.damage = 0; z.color = 0x0ea5e9;
        }
        events.emit('frostNova', { pos: pl.pos.clone(), radius: bR });
        pl.anim.castT = 1;
      } else blizzT = max;
    }
  }

  // Warcry (barbarian) / Inspire (archer): a timed self-buff whenever an enemy is near
  const rally = lv.warcry > 0 ? 'warcry' : lv.inspire > 0 ? 'inspire' : null;
  if (rally) {
    const l = rally === 'warcry' ? lv.warcry : lv.inspire;
    const max = 12 * cdrMul();
    rallyT += dt * chargeMul;
    setCd(rally, max - rallyT, max);
    if (rallyT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 25)) rallyT = max;
      else {
        rallyT = 0;
        pl.buffT = 5 + 0.5 * (l - 1);
        if (rally === 'warcry') { pl.buffDmg = 0.10 + 0.05 * (l - 1); pl.buffDef = 8 + 4 * (l - 1); pl.buffHaste = 0; }
        else { pl.buffHaste = 0.15 + 0.05 * (l - 1); pl.buffDmg = 0.08 + 0.04 * (l - 1); pl.buffDef = 0; }
        const col = rally === 'warcry' ? 0xff6a3c : 0x7dffb0;
        events.emit('floatText', { pos: pl.pos, text: rally === 'warcry' ? 'WARCRY!' : 'INSPIRED!', color: col, scale: 1.0, dy: 2.2 });
        events.emit('shockwave', { pos: pl.pos.clone(), radius: 6, color: col });
        if (rally === 'warcry') events.emit('shake', { amount: 0.25 });
        pl.anim.castT = 1;
      }
    }
  }

  if (lv.storm > 0) {
    stormT += dt * chargeMul;
    const max = Math.max(5, 12 - lv.storm * 0.2) * cdrMul();
    setCd('storm', max - stormT, max);
    if (stormT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 40)) { stormT = max; } else {
      stormT = 0;
      const dir = getAimDir(aim);
      // Storm: a medium tornado spawns ~6 units in front of the hero, grinds enemies inside (continuous damage + light
      // pull) for ~3.5 s and drifts toward the nearest enemy. Storm Twin talent adds a second one beside it.
      const dps = stats.damage * 1.3 * stats.skillDamage * lvScale(lv.storm);
      const life = 3.5 + 0.25 * (stats.stormBonus | 0);
      const twin = stats.stormTwin > 0;
      for (let i = 0; i < (twin ? 2 : 1); i++) {
        const side = twin ? (i === 0 ? -1 : 1) * 2.6 : 0;
        const z = allocZone();
        if (!z) break;
        z.active = true; z.kind = 'TORNADO'; z.hostile = false;
        z.pos.set(pl.pos.x + dir.x * 6 - dir.z * side, 0, pl.pos.z + dir.z * 6 + dir.x * side);
        z.radius = 3.6 + 0.1 * lv.storm; z.life = z.maxLife = life; z.tickT = 0;
        z.damage = dps; z.color = 0xa8d8ff; z.length = 7; z.maxPull = 10;
        stormZones[i] = z;
      }
      events.emit('lightning', { from: new Vector3(pl.pos.x, 1.2, pl.pos.z), to: new Vector3(pl.pos.x + dir.x * 6, 1.2, pl.pos.z + dir.z * 6) });
      pl.anim.castT = 1;
      }
    }
  }

  // Storm tornadoes drift slowly toward the nearest enemy.
  for (let i = 0; i < stormZones.length; i++) {
    const z = stormZones[i];
    if (!z) continue;
    if (!z.active || z.kind !== 'TORNADO' || z.life <= 0) { stormZones[i] = null; continue; }
    const e = findNearestEnemy(z.pos.x, z.pos.z, 14);
    if (!e) continue;
    const dx = e.pos.x - z.pos.x, dz = e.pos.z - z.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.8) { const st2 = Math.min(d, 3.2 * dt); z.pos.x += (dx / d) * st2; z.pos.z += (dz / d) * st2; }
  }

  // Axe Storm: the basic attack flags a proc (see projectiles.fireBasicAttack).
  if (procFlags.stomp > 0) { const l = procFlags.stomp; procFlags.stomp = 0; axeStorm(l); }

  if (lv.orbital > 0) updateOrbitals(dt, lv.orbital, chargeMul);
}
