// ============================================================================
// Passive hero skills (burning/freezing arrows, blizzard, storm, thunder,
// mega stamp, orbital blades). Numbers follow the original SkillManager.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone } from '../world';
import { events } from '../events';
import type { Enemy, Projectile } from '../types';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, findNearestEnemy, getAimDir, rollCrit, lastCrit, trySpendMana,
  type DamageOpts, type StatusEffect,
} from './combat';
import { spawnProjectile } from './projectiles';

/** HUD cooldown progress. `t` = seconds remaining, `max` = full cooldown. Mutated in place every frame. */
export const passiveCooldowns: Record<string, { t: number; max: number }> = {
  burning: { t: 0, max: 8 },
  freezing: { t: 0, max: 7 },
  freezeSpell: { t: 0, max: 14 },
  storm: { t: 0, max: 15 },
  thunder: { t: 0, max: 7 },
  stamp: { t: 0, max: 12 },
  orbital: { t: 0, max: 2 },
};

const aim = new Vector3();
const lvScale = (lv: number): number => 1 + 0.15 * Math.max(0, lv - 1);
const cdrMul = (): number => 1 - useGameStore.getState().stats.cooldownReduction;
const thunderPool: Enemy[] = [];
const thunderOut: number[] = [];
const blades: Projectile[] = [];
const stompStun: StatusEffect = { type: 'STUN', duration: 2 };
const stompOpts1: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const stompOpts2: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 5 };
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const freeze5: StatusEffect = { type: 'FREEZE', duration: 5.1 };
const bladeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const thunderOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER', crit: false };
const bladeOut: number[] = [];

let burnT = 0, freezeT = 0, blizzT = 0, stormT = 0, thunderT = 0, stampT = 0;
let stampStage = 0, stampSeqT = 0;
let orbState = 2, orbT = 2, orbTick = 0;

export function resetSkills(): void {
  burnT = freezeT = blizzT = stormT = thunderT = stampT = 0;
  stampStage = 0; stampSeqT = 0;
  orbState = 2; orbT = 2; orbTick = 0;
  blades.length = 0;
  for (const k in passiveCooldowns) { passiveCooldowns[k].t = 0; }
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

function fireArrowFan(kind: 'BURNING_ARROW' | 'FREEZING_ARROW', mult: number, level: number, effect: Projectile['effect']): void {
  const st = useGameStore.getState().stats;
  const dir = getAimDir(aim);
  const pl = world.player;
  const dmg = st.damage * mult * st.skillDamage * 2.0 * lvScale(level);
  for (let i = -1; i <= 1; i++) {
    const a = i * 0.5;
    const c = Math.cos(a), s = Math.sin(a);
    spawnProjectile(kind, pl.pos.x + dir.x * 0.9, pl.pos.z + dir.z * 0.9,
      dir.x * c - dir.z * s, dir.x * s + dir.z * c, 30, dmg,
      { life: 3, pierce: 5, aoe: 5, radius: 3, knockback: st.knockback, effect });
  }
  pl.anim.castT = 1;
}

function stomp(stage: 1 | 2, level: number): void {
  const st = useGameStore.getState().stats;
  const pl = world.player;
  const dmg = st.damage * 1.5 * st.skillDamage * lvScale(level);
  if (stage === 1) damageEnemiesInRadius(pl.pos.x, pl.pos.z, 16, dmg, stompOpts1, stompStun);
  else damageEnemiesInRadius(pl.pos.x, pl.pos.z, 16, dmg, stompOpts2);
  const z = allocZone();
  if (z) {
    z.active = true; z.kind = 'SHOCKWAVE'; z.hostile = false;
    z.pos.set(pl.pos.x, 0, pl.pos.z); z.radius = 16; z.life = z.maxLife = 0.5; z.damage = 0; z.color = 0xf97316;
  }
  events.emit('shockwave', { pos: pl.pos.clone(), radius: 16, color: 0xf97316 });
  pl.anim.castT = 1;
}

function updateOrbitals(dt: number, level: number): void {
  const st = useGameStore.getState().stats;
  const pl = world.player;
  const dmg = st.damage * 1.5 * (1 + level * 0.1);

  if (orbState === 2) {
    orbT += dt;
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

function updateThunder(level: number): void {
  const st = useGameStore.getState();
  const pl = world.player;
  const ids = world.enemyGrid.query(pl.pos.x, pl.pos.z, 40, thunderOut);
  thunderPool.length = 0;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z;
    if (dx * dx + dz * dz < 1600) thunderPool.push(e);
  }
  if (thunderPool.length === 0) return;
  if (!trySpendMana(st.getManaCost('thunder'))) return;
  thunderT = 0;
  for (let i = 0; i < level && thunderPool.length > 0; i++) {
    const idx = Math.floor(Math.random() * thunderPool.length);
    const target = thunderPool[idx];
    thunderPool[idx] = thunderPool[thunderPool.length - 1];
    thunderPool.pop();
    const mult = rollCrit(st.stats.critRate, st.stats.critDamage);
    thunderOpts.crit = lastCrit;
    const dmg = st.stats.damage * 0.75 * (1 + level * 0.1) * mult;
    events.emit('lightning', { from: new Vector3(target.pos.x, 40, target.pos.z), to: target.pos.clone() });
    damageEnemy(target, dmg, thunderOpts);
  }
}

export function updateSkills(dt: number): void {
  const st = useGameStore.getState();
  const lv = st.skillLevels;
  const stats = st.stats;
  const pl = world.player;
  if (!pl.alive) return;

  if (lv.burning > 0) {
    burnT += dt;
    const max = Math.max(2, 8 - lv.burning * 0.5) * cdrMul();
    setCd('burning', max - burnT, max);
    if (burnT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 35) && trySpendMana(st.getManaCost('burning'))) {
        burnT = 0;
        fireArrowFan('BURNING_ARROW', 0.525, lv.burning, { type: 'BURN', duration: 4, value: stats.damage * 0.3 });
      } else burnT = max;
    }
  }

  if (lv.freezing > 0) {
    freezeT += dt;
    const max = Math.max(2, 7 - lv.freezing * 0.5) * cdrMul();
    setCd('freezing', max - freezeT, max);
    if (freezeT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 35) && trySpendMana(st.getManaCost('freezing'))) {
        freezeT = 0;
        fireArrowFan('FREEZING_ARROW', 0.75, lv.freezing, { type: 'FREEZE', duration: 1.5 });
      } else freezeT = max;
    }
  }

  if (lv.freezeSpell > 0) {
    blizzT += dt;
    const max = Math.max(7, 14 - lv.freezeSpell * 0.2) * cdrMul();
    setCd('freezeSpell', max - blizzT, max);
    if (blizzT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 27) && trySpendMana(st.getManaCost('freezeSpell'))) {
        blizzT = 0;
        damageEnemiesInRadius(pl.pos.x, pl.pos.z, 27, stats.damage * 0.75 * stats.skillDamage * lvScale(lv.freezeSpell), iceOpts, freeze5);
        const z = allocZone();
        if (z) {
          z.active = true; z.kind = 'FROST_NOVA'; z.hostile = false;
          z.pos.set(pl.pos.x, 0, pl.pos.z); z.radius = 27; z.life = z.maxLife = 1.5; z.damage = 0; z.color = 0x0ea5e9;
        }
        events.emit('frostNova', { pos: pl.pos.clone(), radius: 27 });
        pl.anim.castT = 1;
      } else blizzT = max;
    }
  }

  if (lv.storm > 0) {
    stormT += dt;
    const max = Math.max(5, 15 - lv.storm * 0.2) * cdrMul();
    setCd('storm', max - stormT, max);
    if (stormT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 40)) { stormT = max; } else {
      stormT = 0;
      const dir = getAimDir(aim);
      spawnProjectile('STORM', pl.pos.x, pl.pos.z, dir.x, dir.z, 4, stats.damage * 1.5 * stats.skillDamage * 2.0 * lvScale(lv.storm),
        { life: 10, pierce: Infinity, knockback: 1.0, bounces: 6, radius: 5.5 });
      }
    }
  }

  if (lv.stamp > 0) {
    if (stampStage === 0) {
      stampT += dt;
      const max = Math.max(4, 12 - lv.stamp * 0.5) * cdrMul();
      setCd('stamp', max - stampT, max);
      if (stampT >= max && findNearestEnemy(pl.pos.x, pl.pos.z, 16) && trySpendMana(st.getManaCost('stamp'))) {
        stampStage = 1; stampSeqT = 0;
        stomp(1, lv.stamp);
      }
    } else {
      stampSeqT += dt;
      if (stampSeqT >= 0.5) { stomp(2, lv.stamp); stampStage = 0; stampT = 0; }
    }
  }

  if (lv.orbital > 0) updateOrbitals(dt, lv.orbital);

  if (lv.thunder > 0) {
    thunderT += dt;
    const tmax = 7 * cdrMul();
    setCd('thunder', tmax - thunderT, tmax);
    if (thunderT > tmax) updateThunder(lv.thunder);
  }
}
