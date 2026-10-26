// Tiny, dependency-free bridge between the co-op session (net/coop.ts) and engine/systems/director.ts, so the director only
// needs a few one-line hooks and no import cycle appears. The director registers `enter` / reads `guest` / calls `onEnter`.
import type { RoomPlan } from '../engine/types';

export interface ForcedRoom { b: number; idx: number; plan: RoomPlan; seed: number }

export const coopRoom = {
  /** true while this player is the GUEST of a co-op run: the director builds the host's rooms, spawns nothing and never clears / rewards. */
  guest: false,
  /** the host's room waiting to be entered (set by the net layer, consumed by director.enterRoom) */
  forced: null as ForcedRoom | null,
  /** director -> net: a room was entered (host sends it to the guest). */
  onEnter: null as ((b: number, idx: number, plan: RoomPlan, seed: number) => void) | null,
  /** director -> net: the host started walking out through a portal. */
  onLeaving: null as (() => void) | null,
  /** net -> director: enter a room now (registered by the director). */
  enter: null as ((b: number, idx: number, plan: RoomPlan) => void) | null,
};
