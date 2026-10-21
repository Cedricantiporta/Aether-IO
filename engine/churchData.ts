// ============================================================================
// Chapel interior (the village "CHURCH" area): layout + collision circles (pure data, no three / no React).
// Centred on the world origin like the castle hall (the town is not drawn inside). Door at the south end (+z), altar in
// the apse at the north end (-z). Read by render/ChurchInterior.tsx, engine/systems/village.ts, questNav, Minimap.
// ============================================================================
import { CHURCH } from './townData';

export const NAVE = { hw: 7, hd: 12, h: 8 };
/** Raised altar step at the north end. */
export const APSE = { hw: 3.6, z0: -12, z1: -8.6, h: 0.35 };
export const CHURCH_SPAWN = { x: 0, z: 9.6 };
export const CHURCH_EXIT = { x: 0, z: 11.6, r: 3.6 };
/** The chapel door in the town (the door sits 0.9 right of the chapel's centre line, see TownScenery buildChurch). */
export const CHURCH_DOOR = { x: CHURCH.x + 0.9, z: CHURCH.z + CHURCH.d / 2 + 1.7, r: 3.6 };
/** Where the hero stands after walking out of the chapel (facing the town). */
export const CHURCH_OUT = { x: CHURCH.x + 0.9, z: CHURCH.z + CHURCH.d / 2 + 3.2 };
/** Pew rows (z of each row); pews run along x on both sides of the aisle, PEW_X = centre x of the right-hand pew. */
export const PEW_Z = [-4.6, -2.3, 0, 2.3, 4.6, 6.9];
export const PEW_X = 3.5, PEW_HL = 2.2;
/** Side door in the west wall, out to the graveyard (inside: the exit pill + where you appear coming in from the yard). */
export const CHURCH_SIDE_EXIT = { x: -6.0, z: -7.4, r: 2.4 };
export const CHURCH_SIDE_SPAWN = { x: -5.4, z: -7.4 };
/** Pew seats (the sitter faces the altar, -z): two per pew. */
export const PEW_SEATS: { x: number; z: number; yaw: number; y: number }[] = [];
for (const z of PEW_Z) for (const sx of [-1, 1]) for (const o of [-1.0, 1.0]) PEW_SEATS.push({ x: sx * PEW_X + o, z: z + 0.05, yaw: Math.PI, y: 0.56 });
export const NAVE_PILLARS: [number, number][] = [];
for (const x of [-6, 6]) for (const z of [-6, 0, 6]) NAVE_PILLARS.push([x, z]);

/** Potted plants (visual + colliders): by the door and either side of the altar. */
export const CHURCH_PLANTS: [number, number][] = [[-5.6, 10.4], [5.6, 10.4], [-5.5, -10.9], [5.5, -10.9]];

export const CHURCH_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  const { hw, hd } = NAVE;
  for (let x = -hw - 0.5; x <= hw + 0.6; x += 1.1) { c.push([x, -hd - 0.6, 1.1], [x, hd + 0.6, 1.1]); }
  for (let z = -hd; z <= hd; z += 1.1) { c.push([hw + 0.6, z, 1.1]); if (Math.abs(z + 7.4) > 1.2) c.push([-hw - 0.6, z, 1.1]); else c.push([-hw - 1.8, z, 1.1]); }
  for (const [x, z] of NAVE_PILLARS) c.push([x, z, 0.8]);
  for (const z of PEW_Z) for (const sx of [-1, 1]) for (let d = -PEW_HL + 0.4; d <= PEW_HL - 0.39; d += 0.9) c.push([sx * PEW_X + d, z, 0.5]);
  c.push([0, -10.6, 1.4], [-1.2, -10.6, 1.0], [1.2, -10.6, 1.0]);   // altar
  for (const sx of [-1, 1]) c.push([sx * 2.7, -9.4, 0.45]);          // candle stands
  for (const [x, z] of CHURCH_PLANTS) c.push([x, z, 0.5]);           // potted plants
  // (the west wall chain has a gap for the side door; see the wall loop above)
  return c;
})();
