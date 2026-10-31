// ============================================================================
// TIDE HYDRA signature: HEADS OF THE HYDRA (docs/BOSS_DESIGN_REFERENCE.md, pattern 31 = Hades' Bone Hydra).
// At 70% / 35% hp (the shared invulnerable-phase trigger, bossPhases.ts, owner = `bp`, kind 'HEADS') the body turns immune and THREE extra heads
// surface one row inside the rim. Each has its own attack (acid fan / water jet lanes / head slam on a marked circle). Cutting one head
// down opens a 5 s EXPOSED window: the body drops its ward, takes x1.5 damage and the five rim heads stop shielding it. The phase ends when all
// three heads are down (and the last window ran out) or after PHASE_MAX seconds (the heads sink back, no reward).
// Host-only state `HX`; a co-op guest reads `bp` (synced by net/coopHaz.ts: on / immune / count) and the heads are ordinary synced enemies.
// No per-frame allocation: three fixed head slots, module scratch.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import type { Enemy } from '../types';
import { spawnEnemy, spawnTelegraphLine } from './enemies';
import { bp } from './bossPhaseState';
import { BT, stat } from './bossFx';
import { S, FIGHT_REF_S, headAnchor, circle, pwr, notify, poofAdd, headAcidFan, slamHead, cancelSlam, clampArena } from './bosses2';

/** Slots 0..4 are the five rim heads; headAnchor puts the spare slots one row further in. */
export const SPARE_SLOTS = [5, 6, 9] as const, SPARE_N = 3;   // head slots (= enemy pattern) of the spare heads; NOT 7 / 8 (enemies.ts MINI flags)
/** Seconds of the damage window one head kill opens, the damage multiplier inside it, target seconds to fell a spare head (reference hero: body in FIGHT_REF_S s), the phase cap. */
export const EXPOSE_T = 5, EXPOSE_MUL = 1.5, SPARE_KILL_S = 4.5, PHASE_MAX = 28, SURFACE_T = 1.6;

export const HX = {
  on: false, t: 0, expT: 0,
  ids: [-1, -1, -1] as number[], dead: [false, false, false] as boolean[],
  kills: 0, windows: 0, phases: 0, noKill: 0,
};
const tv = new Vector3();
const ha = { x: 0, z: 0 };

export function headsReset(): void {
  HX.on = false; HX.t = 0; HX.expT = 0; HX.kills = 0; HX.windows = 0; HX.phases = 0; HX.noKill = 0;
  for (let i = 0; i < SPARE_N; i++) { HX.ids[i] = -1; HX.dead[i] = false; }
}
export const headsPhaseOn = (): boolean => HX.on;
/** Damage multiplier of the body while a head window is open (1 = closed). */
export const hydraExposeMul = (): number => (HX.on && HX.expT > 0 ? EXPOSE_MUL : 1);

/** Called by bossPhases.begin for kind 'HEADS': the three spare heads surface now (they rise during the banner). */
export function headsBegin(b: Enemy): void {
  HX.on = true; HX.t = 0; HX.expT = 0; HX.phases++; HX.kills = 0;
  bp.count = -1;
  for (let i = 0; i < SPARE_N; i++) {
    const k = SPARE_SLOTS[i];
    headAnchor(b, k, ha);
    tv.set(ha.x, 0, ha.z); clampArena(tv, 2);
    const h = spawnEnemy('BOSS_HYDRA_HEAD', tv);
    HX.dead[i] = !h; HX.ids[i] = h ? h.id : -1;
    if (!h) continue;
    // hp so that a hero who would kill the BODY in ~130 s (the balance reference) fells a spare head in ~SPARE_KILL_S s: the body's armour (level term) and the head's differ, so scale by both
    h.pattern = k; h.attackCd = SURFACE_T + 0.5 + i * 1.3; h.armor = Math.round(h.armor * 1.5); h.shield = 0;
    h.maxHp = Math.max(1, Math.round(b.maxHp * (SPARE_KILL_S / FIGHT_REF_S) * ((100 + b.armor) / (100 + h.armor)))); h.hp = h.maxHp;
    S.lungeT[k] = 0;
    events.emit('trick', { pos: h.pos.clone(), kind: 'RAIN_GEYSER', radius: 4 });   // the water boils where a head surfaces
  }
  events.emit('floatText', { pos: b.pos, text: 'THREE NEW HEADS!', color: 0x7dd3fc, scale: 1.4, dy: 6 });
}

/** The phase is over: spare heads that still live sink back (never leave a head behind), the window closes. */
export function headsEnd(): void {
  for (let i = 0; i < SPARE_N; i++) {
    const id = HX.ids[i];
    if (id >= 0) { const h = world.enemies[id]; if (h && h.active && h.kind === 'BOSS_HYDRA_HEAD' && h.pattern === SPARE_SLOTS[i] && h.state !== 'DYING') poofAdd(h); cancelSlam(SPARE_SLOTS[i]); S.lungeT[SPARE_SLOTS[i]] = 0; }
    HX.ids[i] = -1;
  }
  HX.on = false; HX.expT = 0; bp.count = -1;
}

const live = (i: number): Enemy | null => {
  const id = HX.ids[i]; if (id < 0) return null;
  const h = world.enemies[id];
  return h && h.active && h.kind === 'BOSS_HYDRA_HEAD' && h.pattern === SPARE_SLOTS[i] && h.state !== 'DYING' ? h : null;
};

/** bossPhases.tickPhase 'HEADS' branch: watches the three heads, opens / closes the EXPOSED windows, ends the phase. Returns true when the phase should end. */
export function tickHeadsPhase(b: Enemy, dt: number): boolean {
  HX.t += dt;
  let alive = 0;
  for (let i = 0; i < SPARE_N; i++) {
    if (live(i)) { alive++; continue; }
    if (HX.dead[i]) continue;
    HX.dead[i] = true; HX.kills++; HX.windows++;   // a spare head went down: open the damage window
    cancelSlam(SPARE_SLOTS[i]); S.lungeT[SPARE_SLOTS[i]] = 0;
    HX.expT = EXPOSE_T; bp.immune = false; bp.countMax = EXPOSE_T; bp.flash = 0.8;
    events.emit('floatText', { pos: b.pos, text: 'EXPOSED!', color: 0xffe08a, scale: 1.9, dy: 6 });
    events.emit('trick', { pos: b.pos.clone(), kind: 'KIT_EXPOSE|1', radius: b.radius });
    events.emit('shake', { amount: 0.5 });
    notify(`A head falls - the Hydra is EXPOSED for ${EXPOSE_T} s! Hit the body!`, '#ffe08a');
    stat('HeadWindow');
  }
  if (HX.expT > 0) {
    HX.expT -= dt; bp.count = Math.max(0, HX.expT);
    if (HX.expT <= 0) {
      HX.expT = 0; bp.count = -1;
      if (alive > 0) { bp.immune = true; events.emit('floatText', { pos: b.pos, text: 'WARDED', color: 0x93c5fd, scale: 1.1, dy: 5 }); events.emit('trick', { pos: b.pos.clone(), kind: 'KIT_EXPOSE|0', radius: b.radius }); }
    }
  }
  if (HX.t < SURFACE_T) return false;
  if (alive === 0 && HX.expT <= 0) return true;                   // all three down and the last window used up
  if (HX.t >= PHASE_MAX && HX.expT <= 0) { if (HX.kills === 0) HX.noKill++; return true; }   // too slow: the heads sink (no reward)
  return false;
}

/** AI of a spare head (called from bosses2.aiHydraHead): slot 0 = acid fan, 1 = water jet lanes, 2 = head slam. */
export function spareHeadAI(h: Enemy, b: Enemy): void {
  const k = h.pattern, i = SPARE_SLOTS.indexOf(k as 5 | 6 | 9), p = world.player.pos;
  if (!HX.on || i < 0 || h.state === 'SPAWN' || HX.t < SURFACE_T || S.lungeT[k] > 0 || h.attackCd > 0 || !world.player.alive) return;
  if (i === 0) {   // ACID FAN (the rim heads' own attack: a cone of blobs, one on the hero)
    h.attackCd = 4.4 * (0.9 + Math.random() * 0.2);
    headAcidFan(h, b);
  } else if (i === 1) {   // WATER JET: two lanes from the head, aimed at the hero's spot AT WINDUP START (locked), 1.25 s warning, then a lash (slow + knockdown)
    h.attackCd = 5.0 * (0.9 + Math.random() * 0.2);
    const dx = p.x + world.player.vel.x * 0.25 - h.pos.x, dz = p.z + world.player.vel.z * 0.25 - h.pos.z, l = Math.hypot(dx, dz) || 1, a0 = Math.atan2(dx / l, dz / l);
    const n = b.phase >= 2 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      const a = a0 + (j - (n - 1) / 2) * 0.42;
      const zn = spawnTelegraphLine(h.pos.x, h.pos.z, Math.sin(a), Math.cos(a), 56, 3.4, 1.25, 0x4fc3ff);
      if (zn) { zn.trick = BT.LASH; zn.damage = pwr(b) * 1.0; }
    }
    events.emit('trick', { pos: h.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
    stat('HeadJet');
  } else {   // HEAD SLAM: this head crashes onto a marked circle on the hero (pinned to its arrival) and rests there
    h.attackCd = 5.8 * (0.9 + Math.random() * 0.2);
    tv.set(p.x + world.player.vel.x * 0.4, 0, p.z + world.player.vel.z * 0.4); clampArena(tv, 3);
    slamHead(b, k, tv.x, tv.z);
    events.emit('trick', { pos: h.pos.clone(), kind: 'SPIT_CAST', radius: 3 });
    stat('HeadSlam3');
  }
}
