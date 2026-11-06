// ============================================================================
// Ignar's creeping lava (owner 2026-10-31): "the longer the fight, the more floor turns to lava".
// His arena STARTS at ~15% lava hugging the rim (lavaFloor.rimPools) and grows toward LAVA_CAP: the target coverage follows fight time AND the boss's
// lost HP (a fast kill sees less lava; ~60% at ~35-40% HP of the burning form). Every LAVA_EVERY seconds of the fight two new lava patches (a main pool +
// 2 satellites, planned by lavaFloor.planLavaPatch: spreading out from the existing lava or the arena edge, never on the arrival keep zone, the
// bare lane from the arrival spot to the middle, or the centre) are marked with an orange telegraph for LAVA_WARN s and then become lava
// (lavaFloor.addLavaDisc: the burn grid changes at once, render/Room.tsx re-rasterises the ground mask). Stops at LAVA_CAP of the floor.
// Paused during any invulnerable phase (the Floor is Lava phase owns the floor then; pending patches wait). No allocation per frame.
// ============================================================================
import { world } from '../world';
import type { Enemy } from '../types';
import { lava, BOSS_LAVA_START, planLavaPatch, addLavaDisc, lavaCoverage, type LDisc } from '../lavaFloor';
import { spawnTelegraphCircle } from './enemies';
import { BT } from './bossFx';
import { bp } from './bossPhaseState';
import { S } from './bosses2';
import { mulberry32 } from '../mapgen';

const LAVA_FIRST = 3, LAVA_EVERY = 2.0, LAVA_WARN = 2.2, LAVA_CAP = 0.45, LAVA_BASE = BOSS_LAVA_START, PATCHES = 3, MAXQ = 16, T_FULL = 110;
const plan: LDisc[] = [];
const q = Array.from({ length: MAXQ }, () => ({ on: false, x: 0, z: 0, r: 0, t: 0 }));
export const ignarLava = { id: -1, t: 0, batches: 0, start: 0, cov: 0, fight: 0, want: 0, log: [] as number[] };
let rnd = mulberry32(1);

export function resetIgnarLava(): void {
  ignarLava.id = -1; ignarLava.t = 0; ignarLava.batches = 0; ignarLava.fight = 0; ignarLava.want = 0; ignarLava.log.length = 0;
  for (const s of q) s.on = false;
}

/** Called every frame from Ignar's AI (bosses2.warlord). */
export function tickIgnarLava(e: Enemy, dt: number): void {
  if (!lava.on || e.state === 'SPAWN' || e.state === 'DYING') return;
  if (ignarLava.id !== e.id) {
    resetIgnarLava(); ignarLava.id = e.id; ignarLava.t = LAVA_FIRST; ignarLava.start = ignarLava.cov = lavaCoverage();
    rnd = mulberry32((world.room.seed ?? 7) ^ 0x1a9a7);
  }
  if (bp.on) return;   // (an invulnerable phase: the floor belongs to it; timers and pending patches wait)
  // pending patches turn to lava when their telegraph ends
  for (let i = 0; i < MAXQ; i++) {
    const s = q[i];
    if (!s.on) continue;
    s.t -= dt;
    if (s.t <= 0) { s.on = false; addLavaDisc(s.x, s.z, s.r); }
  }
  ignarLava.fight += dt;
  // wanted coverage: 15% -> 65% by a mix of elapsed time (60%, full at 110 s) and HP lost (70%, over both forms; the burning form is the second half)
  const hpLost = e.maxHp > 0 ? 1 - Math.max(0, e.hp) / e.maxHp : 0, hpP = S.enraged ? 0.5 + hpLost * 0.5 : hpLost * 0.5;
  const prog = Math.min(1, 0.6 * Math.min(1, ignarLava.fight / T_FULL) + 0.7 * Math.min(1, hpP / 0.8));
  ignarLava.want = LAVA_BASE + (LAVA_CAP - LAVA_BASE) * prog;
  ignarLava.t -= dt;
  if (ignarLava.t > 0) return;
  ignarLava.t = LAVA_EVERY;
  let pend = 0; for (let i = 0; i < MAXQ; i++) if (q[i].on) pend++;
  if (pend > 0) return;
  ignarLava.cov = lavaCoverage();
  if (ignarLava.cov >= LAVA_CAP - 0.015 || ignarLava.cov >= ignarLava.want) return;   // (a batch adds ~2-3%: this keeps the total at or under the cap)
  let n = 0;
  for (let k = 0; k < PATCHES; k++) {
    if (planLavaPatch(plan, rnd) === 0) continue;
    for (let j = 0; j < plan.length; j++) {
      const d = plan[j];
      let slot = -1; for (let i = 0; i < MAXQ; i++) if (!q[i].on) { slot = i; break; }
      if (slot < 0) break;
      const s = q[slot]; s.on = true; s.x = d.x; s.z = d.z; s.r = d.r; s.t = LAVA_WARN;
      const zn = spawnTelegraphCircle(d.x, d.z, d.r, LAVA_WARN, 0, 0xff5a1a);
      if (zn) zn.trick = BT.VISUAL;
      n++;
    }
    // patches planned in one batch must not overlap each other: apply the first to the grid's keep via a quick probe is overkill; they are
    // simply allowed to merge (it is lava either way)
  }
  if (n > 0) { ignarLava.batches++; ignarLava.log.push(Math.round(ignarLava.cov * 1000) / 10); }
}

if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {   // QA: `__ignarLava.state()`
  (window as unknown as Record<string, unknown>).__ignarLava = {
    state: () => ({ fight: ignarLava.fight, want: ignarLava.want, id: ignarLava.id, t: ignarLava.t, batches: ignarLava.batches, start: ignarLava.start, cov: lavaCoverage(), log: ignarLava.log.slice(), on: lava.on }),
  };
}
