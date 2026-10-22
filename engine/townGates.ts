// ============================================================================
// Story gates: a few outlying corners of the kingdom start blocked by a cute physical blocker (flooded-road barricade, cave-in
// rubble, fallen tree, thorny brambles) and open as the MAIN story advances, so the world unfolds with the tale. Pure data +
// pure helpers (no three / React / store): the open state is DERIVED from the saved story step , so refreshes, new sessions and old saves are always consistent and need no save of their own.
//   engine/systems/townGatesLogic.ts   colliders, prompts, unlock announcement (runtime)
//   render/TownGates.tsx               the blockers' meshes + the removal animation
//   ui/hud/Minimap.tsx                 draws the closed ones
// Rules the data must keep (checked by gateSelfCheck in the logic module): a gate never sits on a path the main story needs at
// or before the step it is still closed (shops, NPCs, doors, the portal, home), and its prompt is never within reach of a shop /
// door prompt (one prompt at a time, village.MAX_NEARBY).
// ============================================================================
import { storyIdx } from '../story';

export type GateId = 'beach' | 'cave' | 'tower' | 'hermit';
export type GateKind = 'barricade' | 'rubble' | 'tree' | 'bramble';
export interface GateDef {
  id: GateId;
  kind: GateKind;
  /** pill label (verb is always "Look") */
  name: string;
  /** main-story step id: the gate is open once the story has REACHED that step (= the step before it is done) */
  opens: string;
  /** the blocked line [x1, z1, x2, z2] (colliders along it; the prompt reaches PROMPT_R from it) */
  span: [number, number, number, number];
  /** side the sign + pile face: world yaw (the sign's front points along (sin yaw, cos yaw)) */
  yaw: number;
  /** collider override [x, z, r] (default: circles along the span) */
  cols?: [number, number, number][];
  /** extra invisible collider lines [x1, z1, x2, z2] that plug the small gaps between the props round the visible blocker (physical leaks found by the QA flood fill) */
  plugs?: [number, number, number, number][];
  /** blocks a DOOR, not a road: the door pill is replaced by the Look pill and the hero may walk round it (the Tower door, the cave mouth) */
  door?: boolean;
  /** what the hero reads when pressing E on the blocker */
  line: string;
  /** notification when it opens */
  done: string;
}

/** Look pill reach (m from the blocked line). */
export const GATE_PROMPT_R = 3.0;
const R = 0.9, STEP = 1.2;

export const TOWN_GATES: readonly GateDef[] = [
  {   // the dirt road to the lakeside beach is only ~4 m wide between two tree groves: a flooded-road barricade across it
    id: 'beach', kind: 'barricade', name: 'Flooded road', opens: 'wolves',
    span: [-37, 49.6, -37, 55.2], yaw: Math.PI / 2,
    plugs: [[-37, 46.4, -37, 48.6], [-37, 39.4, -37, 41.4], [-37, 58.4, -37, 61.6]],
    line: 'The lake road is flooded and fenced off. "Water will drain after the Meadow trial," says the sign. Maybe try the Greenwood first?',
    done: 'The flood drained: the road to the beach is open!',
  },
  {   // a cave-in piled up in front of the mine mouth (the camp itself stays open: Mining Supplies is there)
    id: 'cave', kind: 'rubble', name: 'Cave-in', opens: 'report2',
    span: [70.2, 9.5, 74.6, 9.5], yaw: 0, door: true,
    cols: [[71.2, 9.3, 1.0], [73.6, 9.3, 1.0], [72.4, 10.0, 1.0]],
    line: 'Cave-in! The miners say they will dig it out once Elderroot stops shaking the hills. Defeat the Greenwood\'s guardian first.',
    done: 'The miners dug out the cave-in: the Crystal Cave is open!',
  },
  {   // the Endless Tower: a great tree has fallen across its door (the forest is open ground, so it blocks the DOOR; the Daily / Waves / Tower windows
      // also open from the HUD corner icons anywhere in town, so nothing else is cut off)
    id: 'tower', kind: 'tree', name: 'Fallen tree', opens: 'wren', door: true,
    span: [1.2, 150.2, 8.8, 150.2], yaw: Math.PI,
    line: 'A giant tree has fallen across the Endless Tower\'s door. The King\'s woodcutters will clear it once you report Elderroot\'s fall.',
    done: 'The woodcutters cleared the fallen tree: the Endless Tower is open!',
  },
  {   // the narrow back trail round the north-east corner to Old Wend: overgrown brambles
    id: 'hermit', kind: 'bramble', name: 'Thorny brambles', opens: 'lysa2',
    span: [46.8, -27, 52.6, -27], yaw: 0,
    line: 'Thick thorny brambles choke the hermit\'s trail. Maybe they will wither once the Marble Halls are cleared.',
    done: 'The brambles withered away: the hermit\'s trail is open!',
  },
];
export const GATE_BY_ID: Readonly<Record<GateId, GateDef>> = Object.fromEntries(TOWN_GATES.map((g) => [g.id, g])) as Record<GateId, GateDef>;

/** Open state of every gate (live copy, kept in sync with the store by townGatesLogic / npcQuestLogic via syncGateFlags). Starts open. */
export const gateFlags: Record<GateId, boolean> = { beach: true, cave: true, tower: true, hermit: true };
/** Pure rule: is `g` open at story step `step`? */
export const gateOpenAt = (g: GateDef, step: number): boolean => step >= storyIdx(g.opens);
/** Recomputes every flag; returns a bitmask of the gates whose state CHANGED (bit i = TOWN_GATES[i]). */
export function syncGateFlags(step: number): number {
  let ch = 0;
  TOWN_GATES.forEach((g, i) => { const o = gateOpenAt(g, step); if (gateFlags[g.id] !== o) { gateFlags[g.id] = o; ch |= 1 << i; } });
  return ch;
}
/** Bitmask of the CLOSED gates (cache key for the minimap bake and the quest markers). */
export function gateMask(): number { let m = 0; TOWN_GATES.forEach((g, i) => { if (!gateFlags[g.id]) m |= 1 << i; }); return m; }

/** Collider circles [x, z, r] of a gate. */
export function gateColliders(g: GateDef): [number, number, number][] {
  if (g.cols) return g.cols;
  const out: [number, number, number][] = [];
  for (const [x1, z1, x2, z2] of [g.span, ...(g.plugs ?? [])]) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / STEP));
    for (let i = 0; i <= n; i++) out.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, R]);
  }
  return out;
}
/** Squared distance from (x, z) to the gate's blocked line. */
export function gateDist2(g: GateDef, x: number, z: number): number {
  const [x1, z1, x2, z2] = g.span, dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)), px = x1 + dx * t - x, pz = z1 + dz * t - z;
  return px * px + pz * pz;
}
