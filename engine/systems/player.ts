// ============================================================================
// Player: movement, dash, auto-fire, cooldowns, regen, potions, death flow.
// ============================================================================
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { PLAYER_RADIUS, POTION_COOLDOWN } from '../../constants';
import { autoAim, findNearestEnemy, getAimDir, healPlayer, damagePlayer, cleansePlayer } from './combat';
import { fireBasicAttack } from './projectiles';
import { updateAbilities, notifyCooldown, abilityState } from './abilities';
import { updateSkillInput, resetAim } from './aim';
import { dashKey } from '../../abilityDefs';
import { breakCrate } from './crates';
import { envSlow } from './zones';
import { queryColliders, edgeLimit, pushOutOfCrates, type Collider } from '../mapgen';
import { Vector3 } from 'three';

const DASH_TIME = 0.18;
const DASH_SPEED = 42;
const DEATH_DELAY = 1.2;
const COLLIDE_PAD = 0.5;

const colOut: Collider[] = [];
const aim = new Vector3();

/** Combat feel: attack only when standing still, auto-target the nearest enemy, slower movement. */
const MOVE_SPEED_SCALE = 0.8;
const AUTO_TARGET_RANGE = 22;
/** Basic-attack range per class: heroes only auto-attack when an enemy is this close. */
const ATTACK_RANGE: Record<string, number> = { ARCHER: 22, WIZARD: 18, BARBARIAN: 11 };
const STOP_TO_FIRE_DELAY = 0.12;

let dying = false;
let deathT = 0;
let ended = false;

export function resetPlayerSystem(): void {
  dying = false; deathT = 0; ended = false;
  resetAim();
}

/** Initialises the runtime player from store stats (after clearWorld). */
export function initPlayer(): void {
  const st = useGameStore.getState();
  const p = world.player;
  p.alive = true;
  p.pos.set(0, 0, 0);
  p.vel.set(0, 0, 0);
  p.hp = st.stats.maxHealth;
  p.mana = st.stats.maxMana;
  p.maxDashCharges = (st.skillLevels[dashKey(st.hero)] >= 5 ? 2 : 1) + (st.stats.dashCharges | 0);
  p.dashCharges = p.maxDashCharges;
  p.dashCd = 0;
  p.maxShieldCharges = st.skillLevels.barrier <= 0 ? 0 : st.skillLevels.barrier >= 5 ? 2 : 1;
  p.shieldCharges = p.maxShieldCharges;
  p.shieldCd = 0;
  p.dashCdMax = 4;
  p.cd.q = p.cd.e = p.cd.s3 = p.cd.s4 = 0;
  p.ult = 0;
  resetPlayerSystem();
}

function tickDown(v: number, dt: number): number {
  return v > 0 ? Math.max(0, v - dt) : 0;
}

function usePotion(health: boolean): boolean {
  const st = useGameStore.getState();
  const p = world.player;
  const item = st.consumeItem((i) =>
    i.type === 'POTION' && i.level <= st.level && (i.name.indexOf('Health') !== -1) === health && (i.name.indexOf('Health') !== -1 || i.name.indexOf('Mana') !== -1));
  if (!item) return false;
  const amt = item.restoreAmount || 50;
  if (health) { healPlayer(amt); p.hpPotCd = POTION_COOLDOWN; }
  else { p.mana = Math.min(st.stats.maxMana, p.mana + amt); p.mpPotCd = POTION_COOLDOWN; }
  return true;
}

function resolveObstacles(p: typeof world.player, x: number, z: number): void {
  const cols = queryColliders(x, z, PLAYER_RADIUS + 6, colOut);
  let nx = x, nz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = nx - c.x, dz = nz - c.z;
      const min = c.r + COLLIDE_PAD;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { nx = c.x + min; continue; }
      nx = c.x + (dx / d) * min;
      nz = c.z + (dz / d) * min;
    }
  }
  p.pos.x = nx; p.pos.z = nz; p.pos.y = 0;
  pushOutOfCrates(p.pos, 0.5);
  const r2 = p.pos.x * p.pos.x + p.pos.z * p.pos.z;
  if (r2 > 80 * 80) {
    const lim = edgeLimit(p.pos.x, p.pos.z, 2);
    if (r2 > lim * lim) { const k = lim / Math.sqrt(r2); p.pos.x *= k; p.pos.z *= k; }
  }
}

export function updatePlayer(dt: number): void {
  const st = useGameStore.getState();
  const stats = st.stats;
  const lv = st.skillLevels;
  const p = world.player;
  const inp = world.input;
  const a = p.anim;

  // ---- always-on decays
  a.hurtT = tickDown(a.hurtT, dt * 3);
  a.attackT = tickDown(a.attackT, dt * 4);
  a.castT = tickDown(a.castT, dt * 3);
  p.levelUpFx = tickDown(p.levelUpFx, dt * 1.2);
  p.reviveFx = tickDown(p.reviveFx, dt * 0.5);

  // ---- death flow
  if (!p.alive) {
    if (!dying) { dying = true; deathT = 0; }
    deathT += dt;
    a.dashing = false;
    a.moveBlend = 0;
    if (deathT >= DEATH_DELAY && !ended) {
      ended = true;
      st.endRun({ ...world.run, wave: world.director.wave });
    }
    return;
  }

  // ---- timers
  p.invulnT = tickDown(p.invulnT, dt);
  p.rageT = tickDown(p.rageT, dt);
  p.titanT = tickDown(p.titanT, dt);
  p.slowT = tickDown(p.slowT, dt);
  p.hpPotCd = tickDown(p.hpPotCd, dt);
  p.mpPotCd = tickDown(p.mpPotCd, dt);
  p.petReviveCd = tickDown(p.petReviveCd, dt);
  p.cd.q = tickDown(p.cd.q, dt);
  p.cd.e = tickDown(p.cd.e, dt);
  p.cd.s3 = tickDown(p.cd.s3, dt);
  p.cd.s4 = tickDown(p.cd.s4, dt);
  p.cryT = tickDown(p.cryT, dt);

  // ---- debuffs from monster tricks (stun: no move/attack/skills; root: no move; silence: no actives/ult)
  p.stunT = tickDown(p.stunT, dt); p.rootT = tickDown(p.rootT, dt); p.silenceT = tickDown(p.silenceT, dt);
  p.defDownT = tickDown(p.defDownT, dt); p.blindT = tickDown(p.blindT, dt);
  p.burnT = tickDown(p.burnT, dt); p.poisonT = tickDown(p.poisonT, dt); p.bleedT = tickDown(p.bleedT, dt);
  if (p.burnT <= 0) p.burnDps = 0;
  if (p.poisonT <= 0) p.poisonDps = 0;
  if (p.bleedT <= 0) p.bleedDps = 0;
  if (p.burnT > 0 || p.poisonT > 0 || p.bleedT > 0) {
    p.dotAcc += dt;
    if (p.dotAcc >= 0.5) {
      p.dotAcc -= 0.5;
      if (p.burnT > 0) damagePlayer(p.burnDps * 0.5, { kind: 'FIRE', dot: true });
      if (p.poisonT > 0) damagePlayer(p.poisonDps * 0.5, { kind: 'POISON', dot: true });
      if (p.bleedT > 0) damagePlayer(p.bleedDps * 0.5, { kind: 'PHYSICAL', dot: true });
      if (!p.alive) return;
    }
  } else p.dotAcc = 0;
  const stunned = p.stunT > 0;

  // ---- charge capacity follows skill levels (cards / skill shop mid-run)
  const dLv = lv[dashKey(st.hero)];
  const maxDash = (dLv >= 5 ? 2 : 1) + (stats.dashCharges | 0);
  if (maxDash > p.maxDashCharges) p.dashCharges += maxDash - p.maxDashCharges;
  p.maxDashCharges = maxDash;
  const maxShield = lv.barrier <= 0 ? 0 : lv.barrier >= 5 ? 2 : 1;
  if (maxShield > p.maxShieldCharges) p.shieldCharges += maxShield - p.maxShieldCharges;
  p.maxShieldCharges = maxShield;
  p.dashCdMax = Math.max(0.6, stats.dashCooldown * (1 - 0.08 * Math.max(0, dLv - 1)) * (1 - stats.cooldownReduction));
  p.shieldCdMax = Math.max(20, 48 - 4 * lv.barrier);

  if (p.dashCharges < p.maxDashCharges) {
    p.dashCd -= dt;
    if (p.dashCd <= 0) {
      p.dashCharges++;
      p.dashCd = p.dashCharges < p.maxDashCharges ? p.dashCdMax : 0;
    }
  }
  if (p.shieldCharges < p.maxShieldCharges) {
    p.shieldCd -= dt;
    if (p.shieldCd <= 0) {
      p.shieldCharges++;
      p.shieldCd = p.shieldCharges < p.maxShieldCharges ? p.shieldCdMax : 0;
    }
  }

  // ---- regen / vitality
  p.hp = Math.min(stats.maxHealth, p.hp + (stats.regen + lv.regen * 0.5) * dt);
  p.mana = Math.min(stats.maxMana, p.mana + stats.manaRegen * dt);
  if (p.hp > stats.maxHealth) p.hp = stats.maxHealth;
  if (p.mana > stats.maxMana) p.mana = stats.maxMana;

  // ---- potions
  if (inp.pressed.KeyZ && p.hpPotCd <= 0) usePotion(true);
  if (inp.pressed.KeyX && p.mpPotCd <= 0) usePotion(false);
  if (st.settings.autoPotions) {
    if (p.hpPotCd <= 0 && p.hp < stats.maxHealth * 0.3) usePotion(true);
    if (p.mpPotCd <= 0 && p.mana < stats.maxMana * 0.3) usePotion(false);
  }

  // ---- auto-target: lock the nearest enemy, keep the lock while it stays alive and in range (sticky)
  {
    const cur = autoAim.id >= 0 ? world.enemies[autoAim.id] : null;
    const keep = cur && cur.active && cur.state !== 'DYING' && cur.state !== 'SPAWN'
      && (cur.pos.x - p.pos.x) ** 2 + (cur.pos.z - p.pos.z) ** 2 < (AUTO_TARGET_RANGE + 4) ** 2;
    if (st.settings.autoAim === false) autoAim.id = -1;
    else if (!keep) {
      const e = findNearestEnemy(p.pos.x, p.pos.z, AUTO_TARGET_RANGE);
      autoAim.id = e ? e.id : -1;
    }
  }
  const dir = getAimDir(aim);

  // ---- movement input
  const k = inp.keys;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  let ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  if (inp.joy.active) { mx = inp.joy.x; mz = inp.joy.z; ml = Math.sqrt(mx * mx + mz * mz); if (ml > 1) { mx /= ml; mz /= ml; ml = 1; } if (ml < 0.05) ml = 0; }

  if (stunned || p.rootT > 0) { mx = 0; mz = 0; ml = 0; }

  // ---- velocity (the Bloodrage Leap drives position itself in updateAbilities)
  if (abilityState.leapT > 0) {
    a.dashing = false;
  } else if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.set(p.dashDir.x * DASH_SPEED, 0, p.dashDir.z * DASH_SPEED);
  } else {
    const speed = stats.moveSpeed * MOVE_SPEED_SCALE * (p.titanT > 0 ? 1.15 : 1) * (p.slowT > 0 ? 0.6 : 1) * envSlow;
    const lerpK = 1 - Math.exp(-12 * dt);
    p.vel.x += (mx * speed - p.vel.x) * lerpK;
    p.vel.z += (mz * speed - p.vel.z) * lerpK;
  }
  if (abilityState.leapT <= 0) {
    a.dashing = p.dashT > 0;
    resolveObstacles(p, p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt);
  }

  // ---- walking crates into pieces
  const crates = world.crates;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c.active) continue;
    const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
    if ((c.kind === 'POT' || c.kind === 'HAY') && dx * dx + dz * dz < 1.21) breakCrate(c);
  }

  // ---- anim / facing: face where you walk; when standing still, face the target
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  const moving = ml > 0 || p.dashT > 0 || abilityState.leapT > 0 || p.whirlT > 0;
  if (moving && sp > 0.5) p.facing = Math.atan2(p.vel.x, p.vel.z);
  else p.facing = Math.atan2(dir.x, dir.z);
  const target = Math.min(1, sp / Math.max(1, stats.moveSpeed));
  a.moveBlend += (target - a.moveBlend) * Math.min(1, 10 * dt);
  a.stepPhase += sp * dt * 1.4;

  // ---- abilities (edge triggered)
  // skill keys 1/2/3, Space (class dash) and R (ult): aimed hold & release / quick / auto casting
  if (stunned) { resetAim(); } else updateSkillInput();
  updateAbilities(dt);

  // ---- auto-fire: only while standing still (stop to shoot). Short draw time after stopping.
  // Archer (mobile kiter) keeps shooting while walking at 80% rate; never during a dash/leap.
  if (stunned) { p.fireT = Math.max(p.fireT, 0.1); return; }
  const archerMoving = st.hero === 'ARCHER' && moving && p.dashT <= 0 && abilityState.leapT <= 0 && p.whirlT <= 0;
  if (moving && !archerMoving) { p.fireT = Math.max(p.fireT, STOP_TO_FIRE_DELAY); return; }
  // No target in weapon range → hold fire (no shooting into empty air).
  const range = ATTACK_RANGE[st.hero] ?? 18;
  if (!findNearestEnemy(p.pos.x, p.pos.z, range)) { p.fireT = Math.max(p.fireT, 0.05); return; }
  p.fireT -= dt;
  if (p.fireT <= 0) {
    const lowHaste = stats.lowHpHaste > 0 && p.hp < stats.maxHealth * 0.5 ? 1 + stats.lowHpHaste : 1;
    const rate = Math.max(0.1, stats.fireRate * (p.rageT > 0 ? 2 : 1) * lowHaste * (archerMoving ? 0.8 : 1));
    fireBasicAttack();
    p.fireT = Math.max(0, p.fireT + 1 / rate);
  }
}

/** Village mode: walking only (movement, collisions, animation). No dash, attacks, abilities or regen drain. */
export function updatePlayerVillage(dt: number): void {
  const st = useGameStore.getState();
  const p = world.player;
  const a = p.anim;
  const k = world.input.keys;
  p.alive = true;
  p.hp = st.stats.maxHealth;
  p.mana = st.stats.maxMana;
  a.hurtT = tickDown(a.hurtT, dt * 3);
  a.attackT = tickDown(a.attackT, dt * 4);
  a.castT = tickDown(a.castT, dt * 3);
  a.dashing = false;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  let ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  const jy = world.input.joy;
  if (jy.active) { mx = jy.x; mz = jy.z; ml = Math.sqrt(mx * mx + mz * mz); if (ml > 1) { mx /= ml; mz /= ml; ml = 1; } if (ml < 0.05) ml = 0; }
  const speed = st.stats.moveSpeed * MOVE_SPEED_SCALE;
  const lerpK = 1 - Math.exp(-12 * dt);
  p.vel.x += (mx * speed - p.vel.x) * lerpK;
  p.vel.z += (mz * speed - p.vel.z) * lerpK;
  resolveObstacles(p, p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt);
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  if (ml > 0 && sp > 0.5) p.facing = Math.atan2(p.vel.x, p.vel.z);
  const target = Math.min(1, sp / Math.max(1, st.stats.moveSpeed));
  a.moveBlend += (target - a.moveBlend) * Math.min(1, 10 * dt);
  a.stepPhase += sp * dt * 1.4;
}
