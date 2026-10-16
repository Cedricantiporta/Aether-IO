// ============================================================================
// Active abilities: Q, E, 3, 4 (class kit) and R (ultimate, charge meter).
// Multi-frame effects run through the pooled ground-fx list (world.fx) + a few timers.
// ============================================================================
import { spawnMinion, MINION_WARRIOR, MINION_MAGE, MINION_GOLEM, MINION_ARCHER, MAX_SKELETONS, PERMANENT, pickRaiseKind } from './minions';
import { unlockLevel, DASH_UNLOCK_LV } from '../../classLevels';
import { Vector3 } from 'three';
import { world, allocZone, allocFx } from '../world';
import { edgeLimit, queryColliders, type Collider } from '../mapgen';
import { events } from '../events';
import { useGameStore } from '../../store';
import { abilityCd, lvMul, ULT_MAX, ACTIVE_ORDER, type ActiveSlot } from '../../abilityDefs';
import { combo, registerUlt } from './combo';
import type { GroundFx, GroundFxKind } from '../types';
import {
  getAimDir, aimOverride, trySpendMana, findNearestEnemy, damageEnemy, damageEnemiesInRadius, applyStatus, healPlayer, addShake, autoAim,
  type DamageOpts, type StatusEffect,
} from './combat';
import { spawnProjectile } from './projectiles';
import { hitStop, slowMo, fovKick } from '../game';
/** Raise Dead skeletons per cast by skill level 1..5 (army: random kinds, at least one warrior, archer and mage). */
const RAISE_N = [2, 3, 4, 5, 5];   // (owner: starts with 2 skeletons)
import { hooks } from './hooks';

/** State for render/UI of multi-frame abilities. */
/** Every class dash deals 70% less damage (user tuning: dashes are for movement). */
const DASH_DMG = 0.3;
const judgeRays = Array.from({ length: 12 }, () => ({ x: 0, z: 0, t: 0, id: -1 }));
const judgeUsed: number[] = [];
let judgeN = 0;
export const abilityState = {
  castLockT: 0,
  curseRaise: 0,           // Plague Ground: skeletons that may still rise from enemies dying in it            // > 0: a skill is being cast, no basic attacks (player.ts)
  lpT: 0, lpMax: 0, lpDx: 0, lpDz: 1, lpDmg: 0,   // Lightpiercer: charging a ball of light, fires when lpT runs out
  lpCharge: 0, lpHold: false,   // ...held longer (key / button kept down): up to LP_CHARGE s of extra charge = more damage + size
  whirlExt: 0,   // Whirlwind: seconds added by holding the key
  tint: 0,                 // (unused: ultimates no longer darken the screen)
  flash: 0,                // 0..1 brief light flash at ult cast / impact
  flashRgb: [1, 0.9, 0.7] as [number, number, number],
  tintTarget: 0,
  tintRgb: [0.04, 0.06, 0.16] as [number, number, number],
  ultKind: 0,              // 0 none, 1 archer, 2 wizard, 3 barbarian
  ultPhase: 0,
  ultT: 0,                 // time in current phase
  ultAcc: 0,
  ultX: 0, ultZ: 0,
  whirlR: 7.5,
  lavaT: 0,
  ultMul: 1, ultB: 0,
  windupT: 0, windupDur: 0, windupX: 0, windupZ: 0, windupAim: false,   // ult cinematic wind-up
  chargeT: 0, chargeDmg: 0, chargeLv: 1, chargeHit: [] as number[],      // barbarian shoulder charge / knight Holy Charge
  judgeT: 0, judgeX: 0, judgeZ: 0, judgeR: 5, judgeDmg: 0, judgeStun: 1,   // knight Judgment (pending pillar)
  whirlBoost: false, whirlHeal: 0, finisher: false,
  orbT: 0, orbN: 0, orbTick: 0, orbChain: 2, orbDmg: 0,
  orbs: [{ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: 0 }],
  leapT: 0, leapDur: 0.55, leapSx: 0, leapSz: 0, leapTx: 0, leapTz: 0, leapDmg: 0, leapLv: 1, leapDash: false,
  whirlTick: 0, whirlDmg: 0, whirlLv: 1,
  finalSlam: 0,
  lastStep: 0,
  ultCd: 0,               // ultimate cooldown remaining (s); the ult needs this at 0 AND a full charge bar
};

/** Ultimate cooldown after each use (s), on top of needing a full charge bar. Cooldown reduction applies. */
export const ULT_COOLDOWN = 90;
/** True when the ultimate can be cast: full charge bar and cooldown finished. */
export function ultReady(): boolean { const p = world.player; return p.ult >= 99.99 && abilityState.ultCd <= 0 && p.ultT <= 0; }

const aim = new Vector3();
const tgt = new Vector3();
const out: number[] = [];
const colOut: Collider[] = [];
let lastNoMana = -10;
const lastCd: Record<string, number> = {};

const physOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER' };
const physKnock: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 1.2 };
const spikeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', launch: 10, slam: 0, armorBreak: true };
const whirlOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', armorBreak: true };
const elecBreak: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER', armorBreak: true };
const chargeOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', knockback: 0.9 };
const holyOpts: DamageOpts = { kind: 'PHYSICAL', source: 'PLAYER', armorBreak: true, knockback: 0.6 };
const aimTmp = new Vector3();
const frostOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER', frost: true };
const trapOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER', frost: true };
const chillSt: StatusEffect = { type: 'CHILL', duration: 4 };
const fireOpts: DamageOpts = { kind: 'FIRE', source: 'PLAYER', knockback: 0.8 };
const iceOpts: DamageOpts = { kind: 'ICE', source: 'PLAYER' };
const elecOpts: DamageOpts = { kind: 'LIGHTNING', source: 'PLAYER' };
const stunSt: StatusEffect = { type: 'STUN', duration: 1 };
const necroSlow: StatusEffect = { type: 'SLOW', duration: 2, value: 0.5 };
const burnSt: StatusEffect = { type: 'BURN', duration: 4, value: 5 };
const freezeSt: StatusEffect = { type: 'FREEZE', duration: 1 };
const slowFrost: StatusEffect = { type: 'SLOW', duration: 2.5, value: 0.5 };

export function resetAbilities(): void {
  const a = abilityState;
  a.tint = a.tintTarget = 0; a.flash = 0; a.ultKind = 0; a.ultPhase = 0; a.ultT = 0; a.ultAcc = 0; a.ultCd = 0;
  a.orbT = 0; a.leapT = 0; a.windupT = 0; a.chargeT = 0; a.judgeT = 0; a.whirlBoost = false; a.finisher = false; for (const c of chainOrbs) c.active = false; a.whirlTick = 0; a.finalSlam = 0; a.lastStep = 0;
  lastNoMana = -10;
  for (const k in lastCd) lastCd[k] = -10;
  gcdUntil = 0;   // world.time restarts at 0 each run: a lock stamped in town would block every skill for minutes
}

export function notifyCooldown(slot: 'q' | 'e' | 's3' | 's4' | 'dash' | 'r'): void {
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

let mineNoteT = -10;
function noSkillsInMine(): void { if (world.time - mineNoteT < 2) return; mineNoteT = world.time; useGameStore.getState().addNotification('No skills in the mine: swing your pick or your weapon.', '#ffb070', 'WARNING'); }
/** Cooldown + mana gate. Returns true when the cast may proceed (mana spent, cooldown set). */
function gate(slot: ActiveSlot): boolean {
  const st = useGameStore.getState();
  const p = world.player;
  if ((st.skillLevels[slot] ?? 0) <= 0) {   // not learned yet (skills unlock by class level, then cost skill points)
    const need = unlockLevel(st.hero, slot);
    if (st.level >= need) st.addNotification('Learn it at the Skill Trainer', 'red', 'WARNING');   // (owner: no 'unlocks at Lv' prompt for locked skills)
    return false;
  }
  if (world.village.miningT > 0) return false;   // busy mining
  if (!world.room.active && world.village.area === 'CAVE') { noSkillsInMine(); return false; }   // (owner: no skills in the mine)
  if (p.cd[slot] > 0) { notifyCooldown(slot); return false; }
  if (abilityState.leapT > 0) return false;
  if (gcdUntil > world.time + GCD) gcdUntil = 0;   // (stale stamp from before a world.time reset)
  if (world.time < gcdUntil) return false;   // global skill lock: one skill at a time
  const cost = st.getManaCost(slot);
  if (!trySpendMana(cost)) { notifyNoMana(); return false; }
  const cd = abilityCd(st.hero, slot, st.skillLevels[slot]) * (1 - st.stats.cooldownReduction);
  p.cd[slot] = cd; p.cdMax[slot] = cd;
  gcdUntil = world.time + GCD;
  return true;
}
/** Shared lock after any skill / ultimate cast, so skills can't all be fired in the same instant. */
const GCD = 0.55;
let gcdUntil = 0;

let curMul = 1;
/** Base damage unit of an active (before its per-skill multiplier). */
function base(lv: number): number {
  const st = useGameStore.getState();
  const s = st.stats, p = world.player;
  let d = s.damage * (st.hero === 'WIZARD' ? s.skillDamage * 0.45 : s.skillDamage) * lvMul(lv);
  if (p.cryT > 0) d *= 1.3;
  d *= 1 + p.buffDmg;   // Warcry / Inspire
  if (p.titanT > 0) d *= 1.5;
  if (p.avatarT > 0) d *= 1.5;   // knight Divine Avatar
  return d * curMul;
}

/** Ground target point: locked enemy, else mouse aim; clamped to [minR, range] and to the arena. */
function aimPoint(range: number, minR: number, o: Vector3): Vector3 {
  const p = world.player;
  let tx = p.aim.x, tz = p.aim.z;
  if (aimOverride.on) { tx = aimOverride.x; tz = aimOverride.z; }
  else if (autoAim.id >= 0) {
    const e = world.enemies[autoAim.id];
    if (e.active && e.state !== 'DYING') { tx = e.pos.x; tz = e.pos.z; }
  }
  let dx = tx - p.pos.x, dz = tz - p.pos.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); d = 1; }
  const dd = Math.min(range, Math.max(minR, d));
  let x = p.pos.x + (dx / d) * dd, z = p.pos.z + (dz / d) * dd;
  const r = Math.hypot(x, z);
  const lim = edgeLimit(x, z, 3);
  if (r > lim) { x *= lim / r; z *= lim / r; }
  return o.set(x, 0, z);
}

/** Nudges a point out of obstacle colliders. */
function safeSpot(o: Vector3): void {
  for (let pass = 0; pass < 3; pass++) {
    const cols = queryColliders(o.x, o.z, 8, colOut);
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = o.x - c.x, dz = o.z - c.z, min = c.r + 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) o.x = c.x + min; else { o.x = c.x + (dx / d) * min; o.z = c.z + (dz / d) * min; }
    }
  }
}

/** Lightpiercer: extra charge time when held (s). Whirlwind: base spin and the longest a held spin can last (s). */
const LP_CHARGE = 1.5, WHIRL_BASE = 1.2, WHIRL_MAX = 4;
/** Hold time of the key / button that cast the current skill (aim.ts sets it; 0 for auto casts). */
export const castHold = { t: 0 };
/** Is the key / touch button of this active slot still held down? */
function slotHeld(slot: string): boolean {
  const i = ACTIVE_ORDER[useGameStore.getState().hero].indexOf(slot as never);
  if (i < 0) return false;
  const inp = world.input;
  return !!inp.keys['Digit' + (i + 1)] || (inp.touchAim.active && inp.touchAim.id === 's' + (i + 1));
}

/** Army of the Dead: the golem meteor (fall time, impact radius) and how long the golem stands. */
const GOLEM_DROP_T = 0.9, GOLEM_DROP_R = 5.5, GOLEM_LIFE = 20;

function mkFx(kind: GroundFxKind, x: number, z: number, delay: number, life: number, radius: number, dmg: number, aux = 0, color = 0xffffff, launch = false): GroundFx | null {
  const f = allocFx();
  if (!f) return null;
  f.launch = launch;
  f.active = true; f.kind = kind; f.x = x; f.z = z; f.delay = delay; f.life = life; f.radius = radius; f.dmg = dmg; f.aux = aux; f.color = color;
  return f;
}

function mkZone(kind: 'TORNADO' | 'FROST_FIELD' | 'METEOR_SHADOW' | 'FIRE' | 'BLACKHOLE' | 'SHOCKWAVE' | 'CURSE', x: number, z: number, r: number, life: number, dmg: number, color: number, pullRange = 0, maxPull = 0) {
  const zn = allocZone();
  if (!zn) return null;
  zn.active = true; zn.kind = kind; zn.hostile = false;
  zn.pos.set(x, 0, z); zn.radius = r; zn.life = zn.maxLife = life; zn.damage = dmg; zn.color = color;
  zn.length = pullRange; zn.maxPull = maxPull; zn.tickT = 0;
  return zn;
}

// ============================================================ chain frost =====
export interface ChainOrb { active: boolean; x: number; z: number; tx: number; tz: number; target: number; left: number; dmg: number; hit: number[]; t: number }
export const chainOrbs: ChainOrb[] = Array.from({ length: 4 }, () => ({ active: false, x: 0, z: 0, tx: 0, tz: 0, target: -1, left: 0, dmg: 0, hit: [], t: 0 }));
const CHAIN_RANGE = 9;
const CHAIN_SPEED = 48;

function nearestFrom(x: number, z: number, r: number, hit: number[]): number {
  const ids = world.enemyGrid.query(x, z, r + 2, out);
  let best = -1, bd = r * r;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || hit.indexOf(e.id) !== -1) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e.id; }
  }
  return best;
}

/** CHAIN FROST: an icy orb flies to the first target then bounces (6 + level) times, range 9 per jump. */
/** Wizard skill 1: three fireballs in a narrow fan; each bursts on the first enemy (splash + burn) and leaves a short fire trail. */
const fbBurn = { type: 'BURN' as const, duration: 3, value: 0 };
function castFireballs(lv: number, b: number): void {
  const p = world.player;
  const dir = getAimDir(aim);
  const dmg = b * 2.2;
  fbBurn.value = Math.max(1, dmg * 0.08);
  // (owner) one fireball at Lv 1-2, two at Lv 3-4, three at Lv 5
  const n = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const a = (k - (n - 1) / 2) * 0.26, c = Math.cos(a), s2 = Math.sin(a);
    const vx = dir.x * c - dir.z * s2, vz = dir.x * s2 + dir.z * c;
    // huge, very slow and piercing: rolls through the whole pack (user)
    spawnProjectile('FIREBALL', p.pos.x + vx * 1.6, p.pos.z + vz * 1.6, vx, vz, 8, dmg,
      { life: 3.4, pierce: 999, aoe: 2.4 + 0.12 * (lv - 1), radius: 2.4, knockback: 0.3, y: 1.6, effect: fbBurn });
  }
  p.anim.castT = 1;
  announce('FIREBALLS');
}
void castChainFrost;

function castChainFrost(lv: number, b: number): void {
  const p = world.player;
  aimPoint(26, 2, tgt);
  const o = chainOrbs.find((c) => !c.active);
  if (!o) return;
  const first = nearestFrom(tgt.x, tgt.z, 14, []);
  o.active = true; o.x = p.pos.x; o.z = p.pos.z; o.t = 0; o.hit.length = 0;
  o.left = 6 + lv; o.dmg = b * 3.0; o.target = first;
  // no enemy near the aim point: the orb flies on to the aim point and bursts there
  o.tx = tgt.x; o.tz = tgt.z;
  announce('CHAIN_FROST');
}

function updateChains(dt: number): void {
  for (let i = 0; i < chainOrbs.length; i++) {
    const o = chainOrbs[i];
    if (!o.active) continue;
    o.t += dt;
    let e = o.target >= 0 ? world.enemies[o.target] : null;
    if (e && (!e.active || e.state === 'DYING')) { o.target = nearestFrom(o.x, o.z, CHAIN_RANGE, o.hit); e = o.target >= 0 ? world.enemies[o.target] : null; if (!e) { o.active = false; continue; } }
    const tx = e ? e.pos.x : o.tx, tz = e ? e.pos.z : o.tz;
    const dx = tx - o.x, dz = tz - o.z, d = Math.sqrt(dx * dx + dz * dz);
    const step = CHAIN_SPEED * dt;
    if (d > step + 0.6) { o.x += (dx / d) * step; o.z += (dz / d) * step; if (o.t > 3) o.active = false; continue; }
    o.x = tx; o.z = tz;
    if (!e) { events.emit('frostNova', { pos: new Vector3(o.x, 0, o.z), radius: 3 }); o.active = false; continue; }
    // impact
    damageEnemy(e, o.dmg, frostOpts);
    applyStatus(e, chillSt);
    events.emit('frostNova', { pos: new Vector3(o.x, 0, o.z), radius: 3 });
    events.emit('lightning', { from: new Vector3(o.x, 1.2, o.z), to: new Vector3(o.x, 2.2, o.z) });
    o.hit.push(e.id); o.left--;
    if (o.left <= 0) { o.active = false; continue; }
    o.target = nearestFrom(o.x, o.z, CHAIN_RANGE, o.hit);
    if (o.target < 0) o.active = false;
  }
}

// ============================================================ casting =======
/** Casts the active bound to key 1 / 2 / 3 (class order). Cooldown + mana gated. */
/** Auto battle: casts the first ready, learned, affordable active (and the ult when charged) without warnings. */
export function autoCast(): void {
  const st = useGameStore.getState(), p = world.player;
  if (abilityState.leapT > 0 || world.time < gcdUntil || abilityState.castLockT > 0) return;
  const order = ACTIVE_ORDER[st.hero];
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if ((st.skillLevels[s] ?? 0) <= 0 || p.cd[s] > 0 || p.mana < st.getManaCost(s)) continue;
    castActive(i); return;
  }
  if (p.ult >= 100 && abilityState.ultCd <= 0 && p.ultT <= 0) castUlt();
}
export function castActive(index: number): void {
  const hero = useGameStore.getState().hero;
  cast(ACTIVE_ORDER[hero][index], false, index);
}
/** Archer Shadow Roll / Wizard Blink Nova: the class dash (charges are handled by player.ts). `auto` = no explicit aim (tap). */
export function castDashSkill(auto: boolean): void {
  const hero = useGameStore.getState().hero;
  if (hero === 'BARBARIAN') { barbLeap(auto); return; }
  if (hero === 'KNIGHT') { shoulderCharge(true); return; }   // Holy Charge
  dashAuto = auto;
  cast('e', true, -1);
}
let dashAuto = false;

function moveDir(out: Vector3): boolean {
  const k = world.input.keys;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  const jj = world.input.joy;
  if (jj.active && Math.hypot(jj.x, jj.z) > 0.2) { mx = jj.x; mz = jj.z; }
  const ml = Math.hypot(mx, mz);
  if (ml < 0.05) return false;
  out.set(mx / ml, 0, mz / ml);
  return true;
}

function cast(slot: ActiveSlot, dash = false, index = -1): void {
  const st = useGameStore.getState();
  const p = world.player;
  if (!p.alive) return;
  if (!dash && !gate(slot)) return;
  const lv = st.skillLevels[slot];
  const hero = st.hero;
  // hit-combo damage bonus is applied per hit in combat.damageEnemy
  curMul = 1;
  if (!dash) abilityState.castLockT = Math.max(abilityState.castLockT, 0.4);   // casting: no basic attacks for a moment
  if (!dash) {
    if (hero === 'BARBARIAN' && slot === 'e') abilityState.whirlBoost = combo.lastSlot === 'q' && world.time - combo.lastSlotT < 3;
    combo.lastSlot = slot; combo.lastSlotT = world.time;
  }
  const dir = getAimDir(aim);
  const dx = dir.x, dz = dir.z;
  const stats = st.stats;
  const b = base(lv) * (dash ? 0.8 : 1);

  if (hero === 'ARCHER') {
    if (slot === 'q') {
      const w = (1 + stats.galeWidth) * (1 + 0.1 * (lv - 1));
      const pr = spawnProjectile('GALE_ARROW', p.pos.x + dx, p.pos.z + dz, dx, dz, 34, b * 4.8,
        { life: 1.6, pierce: Infinity, knockback: 0.4, radius: 2.1 * w, y: 1.5, effect: { type: 'ARMOR_BREAK', duration: 6 } });
      if (pr) { pr.state = 0; pr.procLv = 0; pr.spin = w; pr.trailT = 0; pr.homing = 0; pr.aoeRadius = 0; pr.bounces = 3 + lv; }
      announce('GALE_ARROW');
    } else if (slot === 'e') {
      // SHADOW ROLL (class dash). Aimed: roll toward the aim; tap/auto: end BEHIND the nearest enemy, else roll away from it.
      let mx = dx, mz = dz;
      const inv = 0.3 + 0.03 * lv;
      p.dashT = 0.25;
      // tap: roll exactly where the hero faces (the facing arrow under the hero); hold-to-aim: along the aimed line
      if (dashAuto) { mx = Math.sin(p.facing); mz = Math.cos(p.facing); }
      p.dashDir.set(mx, 0, mz);
      p.dashIframes = true;
      p.invulnT = Math.max(p.invulnT, inv);
      events.emit('dash', { from: p.pos.clone(), dir: p.dashDir.clone() });
      const R = 4.2 + 0.3 * (lv - 1);   // a smaller blast
      mkFx('ARROW_STICK', p.pos.x, p.pos.z, 0.6, 0.85, R, b * 8 * DASH_DMG, 0, 0xffe8a0);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * 6.283, d = 0.4 + Math.random() * 1.1;
        mkFx('ARROW_STICK', p.pos.x + Math.cos(a) * d, p.pos.z + Math.sin(a) * d, 0.6, 0.85, 0, 0, 0, 0xffe8a0);
      }
      announce('SHADOW_ROLL');
    } else if (slot === 's3') {
      // LIGHTPIERCER: charges a ball of light (0.5s), then looses a big white arrow that pierces the whole line
      abilityState.lpT = abilityState.lpMax = 0.5; abilityState.lpDx = dx; abilityState.lpDz = dz; abilityState.lpDmg = b * 5;   // (base -33%: holding charges it)
      abilityState.lpCharge = Math.min(LP_CHARGE, castHold.t); abilityState.lpHold = true;
      abilityState.castLockT = Math.max(abilityState.castLockT, 0.75);
      p.facing = Math.atan2(dx, dz);
      announce('LIGHT_ARROW');
    } else {
      const R = 7.5 + 0.5 * (lv - 1);
      const baseAng = Math.atan2(dz, dx);
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.5;
        let x = p.pos.x + Math.cos(a) * 17, z = p.pos.z + Math.sin(a) * 17;
        const r = Math.hypot(x, z), lim = edgeLimit(x, z, 3);
        if (r > lim) { x *= lim / r; z *= lim / r; }
        const f = mkFx('TRAP', x, z, 0.5, 0.6, 5.5, b * 3, R, 0x7fe0ff);
        if (f) { f.sx = p.pos.x; f.sz = p.pos.z; }
      }
      announce('FROST_FIELD');
    }
    return;
  }

  if (hero === 'WIZARD') {
    if (slot === 'q') {
      aimPoint(28, 7, tgt);
      const R = 11 + 0.6 * (lv - 1);
      mkZone('BLACKHOLE', tgt.x, tgt.z, R, (3 + 0.1 * lv) * 0.7, b * 6.5, 0x6d28d9, R * 2.1, 999);
      announce('SINGULARITY');
    } else if (slot === 'e') {
      if (dashAuto && !aimOverride.on) { // tap: blink in the movement / facing direction
        const md = moveDir(tgt) ? tgt.clone() : new Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
        aimOverride.on = true; aimOverride.x = p.pos.x + md.x * 9; aimOverride.z = p.pos.z + md.z * 9;   // (shorter dash range)
        aimPoint(14 + 0.5 * lv, 4, tgt);
        aimOverride.on = false;
      } else aimPoint(14 + 0.5 * lv, 4, tgt);
      safeSpot(tgt);
      p.dashIframes = true;
      const R = 5 + 0.25 * (lv - 1);   // smaller nova (user)
      const from = p.pos.clone();
      novaAt(from.x, from.z, R, b * 3 * DASH_DMG, lv);
      p.pos.set(tgt.x, 0, tgt.z); p.vel.set(0, 0, 0);
      p.invulnT = Math.max(p.invulnT, 0.35);
      novaAt(tgt.x, tgt.z, R, b * 3 * DASH_DMG, lv);
      events.emit('blink', { from, to: p.pos.clone() });
      announce('BLINK_NOVA');
    } else if (slot === 's3') {
      const a = abilityState;
      a.orbN = 3 + (lv >= 3 ? 1 : 0) + (stats.orbBonus | 0);
      if (a.orbN > 6) a.orbN = 6;
      a.orbT = (4 + stats.stormBonus) * 0.5;   // Storm Orbs: half the duration a.orbTick = 0.15; a.orbChain = 2 + Math.floor(lv / 2) + (stats.thunderChain | 0);
      a.orbDmg = b * 1.7;
      announce('STORM_ORBS');
    } else {
      castFireballs(lv, b);
    }
    return;
  }

  // ---- NECROMANCER
  if (hero === 'NECROMANCER') {
    if (slot === 'q') {   // RAISE DEAD: skeletons (warriors, archers or mages) claw out of the ground around you
      const n = Math.min(MAX_SKELETONS, RAISE_N[Math.min(5, Math.max(1, lv)) - 1] + (stats.minionCount | 0));   // 2 / 3 / 4 / 5 / 5 by level (max 5)
      for (let i = 0; i < n; i++) {
        const an = p.facing + (i - (n - 1) / 2) * 0.75;
        // random warrior / archer / mage, at least one of each in the army
        spawnMinion(pickRaiseKind(), p.pos.x + Math.sin(an) * 2.4, p.pos.z + Math.cos(an) * 2.4, b * 0.9, PERMANENT, 1);
      }
      announce('RAISE_DEAD');
    } else if (slot === 'e') {   // SOUL STEP: blink, bone shards burst where you stood
      if (dashAuto && !aimOverride.on) {
        const md = moveDir(tgt) ? tgt.clone() : new Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
        aimOverride.on = true; aimOverride.x = p.pos.x + md.x * 8; aimOverride.z = p.pos.z + md.z * 8;   // (shorter dash range)
        aimPoint(11 + 0.5 * lv, 4, tgt);
        aimOverride.on = false;
      } else aimPoint(11 + 0.5 * lv, 4, tgt);
      safeSpot(tgt);
      p.dashIframes = true;
      const from = p.pos.clone(), R = 5 + 0.3 * (lv - 1);
      necroSlow.duration = 2;
      damageEnemiesInRadius(from.x, from.z, R, b * 1.25 * DASH_DMG, physOpts, necroSlow);
      events.emit('explosion', { pos: from, radius: R, color: 0xd8d0b8 });
      p.pos.set(tgt.x, 0, tgt.z); p.vel.set(0, 0, 0);
      p.invulnT = Math.max(p.invulnT, 0.35);
      events.emit('blink', { from, to: p.pos.clone() });
      announce('SOUL_STEP');
    } else if (slot === 's3') {   // BONE SPEAR: impales a whole line
      const nSp = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;   // more spears with level, fanned out (Lv 3: 2, Lv 5: 3)
      for (let k = 0; k < nSp; k++) {
        const a = (k - (nSp - 1) / 2) * 0.32, ca = Math.cos(a), sa = Math.sin(a), sx = dx * ca + dz * sa, sz = -dx * sa + dz * ca;
        spawnProjectile('BONE_SPEAR', p.pos.x + sx, p.pos.z + sz, sx, sz, 38, b * 2.25,   // -50% (user)
          { life: 0.95, pierce: Infinity, radius: 1.9, knockback: 0.3, y: 1.1, effect: { type: 'SLOW', duration: 2, value: 0.4 } });
      }
      p.anim.attackT = 1;
      announce('BONE_SPEAR');
    } else {   // PLAGUE GROUND: a cursed patch; the fallen rise for you
      aimPoint(26, 7.5, tgt);
      const R = 7.5 + 0.4 * (lv - 1);
      mkZone('CURSE', tgt.x, tgt.z, R, 5 + 0.3 * lv, b * 0.6, 0x9a3aff);
      abilityState.curseRaise = 2 + Math.floor(lv / 2);
      announce('CURSE_FIELD');
    }
    return;
  }

  // ---- KNIGHT
  if (hero === 'KNIGHT') {
    const a = abilityState;
    if (slot === 'q') {
      // Holy Wave: a wide golden crescent that sweeps forward through everything
      spawnProjectile('HOLY_WAVE', p.pos.x + dx * 1.4, p.pos.z + dz * 1.4, dx, dz, 20, b * 4.4,
        { life: 0.95, pierce: 999, knockback: 1.6, radius: (3.6 + 0.4 * (lv - 1)) * (p.avatarT > 0 ? 2 : 1), y: 1.1 });
      p.anim.attackT = 1; addShake(0.12);
      announce('HOLY_WAVE');
    } else if (slot === 'e') {
      // Shield Wall: knockback burst, then heavy damage reduction + slow heal
      p.guardT = 3 + 0.4 * (lv - 1); p.guardRed = Math.min(0.75, 0.5 + 0.04 * (lv - 1));
      const wr = 8 + 0.3 * (lv - 1);
      damageEnemiesInRadius(p.pos.x, p.pos.z, wr, b * 2.5, physKnock);
      events.emit('shockwave', { pos: p.pos.clone(), radius: wr, color: 0xffe08a });
      events.emit('shieldBlock', { pos: p.pos.clone(), radius: 3.4, gold: true });
      p.anim.castT = 1; addShake(0.2);
      announce('SHIELD_WALL');
    } else if (slot === 's3') {
      // Judgment: up to 12 rays of holy light strike enemies around the target from above, one after another (wide AoE)
      aimPoint(26, 0, tgt);
      const area = 14 + 0.6 * (lv - 1), n = Math.min(12, 5 + lv);
      a.judgeR = 4.0 + 0.2 * (lv - 1); a.judgeDmg = b * 1.5; a.judgeStun = 0.8 + 0.1 * lv;   // (damage -50%)
      const ids = world.enemyGrid.query(tgt.x, tgt.z, area + 2, out);
      judgeN = 0; judgeUsed.length = 0;
      // nearest-first distinct enemies, then random spots around the target for the leftover rays
      for (let pass = 0; pass < n; pass++) {
        let best = -1, bd = area * area;
        for (let i = 0; i < ids.length; i++) {
          const e = world.enemies[ids[i]];
          if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || judgeUsed.includes(ids[i])) continue;
          const d = (e.pos.x - tgt.x) ** 2 + (e.pos.z - tgt.z) ** 2;
          if (d < bd) { bd = d; best = ids[i]; }
        }
        const r = judgeRays[judgeN];
        if (best >= 0) { judgeUsed[judgeN] = best; const e = world.enemies[best]; r.x = e.pos.x; r.z = e.pos.z; r.id = best; }
        else { judgeUsed[judgeN] = -1; const an = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * area * 0.7; r.x = tgt.x + Math.cos(an) * rr; r.z = tgt.z + Math.sin(an) * rr; r.id = -1; }
        r.t = 0.45 + judgeN * 0.07; judgeN++;
      }
      a.judgeT = 1;
      events.emit('telegraph', { pos: tgt.clone(), radius: area, duration: 0.45 });
      p.anim.castT = 1;
      announce('JUDGMENT');
    }
    return;
  }

  // ---- BARBARIAN
  if (slot === 'q') {
    // Cross Slash: a slow, wide burning X that rolls forward piercing everything in the lane (owner: no growth with level;
    // Titan's Wrath makes every barbarian skill bigger instead)
    const dmg = b * 4.2;
    spawnProjectile('X_SLASH', p.pos.x + dx * 1.6, p.pos.z + dz * 1.6, dx, dz, 12, dmg,
      { life: 1.05 + 0.03 * (lv - 1), pierce: 999, knockback: 1.4, radius: 6.0 * titanScale(), y: 1.1 });
    p.anim.attackT = 1;
    addShake(0.15);
    announce('CROSS_SLASH');
  } else if (slot === 'e') {
    const a = abilityState;
    p.whirlT = WHIRL_BASE; a.whirlExt = 0; a.whirlHeal = 0; a.whirlTick = 0; a.whirlDmg = b * 1.76; a.whirlLv = lv; a.whirlR = (7.5 + 0.3 * (lv - 1)) * titanScale();
    announce('WHIRLWIND');
  } else if (slot === 's3') {
    const ts = titanScale(), L = (9 + 0.6 * (lv - 1)) * ts, n = 6;   // close-range cleave (was a 34+ unit lane)
    const stun = 0.6 + 0.1 * lv;
    for (let i = 0; i < n; i++) {
      const d = 1.5 + (i / (n - 1)) * L;
      const x = p.pos.x + dx * d, z = p.pos.z + dz * d;
      mkFx('SPIKE', x, z, 0.1 + i * 0.045, 1.5 + i * 0.045, 2.8 * ts, b * 5, stun, 0xa89a80, true);
      if (i % 2 === 0) mkFx('SPIKE', x - dz * 2.2 * ts, z + dx * 2.2 * ts, 0.2 + i * 0.045, 1.4 + i * 0.045, 1.4 * ts, b * 2, 0.3, 0xa89a80, true);
      else mkFx('SPIKE', x + dz * 2.2 * ts, z - dx * 2.2 * ts, 0.2 + i * 0.045, 1.4 + i * 0.045, 1.4 * ts, b * 2, 0.3, 0xa89a80, true);
    }
    events.emit('fissure', { from: p.pos.clone(), dir: dir.clone(), length: L + 1.5 });
    announce('EARTHSPLITTER');
  }
}

/** Titan's Wrath (barbarian ult) makes every barbarian skill bigger while it lasts (owner). */
function titanScale(): number { return world.player.titanT > 0 ? 1.4 : 1; }

/** Battle Cry folded into Titan's Wrath: a roar that stuns and terrifies nearby enemies. */
function battleCryRoar(b: number, lv: number): void {
  const p = world.player;
  const R = 15 + lv;
  const fear = 3 + 0.3 * lv;
  stunSt.duration = 1.5;
  damageEnemiesInRadius(p.pos.x, p.pos.z, R, b * 2, physKnock, stunSt);
  const ids = world.enemyGrid.query(p.pos.x, p.pos.z, R + 4, out);
  const r2 = R * R;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.boss) continue;
    const ex = e.pos.x - p.pos.x, ez = e.pos.z - p.pos.z;
    if (ex * ex + ez * ez <= r2) e.fearT = Math.max(e.fearT, fear);
  }
  events.emit('shout', { pos: p.pos.clone(), radius: R });
  addShake(0.35);
}

/** Barbarian class dash: shoulder charge, damages everything on its path, small knockback, NO i-frames. */
/** Barbarian class dash: Bloodrage Leap — jump to the aim point (tap: along movement / facing), slam on landing (stun + short Rage). */
function barbLeap(auto: boolean): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;
  const lv = st.skillLevels.dash;
  const tgt = aim;
  if (auto && !aimOverride.on) {
    const md = moveDir(tgt) ? tgt.clone() : new Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    tgt.set(p.pos.x + md.x * 8, 0, p.pos.z + md.z * 8);   // (shorter dash range)
  } else aimPoint(12, 4, tgt);
  safeSpot(tgt);
  a.leapT = a.leapDur; a.leapSx = p.pos.x; a.leapSz = p.pos.z; a.leapTx = tgt.x; a.leapTz = tgt.z;
  a.leapDmg = base(lv) * 3.5 * DASH_DMG; a.leapLv = lv; a.leapDash = true;   // -70% damage (user tuning)
  p.invulnT = Math.max(p.invulnT, a.leapDur + 0.1);
  events.emit('leap', { from: p.pos.clone(), to: tgt.clone(), dur: a.leapDur });
  p.anim.castT = 1;
}

function shoulderCharge(holy = false): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;
  const lv = st.skillLevels.dash;
  curMul = 1;
  let mx = getAimDir(aim).x, mz = getAimDir(aim).z;
  const k = world.input.keys;
  let kx = 0, kz = 0;
  if (k.KeyW || k.ArrowUp) kz -= 1;
  if (k.KeyS || k.ArrowDown) kz += 1;
  if (k.KeyA || k.ArrowLeft) kx -= 1;
  if (k.KeyD || k.ArrowRight) kx += 1;
  const jj = world.input.joy;
  if (jj.active && Math.hypot(jj.x, jj.z) > 0.2) { kx = jj.x; kz = jj.z; }
  const kl = Math.hypot(kx, kz);
  if (!aimOverride.on) { mx = Math.sin(p.facing); mz = Math.cos(p.facing); }   // exactly where the hero faces (= move direction while walking)
  void kl;
  p.dashT = holy ? 0.3 : 0.22; p.dashDir.set(mx, 0, mz);
  p.dashIframes = holy;   // Holy Charge: invulnerable behind the shield
  a.chargeT = holy ? 0.34 : 0.26; a.chargeDmg = base(lv) * (holy ? 3 : 2.2) * DASH_DMG; a.chargeLv = lv; a.chargeHit.length = 0;
  if (holy) { events.emit('shockwave', { pos: p.pos.clone(), radius: 3, color: 0xffe08a }); announce('HOLY_CHARGE'); }
  events.emit('dash', { from: p.pos.clone(), dir: p.dashDir.clone() });
  p.anim.castT = 1;
}

function novaAt(x: number, z: number, R: number, dmg: number, lv: number): void {
  // short freeze with a 35% chance per enemy (user: less frost)
  freezeSt.duration = 0.8 + 0.1 * (lv - 1);
  damageEnemiesInRadius(x, z, R, dmg, iceOpts);
  const ids = world.enemyGrid.query(x, z, R + 1, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.boss || (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 > R * R || Math.random() >= 0.35) continue;
    applyStatus(e, freezeSt);
  }
  events.emit('frostNova', { pos: new Vector3(x, 0, z), radius: R });
}

// ============================================================ ultimate ======
export const ULT_WINDUP = 1.0;

/** Ult press: validates, then starts the cinematic wind-up (sim paused, hero invulnerable, camera pushes in). */
export function castUlt(): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;
  if (!p.alive || p.ultT > 0 || a.ultKind !== 0 || a.windupT > 0) return;
  if ((st.skillLevels.ult ?? 0) <= 0) return;   // locked until Lv 10
  if (world.village.miningT > 0) return;
  if (!world.room.active && world.village.area === 'CAVE') { noSkillsInMine(); return; }
  if (p.ult < ULT_MAX - 0.001 || a.ultCd > 0) { notifyCooldown('r'); return; }
  if (world.time < gcdUntil) return;
  gcdUntil = world.time + GCD;
  p.ult = 0;
  a.ultCd = ULT_COOLDOWN * (1 - Math.min(0.75, st.stats.cooldownReduction || 0));
  // combo: an ult cast with a 50+ hit chain is a FINISHER (+50%, refunds 25% charge)
  curMul = 1;
  const fin = registerUlt();
  if (fin) curMul += 0.5;
  a.finisher = fin; a.ultMul = curMul;
  a.windupT = a.windupDur = ULT_WINDUP;
  a.windupAim = aimOverride.on; a.windupX = aimOverride.x; a.windupZ = aimOverride.z;
  a.flashRgb = st.hero === 'WIZARD' ? [1, 0.6, 0.3] : st.hero === 'ARCHER' ? [1, 0.95, 0.7] : st.hero === 'KNIGHT' ? [1, 0.92, 0.6] : [1, 0.75, 0.4];
  p.invulnT = Math.max(p.invulnT, ULT_WINDUP + 0.4);
  p.anim.castT = 1;
  events.emit('ultWindup', { hero: st.hero, pos: p.pos.clone(), duration: ULT_WINDUP });
}

/** Real-time tick of the wind-up (called from game.ts while the simulation is frozen). */
export function tickUltWindup(rawDt: number): boolean {
  const a = abilityState;
  if (a.windupT <= 0) return false;
  const p = world.player;
  a.windupT -= rawDt;
  const k = 1 - Math.max(0, a.windupT) / a.windupDur;
  world.camera.zoom = 1 - 0.3 * Math.sin(k * Math.PI * 0.5);
  p.anim.castT = 1;
  if (a.windupT <= 0) {
    a.windupT = 0;
    world.camera.zoom = 1;
    aimOverride.on = a.windupAim; aimOverride.x = a.windupX; aimOverride.z = a.windupZ;
    releaseUlt();
    aimOverride.on = false;
  }
  return true;
}

function releaseUlt(): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;
  const lv = st.skillLevels.ult;
  curMul = 1;
  const b = base(lv) * 0.7 * a.ultMul; // ultimates -30% damage; combo / finisher bonus applies on top
  a.ultT = 0; a.ultPhase = 0; a.ultAcc = 0;
  events.emit('ultStart', { hero: st.hero, pos: p.pos.clone() });
  events.emit('ultRelease', { hero: st.hero, pos: p.pos.clone() });
  a.flash = a.finisher ? 0.9 : 0.6; addShake(a.finisher ? 0.7 : 0.45); fovKick(a.finisher ? 0.9 : 0.6);
  p.anim.castT = 1;
  if (st.hero === 'ARCHER') {
    a.ultKind = 1;
    p.ultT = 0.3 + (4.5 + st.stats.hawkBonus) * 0.6 + 0.5;
    a.tintRgb = [0.02, 0.03, 0.14]; a.tintTarget = 0;
    slowMo(0.8, 0.3); fovKick(0.5);
    aimPoint(28, 6, tgt);
    a.ultX = tgt.x; a.ultZ = tgt.z; a.ultB = b;
    mkZone('SHOCKWAVE', tgt.x, tgt.z, 14, 0.8, 0, 0xffe8a0);
  } else if (st.hero === 'WIZARD') {
    // METEOR CATACLYSM: one colossal impact (no meteor shower): shadow grows 1.2 s, impact, 3 fire rings, molten crater
    a.ultKind = 2;
    p.ultT = 1.2 + 2.7;
    aimPoint(30, 8, tgt);
    a.ultX = tgt.x; a.ultZ = tgt.z;
    mkZone('METEOR_SHADOW', tgt.x, tgt.z, 14, 1.2, 0, 0xff5a1a);
    mkFx('BIG_METEOR', tgt.x, tgt.z, 1.2, 1.5, 14, b * 50, 0, 0xff7a1a);
    events.emit('telegraph', { pos: tgt.clone(), radius: 14, duration: 1.2 });
    slowMo(0.5, 0.45);
  } else if (st.hero === 'NECROMANCER') {
    // ARMY OF THE DEAD: a bone golem crashes down like a meteor (AoE stun on impact), fights 20 s, then crumbles
    a.ultKind = 5;
    p.ultT = 1.2; p.invulnT = Math.max(p.invulnT, 0.8);
    const mlv = st.skillLevels.ult, md = base(mlv);
    aimPoint(9, 3.5, tgt);
    safeSpot(tgt);
    mkZone('METEOR_SHADOW', tgt.x, tgt.z, GOLEM_DROP_R, GOLEM_DROP_T, 0, 0x9a6bd8);
    mkFx('GOLEM_DROP', tgt.x, tgt.z, GOLEM_DROP_T, GOLEM_DROP_T + 0.4, GOLEM_DROP_R, b * 8, md * 3, 0x9a6bd8);
    a.tintRgb = [0.08, 0.03, 0.12]; a.tintTarget = 0;
  } else if (st.hero === 'KNIGHT') {
    // DIVINE AVATAR: a column of light crashes down around the knight, then 8s of radiant power
    a.ultKind = 4;
    const dur = 8 + (st.stats.avatarBonus || 0);
    p.ultT = dur; p.avatarT = dur; p.invulnT = Math.max(p.invulnT, 0.8);
    stunSt.duration = 1.5;
    damageEnemiesInRadius(p.pos.x, p.pos.z, 12, b * 14, physKnock, stunSt);
    p.levelUpFx = 1;   // the golden pillar
    a.tintRgb = [0.14, 0.11, 0.03]; a.tintTarget = 0;
    events.emit('ultImpact', { pos: p.pos.clone(), name: 'DIVINE_AVATAR', radius: 12 });
    events.emit('shockwave', { pos: p.pos.clone(), radius: 14, color: 0xffe08a });
    addShake(0.6); fovKick(0.7); slowMo(0.4, 0.4);
  } else {
    a.ultKind = 3;
    battleCryRoar(b, lv);
    p.ultT = 6; p.titanT = 6; p.invulnT = Math.max(p.invulnT, 0.8);
    a.tintRgb = [0.12, 0.06, 0.02]; a.tintTarget = 0;
    a.lastStep = Math.floor(p.anim.stepPhase / Math.PI);
    a.ultX = b;
    addShake(0.6); fovKick(0.7); slowMo(0.4, 0.4);
    events.emit('shockwave', { pos: p.pos.clone(), radius: 12, color: 0xd99a4a });
  }
  refundFinisher();
}

/** Finisher refund is applied after release so the charge bar visibly refills. */
function refundFinisher(): void {
  const a = abilityState;
  if (!a.finisher) return;
  const p = world.player;
  p.ult = Math.min(100, p.ult + 25); a.finisher = false;
  events.emit('floatText', { pos: p.pos, text: 'FINISHER', color: 0xffd23a, scale: 1.4, dy: 1.6 });
  events.emit('shockwave', { pos: p.pos.clone(), radius: 30, color: 0xffd23a });
  events.emit('explosion', { pos: p.pos.clone(), radius: 8, color: 0xffd23a });
  hitStop(0.12, 0.05, true); addShake(0.5);
}

/** Random point inside the aimed circle (50%: on an enemy inside it). */
function circleTarget(cx: number, cz: number, r: number, enemyChance: number, o: Vector3): void {
  if (Math.random() < enemyChance) {
    const ids = world.enemyGrid.query(cx, cz, r + 2, out);
    if (ids.length) {
      const e = world.enemies[ids[(Math.random() * ids.length) | 0]];
      if (e.active && e.state !== 'DYING' && (e.pos.x - cx) ** 2 + (e.pos.z - cz) ** 2 < r * r) { o.set(e.pos.x + (Math.random() - 0.5) * 2, 0, e.pos.z + (Math.random() - 0.5) * 2); return; }
    }
  }
  const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r;
  o.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
}

function randomTarget(range: number, fromEnemyChance: number, o: Vector3): void {
  const p = world.player;
  if (Math.random() < fromEnemyChance) {
    const list = world.enemies;
    const start = (Math.random() * list.length) | 0;
    for (let k = 0; k < 40; k++) {
      const e = list[(start + k) % list.length];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 60 * 60) continue;
      o.set(e.pos.x + (Math.random() - 0.5) * 2, 0, e.pos.z + (Math.random() - 0.5) * 2);
      return;
    }
  }
  o.set(p.pos.x + (Math.random() * 2 - 1) * range, 0, p.pos.z + (Math.random() * 2 - 0.9) * range * 0.62);
}

function updateUlt(dt: number): void {
  const st = useGameStore.getState();
  const a = abilityState, p = world.player;
  // Safety: ultT is only decremented while an ult runs, so a leftover value (e.g. wizard ultT > its real
  // duration) would block charge gain forever. Always clear it once nothing is running.
  if (a.ultCd > 0) a.ultCd = Math.max(0, a.ultCd - dt);
  if (a.ultKind === 0) { p.ultT = 0; return; }
  const lv = st.skillLevels.ult;
  const b = base(lv);
  p.ultT = Math.max(0, p.ultT - dt);
  a.ultT += dt;

  if (a.ultKind === 5) { if (p.ultT <= 0) a.ultKind = 0; return; }   // necromancer: the legion fights on its own
  if (a.ultKind === 1) {
    // phase 0 intro (0.3s), phase 1 rain, phase 2 finale
    const dur = (4.5 + st.stats.hawkBonus) * 0.6;   // 2.7s base
    if (a.ultPhase === 0) {
      if (a.ultT >= 0.3) { a.ultPhase = 1; a.ultT = 0; }
    } else if (a.ultPhase === 1) {
      const rate = 54 * (1 + 0.1 * (lv - 1)); // density -30%
      a.ultAcc += rate * dt;
      while (a.ultAcc >= 1) {
        a.ultAcc -= 1;
        circleTarget(a.ultX, a.ultZ, 14, 0.5, tgt);
        const fall = 0.45 + Math.random() * 0.15;
        mkFx('RAIN_ARROW', tgt.x, tgt.z, fall, fall + 0.3, 2.6, b * 2.4 * 0.7, 0, 0xffe8a0);
      }
      if (a.ultT >= dur) {
        a.ultPhase = 2; a.ultT = 0;
        // final volley: dense carpet inside the circle
        const n = 70;
        for (let i = 0; i < n; i++) {
          const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 14;
          const fall = 0.4 + (d / 14) * 0.5 + Math.random() * 0.1;
          mkFx('RAIN_ARROW', a.ultX + Math.cos(ang) * d, a.ultZ + Math.sin(ang) * d, fall, fall + 0.3, 3.4, b * 25 / 6 * 0.7, 0, 0xfff0b0);
        }
        events.emit('ultImpact', { pos: new Vector3(a.ultX, 0, a.ultZ), name: 'FINAL_VOLLEY', radius: 14 });
        addShake(0.6); fovKick(0.6);
        a.tintTarget = 0;
      }
    } else if (a.ultT >= 1.2) { a.ultKind = 0; a.tintTarget = 0; p.ultT = 0; }
    return;
  }

  if (a.ultKind === 2) {
    if (a.ultPhase === 1) {
      // 3 expanding fire rings, then lava spouts erupting inside the molten crater
      while (a.ultAcc < 2 && a.ultT >= 0.15 + a.ultAcc * 0.42) {
        a.ultAcc++;
        mkFx('RING', a.ultX, a.ultZ, 0, 1.0, 0, b * 3, 26, 0xff7a1a);
        events.emit('shockwave', { pos: new Vector3(a.ultX, 0, a.ultZ), radius: 26, color: 0xffa050 });
        addShake(0.3);
      }
      a.lavaT -= dt;
      if (a.lavaT <= 0 && a.ultT < 2.5) {
        a.lavaT = 0.28 + Math.random() * 0.2;
        const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 9;
        const lx = a.ultX + Math.cos(ang) * d, lz = a.ultZ + Math.sin(ang) * d;
        damageEnemiesInRadius(lx, lz, 2.4, b * 2.2, fireOpts);
        events.emit('fxImpact', { pos: new Vector3(lx, 0, lz), kind: 'METEOR', radius: 3 });
        events.emit('explosion', { pos: new Vector3(lx, 0, lz), radius: 2.2, color: 0xff6a20 });
      }
      if (a.ultT >= 2.7) { a.ultKind = 0; p.ultT = 0; }
    }
    return;
  }

  // knight: Divine Avatar runs on p.avatarT (white wings, damage x1.5, +50% attack speed, 2x golden swings + Holy Wave, swings release Holy Waves)
  if (a.ultKind === 4) {
    if (p.avatarT <= 0) { a.ultKind = 0; a.tintTarget = 0; p.ultT = 0; events.emit('shockwave', { pos: p.pos.clone(), radius: 6, color: 0xffe08a }); }
    return;
  }

  // barbarian
  if (a.ultKind === 3) {
    const step = Math.floor(p.anim.stepPhase / Math.PI);
    if (step !== a.lastStep) {
      a.lastStep = step;
      if (Math.hypot(p.vel.x, p.vel.z) > 1) {
        damageEnemiesInRadius(p.pos.x, p.pos.z, 9, b * 2.275, physKnock);
        events.emit('quake', { pos: p.pos.clone(), radius: 9 });
        addShake(0.18);
      }
    }
    if (a.ultT >= 6 || p.titanT <= 0) {
      a.ultKind = 0; a.tintTarget = 0; p.ultT = 0;
      finalSlam(b);
    }
  }
}

function finalSlam(b: number): void {
  const p = world.player;
  const px = p.pos.x, pz = p.pos.z;
  p.titanT = 0;
  stunSt.duration = 2;
  damageEnemiesInRadius(px, pz, 18, b * 12, physKnock, stunSt);
  // a big ring of spikes (radius ~12), not screen-wide
  for (let i = 0; i < 44; i++) {
    const ang = (i / 44) * 6.283 + Math.random() * 0.1, d = 7 + Math.random() * 5;
    mkFx('SPIKE', px + Math.cos(ang) * d, pz + Math.sin(ang) * d, 0.15 + (d - 7) * 0.03 + (i % 4) * 0.04, 1.4, 3, b * 4, 1.0, 0xa89a80);
  }
  events.emit('ultImpact', { pos: p.pos.clone(), name: 'TITAN_SLAM', radius: 16 });
  events.emit('shockwave', { pos: p.pos.clone(), radius: 18, color: 0xd99a4a });
  events.emit('crater', { pos: p.pos.clone(), radius: 9, color: 0x3a2a1a });
  hitStop(0.16, 0.04, true); fovKick(1); addShake(1);
}

function bigMeteorImpact(f: GroundFx): void {
  const a = abilityState;
  const px = f.x, pz = f.z;
  const R = 16.5; // impact radius -25%
  stunSt.duration = 1.5;
  const ids = world.enemyGrid.query(px, pz, R + 4, out);
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING') continue;
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > R) continue;
    const fall = 1 - 0.5 * (d / R);
    applyStatus(e, stunSt);
    burnSt.duration = 3; burnSt.value = f.dmg * 0.02;
    applyStatus(e, burnSt);
    if (!e.boss) {
      const k = (1 - d / R) * 32 + 6;
      const inv = 1 / (d || 1);
      e.knock.x += dx * inv * k; e.knock.z += dz * inv * k;
    }
    damageEnemy(e, f.dmg * fall, fireOpts);
  }
  { const cz = mkZone('FIRE', px, pz, 9, 2.5, f.dmg * 0.035, 0xff5a1a); if (cz) cz.aux = 1; } // molten crater, burns 2.5 s
  mkZone('SHOCKWAVE', px, pz, 30, 0.9, 0, 0xff8a40);
  events.emit('explosion', { pos: new Vector3(px, 0, pz), radius: 18, color: 0xff7a1a });
  events.emit('shockwave', { pos: new Vector3(px, 0, pz), radius: 40, color: 0xffb060 });
  events.emit('crater', { pos: new Vector3(px, 0, pz), radius: 13, color: 0x1a0a04 });
  events.emit('ultImpact', { pos: new Vector3(px, 0, pz), name: 'METEOR', radius: 30 });
  hitStop(0.2, 0.04, true); fovKick(1); addShake(1);
  a.flash = 1; a.flashRgb = [1, 0.8, 0.5];
  a.ultPhase = 1; a.ultT = 0; a.ultAcc = 0; a.lavaT = 0.2;
}

// ============================================================ fx pool =======
function resolveFx(f: GroundFx): void {
  if (f.hostile) { hooks.hostileFx(f); return; }   // dark hero copy: never hurts monsters
  const pos = new Vector3(f.x, 0, f.z);
  switch (f.kind) {
    case 'RAIN_ARROW':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physOpts);
      events.emit('fxImpact', { pos, kind: 'RAIN_ARROW', radius: f.radius });
      break;
    case 'METEOR':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, fireOpts);
      { const cz = mkZone('FIRE', f.x, f.z, 2.6, 2.5, f.dmg * 0.18, 0xff5a1a); if (cz) cz.aux = 1; }
      events.emit('fxImpact', { pos, kind: 'METEOR', radius: f.radius });
      addShake(0.05);
      break;
    case 'SPIKE':
      stunSt.duration = f.aux;
      if (f.launch) { spikeOpts.slam = f.dmg * 0.9; damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, spikeOpts, stunSt); }
      else damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock, stunSt);
      events.emit('fxImpact', { pos, kind: 'SPIKE', radius: f.radius });
      break;
    case 'ROCK':
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock);
      events.emit('fxImpact', { pos, kind: 'ROCK', radius: f.radius });
      break;
    case 'ARROW_STICK':
      if (f.dmg > 0) {
        damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock);
        events.emit('explosion', { pos, radius: f.radius * 0.8, color: 0xffd070 });
        addShake(0.25);
      }
      break;
    case 'TRAP': {
      freezeSt.duration = 0.8;
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, trapOpts, slowFrost);
      damageEnemiesInRadius(f.x, f.z, f.radius * 0.5, 0, iceOpts, freezeSt); // brief freeze only in the centre
      const lvq = useGameStore.getState().skillLevels.s4;
      mkZone('FROST_FIELD', f.x, f.z, f.aux, (5 + 0.5 * lvq) * 0.65, f.dmg * 0.275, 0x7fe0ff);
      events.emit('frostNova', { pos, radius: f.radius * 1.3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283 + f.seed * 6, d = 1.5 + (i % 2) * 1.6;
        mkFx('CRYSTAL', f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, 0, 4, 0, 0, 0, 0x9fe8ff);
      }
      addShake(0.15);
      break;
    }
    case 'BIG_METEOR': bigMeteorImpact(f); break;
    case 'GOLEM_DROP':
      // the golem lands: stun + knock everything in the crater, then it stands up and fights for 20 s
      stunSt.duration = 1.2;
      damageEnemiesInRadius(f.x, f.z, f.radius, f.dmg, physKnock, stunSt);
      spawnMinion(MINION_GOLEM, f.x, f.z, f.aux, GOLEM_LIFE, 2, true);
      events.emit('explosion', { pos, radius: f.radius * 0.6, color: 0x6a3aa8 });
      events.emit('shockwave', { pos, radius: f.radius * 1.8, color: 0xc8a8ff });
      events.emit('crater', { pos, radius: f.radius * 0.6, color: 0x120a18 });
      hitStop(0.12, 0.04, true); addShake(0.6); fovKick(0.5);
      break;
    default: break;
  }
}

function stepFx(dt: number): void {
  const list = world.fx;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f.active) continue;
    f.t += dt;
    if (f.kind === 'RING' && !f.hostile) {
      const k = Math.min(1, f.t / f.life);
      const r = f.aux * Math.pow(k, 0.75);
      f.radius = r;
      f.sx += dt;
      if (f.sx >= 0.12) {
        f.sx = 0;
        const ids = world.enemyGrid.query(f.x, f.z, r + 5, out);
        for (let n = 0; n < ids.length; n++) {
          const e = world.enemies[ids[n]];
          if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
          const dx = e.pos.x - f.x, dz = e.pos.z - f.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (Math.abs(d - r) > 2.6) continue;
          burnSt.duration = 2; burnSt.value = f.dmg * 0.12;
          applyStatus(e, burnSt);
          if (!e.boss && d > 0.1) { const kk = (e.mini ? 3 : e.elite ? 6 : 12) / d; e.knock.x += dx * kk; e.knock.z += dz * kk; }
          damageEnemy(e, f.dmg, fireOpts);
        }
      }
    } else if (!f.done && f.t >= f.delay) {
      f.done = true;
      resolveFx(f);
    }
    if (f.t >= f.life) f.active = false;
  }
}

// ============================================================ per frame =====
export function updateAbilities(dt: number): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = abilityState;

  stepFx(dt);
  updateChains(dt);
  updateUlt(dt);
  if (a.castLockT > 0) a.castLockT -= dt;
  if (a.lpT > 0) {   // Lightpiercer charge -> fire (keep holding the key to charge it further)
    p.facing = Math.atan2(a.lpDx, a.lpDz);
    if (a.lpHold && a.lpCharge < LP_CHARGE && slotHeld('s3')) {
      a.lpCharge = Math.min(LP_CHARGE, a.lpCharge + dt);
      a.castLockT = Math.max(a.castLockT, 0.3);
      if (a.lpCharge >= LP_CHARGE) events.emit('floatText', { pos: p.pos, text: 'FULL CHARGE', color: 0xfff4c8, scale: 0.8, dy: 2.6 });
    } else { a.lpHold = false; a.lpT -= dt; }
    if (a.lpT <= 0) {
      const k = a.lpCharge / LP_CHARGE;   // 0..1: up to x2.5 damage and x2 size
      spawnProjectile('PIERCING_ARROW', p.pos.x + a.lpDx, p.pos.z + a.lpDz, a.lpDx, a.lpDz, 75, a.lpDmg * (1 + 1.5 * k), { life: 1.1, pierce: Infinity, radius: 2.4 * (1 + k), knockback: 0.15 + 0.5 * k, y: 1.3 });
      addShake(0.2 + 0.3 * k); p.anim.attackT = 1;
      a.lpCharge = 0;
    }
  }

  a.tint = 0;
  if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 2.4);

  // ---- leap
  if (a.leapT > 0) {
    a.leapT -= dt;
    const k = 1 - Math.max(0, a.leapT) / a.leapDur;
    p.pos.x = a.leapSx + (a.leapTx - a.leapSx) * k;
    p.pos.z = a.leapSz + (a.leapTz - a.leapSz) * k;
    p.air = 6 * 4 * k * (1 - k);
    p.vel.set((a.leapTx - a.leapSx) / a.leapDur, 0, (a.leapTz - a.leapSz) / a.leapDur);
    p.facing = Math.atan2(a.leapTx - a.leapSx, a.leapTz - a.leapSz);
    if (a.leapT <= 0) {
      p.air = 0; p.vel.set(0, 0, 0);
      const lv = a.leapLv;
      const R = ((a.leapDash ? 7 : 9) + 0.5 * (lv - 1)) * titanScale();
      stunSt.duration = a.leapDash ? 0.6 : 1;
      damageEnemiesInRadius(p.pos.x, p.pos.z, R, a.leapDmg, physKnock, stunSt);
      p.rageT = Math.max(p.rageT, (a.leapDash ? 1.5 + 0.5 * lv : 3 + lv) + st.stats.rageBonus);
      a.leapDash = false;
      events.emit('shockwave', { pos: p.pos.clone(), radius: R, color: 0xff5a3a });
      events.emit('crater', { pos: p.pos.clone(), radius: R * 0.7, color: 0x2a1408 });
      events.emit('quake', { pos: p.pos.clone(), radius: R });
      addShake(0.5);
    }
  }

  // ---- knight Judgment: the pillar of light lands
  if (a.judgeT > 0) {
    let live = 0;
    for (let k = 0; k < judgeN; k++) {
      const r = judgeRays[k];
      if (r.t <= 0) continue;
      r.t -= dt;
      if (r.t > 0) { live++; continue; }
      // the ray follows its enemy until it lands
      if (r.id >= 0) { const e = world.enemies[r.id]; if (e.active && e.state !== 'DYING') { r.x = e.pos.x; r.z = e.pos.z; } }
      stunSt.duration = a.judgeStun;
      damageEnemiesInRadius(r.x, r.z, a.judgeR, a.judgeDmg, holyOpts, stunSt);
      const at = new Vector3(r.x, 0, r.z);
      events.emit('ultImpact', { pos: at, name: 'JUDGMENT', radius: a.judgeR });
      events.emit('shockwave', { pos: at.clone(), radius: a.judgeR * 1.3, color: 0xfff2c0 });
      addShake(0.12);
    }
    if (live === 0) a.judgeT = 0;
  }

  // ---- barbarian shoulder charge: bulldozes everything on its path
  if (a.chargeT > 0) {
    a.chargeT -= dt;
    const ids = world.enemyGrid.query(p.pos.x, p.pos.z, 6, out);
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || a.chargeHit.indexOf(e.id) !== -1) continue;
      const ddx = e.pos.x - p.pos.x, ddz = e.pos.z - p.pos.z, rr = e.radius + 1.6;
      if (ddx * ddx + ddz * ddz > rr * rr) continue;
      a.chargeHit.push(e.id);
      chargeOpts.knockDir = aimTmp.set(p.dashDir.x, 0, p.dashDir.z);
      damageEnemy(e, a.chargeDmg, chargeOpts);
      events.emit('shockwave', { pos: e.pos.clone(), radius: 2.2, color: useGameStore.getState().hero === 'KNIGHT' ? 0xffe08a : 0xffb060 });
    }
  }

  // ---- whirlwind
  if (p.whirlT > 0) {
    // holding the key keeps spinning (up to WHIRL_MAX s in total)
    if (st.hero === 'BARBARIAN' && a.whirlExt < WHIRL_MAX - WHIRL_BASE && slotHeld('e')) a.whirlExt += dt;
    else p.whirlT = Math.max(0, p.whirlT - dt);
    a.whirlTick += dt;
    const R = a.whirlR;
    // pull inward every frame
    const ids = world.enemyGrid.query(p.pos.x, p.pos.z, R + 8, out);
    const pullR = (R + 6) * 0.7; // pull radius -30%
    const R2 = pullR * pullR;
    for (let i = 0; i < ids.length; i++) {
      const e = world.enemies[ids[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      if (e.boss || e.mini) { // big targets: no pull, only a gentle shove so they don't stand inside the hero
        const d = Math.sqrt(d2) || 1, keep = 1.5 + e.radius;
        if (d < keep) { const push = Math.min(keep - d, 6 * dt); e.pos.x -= (dx / d) * push; e.pos.z -= (dz / d) * push; }
        continue;
      }
      const d = Math.sqrt(d2) || 1;
      // keep-out ring: nothing gets close enough to touch the hero while spinning (still damaged by the ticks below)
      const keep = 3.0 + e.radius;
      if (d < keep) {
        const push = Math.min(keep - d, 18 * dt);
        e.pos.x -= (dx / d) * push; e.pos.z -= (dz / d) * push;
        continue;
      }
      const step = Math.min(d - keep, 14 * 0.08 * dt * (a.whirlBoost ? 1.3 : 1)); // very slight pull toward the blade ring
      e.pos.x += (dx / d) * step; e.pos.z += (dz / d) * step;
    }
    if (a.whirlTick >= 0.15) {
      a.whirlTick = 0;
      const hits = damageEnemiesInRadius(p.pos.x, p.pos.z, R, a.whirlDmg, whirlOpts);
      if (hits > 0 && a.whirlHeal < st.stats.maxHealth * 0.12) {
        const h = Math.min(6, hits) * st.stats.maxHealth * (0.005 + 0.001 * (a.whirlLv - 1)) * 0.5 * (a.whirlBoost ? 1.5 : 1);
        a.whirlHeal += h; healPlayer(h); // heal per hit -50%, capped at ~12% max HP per cast
      }
    }
  }

  // ---- storm orbs
  if (a.orbT > 0) {
    a.orbT -= dt;
    a.orbTick -= dt;
    const n = a.orbN;
    const ang = world.time * 2.8;
    const fade = Math.min(1, a.orbT / 0.4);
    for (let i = 0; i < n; i++) {
      const o = a.orbs[i];
      const aa = ang + (i * 6.283) / n;
      o.x = p.pos.x + Math.cos(aa) * 4.5; o.z = p.pos.z + Math.sin(aa) * 4.5; o.y = 1.4 + Math.sin(world.time * 5 + i) * 0.2;
    }
    if (a.orbTick <= 0 && fade > 0.3) {
      a.orbTick = 0.8;   // zap rate halved
      for (let i = 0; i < n; i++) orbZap(a.orbs[i], a);
    }
    if (a.orbT <= 0) a.orbN = 0;
  }
}

const hitList: number[] = [];
const orbFrom = new Vector3();
function orbZap(o: { x: number; y: number; z: number }, a: typeof abilityState): void {
  const ids = world.enemyGrid.query(o.x, o.z, 18, out);
  let best = -1, bd = 16 * 16;
  for (let i = 0; i < ids.length; i++) {
    const e = world.enemies[ids[i]];
    if (!e.active || e.state === 'DYING' || e.state === 'SPAWN') continue;
    const dx = e.pos.x - o.x, dz = e.pos.z - o.z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = e.id; }
  }
  if (best < 0) return;
  hitList.length = 0;
  let cur = world.enemies[best];
  orbFrom.set(o.x, o.y, o.z);
  events.emit('lightning', { from: orbFrom.clone(), to: new Vector3(cur.pos.x, 1.2, cur.pos.z) });
  damageEnemy(cur, a.orbDmg, elecBreak);
  hitList.push(cur.id);
  for (let c = 0; c < a.orbChain; c++) {
    const near = world.enemyGrid.query(cur.pos.x, cur.pos.z, 14, out);
    let nb: number = -1, nd = 12 * 12;
    for (let i = 0; i < near.length; i++) {
      const e = world.enemies[near[i]];
      if (!e.active || e.state === 'DYING' || e.state === 'SPAWN' || hitList.indexOf(e.id) !== -1) continue;
      const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z, d = dx * dx + dz * dz;
      if (d < nd) { nd = d; nb = e.id; }
    }
    if (nb < 0) break;
    const nx = world.enemies[nb];
    events.emit('lightning', { from: new Vector3(cur.pos.x, 1.2, cur.pos.z), to: new Vector3(nx.pos.x, 1.2, nx.pos.z) });
    damageEnemy(nx, a.orbDmg * 0.7, elecBreak);
    hitList.push(nx.id);
    cur = nx;
  }
}

// ============================================================ dash entry =====
/** Space: spends a dash charge and performs the class dash (Shadow Roll / Blink Nova / Shoulder Charge). */
export function tryDash(auto: boolean): boolean {
  const p = world.player;
  if (!p.alive || p.dashT > 0 || p.stunT > 0 || abilityState.leapT > 0 || abilityState.windupT > 0) return false;
  if (useGameStore.getState().level < DASH_UNLOCK_LV) {   // the dash unlocks at class level DASH_UNLOCK_LV (6)
    return false;
  }
  if (p.dashCharges <= 0) { notifyCooldown('dash'); return false; }
  if (p.dashCd <= 0) p.dashCd = p.dashCdMax;
  p.dashCharges--;
  p.rootT = 0; p.slowT = 0; // dash cleanses root + slow
  castDashSkill(auto);
  return true;
}
