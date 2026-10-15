// Ground height under a point in the town (the raised castle terrace + its stairs, engine/townData.townLift).
// Zero everywhere else (runs, the castle hall, the cave): the engine keeps y = 0, renderers add this on top.
import { world } from '../engine/world';
import { townLift } from '../engine/townData';
import { useGameStore } from '../store';
import { GameStatus } from '../types';

export function liftAt(x: number, z: number): number {
  if (world.village.area !== 'TOWN' || useGameStore.getState().status !== GameStatus.MENU) return 0;
  return townLift(x, z);
}
