// Co-op (STEP 3): the world's global mechanics (void fields, boss mechanics / phases, dark heroes, human bosses, room traps, biome hazards, boss breath / waves)
// used to look only at `world.player`. With a partner there are TWO heroes: the host's own and the guest's stand-in (`coopRoom.ally`, a PlayerRuntime that follows
// his position). `forEachHero(fn)` runs a hero-effect block once per living hero with `world.player` pointing at that hero for the call, so the existing
// `damagePlayer / applyPlayerDebuff / knockHero / freezePlayer / slowHero` calls inside it land on the right one: for the stand-in, combat.ts forwards the blow to the
// guest (HIT / DEBUF / KNOCK) and HE applies it with his own defence. Solo (no stand-in) it is exactly one plain call: nothing changes for a single player.
// Only wrap the "is this hero inside the area? -> hurt him" part, never timers / spawns (they must run once per frame).
// (enemies.updateEnemies temporarily swaps `world.player` to the stand-in while a monster targeting him updates, so the host hero is the constant below.)
import { world } from './world';
import { coopRoom } from '../net/coopRoom';
import type { PlayerRuntime } from './types';

const HOST: PlayerRuntime = world.player;

/** `fn(p)` for each living hero (host hero, then the partner's stand-in); `world.player` is `p` during the call. Solo: one plain call for `world.player`. */
export function forEachHero(fn: (p: PlayerRuntime) => void): void {
  const cur = world.player, a = coopRoom.ally;
  if (!a || !a.alive) { fn(cur); return; }
  try {
    if (HOST.alive) { world.player = HOST; fn(HOST); }
    world.player = a; fn(a);
  } finally { world.player = cur; }
}

/** The living hero nearest to (x, z): `world.player` solo, the nearer of the two in co-op (a downed / dead hero is skipped unless nobody is up). */
export function nearestHero(x: number, z: number): PlayerRuntime {
  const a = coopRoom.ally;
  if (!a || !a.alive) return world.player;
  if (!HOST.alive) return a;
  return (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2 < (HOST.pos.x - x) ** 2 + (HOST.pos.z - z) ** 2 ? a : HOST;
}

/** A random living hero (co-op: either of the two, solo: `world.player`). */
export function randomHero(): PlayerRuntime {
  const a = coopRoom.ally;
  if (!a || !a.alive) return world.player;
  if (!HOST.alive) return a;
  return Math.random() < 0.5 ? a : HOST;
}

/** A living hero within `r` of (x, z) (the nearest one), or null. Solo: `world.player` when he is alive and inside. */
export function heroNear(x: number, z: number, r: number): PlayerRuntime | null {
  const a = coopRoom.ally, c = world.player;
  let best: PlayerRuntime | null = null, bd = r * r;
  if (!a || !a.alive) { const d = (c.pos.x - x) ** 2 + (c.pos.z - z) ** 2; return c.alive && d < bd ? c : null; }
  if (HOST.alive) { const d = (HOST.pos.x - x) ** 2 + (HOST.pos.z - z) ** 2; if (d < bd) { bd = d; best = HOST; } }
  const d2 = (a.pos.x - x) ** 2 + (a.pos.z - z) ** 2; if (d2 < bd) best = a;
  return best;
}

/** Runs `fn` with `world.player` pointing at `h` (so combat.damagePlayer & co. route a blow to the right hero). */
export function asHero(h: PlayerRuntime, fn: () => void): void {
  const cur = world.player;
  if (cur === h) { fn(); return; }
  world.player = h;
  try { fn(); } finally { world.player = cur; }
}

/** true for the guest's stand-in (the per-hero timers / once-per-phase flags of a mechanic use a second slot for him) */
export const isAlly = (p: PlayerRuntime): boolean => p === coopRoom.ally;
