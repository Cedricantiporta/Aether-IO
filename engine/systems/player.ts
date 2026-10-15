// ============================================================================
// Player: movement, dash, auto-fire, cooldowns, regen, potions, death flow.
// ============================================================================
import { GameStatus } from '../../types';
import { techLv } from '../../tech';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { PLAYER_RADIUS, POTION_COOLDOWN } from '../../constants';
import { lockedEnemy, updateTarget } from './target';
import { autoAim, findNearestEnemy, getAimDir, healPlayer, damagePlayer, cleansePlayer, applyPlayerDebuff, ankhOffer, ankhAvailable } from './combat';
import { hooks } from './hooks';
import { fireBasicAttack } from './projectiles';
import { updateAbilities, notifyCooldown, abilityState, autoCast } from './abilities';
import { wardedBossId } from './bossMech';
import { updateSkillInput, resetAim } from './aim';
import { dashKey } from '../../abilityDefs';
import { breakCrate } from './crates';
import { envSlow } from './zones';
import { queryColliders, edgeLimit, bounds, pushOutOfCrates, clampToDeck, type Collider } from '../mapgen';
import { Vector3 } from 'three';
import { dailyMods } from '../../dailyChallenge';

/** Dashes never stack: one charge, a fixed recharge; dash levels only raise its damage. */
const MAX_DASH_CHARGES = 1;
/** Every dash (all classes, any level) recharges in exactly 4 s. */
const DASH_CD = 5.5;   // (owner: was 6 s)
import { camRel } from '../camera';

const DASH_TIME = 0.18;
const DASH_SPEED = 24;   // shorter dashes for every class (was 32, before that 42)
const DEATH_DELAY = 1.2;
const COLLIDE_PAD = 0.5;
let lavaTouch = false;

const colOut: Collider[] = [];
const aim = new Vector3();
const _mv = { x: 0, z: 0 };

/** Combat feel: attack only when standing still, auto-target the nearest enemy, slower movement. */
const MOVE_SPEED_SCALE = 0.8;
const AUTO_TARGET_RANGE = 22;
/** Basic-attack range per class: heroes only auto-attack when an enemy is this close. */
const ATTACK_RANGE: Record<string, number> = { ARCHER: 22, WIZARD: 18, BARBARIAN: 11, KNIGHT: 7, NECROMANCER: 17 };   // knight: sword arc reach ~ 24 u/s x 0.26 s + its 2.5 width
const STOP_TO_FIRE_DELAY = 0.12;
let autoChase = false, lastAimId = -1;
/** Auto-chase ring = weapon range x this (the hero walks in when an enemy is inside it but out of weapon range). */
const CHASE_MUL = 1.35;

let dying = false;
let deathT = 0;
let ended = false;

export function resetPlayerSystem(): void {
  dying = false; deathT = 0; ended = false; ankhOffer.open = false; ankhOffer.declined = false;
  resetAim();
}
hooks.onRevive = () => { dying = false; deathT = 0; ended = false; ankhOffer.open = false; ankhOffer.declined = false; };

/** Initialises the runtime player from store stats (after clearWorld). */
export function initPlayer(): void {
  const st = useGameStore.getState();
  const p = world.player;
  p.alive = true;
  p.pos.set(0, 0, 0);
  p.vel.set(0, 0, 0);
  p.hp = st.stats.maxHealth;
  p.mana = st.stats.maxMana;
  p.maxDashCharges = MAX_DASH_CHARGES;   // one dash, every class, every level
  p.dashCharges = p.maxDashCharges;
  p.dashCd = 0;
  p.maxShieldCharges = st.skillLevels.barrier <= 0 ? 0 : st.skillLevels.barrier >= 5 ? 2 : 1;
  p.shieldCharges = p.maxShieldCharges;
  p.shieldCd = 0;
  p.dashCdMax = DASH_CD;
  p.cd.q = p.cd.e = p.cd.s3 = p.cd.s4 = 0;
  p.ult = 0;
  p.arcane = p.arcaneMax = p.arcaneT = 0;
  resetPlayerSystem();
}

function tickDown(v: number, dt: number): number {
  return v > 0 ? Math.max(0, v - dt) : 0;
}

let dryTextT = -10;
function usePotion(health: boolean): boolean {
  const st = useGameStore.getState();
  const p = world.player;
  if (dailyMods.noPotions) {   // Daily Trial: Dry Flasks
    if (world.time - dryTextT > 4) { dryTextT = world.time; events.emit('floatText', { pos: p.pos, text: 'DRY FLASKS: NO POTIONS', color: 0xef5f55, scale: 0.8, dy: 2.6 }); }
    return false;
  }
  const item = st.consumeItem((i) =>
    i.type === 'POTION' && i.level <= st.level && (i.name.indexOf('Health') !== -1) === health && (i.name.indexOf('Health') !== -1 || i.name.indexOf('Mana') !== -1));
  if (!item) return false;
  const amt = (item.restoreAmount || 50) * (1 + 0.12 * techLv(st.tech, 'potion'));   // Tech House: Potion Brewing
  // health potions restore a share of max HP: 70% (Big: 100%), Potion Brewing on top
  if (health) { healPlayer(st.stats.maxHealth * ((item.restoreAmount || 50) >= 75 ? 1 : 0.7) * (1 + 0.12 * techLv(st.tech, 'potion'))); p.hpPotCd = POTION_COOLDOWN; }
  else { p.mana = Math.min(st.stats.maxMana, p.mana + st.stats.maxMana * ((item.restoreAmount || 50) >= 75 ? 1 : 0.7) * (1 + 0.12 * techLv(st.tech, 'potion'))); p.mpPotCd = POTION_COOLDOWN; }   // 70% (Big: 100%)
  void amt;
  return true;
}

/** Moves the player to (x, z) against colliders, in short sub-steps so fast moves (a dash covers ~1.6 u per frame) can
 *  never tunnel through walls, props or crates: everything solid stops a dash. */
function resolveObstacles(p: typeof world.player, x: number, z: number): void {
  const dx = x - p.pos.x, dz = z - p.pos.z;
  const n = Math.min(12, Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.35));
  if (n <= 1) { resolveStep(p, x, z); return; }
  const sx = dx / n, sz = dz / n;
  for (let i = 0; i < n; i++) resolveStep(p, p.pos.x + sx, p.pos.z + sz);
}

function resolveStep(p: typeof world.player, x: number, z: number): void {
  const ox = p.pos.x, oz = p.pos.z;   // (pier decks: the deck stood on before this step, see mapgen.clampToDeck)
  const cols = queryColliders(x, z, PLAYER_RADIUS + 6, colOut);
  let nx = x, nz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const dx = nx - c.x, dz = nz - c.z;
      const min = c.r + COLLIDE_PAD;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      if (c.liquid === 2) lavaTouch = true;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { nx = c.x + min; continue; }
      nx = c.x + (dx / d) * min;
      nz = c.z + (dz / d) * min;
    }
  }
  if (lavaTouch && p.burnT <= 0.3 && p.alive) applyPlayerDebuff('BURN', 2.5, 4 + world.director.wave * 0.8);   // walked into lava
  lavaTouch = false;
  p.pos.x = nx; p.pos.z = nz; p.pos.y = 0;
  pushOutOfCrates(p.pos, 0.5);
  const r2 = p.pos.x * p.pos.x + p.pos.z * p.pos.z;
  if (r2 > bounds.checkR2) {
    const lim = edgeLimit(p.pos.x, p.pos.z, 2);
    if (r2 > lim * lim && !clampToDeck(p.pos, ox, oz)) { const k = lim / Math.sqrt(r2); p.pos.x *= k; p.pos.z *= k; }
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
      // an Ankh of Life in the bag (off cooldown): offer it on the death screen first (ui/screens/AnkhPrompt.tsx)
      if (!ankhOffer.declined && ankhAvailable()) { ankhOffer.open = true; return; }
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
  p.buffT = tickDown(p.buffT, dt);
  if (p.guardT > 0) { p.guardT = tickDown(p.guardT, dt); healPlayer(st.stats.maxHealth * 0.02 * dt); }   // Shield Wall: slow heal
  p.avatarT = tickDown(p.avatarT, dt);
  if (p.buffT <= 0) { p.buffDmg = 0; p.buffDef = 0; p.buffHaste = 0; }

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
  const maxDash = MAX_DASH_CHARGES;   // one dash, every class, every level
  if (maxDash > p.maxDashCharges) p.dashCharges += maxDash - p.maxDashCharges;
  p.maxDashCharges = maxDash;
  if (p.dashCharges > maxDash) p.dashCharges = maxDash;
  const maxShield = lv.barrier <= 0 ? 0 : lv.barrier >= 5 ? 2 : 1;
  if (maxShield > p.maxShieldCharges) p.shieldCharges += maxShield - p.maxShieldCharges;
  p.maxShieldCharges = maxShield;
  p.dashCdMax = DASH_CD - Math.min(2, 0.3 * Math.max(0, (dLv ?? 1) - 1));   // 5.5 s, -0.3 s per dash level above 1 (capped at -2 s); no gear / talent CDR
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
  p.hp = Math.min(stats.maxHealth, p.hp + (stats.regen + lv.regen * 0.5) * 0.5 * dt);   // all HP regen halved
  p.mana = Math.min(stats.maxMana, p.mana + stats.manaRegen * dt);   // class bases 1.0-1.5/s (constants HERO_STATS); the sheet shows the real rate
  if (p.hp > stats.maxHealth) p.hp = stats.maxHealth;
  if (p.mana > stats.maxMana) p.mana = stats.maxMana;

  // ---- potions
  if (inp.pressed.KeyZ && p.hpPotCd <= 0) usePotion(true);
  if (inp.pressed.KeyX && p.mpPotCd <= 0) usePotion(false);
  if (st.settings.autoPotions) {
    if (p.hpPotCd <= 0 && p.hp < stats.maxHealth * 0.3) usePotion(true);
    if (p.mpPotCd <= 0 && p.mana < stats.maxMana * 0.3) usePotion(false);
  }

  // ---- auto-target: the clicked lock, else the closest enemy
  {
    const cur = autoAim.id >= 0 ? world.enemies[autoAim.id] : null;
    const keep = cur && cur.active && cur.state !== 'DYING' && cur.state !== 'SPAWN'
      && (cur.pos.x - p.pos.x) ** 2 + (cur.pos.z - p.pos.z) ** 2 < (AUTO_TARGET_RANGE + 4) ** 2;
    updateTarget();
    const lk = lockedEnemy();
    const lr = (ATTACK_RANGE[st.hero] ?? 18) + (lk ? lk.radius : 0);
    void lr;
    if (lk) autoAim.id = lk.id;   // a clicked target always wins (the hero walks to it when out of range)
    else if (st.settings.autoAim === false) autoAim.id = -1;
    else {
      // always the closest enemy; a current target is only dropped for one clearly closer (1.5 u), so it doesn't flicker
      const e = findNearestEnemy(p.pos.x, p.pos.z, AUTO_TARGET_RANGE);
      if (!e) autoAim.id = -1;
      else if (!keep || !cur) autoAim.id = e.id;
      else if (e !== cur) {
        const dc = Math.hypot(cur.pos.x - p.pos.x, cur.pos.z - p.pos.z), de = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (de + 1.5 < dc) autoAim.id = e.id;
      }
      // a warded (immune) boss is skipped while its guards / crystals live: auto-aim goes for the nearest of them
      // (balance pass 2: ranged heroes kept shooting the shielded boss and lost the race at the 66% / 33% wards)
      const wb = wardedBossId();
      if (wb >= 0 && autoAim.id === wb) {
        let best = -1, bd = AUTO_TARGET_RANGE * AUTO_TARGET_RANGE;
        const L = world.enemies;
        for (let i = 0; i < L.length; i++) {
          const o = L[i];
          if (!o.active || o.state === 'DYING' || o.id === wb || o.decoy) continue;
          const d2 = (o.pos.x - p.pos.x) ** 2 + (o.pos.z - p.pos.z) ** 2;
          if (d2 < bd) { bd = d2; best = o.id; }
        }
        if (best >= 0) autoAim.id = best;
      }
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
  if (ml > 0) { camRel(mx, mz, _mv); mx = _mv.x; mz = _mv.z; }   // W = away from the camera

  // ---- auto-chase: no movement input + an enemy inside the chase ring (a bit beyond weapon range) but outside
  // weapon range -> walk toward it until it is in range (then the normal auto-attack takes over). Follows the auto-aim setting.
  autoChase = false;
  if (ml === 0 && st.settings.autoAim !== false && !world.input.keys.KeyF && p.dashT <= 0 && abilityState.leapT <= 0 && p.whirlT <= 0) {
    const range = ATTACK_RANGE[st.hero] ?? 18;
    const chaseR = range * CHASE_MUL;
    // the targeted enemy (clicked lock, else the auto-aim pick) is always walked to until it is in weapon range
    const lk = lockedEnemy();
    const cur = autoAim.id >= 0 ? world.enemies[autoAim.id] : null;
    let e = lk ?? (cur && cur.active && cur.state !== 'DYING' ? cur : null);
    if (!e && !findNearestEnemy(p.pos.x, p.pos.z, range)) e = findNearestEnemy(p.pos.x, p.pos.z, world.autoBattle.on && st.status === GameStatus.PLAYING ? 80 : chaseR);   // auto battle: hunt anywhere in the room
    if (e) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > range - 0.4 && d > 0.01) { mx = dx / d; mz = dz / d; ml = 1; autoChase = true; }   // (stops inside the firing check's range)
    }
  }

  if (stunned || p.rootT > 0) { mx = 0; mz = 0; ml = 0; }

  // ---- velocity (the Bloodrage Leap drives position itself in updateAbilities)
  if (abilityState.leapT > 0) {
    a.dashing = false;
  } else if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.set(p.dashDir.x * DASH_SPEED, 0, p.dashDir.z * DASH_SPEED);
  } else {
    const speed = stats.moveSpeed * MOVE_SPEED_SCALE * dailyMods.playerSpeed * (p.titanT > 0 ? 1.15 : 1) * (p.slowT > 0 ? 0.6 : 1) * envSlow;
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
  // auto battle: cast ready skills while an enemy is close
  if (world.autoBattle.on && st.status === GameStatus.PLAYING && !stunned && (world.autoBattle.castT -= dt) <= 0) {
    world.autoBattle.castT = 0.5;
    if (findNearestEnemy(p.pos.x, p.pos.z, 13)) autoCast();
  }

  // ---- auto-fire: only while standing still (stop to shoot). Short draw time after stopping.
  // Archer (mobile kiter) keeps shooting while walking at 80% rate; never during a dash/leap.
  // Holding F (or the touch ATTACK button) = manual attack: fires while moving (80% rate) and even with no target in range.
  if (stunned) { p.fireT = Math.max(p.fireT, 0.1); return; }
  // the swing timer keeps counting down while walking, so arriving at a target swings at once (no idle second)
  p.fireT = Math.max(-0.05, p.fireT - dt);
  const manual = !!world.input.keys.KeyF;
  // casting a skill: no basic attacks until the cast is done
  if (abilityState.castLockT > 0) { p.fireT = Math.max(p.fireT, 0.08); return; }
  const busy = p.dashT > 0 || abilityState.leapT > 0 || p.whirlT > 0;
  const archerMoving = manual && moving && !busy;   // (the archer no longer shoots on the move; holding F still forces a shot)
  if (moving && !archerMoving) { if (!autoChase) p.fireT = Math.max(p.fireT, STOP_TO_FIRE_DELAY); return; }   // (walking up to the target: swing on arrival)
  // a new target: swing at it right away (no idle wait)
  if (autoAim.id !== lastAimId) { lastAimId = autoAim.id; if (autoAim.id >= 0) p.fireT = Math.min(p.fireT, 0.03); }
  // Auto-attack: no target in weapon range → hold fire (no shooting into empty air).
  const range = ATTACK_RANGE[st.hero] ?? 18;
  const lkd = lockedEnemy();
  const lockInRange = !!lkd && autoAim.id === lkd.id && (lkd.pos.x - p.pos.x) ** 2 + (lkd.pos.z - p.pos.z) ** 2 <= (range + lkd.radius) ** 2;
  if (!manual && !lockInRange && !findNearestEnemy(p.pos.x, p.pos.z, range + 0.8)) return;
  if (p.fireT <= 0) {
    const lowHaste = stats.lowHpHaste > 0 && p.hp < stats.maxHealth * 0.5 ? 1 + stats.lowHpHaste : 1;
    const rate = Math.max(0.1, stats.fireRate * (1 + p.buffHaste) * (p.rageT > 0 ? 2 : 1) * (p.avatarT > 0 ? 1.5 : 1) * lowHaste * (archerMoving ? 0.8 : 1));
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
  if (!(world.village.cave.combat && world.village.area === 'CAVE')) p.hp = st.stats.maxHealth;   // (deep cave floors keep real HP, see cave.ts)
  // run-only flashes must still fade in town (a level-up / revive light carried back from a run used to stay lit forever)
  p.levelUpFx = tickDown(p.levelUpFx, dt * 1.2); p.reviveFx = tickDown(p.reviveFx, dt);
  p.avatarT = 0; p.guardT = 0;
  p.mana = st.stats.maxMana;
  a.hurtT = tickDown(a.hurtT, dt * 3);
  a.attackT = tickDown(a.attackT, dt * 4);
  a.castT = tickDown(a.castT, dt * 3);
  // skills + class dash work in town too (free: mana stays full; no enemies to hit)
  p.cd.q = tickDown(p.cd.q, dt); p.cd.e = tickDown(p.cd.e, dt); p.cd.s3 = tickDown(p.cd.s3, dt); p.cd.s4 = tickDown(p.cd.s4, dt);
  if (p.maxDashCharges < 1) p.maxDashCharges = 1;
  if (p.dashCdMax <= 0) p.dashCdMax = DASH_CD;
  if (p.dashCharges < p.maxDashCharges) { p.dashCd -= dt; if (p.dashCd <= 0) { p.dashCharges++; p.dashCd = p.dashCharges < p.maxDashCharges ? p.dashCdMax : 0; } }
  updateSkillInput();
  updateAbilities(dt);
  a.dashing = p.dashT > 0;
  if (abilityState.leapT > 0) return;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.set(p.dashDir.x * DASH_SPEED, 0, p.dashDir.z * DASH_SPEED);
    resolveObstacles(p, p.pos.x + p.vel.x * dt, p.pos.z + p.vel.z * dt);
    return;
  }
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  let ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  const jy = world.input.joy;
  if (jy.active) { mx = jy.x; mz = jy.z; ml = Math.sqrt(mx * mx + mz * mz); if (ml > 1) { mx /= ml; mz /= ml; ml = 1; } if (ml < 0.05) ml = 0; }
  // click-to-walk (village): head for the clicked shop until there; any manual input cancels it
  const go = world.village.go;
  let worldDir = false;
  if (go.on) {
    if (ml > 0) go.on = false;
    else { const dx = go.x - p.pos.x, dz = go.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz); if (d > (go.i >= go.n - 1 ? go.r * 0.6 : 0.3)) { mx = dx / d; mz = dz / d; ml = 1; worldDir = true; } }
  }
  if (ml > 0 && !worldDir) { camRel(mx, mz, _mv); mx = _mv.x; mz = _mv.z; }
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
  // town monsters (hermit path): auto-attack while standing still with one in range, like in a run
  if (ml > 0 || p.dashT > 0 || p.whirlT > 0) { p.fireT = Math.max(p.fireT, STOP_TO_FIRE_DELAY); return; }
  const tgt = findNearestEnemy(p.pos.x, p.pos.z, ATTACK_RANGE[st.hero] ?? 18);
  if (!tgt) { p.fireT = Math.max(p.fireT, 0.05); autoAim.id = -1; return; }
  autoAim.id = tgt.id; p.facing = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);   // aim at it (no run targeting in town)
  p.fireT -= dt;
  if (p.fireT <= 0) { fireBasicAttack(); p.fireT = Math.max(0, p.fireT + 1 / Math.max(0.1, st.stats.fireRate)); }
}
