// ============================================================================
// Hand-laid round rooms (no random clutter): the dark hero DUEL ring, the GATEKEEPER courtyard and the FOUNTAIN plaza.
// roomgen.buildRoom hands these types over here. Writes world.obstacles (biome props drawn by render/Props) and the
// collision world; the special set pieces (braziers, gates, castle, marble columns) are drawn by render/SpecialRooms.tsx
// and only get colliders here. Deterministic per seed.
// ============================================================================
import { Vector3 } from 'three';
import { world } from './world';
import { mulberry32, installRoom, commitCrates, type Collider } from './mapgen';
import type { Obstacle, ObstacleKind, RoomType } from './types';
import { biomeOf } from './roomDefs';
import { buildShape, shape, dbg } from './roomShape';
import { HUB_R, CASTLE_DOOR, KEEPER_POS, gatePos } from './gates';

export const isArenaRoom = (t: RoomType): boolean => t === 'DUEL' || t === 'GATEKEEPER' || t === 'FOUNTAIN';
export function arenaRadius(t: RoomType): number { return t === 'GATEKEEPER' ? HUB_R : t === 'DUEL' ? 21 : 19; }
/** Fountain plaza: marble columns ring (radius around the station). */
export const PLAZA_COLS = 8, PLAZA_COL_R = 8.2;
/** Duel ring: braziers stand just inside the pillar ring at this fraction of R. */
export const DUEL_BRAZIERS = 8;

const SPEC: Record<string, { s: [number, number]; r: (s: number) => number }> = {
  TREE: { s: [1.5, 2.4], r: (s) => 0.8 + s * 0.25 }, PINE: { s: [1.5, 2.4], r: (s) => 0.8 + s * 0.25 },
  ROCK: { s: [0.9, 1.7], r: (s) => 0.6 + s * 0.9 }, BOULDER: { s: [1.6, 2.5], r: (s) => 1 + s * 0.7 },
  RUIN: { s: [1, 1.6], r: () => 0.9 }, STATUE: { s: [1, 1.3], r: () => 1.0 }, CRYSTAL_SPIRE: { s: [1.1, 1.9], r: () => 1.0 },
};
const gp: [number, number] = [0, 0];

export function buildArena(biome: number, type: RoomType, R: number, seed: number): void {
  const f = dbg.force; dbg.force = 'ROUND';
  buildShape(type, R, seed);
  dbg.force = f;
  const def = biomeOf(biome);
  const rnd = mulberry32(seed);
  const obstacles: Obstacle[] = [];
  const colliders: Collider[] = [];
  let id = 1;
  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, collide = true): void => {
    obstacles.push({ id: id++, kind, pos: new Vector3(x, 0, z), radius, scale, rot: rnd() * Math.PI * 2, blocksProjectiles: true });
    if (collide) colliders.push({ x, z, r: radius, blocksProjectiles: true });
  };
  const col = (x: number, z: number, r: number): void => { colliders.push({ x, z, r, blocksProjectiles: true }); };
  const border = def.border.filter((k) => k !== 'STUMP' && k !== 'LOG');
  const pickBorder = (): ObstacleKind => (border.length ? border[Math.floor(rnd() * border.length)] : 'ROCK');
  const wallR = shape.baseR + 2.6;

  // ---- walls ring
  const n1 = Math.ceil((Math.PI * 2 * wallR) / (type === 'DUEL' ? 2.9 : 2.7));
  for (let i = 0; i < n1; i++) {
    const a = (i / n1) * Math.PI * 2, x = Math.cos(a) * wallR, z = Math.sin(a) * wallR;
    if (type === 'GATEKEEPER' && z < -18 && Math.abs(x) < 13) continue;   // the castle front closes this arc
    if (type === 'DUEL') { add('RUIN', x, z, 1.6, 1.35); continue; }       // a ring of old stone pillars
    const k = pickBorder(), sp = SPEC[k] ?? SPEC.ROCK, s = sp.s[0] + rnd() * (sp.s[1] - sp.s[0]);
    add(k, x, z, Math.max(1.5, sp.r(s)), s);
  }
  // ---- outer decor ring (no collision)
  const n2 = Math.ceil((Math.PI * 2 * (wallR + 4)) / 5.5);
  for (let i = 0; i < n2; i++) {
    const a = ((i + 0.5) / n2) * Math.PI * 2, rr = wallR + 3.5 + rnd() * 2.5, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (type === 'GATEKEEPER' && z < -20 && Math.abs(x) < 16) continue;
    const k = pickBorder(), sp = SPEC[k] ?? SPEC.ROCK, s = (sp.s[0] + rnd() * (sp.s[1] - sp.s[0])) * 1.25;
    add(k, x, z, sp.r(s), s, false);
  }

  if (type === 'GATEKEEPER') {
    // the castle front: a wall of colliders across the back (the door is at CASTLE_DOOR, entered with E)
    for (let x = -13; x <= 13; x += 1.6) col(x, CASTLE_DOOR[1] - 2.4, 1.3);
    col(0, KEEPER_POS[1], 1.5);   // the Gatekeeper statue
    for (let i = 0; i < 5; i++) {   // each gate: two pillars beside the portal
      const yaw = gatePos(i, gp);
      const px = Math.cos(yaw), pz = -Math.sin(yaw);   // the gate's sideways axis
      col(gp[0] + px * 2.3, gp[1] + pz * 2.3, 0.75); col(gp[0] - px * 2.3, gp[1] - pz * 2.3, 0.75);
    }
  } else if (type === 'FOUNTAIN') {
    const cz = -shape.baseR * 0.1;   // station = stationPos (round room)
    for (let i = 0; i < PLAZA_COLS; i++) { const a = (i / PLAZA_COLS) * Math.PI * 2 + Math.PI / PLAZA_COLS; col(Math.cos(a) * PLAZA_COL_R, cz + Math.sin(a) * PLAZA_COL_R, 0.65); }
  }

  world.obstacles = obstacles;
  world.obstaclesVersion++;
  installRoom(colliders, shape.baseR + 1);
  commitCrates([], rnd);
}
