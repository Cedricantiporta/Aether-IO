// ============================================================================
// Aimed ("MOBA-style") casting. Desktop: press-and-HOLD a skill key shows a ground indicator,
// RELEASE casts there, right-click / Esc cancels. Touch: drag from the skill button, release casts,
// drag back to the centre (or into the top cancel zone) cancels, a quick tap casts at the auto-target.
// Settings: castMode AIMED (hold & release) / QUICK (instant at cursor) / AUTO (instant at auto-target).
// ============================================================================
import { world } from '../world';
import { useGameStore } from '../../store';
import { ACTIVE_ORDER, type ActiveSlot } from '../../abilityDefs';
import { ULT_MAX } from '../../abilityDefs';
import { aimOverride, autoAim, findNearestEnemy } from './combat';
import { castActive, castUlt, tryDash, ultReady, castHold } from './abilities';
import { edgeLimit } from '../mapgen';
import { lockedEnemy } from './target';
import { camRel } from '../camera';

const _td = { x: 0, z: 0 };

export const Shape = { NONE: 0, LINE: 1, CONE: 2, CIRCLE: 3, RING: 4, ARROW: 5 } as const;
export const aimState = {
  active: false, id: '', shape: 0 as number,
  x: 0, z: 0,            // circle centre / line end
  dx: 0, dz: 1,          // direction
  len: 0, width: 0, radius: 0, half: 0,
  clamped: false, castable: true, touch: false,
  targetX: 0, targetZ: 0, // ground point the cast will use (indicator target)
  startedAt: 0, cancelZone: false,
};

export const SKILL_KEYS: readonly (readonly [string, string])[] = [
  ['Digit1', 's1'], ['Digit2', 's2'], ['Digit3', 's3'], ['Space', 'dash'], ['KeyR', 'ult'],
];
const held: Record<string, boolean> = {};
const pressAt: Record<string, number> = {};   // performance.now() when each key / touch button went down
const lastTouchFired = { on: false };   // a hold skill already fired at touch-down

/** Skills charged / sustained by holding the key: Lightpiercer (charge) and Whirlwind (longer spin). */
function holdSkill(id: string): boolean {
  const hero = useGameStore.getState().hero, slot = slotOf(id);
  return (hero === 'ARCHER' && slot === 's3') || (hero === 'BARBARIAN' && slot === 'e');
}
const lastTouch = { active: false, maxMag: 0 };

/** (owner) a click on the skill bar casts at the auto-target (the cursor is on the button, not the battlefield). */
export const forceAutoCast = { on: false };
function mode(): 'AIMED' | 'QUICK' | 'AUTO' {
  if (forceAutoCast.on) return 'AUTO';
  return (useGameStore.getState().settings as { castMode?: 'AIMED' | 'QUICK' | 'AUTO' }).castMode ?? 'AIMED';
}

export function resetAim(): void {
  aimState.active = false;
  for (const k in held) held[k] = false;
  lastTouch.active = false;
  aimOverride.on = false;
}
export function cancelAim(): void { aimState.active = false; aimState.cancelZone = false; }
export const isAiming = (): boolean => aimState.active;

function slotOf(id: string): ActiveSlot | null {
  const hero = useGameStore.getState().hero;
  const i = id === 's1' ? 0 : id === 's2' ? 1 : id === 's3' ? 2 : -1;
  return i >= 0 ? ACTIVE_ORDER[hero][i] : null;
}

function isCastable(id: string): boolean {
  const p = world.player, st = useGameStore.getState();
  if (!p.alive) return false;
  if (id === 'ult') return ultReady() && p.stunT <= 0 && p.silenceT <= 0;
  if (id === 'dash') return p.dashCharges > 0 && p.stunT <= 0;
  const slot = slotOf(id);
  if (!slot) return false;
  return p.cd[slot] <= 0 && p.mana >= st.getManaCost(slot) && p.stunT <= 0 && p.silenceT <= 0;
}

/** Does this skill use an aim indicator? (Barbarian dash is a plain instant dash.) */
function aimable(id: string): boolean {
  const hero = useGameStore.getState().hero;
  if (id === 'dash') return true;
  // Self-centred skills cast instantly (no drag/aim): Storm Orbs, Whirlwind, Titan's Wrath.
  const slot = id === 'ult' ? 'ult' : slotOf(id);
  if (hero === 'WIZARD' && slot === 's3') return false;
  if ((hero === 'BARBARIAN' || hero === 'KNIGHT') && (slot === 'e' || slot === 'ult')) return false;
  return true;
}

// ------------------------------------------------------------ shape table --
/** Fills aimState for `id` with the cursor at (cx, cz) world ground point. */
function shapeFor(id: string, cx: number, cz: number): void {
  const p = world.player, st = useGameStore.getState(), hero = st.hero, lv = st.skillLevels, A = aimState, S = st.stats;
  let dx = cx - p.pos.x, dz = cz - p.pos.z;
  let d = Math.hypot(dx, dz);
  if (d < 0.05) { dx = Math.sin(p.facing); dz = Math.cos(p.facing); d = 1; }
  const ux = dx / d, uz = dz / d;
  A.dx = ux; A.dz = uz; A.clamped = false; A.half = 0; A.width = 0; A.radius = 0; A.len = 0;
  const circle = (range: number, minR: number, radius: number) => {
    const dd = Math.min(range, Math.max(minR, d));
    A.clamped = d > range + 0.5;
    let x = p.pos.x + ux * dd, z = p.pos.z + uz * dd;
    const r = Math.hypot(x, z), lim = edgeLimit(x, z, 3);
    if (r > lim) { x *= lim / r; z *= lim / r; }
    A.shape = Shape.CIRCLE; A.x = x; A.z = z; A.radius = radius; A.len = dd;
    A.targetX = x; A.targetZ = z;
  };
  const line = (len: number, width: number) => {
    A.shape = Shape.LINE; A.len = len; A.width = width; A.x = p.pos.x + ux * len; A.z = p.pos.z + uz * len;
    A.targetX = p.pos.x + ux * Math.max(4, Math.min(len, d)); A.targetZ = p.pos.z + uz * Math.max(4, Math.min(len, d));
  };
  const ring = (radius: number) => { A.shape = Shape.RING; A.x = p.pos.x; A.z = p.pos.z; A.radius = radius; A.targetX = cx; A.targetZ = cz; };
  const slot = id === 'ult' ? 'ult' : id === 'dash' ? 'e' : slotOf(id);
  if (hero === 'ARCHER') {
    if (id === 'dash') { A.shape = Shape.ARROW; A.len = 6; A.width = 2.2; A.x = p.pos.x + ux * 6; A.z = p.pos.z + uz * 6; A.targetX = cx; A.targetZ = cz; }
    else if (slot === 'q') line(38, 6 * (1 + S.galeWidth) * (1 + 0.1 * (lv.q - 1)));
    else if (slot === 's3') { A.shape = Shape.CONE; A.half = 0.305; A.len = 22; A.x = p.pos.x + ux * 22; A.z = p.pos.z + uz * 22; A.targetX = cx; A.targetZ = cz; }
    else if (slot === 's4') circle(17, 17, 8.5);
    else circle(28, 6, 14);
  } else if (hero === 'WIZARD') {
    if (id === 'dash') { circle(14 + 0.5 * lv.e, 4, 8.5 + 0.4 * (lv.e - 1)); A.shape = Shape.CIRCLE; }
    else if (slot === 'q') circle(28, 7, 11 + 0.6 * (lv.q - 1));
    else if (slot === 's3') ring(4.5);
    else if (slot === 's4') line(26, 1.8);
    else circle(30, 8, 14);
  } else {
    if (id === 'dash') circle(12, 4, 7 + 0.5 * (lv.dash - 1));
    else if (slot === 'q') line(21, 4.6);
    else if (slot === 'e') ring(7.5 + 0.3 * (lv.e - 1));
    else if (slot === 's3') line(37 + 2 * (lv.s3 - 1), 5.6);
    else ring(12);
  }
  A.castable = isCastable(id);
}

// ------------------------------------------------------------ firing --
function autoTarget(): { x: number; z: number } | null {
  const p = world.player;
  const lk = lockedEnemy();
  if (lk && (lk.pos.x - p.pos.x) ** 2 + (lk.pos.z - p.pos.z) ** 2 < 30 * 30) return { x: lk.pos.x, z: lk.pos.z };
  if (autoAim.id >= 0) { const e = world.enemies[autoAim.id]; if (e.active && e.state !== 'DYING') return { x: e.pos.x, z: e.pos.z }; }
  const e = findNearestEnemy(p.pos.x, p.pos.z, 26);
  return e ? { x: e.pos.x, z: e.pos.z } : null;
}

/** Point in front of the hero: the locked / nearest enemy inside a ~35 deg cone of the facing, else 12 units ahead. */
function facingPoint(): { x: number; z: number } {
  const p = world.player;
  const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
  const t = autoTarget();
  if (t) {
    const dx = t.x - p.pos.x, dz = t.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5 && d < 30 && (dx * fx + dz * fz) / d > 0.82) return { x: p.pos.x + fx * d, z: p.pos.z + fz * d };
  }
  return { x: p.pos.x + fx * 12, z: p.pos.z + fz * 12 };
}

function fire(id: string, how: 'AIM' | 'CURSOR' | 'AUTO' | 'FACING', ax = 0, az = 0): void {
  const p = world.player;
  aimOverride.on = false;
  let auto = false;
  castHold.t = pressAt[id] ? Math.max(0, (performance.now() - pressAt[id]) / 1000) : 0;
  pressAt[id] = 0;
  if (how === 'AIM') { aimOverride.on = true; aimOverride.x = ax; aimOverride.z = az; }
  else if (how === 'FACING') {   // skills always go at the targeted (locked / auto-aimed / nearest) enemy; the dash keeps the facing
    const t = id === 'dash' ? null : autoTarget(), f = t ?? facingPoint();
    aimOverride.on = true; aimOverride.x = f.x; aimOverride.z = f.z;
  }
  else if (how === 'CURSOR') { aimOverride.on = true; aimOverride.x = p.aim.x; aimOverride.z = p.aim.z; }
  else {
    const t = autoTarget();
    if (t) { aimOverride.on = true; aimOverride.x = t.x; aimOverride.z = t.z; }
    auto = true;
  }
  if (id === 'dash') tryDash(auto || how === 'AUTO');
  else if (id === 'ult') castUlt();
  else castActive(id === 's1' ? 0 : id === 's2' ? 1 : 2);
  aimOverride.on = false;
}

function begin(id: string, touch: boolean): void {
  aimState.active = true; aimState.id = id; aimState.touch = touch; aimState.startedAt = performance.now(); aimState.cancelZone = false;
  shapeFor(id, world.player.aim.x, world.player.aim.z);
}

function press(id: string): void {
  // Default: skills and dash go where the hero is FACING (setting aimAtCursor restores mouse aiming).
  if (!(useGameStore.getState().settings as { aimAtCursor?: boolean }).aimAtCursor) { fire(id, 'FACING'); return; }
  const m = mode();
  if (!aimable(id) || m !== 'AIMED') { fire(id, m === 'AUTO' ? 'AUTO' : 'CURSOR'); return; }
  begin(id, false);
}

/** Per-frame input pump (called from player.ts). Handles keyboard hold/release and touch drag-casting. */
export function updateSkillInput(): void {
  const inp = world.input, p = world.player;
  // ---- cancel (right-click / Esc set inp.cancelAim)
  if (inp.cancelAim) { inp.cancelAim = false; if (aimState.active) { cancelAim(); } }

  // ---- keyboard
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const [code, id] = SKILL_KEYS[i];
    const down = !!inp.keys[code];
    const was = !!held[code];
    held[code] = down;
    if (down && !was) {
      // a fresh press after a cancel must be released first (down edge only)
      pressAt[id] = performance.now();
      press(id);
      if (!aimState.active) pressAt[id] = 0;   // fired on the press: any further hold is read live (slotHeld)
    } else if (!down && was) {
      if (aimState.active && aimState.id === id && !aimState.touch) {
        aimState.active = false;
        fire(id, 'AIM', aimState.targetX, aimState.targetZ);
      }
    }
  }

  // ---- touch drag-cast
  const T = inp.touchAim;
  if (T.active && !lastTouch.active) {
    lastTouch.active = true; lastTouch.maxMag = 0; lastTouchFired.on = false;
    // hold skills fire at touch-down so keeping the button pressed charges / sustains them
    if (holdSkill(T.id)) { fire(T.id, 'AUTO'); lastTouchFired.on = true; }
  }
  if (lastTouchFired.on) {
    if (!T.active) { lastTouch.active = false; lastTouchFired.on = false; }
  } else {
  if (T.active) {
    lastTouch.maxMag = Math.max(lastTouch.maxMag, T.mag);
    if (aimable(T.id) && lastTouch.maxMag > 0.14) {
      if (!aimState.active || !aimState.touch) { aimState.active = true; aimState.touch = true; aimState.id = T.id; }
      const m = Math.max(0.05, T.mag);
      const len = Math.hypot(T.dx, T.dz) || 1;
      const reach = 30 * Math.min(1, m);
      camRel(T.dx / len, T.dz / len, _td);
      shapeFor(T.id, p.pos.x + _td.x * reach, p.pos.z + _td.z * reach);
      aimState.cancelZone = T.cancel;
    }
  } else if (lastTouch.active) {
    lastTouch.active = false;
    const wasAiming = aimState.active && aimState.touch;
    const id = T.id;
    aimState.active = false;
    if (T.cancel || (wasAiming && T.mag < 0.12)) { /* cancelled */ }
    else if (wasAiming) fire(id, 'AIM', aimState.targetX, aimState.targetZ);
    else fire(id, 'AUTO'); // quick tap = smart cast at the auto-target
  }
  }

  // ---- refresh the desktop indicator while holding
  if (aimState.active && !aimState.touch) shapeFor(aimState.id, p.aim.x, p.aim.z);

  autoSkills();
}

// ------------------------------------------------------------ auto skills --
// Setting `autoSkills`: casts 1/2/3 (and the ult) by itself at the auto-target. Dash always stays manual.
// Skills fire one at a time (short gap) only when enemies are in reach; the ult waits for a boss or a crowd.
const AUTO_IDS = ['s1', 's2', 's3'] as const;
const autoState = { next: 0, i: 0 };
const nearOut: number[] = [];
function countNear(r: number): number {
  const p = world.player, ids = world.enemyGrid.query(p.pos.x, p.pos.z, r, nearOut);
  let n = 0;
  for (let i = 0; i < ids.length; i++) { const e = world.enemies[ids[i]]; if (e.active && e.state !== 'DYING' && e.state !== 'SPAWN') n++; }
  return n;
}
function autoSkills(): void {
  const st = useGameStore.getState();
  if (!(st.settings as { autoSkills?: boolean }).autoSkills || aimState.active) return;
  const p = world.player;
  if (autoState.next > world.time + 2) autoState.next = 0;   // (stale stamp from before a world.time reset, e.g. a town visit)
  if (!p.alive || world.time < autoState.next) return;
  autoState.next = world.time + 0.25;
  if (isCastable('ult')) {
    const boss = findNearestEnemy(p.pos.x, p.pos.z, 24);
    if ((boss && boss.boss) || countNear(14) >= 6) { fire('ult', 'AUTO'); autoState.next = world.time + 1.2; return; }
  }
  for (let k = 0; k < AUTO_IDS.length; k++) {
    const id = AUTO_IDS[(autoState.i + k) % AUTO_IDS.length];
    if (!isCastable(id)) continue;
    const reach = aimable(id) ? 20 : 7; // self-centred skills need enemies close
    if (!findNearestEnemy(p.pos.x, p.pos.z, reach)) continue;
    fire(id, 'AUTO');
    autoState.i = (autoState.i + k + 1) % AUTO_IDS.length;
    autoState.next = world.time + 0.7;
    return;
  }
}
