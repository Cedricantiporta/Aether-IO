// ============================================================================
// Player: movement, dash, auto-fire, cooldowns, regen, potions, death flow.
// ============================================================================
import { world, ARENA_RADIUS } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { PLAYER_RADIUS } from '../../constants';
import { getAimDir, healPlayer } from './combat';
import { fireBasicAttack } from './projectiles';
import { castQ, castR, castE, updateAbilities, notifyCooldown, notifyNoMana } from './abilities';
import { breakCrate } from './crates';
import { envSlow } from './zones';
import { queryColliders, edgeLimit, pushOutOfCrates, type Collider } from '../mapgen';
import { Vector3 } from 'three';

const DASH_TIME = 0.18;
const DASH_SPEED = 42;
const POTION_CD = 10;
const DEATH_DELAY = 1.2;
const COLLIDE_PAD = 0.5;

const colOut: Collider[] = [];
const aim = new Vector3();

let dying = false;
let deathT = 0;
let ended = false;

export function resetPlayerSystem(): void {
  dying = false; deathT = 0; ended = false;
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
  p.maxDashCharges = st.skillLevels.dash >= 5 ? 2 : 1;
  p.dashCharges = p.maxDashCharges;
  p.dashCd = 0;
  p.maxShieldCharges = st.skillLevels.barrier <= 0 ? 0 : st.skillLevels.barrier >= 5 ? 2 : 1;
  p.shieldCharges = p.maxShieldCharges;
  p.shieldCd = 0;
  p.cdMax.q = 7; p.cdMax.r = 15; p.cdMax.e = 20; p.dashCdMax = 4;
  p.cd.q = p.cd.r = p.cd.e = 0;
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
  if (health) { healPlayer(amt); p.hpPotCd = POTION_CD; }
  else { p.mana = Math.min(st.stats.maxMana, p.mana + amt); p.mpPotCd = POTION_CD; }
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
  p.sprintT = tickDown(p.sprintT, dt);
  p.slowT = tickDown(p.slowT, dt);
  p.hpPotCd = tickDown(p.hpPotCd, dt);
  p.mpPotCd = tickDown(p.mpPotCd, dt);
  p.petReviveCd = tickDown(p.petReviveCd, dt);
  p.cd.q = tickDown(p.cd.q, dt);
  p.cd.r = tickDown(p.cd.r, dt);
  p.cd.e = tickDown(p.cd.e, dt);

  // ---- charge capacity follows skill levels (cards / skill shop mid-run)
  const maxDash = lv.dash >= 5 ? 2 : 1;
  if (maxDash > p.maxDashCharges) p.dashCharges += maxDash - p.maxDashCharges;
  p.maxDashCharges = maxDash;
  const maxShield = lv.barrier <= 0 ? 0 : lv.barrier >= 5 ? 2 : 1;
  if (maxShield > p.maxShieldCharges) p.shieldCharges += maxShield - p.maxShieldCharges;
  p.maxShieldCharges = maxShield;
  p.dashCdMax = Math.max(0.6, stats.dashCooldown * (1 - 0.08 * Math.max(0, lv.dash - 1)) * (1 - stats.cooldownReduction));
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
  if (p.vitalityT > 0) {
    p.vitalityT = tickDown(p.vitalityT, dt);
    p.hp = Math.min(stats.maxHealth, p.hp + 10 * dt);
  }
  if (p.hp > stats.maxHealth) p.hp = stats.maxHealth;
  if (p.mana > stats.maxMana) p.mana = stats.maxMana;

  // ---- potions
  if (inp.pressed.Digit1 && p.hpPotCd <= 0) usePotion(true);
  if (inp.pressed.Digit2 && p.mpPotCd <= 0) usePotion(false);
  if (st.settings.autoPotions) {
    if (p.hpPotCd <= 0 && p.hp < stats.maxHealth * 0.3) usePotion(true);
    if (p.mpPotCd <= 0 && p.mana < stats.maxMana * 0.3) usePotion(false);
  }

  // ---- aim / facing
  const dir = getAimDir(aim);
  p.facing = Math.atan2(dir.x, dir.z);

  // ---- movement input
  const k = inp.keys;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0) { mx /= ml; mz /= ml; }

  // ---- dash
  if (inp.pressed.Space && p.dashT <= 0) {
    if (p.dashCharges <= 0) notifyCooldown('dash');
    else if (p.mana < st.getManaCost('dash')) notifyNoMana();
    else {
      p.mana -= st.getManaCost('dash');
      if (p.dashCd <= 0) p.dashCd = p.dashCdMax;
      p.dashCharges--;
      p.dashT = DASH_TIME;
      if (ml > 0) p.dashDir.set(mx, 0, mz); else p.dashDir.set(dir.x, 0, dir.z);
      p.invulnT = Math.max(p.invulnT, DASH_TIME);
      events.emit('dash', { from: p.pos.clone(), dir: p.dashDir.clone() });
    }
  }

  // ---- velocity
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.set(p.dashDir.x * DASH_SPEED, 0, p.dashDir.z * DASH_SPEED);
  } else {
    const speed = stats.moveSpeed * (p.sprintT > 0 ? 2 : 1) * (p.slowT > 0 ? 0.6 : 1) * envSlow;
    const lerpK = 1 - Math.exp(-12 * dt);
    p.vel.x += (mx * speed - p.vel.x) * lerpK;
    p.vel.z += (mz * speed - p.vel.z) * lerpK;
  }
  a.dashing = p.dashT > 0;

  resolveObstacles(p, p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt);

  // ---- walking crates into pieces
  const crates = world.crates;
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c.active) continue;
    const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
    if ((c.kind === 'POT' || c.kind === 'HAY') && dx * dx + dz * dz < 1.21) breakCrate(c);
  }

  // ---- anim
  const sp = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
  const target = Math.min(1, sp / Math.max(1, stats.moveSpeed));
  a.moveBlend += (target - a.moveBlend) * Math.min(1, 10 * dt);
  a.stepPhase += sp * dt * 1.4;

  // ---- abilities (edge triggered)
  if (inp.pressed.KeyQ) castQ();
  if (inp.pressed.KeyR) castR();
  if (inp.pressed.KeyE) castE();
  updateAbilities(dt);

  // ---- auto-fire
  p.fireT -= dt;
  if (p.fireT <= 0) {
    const rate = Math.max(0.1, stats.fireRate * (p.rageT > 0 ? 2 : 1));
    fireBasicAttack();
    p.fireT = Math.max(0, p.fireT + 1 / rate);
  }
}
