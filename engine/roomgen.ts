// ============================================================================
// Procedural run room: a star-convex outline with a walls ring (blocking trees / rocks / walls), a decorative outer
// ring, a few interior obstacles, some breakable crates and the biome's hazards. On top of that each fight room rolls
// a STAGE LAYOUT (engine/roomFeatures.ts): plain, big (x1.4), long hall / oval, a river / lava / chasm channel crossed
// by 1-3 bridges, or a lake stage (water, lava, abyss pits). Liquids are circle colliders that block walking (hero and
// monsters) but not shots. Writes world.obstacles (render/Props), the collision world (mapgen.installRoom) and `feat`.
// Deterministic per seed.
// ============================================================================
import { Vector3 } from 'three';
import { world, allocZone } from './world';
import { mulberry32, installRoom, commitCrates, type Collider } from './mapgen';
import { runInfo } from './runMods';
import type { Obstacle, ObstacleKind, CrateKind, RoomType } from './types';
import { biomeOf, variantOf, BIOMES } from './roomDefs';
import { buildShape, shape, shapeAt, boundaryPoint, perimeter, insideShape, startPoint, stationPoint, portalPoint, type ShapeKind } from './roomShape';
import { MAX_LAKES, hwAt, feat, resetFeatures, riverD, riverS, riverPoint, inLiquid, liquidCode, type Layout } from './roomFeatures';
import { isArenaRoom, buildArena } from './arenaRooms';

/** QA hook: force the stage layout of the following fight rooms. */
export const layoutDbg: { force: Layout | null } = { force: null };

const FIGHT: Partial<Record<RoomType, boolean>> = { COMBAT: true, ELITE: true, TREASURE: true };
const LAYOUTS: Layout[] = ['PLAIN', 'BIG', 'LONG', 'RIVER', 'LAKE'];

/** Stage layout of a room (pure function of biome, type, seed and room index). */
export function roomLayout(biome: number, type: RoomType, seed: number, index: number): Layout {
  if (runInfo.mode === 'TOWER') return 'PLAIN';
  const r = mulberry32(seed ^ 0x2545f491)();
  if (type === 'MINIBOSS') return layoutDbg.force === 'BIG' || r < 0.3 ? 'BIG' : 'PLAIN';
  if (!FIGHT[type]) return 'PLAIN';
  if (layoutDbg.force && (variantOf(biomeOf(biome), index)?.layouts ?? biomeOf(biome).layouts)[LAYOUTS.indexOf(layoutDbg.force)] > 0) return layoutDbg.force;
  if (biome % BIOMES.length === 0 && index === 0 && biome < BIOMES.length) return 'PLAIN';   // the very first room of a run stays simple
  const bd = biomeOf(biome);
  const w = variantOf(bd, index)?.layouts ?? bd.layouts;
  let sum = 0; for (const x of w) sum += x;
  let k = r * sum;
  for (let i = 0; i < 5; i++) { k -= w[i]; if (k <= 0) return LAYOUTS[i]; }
  return 'PLAIN';
}

/** Boss arena radius per biome (Gorath 34 ... the Void Herald / Malakar 50): big bosses need room to move. */
const BOSS_ARENA_R = [34, 38, 42, 44, 46, 48, 50];

/** Walkable radius for a room (the walls ring starts just outside it). Boss arenas are bigger; BIG stages ~1.4x. */
export function roomRadius(type: RoomType, seed: number, biome = 0, index = 1): number {
  const r = mulberry32(seed ^ 0x9e3779b9)();
  if (runInfo.mode === 'TOWER') return type === 'BOSS' ? 29 : 26;   // tower floors: one semi-big round arena
  let R: number;
  switch (type) {
    case 'BOSS': return BOSS_ARENA_R[biome % BOSS_ARENA_R.length];   // later bosses fight in bigger arenas
    case 'FOUNTAIN': case 'MERCHANT': R = 19 + r * 3; break;
    case 'SHRINE': R = 26 + r * 3; break;   // a bigger stage: the challenge waves need room
    case 'CAMP': return 23;
    case 'TREASURE': R = 22 + r * 3; break;
    case 'ELITE': case 'MINIBOSS': R = 25 + r * 3; break;
    default: R = 24 + r * 4; break;
  }
  const lay = roomLayout(biome, type, seed, index);
  return R * (lay === 'BIG' ? 1.4 : lay === 'RIVER' ? 1.14 : lay === 'LAKE' ? 1.22 : 1);
}

/** Where the hero stands on arrival, and where the room's single station (fountain, merchant, chest, altar) sits (shape-aware; R kept for API stability). */
const tmpA: [number, number] = [0, 0];
export const startPos = (_R?: number): [number, number] => { startPoint(tmpA); return [tmpA[0], tmpA[1]]; };
export const stationPos = (_R?: number): [number, number] => { stationPoint(tmpA); return [tmpA[0], tmpA[1]]; };
/** Exit portal slot i of n, across the front (far) end of the room. */
export function portalSlot(i: number, n: number, _R: number, out: [number, number]): void { portalPoint(i, n, out); }

interface KindSpec { r: (rnd: () => number, s: number) => number; s: [number, number]; blocks: boolean; walk?: boolean }
const SPEC: Record<string, KindSpec> = {
  TREE: { s: [1.5, 2.4], r: (_, s) => 0.8 + s * 0.25, blocks: true },
  PINE: { s: [1.5, 2.4], r: (_, s) => 0.8 + s * 0.25, blocks: true },
  DEAD_TREE: { s: [1.3, 2.0], r: (_, s) => 0.7 + s * 0.2, blocks: true },
  ROCK: { s: [0.9, 1.7], r: (_, s) => 0.6 + s * 0.9, blocks: true },
  ICE_ROCK: { s: [0.9, 1.7], r: (_, s) => 0.6 + s * 0.9, blocks: true },
  BOULDER: { s: [1.6, 2.5], r: (_, s) => 1 + s * 0.7, blocks: true },
  OBSIDIAN: { s: [1.0, 1.8], r: (_, s) => 0.8 + s * 0.35, blocks: true },
  STUMP: { s: [0.9, 1.5], r: () => 0.6, blocks: false },
  LOG: { s: [1, 1.2], r: () => 0.9, blocks: false },
  BONES: { s: [0.9, 1.4], r: () => 0.8, blocks: false, walk: true },
  RUIN: { s: [1, 1.6], r: () => 0.9, blocks: true },
  STATUE: { s: [1, 1.3], r: () => 1.0, blocks: true },
  CRYSTAL_SPIRE: { s: [1.1, 1.9], r: () => 1.0, blocks: true },
  CACTUS: { s: [1.0, 1.6], r: () => 0.75, blocks: true },
  SANDSTONE: { s: [1.0, 1.6], r: (_, s) => 1.1 + s * 0.25, blocks: true },
  COLUMN: { s: [1.0, 1.3], r: () => 0.95, blocks: true },
  LOWWALL: { s: [1.0, 1.15], r: () => 1.45, blocks: true },
  CASTLEWALL: { s: [1.0, 1.12], r: () => 1.7, blocks: true },
  BRAZIER: { s: [1.0, 1.15], r: () => 0.75, blocks: true },
};

const tmpPortal: [number, number] = [0, 0];
const rp: [number, number] = [0, 0];
/** Harvest node kind from a 0..1 roll: crystal 30%, ore 30%, gold vein 20%, healing herb 20%. */
const pickHarvest = (r: number): CrateKind => (r < 0.3 ? 'CRYSTAL' : r < 0.6 ? 'ORE' : r < 0.8 ? 'GOLD_VEIN' : 'HERB');

export function buildRoom(biome: number, type: RoomType, R: number, seed: number, index = 1): void {
  if (runInfo.mode !== 'TOWER' && isArenaRoom(type)) { buildArena(biome, type, R, seed); return; }   // duel ring / gatekeeper courtyard / fountain plaza
  const def = biomeOf(biome);
  const tower = runInfo.mode === 'TOWER';
  const layout: Layout = roomLayout(biome, type, seed, index);
  const fightRoom = !!FIGHT[type];
  buildShape(type, R, seed, {
    weights: fightRoom || type === 'MINIBOSS' ? def.shapes : undefined,
    long: layout === 'LONG',
    force: layout === 'LAKE' && (type === 'COMBAT' || type === 'ELITE') ? pickLakeShape(seed) : undefined,
  });
  const vr = tower ? null : variantOf(def, index);
  const border = vr?.border ?? def.border, interior = vr?.interior ?? def.interior, hazard = vr ? vr.hazard : def.hazard;
  const outerKinds = def.outer ?? border;

  resetFeatures();
  feat.layout = layout; feat.variant = vr && def.variants ? def.variants.indexOf(vr) : 0;
  const rnd = mulberry32(seed);
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const boss = type === 'BOSS';
  const obstacles: Obstacle[] = [];
  const colliders: Collider[] = [];
  let id = 1;

  const add = (kind: ObstacleKind, x: number, z: number, radius: number, scale: number, blocks: boolean, collide = true, rot = rnd() * Math.PI * 2): void => {
    obstacles.push({ id: id++, kind, pos: new Vector3(x, 0, z), radius, scale, rot, blocksProjectiles: blocks });
    if (collide) colliders.push({ x, z, r: radius, blocksProjectiles: blocks });
  };

  // keep-clear spots: arrival, station, all three exit slots
  const keep: { x: number; z: number; r: number }[] = [];
  const [sx, sz] = startPos(R);
  const [stx, stz] = stationPos(R);
  keep.push({ x: sx, z: sz, r: 4.5 });
  if (!boss) keep.push({ x: stx, z: stz, r: type === 'MINIBOSS' ? 12 : type === 'SHRINE' ? 8 : 5 });   // mini-boss rooms: a wide open arena where the champion spawns (big ones never wedge in rocks)
  for (let n = 1; n <= 3; n++) for (let i = 0; i < n; i++) { portalSlot(i, n, R, tmpPortal); keep.push({ x: tmpPortal[0], z: tmpPortal[1], r: 4 }); }
  const nearKeep = (x: number, z: number, r: number): boolean => { for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return true; return false; };
  const blockedSpot = (x: number, z: number, r: number, gap: number): boolean => {
    if (nearKeep(x, z, r)) return true;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + gap) return true;
    return false;
  };

  // ---- stage liquids first (everything else is placed around them)
  if (!tower && !boss) {
    if (layout === 'RIVER') {
      buildRiver(def.river, rnd, colliders);
      // nothing may block a bridge deck or its two mouths
      for (let i = 0; i < feat.nb; i++) for (const d of [0, -(feat.hw + 2), feat.hw + 2]) {
        riverPoint(feat.bridgeS[i], d, rp); keep.push({ x: rp[0], z: rp[1], r: Math.max(feat.bw + 0.8, 3.2) });
      }
    } else if (layout === 'LAKE') buildLakes(def.lake, rnd, colliders, nearKeep, type, index, def.hydras, vr?.lakeScale ?? 1);
    // (owner: hydras were hard to hit) keep a clear firing lane: nothing blocking near a hydra or between it and the room centre
    for (let i = 0; i < feat.nHydras; i++) {
      const hx = feat.hx[i], hz = feat.hz[i], d = Math.hypot(hx, hz) || 1;
      keep.push({ x: hx, z: hz, r: 5 });
      for (const t of [5, 9]) keep.push({ x: hx - (hx / d) * t, z: hz - (hz / d) * t, r: 3.5 });
    }
  }

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
  /** Yaw that lays a wall segment (built along local x) along the outline at (x, z). */
  const tangentRot = (x: number, z: number): number => -Math.atan2(z, x) - Math.PI / 2;
  const wallKind = (k: ObstacleKind): ObstacleKind => (k === 'STUMP' || k === 'LOG' || k === 'BONES' ? 'ROCK' : k);
  if (tower) {
    // tower floor: a cobbled disc open to the night sky, ringed by evenly spaced stone pillars (fixed layout every floor)
    const n = 28, rr = shape.baseR + 2.2;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; add('RUIN', Math.cos(a) * rr, Math.sin(a) * rr, 1.6, 1.3, true); }
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; add('STATUE', Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 1.1, 1.2, true); }
  }
  const castle = border.every((k) => k === 'CASTLEWALL');   // curtain wall segments abut each other
  const n1 = tower ? 0 : Math.ceil(P / Math.max(castle ? 3.3 : 2.6, P / 70));
  if (n1 > 0) ringWalk(n1, 1.6, 0.03, (x, z) => {
    if (feat.river && inLiquid(x, z, 1.2)) return;   // the river flows out through a gap in the wall
    const kind = wallKind(pickKind(border));
    const sp = SPEC[kind] ?? SPEC.ROCK;
    const s = rand(sp.s[0], sp.s[1]);
    add(kind, x, z, Math.max(1.5, sp.r(rnd, s)), s, true, true, kind === 'LOWWALL' || kind === 'CASTLEWALL' ? tangentRot(x, z) : rnd() * Math.PI * 2);
  });
  const n2 = tower || def.lavaSea || def.waterSea ? 0 : Math.ceil(P / Math.max(5.2, P / 34));   // (lava sea: nothing stands out in the lava)
  if (n2 > 0) ringWalk(n2, 5, 0.1, (x, z) => {
    if (feat.river && inLiquid(x, z, 1.5)) return;
    const kind = wallKind(pickKind(outerKinds));
    const sp = SPEC[kind] ?? SPEC.ROCK;
    const s = rand(sp.s[0], sp.s[1]) * (kind === 'CASTLEWALL' ? 1.35 : kind === 'LOWWALL' || kind === 'COLUMN' ? 1.6 : 1.25);
    add(kind, x, z, sp.r(rnd, s), s, true, false, kind === 'LOWWALL' || kind === 'CASTLEWALL' ? tangentRot(x, z) : rnd() * Math.PI * 2);
  });

  // ---- interior obstacles
  const big = layout === 'BIG';
  const count = tower ? 0 : boss ? 6 : type === 'COMBAT' || type === 'ELITE' || type === 'MINIBOSS' || type === 'TREASURE' ? Math.round(rand(7, 11) * (big ? 1.6 : 1)) : 5;
  if (tower) { /* open floor */ } else if (boss) {
    // each biome's boss arena has its own pillar plan (everything else stays open for the dance):
    // rings of [count, radius fraction, angle offset, size]
    const k = pickKind(interior.filter((o) => SPEC[o]?.blocks) as ObstacleKind[]);
    const PLANS: [number, number, number, number][][] = [
      [[6, 0.62, 0.3, 1]],                              // Greenwood: one ring
      [[10, 0.72, 0, 0.9]],                             // Marble Halls: a colonnade circle
      [[4, 0.45, 0.785, 1.3], [8, 0.8, 0, 0.9]],        // Desert: four great obelisks inside a broken ring
      [[3, 0.35, 0.5, 1.1], [9, 0.74, 0.2, 1]],         // Frost: an inner triangle of ice and an outer ring
      [[5, 0.5, 0, 1.1], [5, 0.82, 0.628, 1.2]],        // Ember: two staggered pentagons
      [[8, 0.42, 0.2, 0.8], [12, 0.84, 0, 0.8]],        // Void: two thin rings (the widest floor)
    ];
    const sp = SPEC[k] ?? SPEC.ROCK;
    for (const [n, fr, off, sz] of PLANS[(biome | 0) % PLANS.length]) for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      const s = rand(sp.s[0], sp.s[1]) * sz;
      add(k, Math.cos(a) * R * fr, Math.sin(a) * R * fr, sp.r(rnd, s), s, sp.blocks, true, k === 'LOWWALL' ? Math.atan2(Math.sin(a), Math.cos(a)) : rnd() * Math.PI * 2);
    }
  } else {
    // marble halls: colonnades along the hall (most fight rooms)
    if (def.style === 'MARBLE' && fightRoom && rnd() < 0.75) {
      const fa = Math.atan2(shape.fz, shape.fx);
      const w = Math.min(shapeAt(fa + Math.PI / 2), shapeAt(fa - Math.PI / 2));
      const lat = Math.max(6, w * 0.55), back = shapeAt(fa + Math.PI) * 0.8, front = shapeAt(fa) * 0.8;
      for (const sd of [-1, 1]) for (let t = -back; t <= front; t += 5.5) {
        const x = shape.fx * t - shape.fz * lat * sd, z = shape.fz * t + shape.fx * lat * sd;
        if (!insideShape(x, z, 3) || blockedSpot(x, z, 1, 0.8)) continue;
        add('COLUMN', x, z, 0.95, rand(1, 1.25), true);
      }
    }
    for (let t = 0, placed = 0; t < count * 25 && placed < count; t++) {
      const kind = pickKind(interior);
      const sp = SPEC[kind] ?? SPEC.ROCK;
      const s = rand(sp.s[0], sp.s[1]);
      const r = sp.r(rnd, s);
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 3 - r);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 3 + r)) continue;
      if (blockedSpot(x, z, r, 1.2)) continue;
      add(kind, x, z, r, s, sp.blocks, !sp.walk);
      placed++;
    }
    // desert oases / grove ponds: palms and reeds hug the shore
    if (layout === 'LAKE' && def.lake === 'WATER' && (def.style === 'SAND' || def.style === 'GRASS')) {
      for (let i = 0; i < feat.nLakes; i++) {
        const n = def.style === 'GRASS' ? (rnd() < 0.5 ? 0 : 1) : 2 + Math.floor(rnd() * 3);   // (owner: grove ponds were walled in by bushes)
        for (let k = 0, t = 0; k < n && t < 20; t++) {
          const a = rnd() * Math.PI * 2, rr = feat.lr[i] + 1.6;
          const x = feat.lx[i] + Math.cos(a) * rr, z = feat.lz[i] + Math.sin(a) * rr;
          if (!insideShape(x, z, 3) || blockedSpot(x, z, 1, 0.6)) continue;
          add(def.style === 'SAND' ? 'PALM' : 'TREE', x, z, 1.0, def.style === 'SAND' ? rand(1.3, 1.9) : rand(1.0, 1.3), true); k++;
        }
      }
    }
  }

  // ---- archer towers (a goblin archer stands on each in fight rooms; the director spawns them)
  if (!tower && def.towers && fightRoom && index >= (biome % BIOMES.length === 0 ? 3 : 1) && rnd() < 0.55) {
    const want = rnd() < 0.35 ? 2 : 1;
    for (let t = 0; t < 80 && feat.nTowers < want; t++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 4) || blockedSpot(x, z, 1.6, 2)) continue;
      if (Math.hypot(x - sx, z - sz) < 15) continue;
      // river stages: on the far bank
      if (feat.river && (riverD(x, z) > 0) !== (riverD(stx, stz) > 0)) continue;
      add('ARCHER_TOWER', x, z, 1.45, 1, false, true, Math.atan2(sx - x, sz - z));
      feat.tx[feat.nTowers] = x; feat.tz[feat.nTowers] = z; feat.nTowers++;
    }
  }

  // ---- breakable crates (decor + a little loot); none in boss arenas
  const crateList: { kind: CrateKind; x: number; z: number }[] = [];
  if (!boss) {
    const cave = type === 'CRYSTAL';   // crystal cavern: a field of harvestable crystals (+ some ore), nothing else
    const want = type === 'CAMP' ? 2 : tower ? Math.round(rand(2, 4)) : cave ? Math.round(rand(13, 17)) : type === 'FOUNTAIN' || type === 'MERCHANT' || type === 'SHRINE' ? 3 : Math.round(rand(5, 9) * (big ? 1.5 : 1));
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
    // harvest nodes (hold E): half the rooms have one (sometimes 2); kind decides the look and the yield
    if (!cave && !tower && type !== 'CAMP') {
      const extra = rnd() < 0.5 ? 0 : rnd() < 0.75 ? 1 : 2;   // half the rooms have none
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
  feat.version++;

  // ---- permanent environmental hazards (swamp puddles, quicksand, ember gas vents)
  if (hazard && !tower && !boss && type !== 'CAMP' && type !== 'FOUNTAIN' && type !== 'MERCHANT' && type !== 'CRYSTAL') {
    const hz: { x: number; z: number; r: number }[] = [];
    const n = Math.round(rand(1, 2.4) * (big ? 1.5 : 1)) + (hazard === 'PUDDLE' && layout === 'LAKE' ? 1 : 0);
    for (let t = 0; t < 80 && hz.length < n; t++) {
      const r = hazard === 'GAS' ? rand(3, 4.2) : rand(3.6, 5.5);
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (shape.maxR - 5 - r);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!insideShape(x, z, 5 + r)) continue;
      if (Math.hypot(x - sx, z - sz) < r + 6 || Math.hypot(x - stx, z - stz) < r + 5) continue;
      if (hz.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + r + 1)) continue;
      if (inLiquid(x, z, r + 1)) continue;
      hz.push({ x, z, r });
    }
    for (const h of hz) {
      const z = allocZone();
      if (!z) break;
      const gas = hazard === 'GAS';
      z.active = true; z.kind = gas ? 'GAS' : 'PUDDLE'; z.hostile = false; z.permanent = true;
      z.pos.set(h.x, 0, h.z); z.radius = h.r; z.maxLife = 1;
      z.dir.set(0, 0, 1); z.length = 0; z.damage = 0; z.tickT = 0;
      if (gas) { z.period = rand(6, 9); z.activeFor = rand(3, 4); z.life = rnd() * z.period; z.color = 0x7bd62a; }
      else { z.period = 0; z.activeFor = 0; z.life = 0; z.color = hazard === 'QUICKSAND' ? 0xc8a060 : 0x4aa3df; z.aux = hazard === 'QUICKSAND' ? 1 : 0; }
    }
  }
}

/** Lake stages prefer roomy outlines. */
function pickLakeShape(seed: number): ShapeKind {
  const r = mulberry32(seed ^ 0x51a7e)();
  return r < 0.35 ? 'ROUND' : r < 0.6 ? 'OCT' : r < 0.8 ? 'ELLIPSE' : 'HEX';
}

/** River / lava / chasm channel across the room (perpendicular to the forward axis, between arrival and station), 1-3 bridges. */
function buildRiver(liq: 'WATER' | 'LAVA' | 'CHASM' | 'ICE', rnd: () => number, colliders: Collider[]): void {
  // Two land masses split by a wide, meandering, uneven channel that sits well below the ground (render/Room.tsx sinks
  // the floor along it), joined by one or two wide bridges.
  feat.river = true; feat.liquid = liq;
  feat.nx = shape.fx; feat.nz = shape.fz;
  feat.straight = false;
  feat.hw = liq === 'CHASM' ? 5.0 + rnd() * 1.0 : 4.4 + rnd() * 1.2;
  feat.amp = 1.8 + rnd() * 1.4;
  feat.freq = 0.06 + rnd() * 0.04; feat.ph = rnd() * Math.PI * 2;
  feat.amp2 = 0.7 + rnd() * 0.6; feat.freq2 = feat.freq * (2.3 + rnd() * 0.6); feat.ph2 = rnd() * Math.PI * 2;
  feat.wAmp = 0.14 + rnd() * 0.1; feat.wFreq = 0.17 + rnd() * 0.1; feat.wPh = rnd() * Math.PI * 2;
  // centre line halfway between the arrival spot and the station, meander kept clear of both
  startPoint(rp); const t0 = rp[0] * feat.nx + rp[1] * feat.nz;
  stationPoint(rp); const t1 = rp[0] * feat.nx + rp[1] * feat.nz;
  feat.off = (t0 + t1) * 0.5;
  const room = (t1 - t0) * 0.5 - feat.hw * (1 + feat.wAmp) - 5.2;
  if (feat.amp + feat.amp2 > room) { const k = Math.max(0, room) / (feat.amp + feat.amp2); feat.amp *= k; feat.amp2 *= k; }
  // walkable extent of the channel line inside the outline
  let sMin = 0, sMax = 0;
  for (let s = 0; s < 120; s += 0.5) { riverPoint(s, 0, rp); if (!insideShape(rp[0], rp[1], 2.5)) break; sMax = s; }
  for (let s = 0; s > -120; s -= 0.5) { riverPoint(s, 0, rp); if (!insideShape(rp[0], rp[1], 2.5)) break; sMin = s; }
  const span = sMax - sMin;
  const nb = span > 24 ? 2 : 1;
  feat.bw = 3.0 + rnd() * 0.4;   // wide decks (~6-7 m): room for the hero, minions and a crowd
  const lo = sMin + feat.bw + 3, hi = sMax - feat.bw - 3;
  feat.nb = 0;
  for (let i = 0; i < nb; i++) {
    const t = nb === 1 ? 0.5 + (rnd() - 0.5) * 0.3 : i === 0 ? 0.22 + rnd() * 0.12 : 0.66 + rnd() * 0.12;
    feat.bridgeS[feat.nb++] = lo + (hi - lo) * Math.min(1, Math.max(0, t));
  }
  // colliders: a chain of circles along the centre line (radius follows the bank wobble), gapped at the bridges
  const code = liquidCode(liq);
  for (let s = sMin - 14; s <= sMax + 14; s += 1.0) {
    const r = hwAt(s) - 0.15;
    let near = false;
    for (let i = 0; i < feat.nb; i++) if (Math.abs(s - feat.bridgeS[i]) < feat.bw + r) { near = true; break; }
    if (near) continue;
    riverPoint(s, 0, rp);
    colliders.push({ x: rp[0], z: rp[1], r, blocksProjectiles: false, liquid: code });
  }
  // beside each deck: rows of small circles filling the channel between the deck edge and the chain
  for (let i = 0; i < feat.nb; i++) for (const sd of [-1, 1]) {
    const b = feat.bridgeS[i], hw = hwAt(b) - 0.15;
    for (let ds = feat.bw + 0.6; ds < feat.bw + hw + 1; ds += 0.9) for (let d = -hw + 0.6; d <= hw - 0.6; d += 1.1) {
      // never on a deck: with two bridges close together one bridge's rows used to reach onto the other's deck
      let onDeck = false;
      for (let j = 0; j < feat.nb; j++) if (Math.abs(b + sd * ds - feat.bridgeS[j]) < feat.bw + 0.6) { onDeck = true; break; }
      if (onDeck) continue;
      riverPoint(b + sd * ds, d, rp);
      colliders.push({ x: rp[0], z: rp[1], r: 0.6, blocksProjectiles: false, liquid: code });
    }
  }
  void riverS;
}

/** Lake stage: one big lake (water / lava / abyss) + 0-2 ponds, kept off the arrival, station and exits. Hydras lurk in water. */
function buildLakes(liq: 'WATER' | 'LAVA' | 'CHASM' | 'ICE', rnd: () => number, colliders: Collider[],
  nearKeep: (x: number, z: number, r: number) => boolean, type: RoomType, index: number, hydras: boolean, scale = 1): void {
  feat.liquid = liq;
  const code = liquidCode(liq);
  const free = (x: number, z: number, r: number, skip: number): boolean => {
    if (!insideShape(x, z, r + 3.2) || nearKeep(x, z, r + 1.5)) return false;
    for (let i = 0; i < feat.nLakes; i++) if (i < skip && Math.hypot(x - feat.lx[i], z - feat.lz[i]) < feat.lr[i] + r + 4) return false;
    return true;
  };
  const put = (x: number, z: number, r: number): void => {
    const k = feat.nLakes++;
    feat.lx[k] = x; feat.lz[k] = z; feat.lr[k] = r;
    colliders.push({ x, z, r: r - 0.35, blocksProjectiles: false, liquid: code });
  };
  // a pool = one core circle plus 2-4 overlapping lobes: an irregular, organic outline (the union of the circles)
  const tryLake = (r: number, tries: number, central: boolean): boolean => {
    for (let t = 0; t < tries; t++) {
      const a = rnd() * Math.PI * 2, d = central ? rnd() * shape.baseR * 0.35 : Math.sqrt(rnd()) * (shape.maxR - r - 3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const first = feat.nLakes;
      if (first >= MAX_LAKES || !free(x, z, r, first)) continue;
      put(x, z, r);
      const lobes = 2 + Math.floor(rnd() * 3), a0 = rnd() * Math.PI * 2;
      for (let j = 0; j < lobes && feat.nLakes < MAX_LAKES; j++) {
        const la = a0 + (j / lobes) * Math.PI * 2 + (rnd() - 0.5) * 1.2, lr = r * (0.42 + rnd() * 0.3), ld = r * (0.55 + rnd() * 0.35);
        const lx = x + Math.cos(la) * ld, lz = z + Math.sin(la) * ld;
        if (free(lx, lz, lr, first)) put(lx, lz, lr);
      }
      return true;
    }
    return false;
  };
  let mainR = shape.baseR * (0.26 + rnd() * 0.07) * scale;
  while (mainR > 4 && !tryLake(mainR, 40, true)) mainR -= 1;
  const ponds = (rnd() < 0.3 ? 0 : rnd() < 0.6 ? 1 : 2) + (scale > 1.2 ? 1 : 0) + (scale > 1.5 ? 1 : 0);
  for (let i = 0; i < ponds; i++) tryLake((2.6 + rnd() * 2) * Math.min(1.4, scale), 30, false);
  // hydras peek out of the water near the shore (fight rooms only, not the first rooms)
  if (hydras && (liq === 'WATER' || liq === 'ICE') && (type === 'COMBAT' || type === 'ELITE') && index >= 1) {
    for (let i = 0; i < feat.nLakes && feat.nHydras < 2; i++) {
      if (feat.lr[i] < 5 || (i > 0 && rnd() < 0.5)) continue;
      const toC = Math.atan2(-feat.lz[i], -feat.lx[i]) + (rnd() - 0.5) * 2;
      const rr = feat.lr[i] - 1.25;
      const k = feat.nHydras++;
      feat.hx[k] = feat.lx[i] + Math.cos(toC) * rr; feat.hz[k] = feat.lz[i] + Math.sin(toC) * rr;
      if (feat.lr[i] > 8 && rnd() < 0.45 && feat.nHydras < 2) {
        const a2 = toC + 2.2 + rnd(); const k2 = feat.nHydras++;
        feat.hx[k2] = feat.lx[i] + Math.cos(a2) * rr; feat.hz[k2] = feat.lz[i] + Math.sin(a2) * rr;
      }
    }
  }
}
