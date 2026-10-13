// ============================================================================
// Passive hero skills (blizzard, storm, orbital blades; burning/freezing/thunder/stamp
// are on-attack procs driven by projectiles.fireBasicAttack). Numbers follow the original SkillManager.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone } from '../world';
import { events } from '../events';
import type { Projectile } from '../types';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, findNearestEnemy, getAimDir, rollCrit, lastCrit, trySpendMana,
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
};

const aim = new Vector3();
const lvScale = (lv: number): number => 1 + 0.15 * Math.max(0, lv - 1);
const cdrMul = (): number => 1 - useGameStore.getState().stats.cooldownReduction;
const blades: Projectile[] = [];
const stompStun: StatusEffect = { type: 'STUN', duration: 2 };
const stompOpts1: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const stompOpts2: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 5 };
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const freeze5: StatusEffect = { type: 'FREEZE', duration: 5.1 };
const bladeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const bladeOut: number[] = [];

let blizzT = 0, stormT = 0;
let stampStage = 0, stampSeqT = 0, stampLv = 1;
let orbState = 2, orbT = 2, orbTick = 0;

export function resetSkills(): void {
  blizzT = stormT = 0;
  stampStage = 0; stampSeqT = 0;
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

function stomp(stage: 1 | 2, level: number): void {
  const st = useGameStore.getState().stats;
  const pl = world.player;
  const R = 12 + level + st.stompRadius;
  const dmg = st.damage * 1.5 * st.skillDamage * lvScale(level) * (1 + st.stompPower);
  stompStun.duration = 2 + st.stompStun;
  if (stage === 1) damageEnemiesInRadius(pl.pos.x, pl.pos.z, R, dmg, stompOpts1, stompStun);
  else damageEnemiesInRadius(pl.pos.x, pl.pos.z, R, dmg, stompOpts2);
  const z = allocZone();
  if (z) {
    z.active = true; z.kind = 'SHOCKWAVE'; z.hostile = false;
    z.pos.set(pl.pos.x, 0, pl.pos.z); z.radius = R; z.life = z.maxLife = 0.5; z.damage = 0; z.color = 0xf97316;
  }
  events.emit('shockwave', { pos: pl.pos.clone(), radius: R, color: 0xf97316 });
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
    const count = 2 + level;
    blades.length = 0;
    for (let i = 0; i < count; i++) {
      const p = allocProjectile();
      if (!p) break;
      p.active = true; p.kind = 'ORBITAL_BLADE'; p.state = 0;
      p.pos.set(pl.pos.x, 1.0, pl.pos.z); p.vel.set(0, 0, 0);
      p.life = p.maxLife = 99; p.damage = dmg * 5; p.radius = 1.5; p.pierce = 1;
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
        b.vel.set((dx / l) * 20, 0, (dz / l) * 20);
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
    const max = Math.max(7, 14 - lv.freezeSpell * 0.2) * cdrMul();
    setCd('freezeSpell', max - blizzT, max);
    if (blizzT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 27) && trySpendMana(st.getManaCost('freezeSpell'))) {
        blizzT = 0;
        const bR = 27 + stats.blizzardRadius;
        freeze5.duration = 5.1 + stats.blizzFreeze;
        damageEnemiesInRadius(pl.pos.x, pl.pos.z, bR, stats.damage * 0.75 * stats.skillDamage * lvScale(lv.freezeSpell), iceOpts, freeze5);
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

  if (lv.storm > 0) {
    stormT += dt * chargeMul;
    const max = Math.max(5, 15 - lv.storm * 0.2) * cdrMul();
    setCd('storm', max - stormT, max);
    if (stormT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 40)) { stormT = max; } else {
      stormT = 0;
      const dir = getAimDir(aim);
      spawnProjectile('STORM', pl.pos.x, pl.pos.z, dir.x, dir.z, 4, stats.damage * 1.5 * stats.skillDamage * 2.0 * lvScale(lv.storm),
        { life: 10 + stats.stormBonus, pierce: Infinity, knockback: 1.0, bounces: 6 + Math.floor(stats.stormBonus / 2), radius: 5.5 });
      if (stats.stormTwin > 0) {
        const a = 0.9, ca = Math.cos(a), sa = Math.sin(a);
        spawnProjectile('STORM', pl.pos.x, pl.pos.z, dir.x * ca - dir.z * sa, dir.x * sa + dir.z * ca, 4, stats.damage * 1.5 * stats.skillDamage * 2.0 * lvScale(lv.storm),
          { life: 10 + stats.stormBonus, pierce: Infinity, knockback: 1.0, bounces: 6 + Math.floor(stats.stormBonus / 2), radius: 5.5 });
      }
      }
    }
  }

  // Mega Stamp: the basic attack flags a stomp; stage 2 follows 0.5s after stage 1.
  if (stampStage === 0) {
    if (procFlags.stomp > 0) { stampLv = procFlags.stomp; procFlags.stomp = 0; stampStage = 1; stampSeqT = 0; stomp(1, stampLv); }
  } else {
    stampSeqT += dt;
    if (stampSeqT >= 0.5) { stomp(2, stampLv); stampStage = 0; }
  }

  if (lv.orbital > 0) updateOrbitals(dt, lv.orbital, chargeMul);
}
