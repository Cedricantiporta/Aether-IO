// ============================================================================
// Passive hero skills (blizzard, arcane shield, orbital blades; burning/freezing/thunder/stamp
// are on-attack procs driven by projectiles.fireBasicAttack). Numbers follow the original SkillManager.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocProjectile, allocZone } from '../world';
import { events } from '../events';
import type { Projectile, Zone } from '../types';
import { useGameStore } from '../../store';
import {
  damageEnemy, damageEnemiesInRadius, findNearestEnemy, applyStatus, getAimDir, rollCrit, lastCrit, trySpendMana, healPlayer,
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
  consecrate: { t: 0, max: 0, kind: 'time' },   // always-on aura: no cooldown shown
  smite: { t: 0, max: 10, kind: 'hits' },
  radiant: { t: 0, max: 10, kind: 'time' },
};

const aim = new Vector3();
const lvScale = (lv: number): number => 1 + 0.15 * Math.max(0, lv - 1);
const cdrMul = (): number => 1 - useGameStore.getState().stats.cooldownReduction;
const blades: Projectile[] = [];
const blizzSlow: StatusEffect = { type: 'SLOW', duration: 3, value: 0.7 };
const blizzFreeze: StatusEffect = { type: 'FREEZE', duration: 1.2 };
const blizOut: number[] = [];
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const bladeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const bladeOut: number[] = [];

let blizzT = 0, stormT = 0, rallyT = 0, auraT = 0, radT = 0;
const auraOut: number[] = [];
const holyAuraOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
let orbState = 2, orbT = 2, orbTick = 0;

export function resetSkills(): void {
  blizzT = stormT = rallyT = auraT = radT = 0;
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

const smiteOut: number[] = [];
const smiteOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const smiteStun: StatusEffect = { type: 'STUN', duration: 0.6 };
const smiteFrom = new Vector3(), smiteAt = new Vector3();
/** SMITE (knight proc): holy light strikes the nearest enemy (or ahead): area damage + a short stun. */
function smite(level: number): void {
  const pl = world.player, st = useGameStore.getState().stats;
  const t = findNearestEnemy(pl.pos.x, pl.pos.z, 14);
  if (t) smiteAt.set(t.pos.x, 0, t.pos.z);
  else { getAimDir(aim); smiteAt.set(pl.pos.x + aim.x * 5, 0, pl.pos.z + aim.z * 5); }
  const R = 3.2 + 0.3 * (level - 1), dmg = st.damage * 2.4 * st.skillDamage * lvScale(level);
  smiteStun.duration = 0.6 + 0.1 * (level - 1);
  const ids = world.enemyGrid.query(smiteAt.x, smiteAt.z, R + 2, smiteOut);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    if ((e.pos.x - smiteAt.x) ** 2 + (e.pos.z - smiteAt.z) ** 2 > (R + e.radius) ** 2) continue;
    damageEnemy(e, dmg, smiteOpts); applyStatus(e, smiteStun);
  }
  smiteFrom.set(smiteAt.x, 16, smiteAt.z);
  events.emit('lightning', { from: smiteFrom.clone(), to: smiteAt.clone() });
  events.emit('crater', { pos: smiteAt.clone(), radius: R, color: 0xffe08a });
  events.emit('shockwave', { pos: smiteAt.clone(), radius: R, color: 0xfff3c0 });
  events.emit('floatText', { pos: smiteAt.clone(), text: 'SMITE!', color: 0xfff3a0, scale: 0.9, dy: 2 });
  events.emit('shake', { amount: 0.15 });
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
      { life: 2.4, pierce: 6, radius: 1.5 * size, knockback: 0.8, y: 1.1, effect: { type: 'ARMOR_BREAK', duration: 6 } });
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
  for (const k of ['burning', 'freezing', 'thunder', 'stamp', 'smite'] as const) procHud(k, passiveCooldowns[k]);

  if (lv.freezeSpell > 0) {
    blizzT += dt * chargeMul;
    const max = Math.max(7, 14 - lv.freezeSpell * 0.2) * 1.3 * cdrMul();
    setCd('freezeSpell', max - blizzT, max);
    if (blizzT >= max) {
      if (findNearestEnemy(pl.pos.x, pl.pos.z, 8 + stats.blizzardRadius) && trySpendMana(st.getManaCost('freezeSpell'))) {
        blizzT = 0;
        const bR = 6.5 + stats.blizzardRadius;   // a tight frost burst around the hero (user: very small radius, little damage)
        blizzSlow.duration = (3 + stats.blizzFreeze) * 1.5;   // +50% slow duration blizzSlow.value = Math.min(0.85, 0.65 + 0.03 * lv.freezeSpell);
        damageEnemiesInRadius(pl.pos.x, pl.pos.z, bR, stats.damage * 0.12 * stats.skillDamage * lvScale(lv.freezeSpell), iceOpts, blizzSlow);
        // small chance to freeze each normal enemy caught in the blizzard (bosses / mini-bosses immune)
        const chance = 0.2 + 0.03 * (lv.freezeSpell - 1);   // higher freeze chance
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

  // Consecration (knight): a holy aura burns nearby enemies once a second and heals a little per enemy hit
  if (lv.consecrate > 0) {
    auraT += dt;
    if (auraT >= 1) {
      auraT = 0;
      const R = 4.5 + 0.4 * (lv.consecrate - 1);
      const ids = world.enemyGrid.query(pl.pos.x, pl.pos.z, R + 2, auraOut);
      let hits = 0;
      const dmg = stats.damage * 0.6 * stats.skillDamage * lvScale(lv.consecrate);
      for (let i = 0; i < ids.length; i++) {
        const e = world.enemies[ids[i]];
        if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
        if ((e.pos.x - pl.pos.x) ** 2 + (e.pos.z - pl.pos.z) ** 2 > (R + e.radius) ** 2) continue;
        damageEnemy(e, dmg, holyAuraOpts); hits++;
      }
      if (hits > 0) {
        healPlayer(stats.maxHealth * 0.004 * Math.min(hits, 5));
        events.emit('shockwave', { pos: pl.pos.clone(), radius: R, color: 0xffe08a });
      }
    }
  }

  // Radiant Burst (knight): a ring of holy crescents every 10 s while enemies are near
  if (lv.radiant > 0) {
    const max = 10 * cdrMul();
    radT += dt * chargeMul;
    setCd('radiant', max - radT, max);
    if (radT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 22)) radT = max;
      else {
        radT = 0;
        const n = 7 + lv.radiant, dmg = stats.damage * 1.6 * stats.skillDamage * lvScale(lv.radiant), a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
          spawnProjectile('HOLY_WAVE', pl.pos.x + dx * 1.2, pl.pos.z + dz * 1.2, dx, dz, 16, dmg, { life: 0.75, pierce: 999, knockback: 1, radius: 2.2, y: 1.1 });
        }
        events.emit('shockwave', { pos: pl.pos.clone(), radius: 5, color: 0xffe08a });
        pl.anim.castT = 1;
      }
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
        else { pl.buffHaste = 0.25; pl.buffDmg = 0.08 + 0.04 * (l - 1); pl.buffDef = 0; }
        const col = rally === 'warcry' ? 0xff6a3c : 0x7dffb0;
        events.emit('floatText', { pos: pl.pos, text: rally === 'warcry' ? 'WARCRY!' : 'INSPIRED!', color: col, scale: 1.0, dy: 2.2 });
        events.emit('shockwave', { pos: pl.pos.clone(), radius: 6, color: col });
        if (rally === 'warcry') events.emit('shake', { amount: 0.25 });
        pl.anim.castT = 1;
      }
    }
  }

  // Arcane Shield (Wizard passive, skill key 'storm'): every 12 s (-1 s per level, min 7 s) in battle a purple shield
  // absorbs 20% (+5% per level) of max HP for 6 s or until broken (combat.damagePlayer soaks it before the Aegis card).
  if (pl.arcaneT > 0) { pl.arcaneT -= dt; if (pl.arcaneT <= 0) { pl.arcaneT = 0; pl.arcane = 0; pl.arcaneMax = 0; } }
  if (lv.storm > 0 && st.hero === 'WIZARD') {
    stormT += dt;   // (charges at full speed while moving: a defensive passive for a kiting caster)
    const max = Math.max(7, 13 - lv.storm) * cdrMul();
    setCd('storm', max - stormT, max);
    if (stormT >= max) {
      if (!findNearestEnemy(pl.pos.x, pl.pos.z, 30)) { stormT = max; } else {
        stormT = 0;
        const size = stats.maxHealth * (0.20 + 0.05 * (lv.storm - 1)) * (1 + 0.25 * (stats.stormTwin | 0));
        pl.arcane = Math.max(pl.arcane, size); pl.arcaneMax = Math.max(pl.arcane, size);
        pl.arcaneT = 6 + 0.25 * (stats.stormBonus | 0);
        events.emit('floatText', { pos: pl.pos, text: 'ARCANE SHIELD', color: 0xb46bff, scale: 0.9, dy: 2.4 });
        events.emit('shockwave', { pos: pl.pos.clone(), radius: 3.2, color: 0xa855f7 });
        pl.anim.castT = 1;
      }
    }
  }

  // Axe Storm: the basic attack flags a proc (see projectiles.fireBasicAttack).
  if (procFlags.stomp > 0) { const l = procFlags.stomp; procFlags.stomp = 0; axeStorm(l); }
  if (procFlags.smite > 0) { const l = procFlags.smite; procFlags.smite = 0; smite(l); }

  if (lv.orbital > 0) updateOrbitals(dt, lv.orbital, chargeMul);
}
