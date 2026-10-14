// ============================================================================
// Procedural run room: a disc around (0,0) with a walls ring (blocking trees / rocks / crystals), a decorative outer
// ring, a few interior obstacles and some breakable crates. Writes world.obstacles (rendered by render/Props through
// the same instancing path as the town) and the collision world (mapgen.installRoom). Deterministic per seed.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone } from './world';
import { mulberry32, installRoom, commitCrates, type Collider } from './mapgen';
import { runInfo } from './runMods';
import type { Obstacle, ObstacleKind, CrateKind, RoomType } from './types';
import { biomeOf } from './roomDefs';
import { buildShape, shape, shapeAt, boundaryPoint, perimeter, insideShape, startPoint, stationPoint, portalPoint } from './roomShape';

/** Walkable radius for a room (the walls ring starts just outside it). Boss arenas are bigger. */
export function roomRadius(type: RoomType, seed: number): number {
  const r = mulberry32(seed ^ 0x9e3779b9)();
  if (runInfo.mode === 'TOWER') return type === 'BOSS' ? 29 : 26;   // tower floors: one semi-big round arena
  switch (type) {
    case 'BOSS': return 30;
    case 'FOUNTAIN': case 'MERCHANT': case 'SHRINE': return 19 + r * 3;
    case 'CAMP': return 23;
    case 'TREASURE': return 22 + r * 3;
    case 'ELITE': case 'MINIBOSS': return 25 + r * 3;
    default: return 24 + r * 4;
  }
}

/** Where the hero stands on arrival, and where the room's single station (fountain, merchant, chest, altar) sits (shape-aware; R kept for API stability). */
const tmpA: [number, number] = [0, 0];
export const startPos = (_R?: number): [number, number] => { startPoint(tmpA); return [tmpA[0], tmpA[1]]; };
export const stationPos = (_R?: number): [number, number] => { stationPoint(tmpA); return [tmpA[0], tmpA[1]]; };
/** Exit portal slot i of n, across the front (far) end of the room. */
export function portalSlot(i: number, n: number, _R: number, out: [number, number]): void { portalPoint(i, n, out); }

interface KindSpec { r: (rnd: () => number, s: number) => number; s: [number, number]; blocks: boolean }
const SPEC: Record<string, KindSpec> = {
  TREE: { s: [1.5, 2.4], r: (_, s) => 0.8 + s * 0.25, blocks: true },
  PINE: { s: [1.5, 2.4], r: (_, s) => 0.8 + s * 0.25, blocks: true },
  ROCK: { s: [0.9, 1.7], r: (_, s) => 0.6 + s * 0.9, blocks: true },
  BOULDER: { s: [1.6, 2.5], r: (_, s) => 1 + s * 0.7, blocks: true },
  STUMP: { s: [0.9, 1.5], r: () => 0.6, blocks: false },
  LOG: { s: [1, 1.2], r: () => 0.9, blocks: false },
  RUIN: { s: [1, 1.6], r: () => 0.9, blocks: true },
  STATUE: { s: [1, 1.3], r: () => 1.0, blocks: true },
  CRYSTAL_SPIRE: { s: [1.1, 1.9], r: () => 1.0, blocks: true },
};

const tmpPortal: [number, number] = [0, 0];
/** Harvest node kind from a 0..1 roll: crystal 30%, ore 30%, gold vein 20%, healing herb 20%. */
const pickHarvest = (r: number): CrateKind => (r < 0.3 ? 'CRYSTAL' : r < 0.6 ? 'ORE' : r < 0.8 ? 'GOLD_VEIN' : 'HERB');

export function buildRoom(biome: number, type: RoomType, R: number, seed: number): void {
  buildShape(type, R, seed);
  const def = biomeOf(biome);
  const rnd = mulberry32(seed);
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const boss = type === 'BOSS';
  const obstacles: Obstacle[] = [];
  const colliders: Collider[] = [];
  let id = 1;

  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, collide = true): void => {
    obstacles.push({ id: id++, kind, pos: new Vector3(x, 0, z), radius, scale, rot: rnd() * Math.PI * 2, blocksProjectiles: blocks });
    if (collide) colliders.push({ x, z, r: radius, blocksProjectiles: blocks });
  };

  // keep-clear spots: arrival, station, all three exit slots
  const keep: { x: number; z: number; r: number }[] = [];
  const [sx, sz] = startPos(R);
  const [stx, stz] = stationPos(R);
  keep.push({ x: sx, z: sz, r: 4.5 });
  if (!boss) { const [cx, cz] = stationPos(R); keep.push({ x: cx, z: cz, r: 5 }); }
  for (let n = 1; n <= 3; n++) for (let i = 0; i < n; i++) { portalSlot(i, n, R, tmpPortal); keep.push({ x: tmpPortal[0], z: tmpPortal[1], r: 4 }); }
  const blockedSpot = (x: number, z: number, r: number, gap: number): boolean => {
    for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return true;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + gap) return true;
    return false;
  };

  // ---- walls ring (blocking) + decorative outer ring
  const pickKind = (list: ObstacleKind[]): ObstacleKind => list[Math.floor(rnd() * list.length)];
  const P = perimeter();
  const bp: [number, number] = [0, 0];
  /** Walks the outline (arc length), placing `n` evenly spaced props `off` outside it. */
  const ringWalk = (n: number, off: number, jit: number, place: (x: number, z: number) => void): void => {
    const o0 = rnd() * Math.PI * 2, step = P / n, dth = 0.004;
    let acc = 0, th = o0, k = 0;
    for (let a = 0; a < Math.PI * 2 + 0.1 && k < n; a += dth) {
      const r = shapeAt(th), dr = (shapeAt(th + 0.01) - shapeAt(th - 0.01)) / 0.02;
      acc += Math.sqrt(r * r + dr * dr) * dth;
      th += dth;
      if (acc >= (k + 0.5) * step) {
        boundaryPoint(th + (rnd() - 0.5) * jit, off + (rnd() - 0.5) * 0.6, bp);
        place(bp[0], bp[1]);
        k++;
      }
    }
  };
  const tower = runInfo.mode === 'TOWER';
  if (tower) {
    // tower floor: a cobbled disc open to the night sky, ringed by evenly spaced stone pillars (fixed layout every floor)
    const n = 28, rr = shape.baseR + 2.2;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; add('RUIN', Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 1.3, true); }
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; add('STATUE', Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 1.1, 1.2, true); }
  }
  const n1 = tower ? 0 : Math.ceil(P / Math.max(2.6, P / 70));
  if (n1 > 0) ringWalk(n1, 1.6, 0.03, (x, z) => {
    let kind = pickKind(def.border);
    if (kind === 'STUMP' || kind === 'LOG') kind = 'ROCK';
    const sp = SPEC[kind] ?? SPEC.ROCK;
    const s = rand(sp.s[0], sp.s[1]);
    add(kind, x, z, Math.max(1.5, sp.r(rnd, s)), s, true);
  });
  const n2 = tower ? 0 : Math.ceil(P / Math.max(5.2, P / 34));
  if (n2 > 0) ringWalk(n2, 5, 0.1, (x, z) => {
    let kind = pickKind(def.border);
    if (kind === 'STUMP' || kind === 'LOG') kind = 'ROCK';
    const sp = SPEC[kind] ?? SPEC.ROCK;
    const s = rand(sp.s[0], sp.s[1]) * 1.25;
    add(kind, x, z, sp.r(rnd, s), s, true, false);
  });

  // ---- interior obstacles
  const count = tower ? 0 : boss ? 6 : type === 'COMBAT' || type === 'ELITE' || type === 'MINIBOSS' || type === 'TREASURE' ? Math.round(rand(9, 14)) : 5;
  if (tower) { /* open floor */ } else if (boss) {
    // a ring of pillars at mid radius; everything else stays open for the dance
    const k = pickKind(def.interior.filter((o) => SPEC[o]?.blocks) as ObstacleKind[]);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.3;
      const sp = SPEC[k] ?? SPEC.ROCK;
      const s = rand(sp.s[0], sp.s[1]);
      add(k, Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, sp.r(rnd, s), s, sp.blocks);
    }
  } else {
    for (let t = 0, placed = 0; t < count * 25 && placed < count; t++) {
      const kind = pickKind(def.interior);
      const sp = SPEC[kind] ?? SPEC.ROCK;
      const s = rand(sp.s[0], sp.s[1]);
      const r = sp.r(rnd, s);
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 3 - r);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 3 + r)) continue;
      if (blockedSpot(x, z, r, 1.2)) continue;
      add(kind, x, z, r, s, sp.blocks);
      placed++;
    }
  }

  // ---- breakable crates (decor + a little loot); none in boss arenas
  const crateList: { kind: CrateKind; x: number; z: number }[] = [];
  if (!boss) {
    const cave = type === 'CRYSTAL';   // crystal cavern: a field of harvestable crystals (+ some ore), nothing else
    const want = type === 'CAMP' ? 2 : tower ? Math.round(rand(2, 4)) : cave ? Math.round(rand(13, 17)) : type === 'FOUNTAIN' || type === 'MERCHANT' || type === 'SHRINE' ? 3 : Math.round(rand(5, 9));
    for (let t = 0; t < want * 30 && crateList.length < want; t++) {
      const kind: CrateKind = cave ? (rnd() < 0.6 ? 'CRYSTAL' : pickHarvest(rnd())) : def.crates[Math.floor(rnd() * def.crates.length)];
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 3)) continue;
      if (blockedSpot(x, z, 1.1, 0.8)) continue;
      let ok = true;
      for (const c of crateList) if (Math.hypot(x - c.x, z - c.z) < 2.4) { ok = false; break; }
      if (ok) crateList.push({ kind, x, z });
    }
    // harvest nodes (hold E): usually 1 per room, sometimes 2; kind decides the look and the yield
    if (!cave && !tower && type !== 'CAMP') {
      const extra = rnd() < 0.75 ? 1 : 2;
      for (let t = 0, added = 0; t < 120 && added < extra; t++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 3);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!insideShape(x, z, 3) || blockedSpot(x, z, 1.1, 0.8)) continue;
        if (crateList.some((c) => Math.hypot(x - c.x, z - c.z) < 2.4)) continue;
        crateList.push({ kind: pickHarvest(rnd()), x, z }); added++;
      }
    }
  }

  world.obstacles = obstacles;
  world.obstaclesVersion++;
  installRoom(colliders, shape.baseR + 1);
  commitCrates(crateList, rnd);

  // ---- permanent environmental hazards (swamp puddles, ember gas vents)
  if (def.hazard && !tower && !boss && type !== 'CAMP' && type !== 'FOUNTAIN' && type !== 'MERCHANT' && type !== 'CRYSTAL') {
    const hz: { x: number; z: number; r: number }[] = [];
    const n = Math.round(rand(1, 2.4));
    for (let t = 0; t < 60 && hz.length < n; t++) {
      const r = def.hazard === 'PUDDLE' ? rand(3.6, 5.5) : rand(3, 4.2);
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 5 - r);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 5 + r)) continue;
      if (Math.hypot(x - sx, z - sz) < r + 6 || Math.hypot(x - stx, z - stz) < r + 5) continue;
      if (hz.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + r + 1)) continue;
      hz.push({ x, z, r });
    }
    for (const h of hz) {
      const z = allocZone();
      if (!z) break;
      z.active = true; z.kind = def.hazard; z.hostile = false; z.permanent = true;
      z.pos.set(h.x, 0, h.z); z.radius = h.r; z.maxLife = 1;
      z.dir.set(0, 0, 1); z.length = 0; z.damage = 0; z.tickT = 0;
      if (def.hazard === 'GAS') { z.period = rand(6, 9); z.activeFor = rand(3, 4); z.life = rnd() * z.period; z.color = 0x7bd62a; }
      else { z.period = 0; z.activeFor = 0; z.life = 0; z.color = 0x4aa3df; }
    }
  }
}
