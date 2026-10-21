// Ground height under a point in the town (the raised castle terrace + its stairs, engine/townData.townLift).
// Zero everywhere else (runs, the castle hall, the cave): the engine keeps y = 0, renderers add this on top.
import { world } from '../engine/world';
import { townLift } from '../engine/townData';
import { daisLift } from '../engine/castleData';
import { hillAt } from '../engine/townHills';
import { useGameStore } from '../store';
import { GameStatus } from '../types';

/** Runs: the stepped round dais under each risen portal arch (render/Room.tsx buildRuinArch: steps r 3.0 / 2.5, tops 0.28 / 0.5, x2.1 for the big biome portal). */
function portalDais(x: number, z: number): number {
  const ps = world.room.portals;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p.active || p.t < 1.25) continue;   // (still rising out of the ground)
    const sc = p.big ? 2.1 : 1, r = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2) / sc;
    if (r >= 3.0) continue;
    return sc * (r < 2.45 ? 0.5 : 0.28);
  }
  return 0;
}

export function liftAt(x: number, z: number): number {
  if (useGameStore.getState().status !== GameStatus.MENU) return portalDais(x, z);
  if (world.village.area === 'CASTLE') return daisLift(x, z);   // the throne dais
  if (world.village.area !== 'TOWN') return 0;
  return townLift(x, z) + hillAt(x, z);
}
