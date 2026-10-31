// ============================================================================
// The road to the Void Herald (adventure mode, the last biome): the Void ends in the Gatekeeper's courtyard instead of a boss
// door. Five trial gates stand in a ring around it; each trial is 1-2 short rooms and ends in a Gate Key fragment.
// All five fragments open the sealed Dark Castle, where the Void Herald waits on the Void Throne (director.finalFight).
// Pure data + the run's gate state; the director drives the flow, render/SpecialRooms.tsx draws the courtyard.
// ============================================================================
import type { RoomPlan, RoomObjective, RoomTwist, RoomType, RewardKind } from './types';

export interface GateStep { type: RoomType; reward: RewardKind; obj?: RoomObjective; twist?: RoomTwist }
export interface GateDef { id: string; name: string; sub: string; color: string; steps: GateStep[] }

export const GATE_KEYS_NEEDED = 5;
export const GATES: readonly GateDef[] = [
  { id: 'SHADOW', name: 'Gate of Shadows', sub: 'Duel your own dark reflection', color: '#b06cff', steps: [{ type: 'DUEL', reward: 'CARD' }] },
  { id: 'HORDE', name: 'Gate of the Horde', sub: 'Two waves, then hold the totem', color: '#ef6a5e', steps: [{ type: 'COMBAT', reward: 'CARD' }, { type: 'COMBAT', reward: 'GEMS', obj: 'DEFEND' }] },
  { id: 'THORNS', name: 'Gate of Thorns', sub: 'A spike-trap gauntlet', color: '#f2a93b', steps: [{ type: 'COMBAT', reward: 'GOLD', twist: 'TRAPS' }, { type: 'ELITE', reward: 'CARD', twist: 'TRAPS' }] },
  { id: 'HUNT', name: 'Gate of the Hunt', sub: 'Mark and slay in the dark', color: '#5fd6a0', steps: [{ type: 'COMBAT', reward: 'CARD', obj: 'HUNT', twist: 'DARK' }] },
  { id: 'ECHOES', name: 'Gate of Echoes', sub: 'Two champions of the Void, the second in the dark', color: '#ff4d6d', steps: [{ type: 'ELITE', reward: 'CARD' }, { type: 'ELITE', reward: 'GEMS', twist: 'DARK' }] },
];

/** This run's gate progress. `cur` = the trial being walked (-1 = none). */
export const gateState = { on: false, done: [false, false, false, false, false], keys: 0, cur: -1, visits: 0 };

export function resetGates(): void {
  gateState.on = false; gateState.keys = 0; gateState.cur = -1; gateState.visits = 0;
  for (let i = 0; i < gateState.done.length; i++) gateState.done[i] = false;
}

/** The plan of trial `gate`, room `step`. */
export function gatePlan(gate: number, step: number): RoomPlan {
  const s = GATES[gate].steps[step];
  const p: RoomPlan = { type: s.type, reward: s.reward, gate, step };
  if (s.obj) p.obj = s.obj;
  if (s.twist) p.twist = s.twist;
  return p;
}
export const isLastStep = (p: RoomPlan): boolean => p.gate !== undefined && (p.step ?? 0) >= GATES[p.gate].steps.length - 1;
export const hallPlan = (): RoomPlan => ({ type: 'HALL', reward: 'NONE' });
export const hubPlan = (): RoomPlan => ({ type: 'GATEKEEPER', reward: 'NONE' });

/** Courtyard layout (round room, forward = -z): the castle door at the back, five gates on a ring around the middle. */
export const HUB_R = 28;
export const CASTLE_DOOR: [number, number] = [0, -25.2];
export const KEEPER_POS: [number, number] = [0, -13];
export const HUB_START: [number, number] = [0, 6];
/** Gate i position + facing (yaw towards the centre). Gates sit at 60, 120, 180, 240, 300 degrees (the castle takes 0). */
export function gatePos(i: number, out: [number, number]): number {
  const a = ((i + 1) / 6) * Math.PI * 2, r = 19.5;
  out[0] = Math.sin(a) * r; out[1] = -Math.cos(a) * r;
  return Math.atan2(-out[0], -out[1]);
}

/** The Hall of the Undying (forward = -z): a narrow dark hall from the Dark Castle door to the purple portal into the Void Throne. */
export const HALL_HL = 66, HALL_HW = 8;                 // walkable half length / half width (m)
export const HALL_START_Z = 59, HALL_PORTAL_Z = -57;      // arrival / the portal at the far end
export const GATEKEEPER_LINES = [
  'Five gates, five trials. Each holds a shard of the key that seals the Dark Castle.',
  'Bring me all five shards and the castle will open. The Void Herald waits on the stolen throne.',
  'Rest here between trials; my flame mends what the gates break.',
];
