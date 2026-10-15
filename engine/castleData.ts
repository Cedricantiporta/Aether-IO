// ============================================================================
// Castle interior (throne hall): layout + collision circles (pure data, no three / no React).
// The hall is centred on the world origin (the town scenery is not drawn while the hero is inside).
// Entrance / exit door at the south end (+z), throne on the raised dais at the north end (-z).
// Read by render/CastleInterior.tsx (drawing), engine/systems/village.ts (colliders + pills), engine/townData.ts (NPC homes).
// ============================================================================
export const HALL = { hw: 14, hd: 20, h: 9 };
/** Raised platform at the north end (x +-6, z -20..-13). The King stands on it, the throne sits against the back wall. */
export const DAIS = { hw: 6, z0: -20, z1: -13, h: 0.6 };
export const THRONE_Z = -18.4;
/** Floor height in the hall: the dais top, with a short step-up along its front edge (renderers add it like townLift). */
export function daisLift(x: number, z: number): number {
  if (Math.abs(x) > DAIS.hw || z < DAIS.z0 || z > DAIS.z1 + DAIS_STEP) return 0;
  return z <= DAIS.z1 ? DAIS.h : DAIS.h * (DAIS.z1 + DAIS_STEP - z) / DAIS_STEP;
}
const DAIS_STEP = 0.7;
/** Where the hero appears after walking through the castle door, and the exit-door pill spot. */
export const CASTLE_SPAWN = { x: 0, z: 16.5 };
export const CASTLE_EXIT = { x: 0, z: 19, r: 4.2 };
/** Hero position on the castle steps outside (south of the keep, facing the town). */
export const CASTLE_STEPS = { x: 0, z: -21.2 };
/** Interact spot for the keep door in the town. */
export const CASTLE_DOOR = { x: 0, z: -23.2, r: 4.6 };

export const PILLARS: [number, number][] = [];
for (const x of [-7.5, 7.5]) for (const z of [-8, -1, 6, 13]) PILLARS.push([x, z]);
/** Long tables [x, z, half-length along z]. Benches run on both sides. */
export const TABLES: [number, number, number][] = [[-10.6, 3.5, 3.2], [10.6, 3.5, 3.2]];
export const BRAZIERS: [number, number][] = [[-4.4, -11.6], [4.4, -11.6], [-3.4, 14.5], [3.4, 14.5]];
export const BANNER_Z = [-14, -4, 4, 14];

/** Collision circles [x, z, r]: wall ring, pillars, dais front, throne, tables, braziers, weapon racks. */
export const CASTLE_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = HALL;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) { c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]); }
  for (let z = -hd; z <= hd; z += 1.1) { c.push([-hw - 0.6, z, 1.1], [hw + 0.6, z, 1.1]); }
  for (const [x, z] of PILLARS) c.push([x, z, 0.9]);
  // the dais is open (owner: walk straight up the carpet to the King; daisLift raises the hero onto it); only the throne blocks
  c.push([0, THRONE_Z - 0.3, 1.4]);
  for (const [x, z, hl] of TABLES) { for (let d = -hl; d <= hl + 0.01; d += 1.0) c.push([x, z + d, 0.8]); for (const s of [-1, 1]) for (let d = -hl; d <= hl + 0.01; d += 1.2) c.push([x + s * 1.35, z + d, 0.45]); }
  for (const [x, z] of BRAZIERS) c.push([x, z, 0.55]);
  for (const x of [-12.8, 12.8]) c.push([x, -8, 0.7], [x, -9.2, 0.7], [x, 9.5, 0.7], [x, 10.7, 0.7]);
  return c;
})();
