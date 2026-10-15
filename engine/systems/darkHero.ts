// ============================================================================
// Dark hero champions: a shadow copy of a hero class that fights the player alone (DUEL rooms, the Gate of Shadows).
// One kind ('DARK_HERO') with five class kits, each an enemy version of the hero's skills with telegraphs:
//   ARCHER      arrows, 5-arrow volley (5 lane telegraphs), evasive roll, rain of arrows (3 ground circles)
//   WIZARD      fire bolts, 3-fireball fan, blink away, frost nova (ring telegraph, slow + a ring of frost orbs)
//   BARBARIAN   melee swings, boomerang axe throw, leap slam (landing circle), whirlwind (spinning, chases)
//   KNIGHT      melee swings, holy charge (lane telegraph), crescent slash (wide lane), shield block (front hits = 0)
//   NECROMANCER soul bolts, raise 2-3 skeletons (rising marks), bone spear lane, soul step (blink + bone burst)
// State machine on the Enemy (CHASE/KITE -> WINDUP -> ATTACK -> RECOVER); e.pattern = skill id (0 basic, 1..3).
// Only one dark hero exists at a time: its per-fight memory lives in the module object `S`, the render layer reads
// `darkView`. Pure engine code, no per-frame allocations.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocEnemyProjectile, allocZone } from '../world';
import { events } from '../events';
import type { Enemy, EnemyProjectile } from '../types';
import type { HeroClass } from '../../types';
import { ENEMY_DEFS, waveHpMult } from '../enemyDefs';
import { damagePlayer, applyPlayerDebuff, staggerView } from './combat';
import { enter, requestYaw, fireEnemyProjectile, spawnEnemy, spawnTelegraphCircle, spawnTelegraphLine, poofAllEnemies, levelHpMul } from './enemies';
import { hooks } from './hooks';
import { spawnPickup } from './pickups';
import { dropLoot } from './loot';
import { useGameStore } from '../../store';
import { runMods } from '../runMods';
import { rarityForDepth } from '../roomDefs';
import { edgeLimit } from '../mapgen';

export const DARK_CLASSES: readonly HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
export const DARK_NAMES: Record<HeroClass, { name: string; title: string }> = {
  ARCHER: { name: 'The Dark Ranger', title: 'Shadow of the Bow' },
  WIZARD: { name: 'The Dark Archmage', title: 'Shadow of the Arcane' },
  BARBARIAN: { name: 'The Dark Berserker', title: 'Shadow of the Axe' },
  KNIGHT: { name: 'The Fallen Paladin', title: 'Shadow of the Oath' },
  NECROMANCER: { name: 'The Dark Necromancer', title: 'Shadow of the Grave' },
};
const RANGED: Record<HeroClass, boolean> = { ARCHER: true, WIZARD: true, BARBARIAN: false, KNIGHT: false, NECROMANCER: true };
/** Skill cooldowns (s) per class: [basic, skill 1, skill 2, skill 3]. */
const CD: Record<HeroClass, [number, number, number, number]> = {
  ARCHER: [1.1, 6, 4.5, 9],
  WIZARD: [1.6, 6, 5.5, 10],
  BARBARIAN: [0, 5, 7, 11],
  KNIGHT: [0, 6, 5, 12],
  NECROMANCER: [1.4, 10, 5, 6.5],
};

/** Read by render/DarkHero.tsx. atk / cast are pulse counters (a change = play the one-shot). */
export const darkView = {
  id: -1, cls: 'KNIGHT' as HeroClass, atk: 0, cast: 0, air: 0, spin: 0, guard: 0, enraged: 0,
  slash: 0, slashX: 0, slashZ: 0, slashYaw: 0,   // crescent slash pulse (render sweeps an arc along the lane)
};

const S = {
  id: -1, cls: 'KNIGHT' as HeroClass,
  cd: [0, 0, 0, 0], gap: 0, strafe: 1, strafeT: 0,
  wind: 0, act: 0, dirX: 0, dirZ: 1, fromX: 0, fromZ: 0, toX: 0, toZ: 0, tick: 0, len: 0, bash: false,
  rainT: -1, rainN: 0, blockText: 0,
};
const rainX = [0, 0, 0], rainZ = [0, 0, 0];
const axes: (EnemyProjectile | null)[] = [null, null];
const axeT = [0, 0];
const tmp = new Vector3(), tmp2 = new Vector3(), dirV = new Vector3();

const pdmg = (e: Enemy) => Math.max(6, e.projectileDamage);
const mdmg = (e: Enemy) => Math.max(8, e.contactDamage);

// ------------------------------------------------------------- spawning ------
/** Spawns a dark hero of class `cls` at (x, z) with a boss bar. HP ~ 5x an elite of the current depth. */
export function spawnDarkHero(cls: HeroClass, x: number, z: number): Enemy | null {
  const e = spawnEnemy('DARK_HERO', tmp.set(x, 0, z));
  if (!e) return null;
  const st = useGameStore.getState();
  const mods = runMods(st.difficulty);
  const wave = world.director.wave;
  e.maxHp = Math.round(ENEMY_DEFS.DARK_HERO.hp * waveHpMult(wave) * mods.hp * 5 * levelHpMul()); e.hp = e.maxHp;   // (scales with the hero's level too)
  e.mini = true; e.staggerMax = 80; e.armor = Math.round(e.armor * 1.25);
  e.xp *= 20; e.pattern = 0;
  if (!RANGED[cls]) { e.contactDamage *= 1.25; e.speed *= 1.08; }
  else e.contactDamage *= 0.6;
  S.id = e.id; S.cls = cls;
  const c = CD[cls];
  S.cd[0] = 1.2; S.cd[1] = c[1] * 0.4; S.cd[2] = c[2] * 0.6; S.cd[3] = c[3] * 0.5; S.gap = 1.2;
  S.strafe = Math.random() < 0.5 ? 1 : -1; S.strafeT = 2; S.rainT = -1; S.bash = false;
  if (cls === 'NECROMANCER') S.cd[1] = 2.5;   // opens with Raise Dead
  axes[0] = axes[1] = null;
  darkView.id = e.id; darkView.cls = cls; darkView.air = 0; darkView.spin = 0; darkView.guard = 0; darkView.enraged = 0;
  const names = DARK_NAMES[cls];
  const b = world.boss;
  b.active = true; b.name = names.name; b.title = names.title; b.hp = e.hp; b.maxHp = e.maxHp; b.phase = 0;
  events.emit('bossSpawn', { name: names.name, title: names.title });
  events.emit('shake', { amount: 0.35 });
  return e;
}

/** Called from enemies.onEnemyDeath: rewards, raised skeletons crumble, boss bar off. */
export function darkHeroDied(e: Enemy): void {
  if (e.id === S.id) { S.id = -1; darkView.guard = 0; darkView.spin = 0; darkView.air = 0; }
  world.boss.active = false; world.boss.hp = 0;
  for (let i = 0; i < axes.length; i++) { const a = axes[i]; if (a) a.active = false; axes[i] = null; }
  poofAllEnemies();   // a duel: whatever it raised goes down with it
  events.emit('shake', { amount: 0.7 });
  events.emit('explosion', { pos: e.pos, radius: 5, color: 0x8b3dff });
  events.emit('floatText', { pos: e.pos, text: 'CHAMPION DEFEATED', color: 0xc9a2ff, scale: 1.1, dy: 2.6 });
  const st = useGameStore.getState();
  const wave = world.director.wave;
  const luck = 2.4 * (1 + wave * 0.02);
  dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
  dropLoot('MINI', luck, e.pos.x, e.pos.z, true);
  const r1 = rarityForDepth(wave, 0.5, world.run.bossKills);
  const it1 = st.rollItemDrop(r1);
  if (it1) spawnPickup('ITEM', tmp.set(e.pos.x - 0.8, 0, e.pos.z), 0, it1);
  const r2 = rarityForDepth(wave, 0.8, world.run.bossKills);
  const it2 = st.rollItemDrop(r2 === 'COMMON' || r2 === 'RARE' ? 'EPIC' : r2);   // a champion always leaves something good
  if (it2) spawnPickup('ITEM', tmp.set(e.pos.x + 0.8, 0, e.pos.z), 0, it2);
  for (let i = 0; i < 3; i++) spawnPickup('GEM', tmp.set(e.pos.x, 0, e.pos.z), 2 + Math.floor(wave / 8));
  for (let i = 0; i < 6; i++) spawnPickup('GOLD', tmp.set(e.pos.x + (Math.random() - 0.5) * 3, 0, e.pos.z + (Math.random() - 0.5) * 3), 12 + wave);
}

// Dark Knight shield block: hits from the front deal nothing while the guard is up.
hooks.heroMul = (e: Enemy): number => {
  if (e.id !== S.id || darkView.guard <= 0) return 1;
  const dx = world.player.pos.x - e.pos.x, dz = world.player.pos.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
  if ((dx * Math.sin(e.facing) + dz * Math.cos(e.facing)) / l < 0.1) return 1;   // from behind / the side: it lands
  if (world.time - S.blockText > 0.45) { S.blockText = world.time; events.emit('floatText', { pos: e.pos, text: 'BLOCKED', color: 0x9fb4ff, scale: 0.8, dy: 1.4 }); }
  return 0;
};

// ------------------------------------------------------------- helpers -------
function aimAt(e: Enemy, px: number, pz: number): number {
  const dx = px - e.pos.x, dz = pz - e.pos.z, l = Math.hypot(dx, dz) || 1;
  S.dirX = dx / l; S.dirZ = dz / l;
  return l;
}
function shoot(e: Enemy, dx: number, dz: number, kind: 'ARROW' | 'ORB' | 'FLAME' | 'SLOW_ORB', speed: number, dmg: number, opts?: { homing?: number; slow?: number; debuff?: number; life?: number }): void {
  tmp.set(e.pos.x + dx * 0.8, 1.3, e.pos.z + dz * 0.8);
  tmp2.set(dx, 0, dz);
  fireEnemyProjectile(tmp, tmp2, kind, speed, dmg, opts);
}
function fan(e: Enemy, n: number, spread: number, kind: 'ARROW' | 'FLAME', speed: number, dmg: number, debuff = 0): void {
  const base = Math.atan2(S.dirX, S.dirZ);
  for (let i = 0; i < n; i++) {
    const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread);
    shoot(e, Math.sin(a), Math.cos(a), kind, speed, dmg, debuff ? { debuff } : undefined);
  }
}
function laneTelegraphs(e: Enemy, n: number, spread: number, len: number, width: number, life: number, color: number): void {
  const base = Math.atan2(S.dirX, S.dirZ);
  for (let i = 0; i < n; i++) {
    const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread);
    spawnTelegraphLine(e.pos.x, e.pos.z, Math.sin(a), Math.cos(a), len, width, life, color);
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
/** A visual-only ground mark (fills up, no effect): the necromancer's rising-skeleton spots. */
function mark(x: number, z: number, r: number, life: number, color: number): void {
  const zn = allocZone();
  if (!zn) return;
  zn.active = true; zn.kind = 'METEOR_SHADOW'; zn.hostile = true; zn.pos.set(x, 0, z); zn.radius = r; zn.life = life; zn.maxLife = life; zn.damage = 0; zn.color = color;
}
function aliveAdds(): number {
  let n = 0;
  for (const o of world.enemies) if (o.active && o.state !== 'DYING' && o.kind !== 'DARK_HERO') n++;
  return n;
}

// ------------------------------------------------------------- skills --------
/** Can skill k start at this distance? */
function wants(k: number, d: number): boolean {
  switch (S.cls) {
    case 'ARCHER': return k === 1 ? d < 17 : k === 2 ? d < 6 : d < 18;
    case 'WIZARD': return k === 1 ? d < 16 : k === 2 ? d < 7 : d < 8.5;
    case 'BARBARIAN': return k === 1 ? d > 5 && d < 17 : k === 2 ? d > 4.5 && d < 15 : d < 7;
    case 'KNIGHT': return k === 1 ? d > 4 && d < 15 : k === 2 ? d < 8.5 : d < 9;
    default: return k === 1 ? aliveAdds() < 3 : k === 2 ? d < 18 : d < 6;   // NECROMANCER
  }
}

/** Starts skill k: telegraphs + windup / active durations. */
function begin(e: Enemy, k: number, px: number, pz: number): void {
  const d = aimAt(e, px, pz);
  e.pattern = k; enter(e, 'WINDUP'); e.vel.set(0, 0, 0);
  S.tick = 0; S.bash = false;
  const c = S.cls;
  if (c === 'ARCHER') {
    if (k === 1) { S.wind = 0.55; S.act = 0.15; laneTelegraphs(e, 5, 0.36, 16, 0.9, 0.55, 0xff3355); }
    else if (k === 2) { S.wind = 0.1; S.act = 0.32; retreatPoint(e, px, pz, 9, dirV); aimAt(e, dirV.x, dirV.z); }
    else {
      S.wind = 0.6; S.act = 0.5; S.rainN = 3;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 2.4 + Math.random() * 1.6;
        rainX[i] = px + Math.cos(a) * r; rainZ[i] = pz + Math.sin(a) * r;
        spawnTelegraphCircle(rainX[i], rainZ[i], 3.1, 1.25, pdmg(e) * 1.5, 0x9b5cff);
      }
      S.rainT = 1.1;
    }
  } else if (c === 'WIZARD') {
    if (k === 1) { S.wind = 0.6; S.act = 0.15; laneTelegraphs(e, 3, 0.3, 14, 1.4, 0.6, 0xff6a2a); }
    else if (k === 2) { S.wind = 0.25; S.act = 0.12; }
    else { S.wind = 0.9; S.act = 0.25; spawnTelegraphCircle(e.pos.x, e.pos.z, 6.5, 0.9, pdmg(e) * 1.4, 0x7fd8ff); }
  } else if (c === 'BARBARIAN') {
    if (k === 1) { S.wind = 0.45; S.act = 0.15; spawnTelegraphLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 15, 1.6, 0.45, 0xff3355); }
    else if (k === 2) {
      S.wind = 0.35; S.act = 0.7; S.fromX = e.pos.x; S.fromZ = e.pos.z;
      const l = Math.min(d, 14); S.toX = e.pos.x + S.dirX * l; S.toZ = e.pos.z + S.dirZ * l;
      spawnTelegraphCircle(S.toX, S.toZ, 4, S.wind + S.act, mdmg(e) * 2.2, 0xff7a1a);
    } else { S.wind = 0.5; S.act = 2.4; spawnTelegraphCircle(e.pos.x, e.pos.z, 3.4, 0.5, mdmg(e) * 0.8, 0xff3355); }
  } else if (c === 'KNIGHT') {
    if (k === 1) { S.wind = 0.6; S.len = Math.min(d + 3, 14); S.act = S.len / 26; spawnTelegraphLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, S.len, 2.2, 0.6, 0xffd36a); }
    else if (k === 2) { S.wind = 0.55; S.act = 0.25; const z = spawnTelegraphLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 9, 3.2, 0.55, 0xffd36a); if (z) z.damage = mdmg(e) * 1.6; }
    else { S.wind = 0.2; S.act = 2.6; }
  } else {   // NECROMANCER
    if (k === 1) {
      S.wind = 1.0; S.act = 0.2; S.rainN = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < S.rainN; i++) {
        const a = Math.atan2(S.dirX, S.dirZ) + (i - (S.rainN - 1) / 2) * 0.9;
        rainX[i] = e.pos.x + Math.sin(a) * 3.2; rainZ[i] = e.pos.z + Math.cos(a) * 3.2;
        const lim = edgeLimit(rainX[i], rainZ[i], 2);
        if (rainX[i] * rainX[i] + rainZ[i] * rainZ[i] > lim * lim) { rainX[i] = e.pos.x; rainZ[i] = e.pos.z; }
        mark(rainX[i], rainZ[i], 1.3, 1.0, 0xb08aff);
      }
    } else if (k === 2) { S.wind = 0.7; S.act = 0.15; const z = spawnTelegraphLine(e.pos.x, e.pos.z, S.dirX, S.dirZ, 18, 1.5, 0.7, 0xb08aff); if (z) z.damage = pdmg(e) * 1.8; }
    else { S.wind = 0.2; S.act = 0.12; }
  }
  darkView.cast++;
}

/** Windup over: the skill fires. */
function release(e: Enemy, px: number, pz: number): void {
  const k = e.pattern, c = S.cls;
  enter(e, 'ATTACK');
  if (c === 'ARCHER') {
    if (k === 1) { fan(e, 5, 0.36, 'ARROW', 24, pdmg(e) * 0.9); darkView.atk++; }
    else if (k === 2) { /* the roll: moves in tickActive */ }
    else darkView.atk++;
  } else if (c === 'WIZARD') {
    if (k === 1) { fan(e, 3, 0.3, 'FLAME', 15, pdmg(e) * 1.2, 2); }
    else if (k === 2) {
      retreatPoint(e, px, pz, 12, dirV);
      tmp.copy(e.pos); events.emit('blink', { from: tmp.clone(), to: dirV.clone() });
      e.pos.set(dirV.x, 0, dirV.z); e.hideT = 0.25;
    } else {
      events.emit('frostNova', { pos: e.pos, radius: 6.5 });
      const p = world.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      if (dx * dx + dz * dz < 6.5 * 6.5) applyPlayerDebuff('SLOW', 2.2);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; shoot(e, Math.sin(a), Math.cos(a), 'SLOW_ORB', 8, pdmg(e) * 0.6, { slow: 0.4, life: 2.2 }); }
    }
  } else if (c === 'BARBARIAN') {
    if (k === 1) {
      for (let i = 0; i < axes.length; i++) {
        if (axes[i] && axes[i]!.active) continue;
        const a = allocEnemyProjectile(); if (!a) break;
        a.active = true; a.kind = 'AXE'; a.pos.set(e.pos.x + S.dirX, 1.3, e.pos.z + S.dirZ); a.vel.set(S.dirX * 20, 0, S.dirZ * 20);
        a.life = 3; a.damage = pdmg(e) * 1.3; a.radius = 0.75;
        axes[i] = a; axeT[i] = 0;
        break;
      }
      darkView.atk++;
    } else if (k === 2) { tmp.set(S.fromX, 0, S.fromZ); tmp2.set(S.toX, 0, S.toZ); events.emit('leap', { from: tmp.clone(), to: tmp2.clone(), dur: S.act }); }
    else darkView.spin = 1;
  } else if (c === 'KNIGHT') {
    if (k === 1) { requestYaw(Math.atan2(S.dirX, S.dirZ)); }
    else if (k === 2) { darkView.slash++; darkView.slashX = e.pos.x; darkView.slashZ = e.pos.z; darkView.slashYaw = Math.atan2(S.dirX, S.dirZ); darkView.atk++; }
    else darkView.guard = 1;
  } else {
    if (k === 1) {
      for (let i = 0; i < S.rainN; i++) {
        const sk = spawnEnemy('SKELETON_ARCHER', tmp.set(rainX[i], 0, rainZ[i]));
        if (sk) { sk.maxHp = Math.round(sk.maxHp * 0.8); sk.hp = sk.maxHp; sk.xp = 0; }
      }
      events.emit('shockwave', { pos: e.pos, radius: 4, color: 0xb08aff });
    } else if (k === 2) { shoot(e, S.dirX, S.dirZ, 'ARROW', 42, 0, { life: 0.5 }); darkView.atk++; }
    else {
      spawnTelegraphCircle(e.pos.x, e.pos.z, 3.2, 0.45, pdmg(e) * 1.4, 0xb08aff);   // bone burst where it stood
      retreatPoint(e, px, pz, 11, dirV);
      tmp.copy(e.pos); events.emit('blink', { from: tmp.clone(), to: dirV.clone() });
      e.pos.set(dirV.x, 0, dirV.z); e.hideT = 0.2;
    }
  }
}

/** Skill active phase (dashes, leaps, whirlwind, guard). */
function tickActive(e: Enemy, dt: number, px: number, pz: number): void {
  const k = e.pattern, c = S.cls;
  if (c === 'ARCHER' && k === 2) { e.vel.set(S.dirX * 19, 0, S.dirZ * 19); requestYaw(Math.atan2(S.dirX, S.dirZ)); return; }
  if (c === 'BARBARIAN' && k === 2) {
    const f = Math.min(1, e.stateT / S.act);
    e.vel.set(0, 0, 0);
    e.pos.x = S.fromX + (S.toX - S.fromX) * f; e.pos.z = S.fromZ + (S.toZ - S.fromZ) * f;
    darkView.air = 4 * f * (1 - f) * 3.2;
    requestYaw(Math.atan2(S.toX - S.fromX, S.toZ - S.fromZ));
    return;
  }
  if (c === 'BARBARIAN' && k === 3) {   // whirlwind: chase at reduced speed, hit every 0.35 s in r 3.4
    aimAt(e, px, pz);
    e.vel.set(S.dirX * e.speed * 0.75, 0, S.dirZ * e.speed * 0.75);
    S.tick -= dt;
    if (S.tick <= 0) {
      S.tick = 0.35;
      const p = world.player.pos, dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      if (dx * dx + dz * dz < 3.6 * 3.6 && world.player.alive) damagePlayer(mdmg(e) * 0.55, { pos: e.pos, kind: 'PHYSICAL' });
    }
    return;
  }
  if (c === 'KNIGHT' && k === 1) { e.vel.set(S.dirX * 26, 0, S.dirZ * 26); requestYaw(Math.atan2(S.dirX, S.dirZ)); return; }
  if (c === 'KNIGHT' && k === 3) {   // shield up: walk in slowly, bash at the end
    aimAt(e, px, pz);
    e.vel.set(S.dirX * e.speed * 0.45, 0, S.dirZ * e.speed * 0.45);
    if (!S.bash && e.stateT >= S.act - 0.5) { S.bash = true; spawnTelegraphCircle(e.pos.x + S.dirX * 1.2, e.pos.z + S.dirZ * 1.2, 3.6, 0.5, mdmg(e) * 1.5, 0x9fb4ff); }
    return;
  }
  e.vel.set(0, 0, 0);
}

function finish(e: Enemy): void {
  const k = e.pattern, c = S.cls;
  if (c === 'BARBARIAN' && k === 2) {
    darkView.air = 0;
    events.emit('quake', { pos: e.pos, radius: 4 }); events.emit('crater', { pos: e.pos, radius: 2.4, color: 0x2a1030 }); events.emit('shake', { amount: 0.45 });
  }
  if (c === 'BARBARIAN' && k === 3) darkView.spin = 0;
  if (c === 'KNIGHT' && k === 3) darkView.guard = 0;
  if (c === 'ARCHER' && k === 2) { aimAt(e, world.player.pos.x, world.player.pos.z); shoot(e, S.dirX, S.dirZ, 'ARROW', 26, pdmg(e)); darkView.atk++; }
  S.cd[k] = CD[c][k] * (0.85 + Math.random() * 0.3);
  S.gap = RANGED[c] ? 0.9 : 1.1;
  e.pattern = 0; e.vel.set(0, 0, 0);
  enter(e, 'RECOVER');
}

// ------------------------------------------------------------- AI ------------
/** Per-frame AI (called from enemies.runAI). (px, pz) = the hero, d = distance to it. */
export function aiDarkHero(e: Enemy, dt: number, px: number, pz: number, d: number): void {
  if (S.id !== e.id) { S.id = e.id; darkView.id = e.id; }
  const b = world.boss;
  b.active = true; b.hp = e.hp; b.maxHp = e.maxHp; b.stagger = staggerView(e); b.staggered = e.staggerT > 0;
  if (e.phase === 0 && e.hp < e.maxHp * 0.5) {   // enrage: faster cooldowns, brighter aura
    e.phase = 1; b.phase = 1; darkView.enraged = 1;
    events.emit('bossPhase', { phase: 1 });
    events.emit('floatText', { pos: e.pos, text: 'ENRAGED', color: 0xff3a5a, scale: 1, dy: 2.4 });
  }
  const rate = e.phase > 0 ? 1.4 : 1;
  for (let i = 0; i < 4; i++) if (S.cd[i] > 0) S.cd[i] -= dt * rate;
  if (S.gap > 0) S.gap -= dt * rate;
  tickAxes(e, dt);
  if (S.rainT > 0) {   // rain of arrows: the arrows land as the circles resolve
    S.rainT -= dt;
    if (S.rainT <= 0) for (let i = 0; i < 3; i++) { tmp.set(rainX[i], 0, rainZ[i]); events.emit('fxImpact', { pos: tmp, kind: 'RAIN_ARROW', radius: 3.1 }); }
  }

  switch (e.state) {
    case 'WINDUP':
      e.vel.set(0, 0, 0);
      if (S.cls === 'KNIGHT' && e.pattern === 1) requestYaw(Math.atan2(S.dirX, S.dirZ));
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

  // ---- pick a skill
  if (S.gap <= 0 && world.player.alive) {
    for (let k = 1; k <= 3; k++) {
      const kk = ((k + (world.frame % 3)) % 3) + 1;   // rotate the check order so no skill starves
      if (S.cd[kk] <= 0 && wants(kk, d)) { begin(e, kk, px, pz); return; }
    }
  }

  // ---- move + basic attack
  const inv = 1 / Math.max(0.001, d);
  const ux = (px - e.pos.x) * inv, uz = (pz - e.pos.z) * inv;
  if (!RANGED[S.cls]) {
    if (d > 2.3) e.vel.set(ux * e.speed, 0, uz * e.speed); else e.vel.set(0, 0, 0);   // melee swings come from contactHit
    return;
  }
  S.strafeT -= dt;
  if (S.strafeT <= 0) { S.strafeT = 1.6 + Math.random() * 1.8; S.strafe = -S.strafe; }
  const lo = S.cls === 'WIZARD' ? 8 : 9, hi = S.cls === 'WIZARD' ? 13 : 14;
  let vx = -uz * S.strafe * 0.65, vz = ux * S.strafe * 0.65;   // circle the hero
  if (d < lo) { vx -= ux; vz -= uz; } else if (d > hi) { vx += ux; vz += uz; }
  const lim = edgeLimit(e.pos.x + vx * 2, e.pos.z + vz * 2, 2.5);
  if ((e.pos.x + vx * 2) ** 2 + (e.pos.z + vz * 2) ** 2 > lim * lim) { S.strafe = -S.strafe; vx = ux * 0.4; vz = uz * 0.4; }   // back to the wall: slide in
  const vl = Math.hypot(vx, vz) || 1;
  e.vel.set((vx / vl) * e.speed * 0.85, 0, (vz / vl) * e.speed * 0.85);
  if (S.cd[0] <= 0 && d < 20 && world.player.alive) {
    S.cd[0] = CD[S.cls][0] * (0.85 + Math.random() * 0.3);
    if (S.cls === 'ARCHER') shoot(e, ux, uz, 'ARROW', 24, pdmg(e));
    else if (S.cls === 'WIZARD') shoot(e, ux, uz, 'FLAME', 13, pdmg(e));
    else shoot(e, ux, uz, 'ORB', 11, pdmg(e), { homing: 1.1 });
    darkView.atk++;
  }
}

/** Boomerang axes: fly out ~0.6 s, then curve back to the thrower (hitting again on the way). */
function tickAxes(e: Enemy, dt: number): void {
  for (let i = 0; i < axes.length; i++) {
    const a = axes[i];
    if (!a) continue;
    if (!a.active || a.kind !== 'AXE') { axes[i] = null; continue; }
    axeT[i] += dt;
    if (axeT[i] < 0.6) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, l = Math.hypot(dx, dz);
    if (l < 1.4) { a.active = false; axes[i] = null; darkView.atk++; continue; }   // caught
    const sp = 21, k = Math.min(1, dt * 5);
    a.vel.x += ((dx / l) * sp - a.vel.x) * k; a.vel.z += ((dz / l) * sp - a.vel.z) * k;
    a.life = Math.max(a.life, 0.5);
  }
}
