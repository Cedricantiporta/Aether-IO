// Round, painted minimap (Zelda: Echoes of Wisdom style): a feathered circle (CSS radial mask, no ring or border), soft
// green grass, rounded forest blobs, tan roads, blue water, cream / brown buildings. The static terrain is baked ONCE per
// area / room into an offscreen canvas (`bake`) and only blitted each frame; markers (hero badge, NPC dots, enemies, gates,
// the tracked quest ring) are drawn on top from the world. No React state, no per-frame allocations (module scratch).
import React, { useRef } from 'react';
import { HOME_ROOM, HOME_DOOR } from '../../engine/homeData';
import { useGameStore } from '../../store';
import { TAP } from '../../engine/tavernData';
import { NAVE, CHURCH_DOOR } from '../../engine/churchData';
import { world, SHRINE_POS, TRAINER_POS } from '../../engine/world';
import {
  GATE, WALL_RUNS, WALL_TOWERS, ROADS, TRAIL_ROCKS, ROCKFALL, ROCKFALL_BREAK, rockfallCleared, STABLE, ANIMALS, NPCS, PLAZA, HOUSES, CASTLE, CHURCH, TAVERN,
  WINDMILL, FIELDS, RIVER, riverBank, BRIDGE, MINE_BRIDGE, TOWN_TREES, PORTAL, TOWER, GRAVEYARD,
} from '../../engine/townData';
import { animals, npcs } from '../../engine/systems/npcs';
import { npcMarkers } from '../../engine/systems/npcQuestLogic';
import { HALL, CASTLE_DOOR, CASTLE_EXT, CASTLE_ROOMS, DOORS, GAP_W } from '../../engine/castleData';
import { CAVE_DOOR } from '../../engine/caveData';
import { TAVERN_DOOR } from '../../engine/tavernData';
import { drawCaveMinimap, drawCaveFloorTag } from './minimapCave';
import { islandRadius, mapSeed } from '../../engine/mapgen';
import { BEACH, DOCK } from '../../engine/beachData';
import { shape, SHAPE_N } from '../../engine/roomShape';
import { halls, HC } from '../../engine/roomHalls';
import { camp, campOn } from '../../engine/campPaths';
import { SHOP_POSITIONS } from '../../constants';
import { portalLabel, biomeOf, variantOf } from '../../engine/roomDefs';
import { feat, riverPoint } from '../../engine/roomFeatures';
import { mainNav, npcQuestNav, navNpc } from '../../engine/systems/questNav';
import { NPC_QUESTS, NPC_QUEST_BY_ID, npcQuestStatus } from '../../npcQuests';
import { useUiStore } from '../uiStore';
import { useRaf } from '../hooks/useRaf';
import { TOWN_GATES, gateFlags, gateMask, type GateDef } from '../../engine/townGates';

const mmPt: [number, number] = [0, 0];
const SIZE = 200;   // css px across

// ---- palette (soft, bright, toy-like) ----
const C = {
  water: '#7ccbee', sand: '#f6e8bb', grass: '#a6dc7c', grassHi: '#b9e68f', forest: '#5fae5a', forestHi: '#78c46b',
  roadPaved: '#f3e3be', roadDirt: '#e2c28c', cream: '#fff3d6', brown: '#c99564', shadow: 'rgba(52,92,48,.28)', stone: '#dcd4c2', rock: '#bdbcb2',
  hero: '#fff6e0', ink: '#5a4636', gold: '#ffd24a', red: '#ff6b6b',
};
const hex = (s: string): [number, number, number] => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, t: number): string => { const x = hex(a), y = hex(b); return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`; };
const lum = (s: string): number => { const [r, g, b] = hex(s); return 0.3 * r + 0.59 * g + 0.11 * b; };

/** Rounded-rect path (arcTo: works on every WebView). */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const disc = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

// ---- the town's walkable outline (recomputed when the map seed changes) ----
const ISLE_N = 180, isle = new Float32Array(ISLE_N * 2);
let isleSeed = -1;
function islePoints(): Float32Array {
  if (isleSeed !== mapSeed) {
    isleSeed = mapSeed;
    for (let i = 0; i < ISLE_N; i++) { const a = (i / ISLE_N) * Math.PI * 2, r = islandRadius(a) - 1.2; isle[i * 2] = Math.cos(a) * r; isle[i * 2 + 1] = Math.sin(a) * r; }
  }
  return isle;
}

// ---- static terrain bake (once per area / room) ----
interface Bake { key: string; cv: HTMLCanvasElement | null; x0: number; z0: number; w: number; h: number; bg: string }
const baked: Bake = { key: '', cv: null, x0: 0, z0: 0, w: 1, h: 1, bg: C.water };
type Drawer = (g: CanvasRenderingContext2D) => void;
/** Render `draw` (world coordinates, metres) into the shared offscreen canvas covering [x0, x0+w] x [z0, z0+h]. */
function bake(key: string, x0: number, z0: number, w: number, h: number, maxPx: number, bg: string, draw: Drawer): void {
  const ppm = Math.min(14, maxPx / Math.max(w, h));
  if (!baked.cv) baked.cv = document.createElement('canvas');
  const cv = baked.cv; cv.width = Math.max(8, Math.round(w * ppm)); cv.height = Math.max(8, Math.round(h * ppm));
  const g = cv.getContext('2d'); if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  baked.key = key; baked.x0 = x0; baked.z0 = z0; baked.w = w; baked.h = h; baked.bg = bg;
}

const treeKind = (k: string): boolean => k === 'TREE' || k === 'PINE' || k === 'PALM' || k === 'DEAD_TREE' || k === 'STUMP' || k === 'LOG';
const rockKind = (k: string): boolean => k.includes('ROCK') || k === 'SANDSTONE' || k === 'OBSIDIAN' || k === 'BONES' || k === 'COLUMN';

function blob(g: CanvasRenderingContext2D, x: number, z: number, r: number, dark: string, light: string): void {
  disc(g, x, z, r * 1.25, dark); disc(g, x - r * 0.18, z - r * 0.22, r * 0.95, light);
}
function building(g: CanvasRenderingContext2D, x: number, z: number, rot: number, w: number, d: number, wall: string): void {
  g.save(); g.translate(x, z); g.rotate(-rot);
  const col = lum(wall) > 175 ? C.cream : C.brown;
  g.fillStyle = C.shadow; rr(g, -w / 2 + 0.5, -d / 2 + 0.7, w, d, Math.min(w, d) * 0.28); g.fill();
  g.fillStyle = col; rr(g, -w / 2, -d / 2, w, d, Math.min(w, d) * 0.28); g.fill();
  g.fillStyle = mix(col, '#b8764a', 0.35); rr(g, -w / 2 + w * 0.14, -d / 2 + d * 0.14, w * 0.72, d * 0.72, Math.min(w, d) * 0.2); g.fill();
  g.restore();
}

/** A closed story gate (engine/townGates.ts): a bold orange bar over its blocked line and a round "x" badge, so the hero sees what is shut. */
function gateMark(g: CanvasRenderingContext2D, gt: GateDef): void {
  const [x1, z1, x2, z2] = gt.span, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  g.lineCap = 'round';
  for (const [col, w] of [['#fff8e8', 3.4], ['#ff8a3c', 2.2]] as const) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, z1); g.lineTo(x2, z2); g.stroke(); }
  disc(g, cx, cz, 2.5, '#fff8e8'); disc(g, cx, cz, 1.9, '#ff6b3c');
  g.strokeStyle = '#fff8e8'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(cx - 0.8, cz - 0.8); g.lineTo(cx + 0.8, cz + 0.8); g.moveTo(cx + 0.8, cz - 0.8); g.lineTo(cx - 0.8, cz + 0.8); g.stroke();
}

function bakeTown(): void {
  const pts = islePoints();
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < ISLE_N; i++) { x0 = Math.min(x0, pts[i * 2]); x1 = Math.max(x1, pts[i * 2]); z0 = Math.min(z0, pts[i * 2 + 1]); z1 = Math.max(z1, pts[i * 2 + 1]); }
  x0 -= 40; z0 -= 40; x1 += 40; z1 += 40;
  const cleared = rockfallCleared(useGameStore.getState().npcQuests);
  bake(`T:${mapSeed}:${world.obstaclesVersion}:${cleared ? 1 : 0}:${gateMask()}`, x0, z0, x1 - x0, z1 - z0, 2048, C.water, (g) => {
    g.fillStyle = C.water; g.fillRect(x0, z0, x1 - x0, z1 - z0);
    // island: sand rim, then grass with a lighter top
    g.beginPath(); for (let i = 0; i < ISLE_N; i++) { if (i === 0) g.moveTo(pts[0], pts[1]); else g.lineTo(pts[i * 2], pts[i * 2 + 1]); } g.closePath();
    g.lineWidth = 5; g.strokeStyle = C.sand; g.stroke(); g.fillStyle = C.grass; g.fill();
    g.lineWidth = 12; g.strokeStyle = C.grassHi; g.save(); g.clip(); g.globalAlpha = 0.35; g.stroke(); g.restore(); g.globalAlpha = 1;
    // beach strip + pier
    g.fillStyle = C.sand; rr(g, BEACH.shoreX, BEACH.z0, BEACH.wallX - BEACH.shoreX, BEACH.z1 - BEACH.z0, 4); g.fill();
    g.fillStyle = C.roadDirt; rr(g, DOCK.x1, DOCK.z - DOCK.hw, DOCK.x0 - DOCK.x1, DOCK.hw * 2, 1); g.fill();
    rr(g, DOCK.head.x0, DOCK.head.z0, DOCK.head.x1 - DOCK.head.x0, DOCK.head.z1 - DOCK.head.z0, 2); g.fill();
    // river + bridges
    g.fillStyle = C.water; g.beginPath();
    for (let x = RIVER.x0; x <= RIVER.x1; x += 3) { const z = riverBank(x, 0); if (x === RIVER.x0) g.moveTo(x, z); else g.lineTo(x, z); }
    for (let x = RIVER.x1; x >= RIVER.x0; x -= 3) g.lineTo(x, riverBank(x, 1));
    g.closePath(); g.fill();
    g.fillStyle = C.roadPaved; rr(g, -BRIDGE.hw, BRIDGE.z0, BRIDGE.hw * 2, BRIDGE.z1 - BRIDGE.z0, 1.2); g.fill();
    g.fillStyle = C.roadDirt; rr(g, MINE_BRIDGE.x - MINE_BRIDGE.hw, MINE_BRIDGE.z0, MINE_BRIDGE.hw * 2, MINE_BRIDGE.z1 - MINE_BRIDGE.z0, 0.8); g.fill();
    // fields
    for (const f of FIELDS) { g.fillStyle = f.crop === 'WHEAT' ? '#ecd77f' : f.crop === 'PUMPKIN' ? '#f3b868' : '#a8de78'; rr(g, f.x - f.hw, f.z - f.hd, f.hw * 2, f.hd * 2, 2); g.fill(); }
    // roads (dirt first, paved on top) + the plaza
    for (const pass of [true, false]) for (const r of ROADS) {
      if (!!r.dirt !== pass) continue;
      g.strokeStyle = r.dirt ? C.roadDirt : C.roadPaved; g.lineWidth = Math.max(2, r.w * 1.1);
      g.beginPath(); g.moveTo(r.x1, r.z1); g.lineTo(r.x2, r.z2); g.stroke();
    }
    disc(g, PLAZA.x, PLAZA.z, PLAZA.r, C.roadPaved);
    // forest: the town's trees and every tree-like obstacle merge into soft darker blobs
    for (const t of TOWN_TREES) blob(g, t.x, t.z, Math.max(1.6, t.s * 0.7), C.forest, C.forestHi);
    const obs = world.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i], p = o.pos; if (!p) continue;
      if (treeKind(o.kind)) blob(g, p.x, p.z, Math.max(1.8, (o.radius ?? 1) * 1.9), C.forest, C.forestHi);
      else if (rockKind(o.kind)) disc(g, p.x, p.z, Math.max(0.9, (o.radius ?? 1) * 1.1), C.rock);
    }
    for (const [x, z, r] of TRAIL_ROCKS) disc(g, x, z, r * 1.1, C.rock);
    ROCKFALL.forEach(([x, z, r], i) => { if (cleared && i === ROCKFALL_BREAK) return; disc(g, x, z, r * 1.1, C.rock); });
    // walls (soft thick strokes with the gate gap) + towers
    g.strokeStyle = C.stone; g.lineWidth = 2.2; g.beginPath();
    for (const [x1_, z1_, x2_, z2_] of WALL_RUNS) { g.moveTo(x1_, z1_); g.lineTo(x2_, z2_); }
    g.stroke();
    for (const t of WALL_TOWERS) disc(g, t.x, t.z, (t.corner ? 2.2 : 1.7), C.stone);
    // buildings
    for (const h of HOUSES) building(g, h.x, h.z, h.rot, h.w, h.d, h.wall);
    building(g, CASTLE.x, CASTLE.z, 0, CASTLE.w, CASTLE.d + 3, '#f0e8d6');
    building(g, CHURCH.x, CHURCH.z, CHURCH.rot, CHURCH.w, CHURCH.d, '#f0e8d6');
    building(g, TAVERN.x, TAVERN.z, TAVERN.rot, TAVERN.w, TAVERN.d, '#d8b890');
    building(g, STABLE.x, STABLE.z, 0, STABLE.w, STABLE.d, '#a07050');
    disc(g, WINDMILL.x, WINDMILL.z, WINDMILL.r, C.cream);
    g.fillStyle = '#d5e9bf'; rr(g, GRAVEYARD.x0, GRAVEYARD.z0, GRAVEYARD.x1 - GRAVEYARD.x0, GRAVEYARD.z1 - GRAVEYARD.z0, 2); g.fill();
    // shops: soft rounded tiles in each shop's colour; board / altar / trainer as small dots
    for (const s of SHOP_POSITIONS) { const x = s.position[0], z = s.position[2]; g.save(); g.translate(x, z); g.rotate(-(s.rot ?? 0)); g.fillStyle = C.shadow; rr(g, -2.4, -2.0, 4.8, 4.8, 1.6); g.fill(); g.fillStyle = mix(s.color, '#ffffff', 0.4); rr(g, -2.4, -2.4, 4.8, 4.8, 1.6); g.fill(); g.restore(); disc(g, x, z, 0.9, C.cream); }   // (the shops face any way: tiles turn with them)
    disc(g, SHRINE_POS[0], SHRINE_POS[2], 1.5, '#c7a2ff'); disc(g, TRAINER_POS[0], TRAINER_POS[2], 1.7, '#ffb05a');
    for (const gt of TOWN_GATES) if (!gateFlags[gt.id]) gateMark(g, gt);   // closed story gates
  });
}

function bakeInterior(area: string): void {
  const hw = area === 'HOME' ? HOME_ROOM.hw : area === 'TAVERN' ? TAP.hw : area === 'CHURCH' ? NAVE.hw : CASTLE_EXT.hw;
  const hd = area === 'HOME' ? HOME_ROOM.hd : area === 'TAVERN' ? TAP.hd : area === 'CHURCH' ? NAVE.hd : HALL.hd;
  const m = 16;
  bake(`A:${area}`, -hw - m, -hd - m, (hw + m) * 2, (hd + m) * 2, 900, '#8a6a52', (g) => {
    g.fillStyle = '#8a6a52'; g.fillRect(-hw - m, -hd - m, (hw + m) * 2, (hd + m) * 2);
    g.fillStyle = '#b98b5e'; rr(g, -hw - 1.2, -hd - 1.2, hw * 2 + 2.4, hd * 2 + 2.4, 3); g.fill();
    g.fillStyle = area === 'CASTLE' ? '#efe6d2' : area === 'CHURCH' ? '#ece3d2' : '#f3dcae'; rr(g, -hw, -hd, hw * 2, hd * 2, 2.4); g.fill();
    if (area === 'CASTLE') {   // throne room + the two wings: one soft tile per room, a gap for every wall, a gold-ish bridge over every doorway
      for (const r of CASTLE_ROOMS) { g.fillStyle = r.color; rr(g, r.x0 + 0.35, r.z0 + 0.35, r.x1 - r.x0 - 0.7, r.z1 - r.z0 - 0.7, 1.4); g.fill(); }
      g.fillStyle = '#efe6d2';
      for (const d of DOORS) { if (d.alongX) g.fillRect(d.x - GAP_W / 2 + 0.6, d.z - 0.6, GAP_W - 1.2, 1.2); else g.fillRect(d.x - 0.6, d.z - GAP_W / 2 + 0.6, 1.2, GAP_W - 1.2); }
      g.fillStyle = '#9a7656'; g.font = 'bold 1.7px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const r of CASTLE_ROOMS) if (r.id !== 'hall') g.fillText(r.name, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2 - (r.z1 - r.z0 > 15 ? 3 : 1));
    }
    if (area === 'CASTLE' || area === 'CHURCH') { g.strokeStyle = '#e48a7c'; g.lineWidth = area === 'CASTLE' ? 4 : 3; g.beginPath(); g.moveTo(0, -hd + 3); g.lineTo(0, hd - 1); g.stroke(); }
  });
}

function bakeRoom(): void {
  const r = world.room, def = biomeOf(r.biome), v = variantOf(def, r.index);
  const g0 = (v?.ground ?? def.ground), edge = v?.edge ?? def.edge;
  const floor = mix(g0[0], g0[1], 0.5), floorHi = mix(floor, '#ffffff', 0.22), dark = mix(floor, '#000000', 0.26);
  const ext = shape.maxR + 10, bg = mix(edge, floor, 0.35);
  bake(`R:${r.version}:${r.seed}:${r.biome}:${r.index}:${world.obstaclesVersion}:${shape.version}:${camp.ver}`, -ext, -ext, ext * 2, ext * 2, 1500, bg, (g) => {
    g.fillStyle = bg; g.fillRect(-ext, -ext, ext * 2, ext * 2);
    if (shape.kind === 'HALLS') {   // chambers + corridors: the walkable mask as merged row runs (outline pass, then floor pass)
      const w = halls.w, hh = halls.h, O = halls.open, outline = mix(floor, '#f6e8bb', 0.5);
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = pass === 0 ? outline : floor;
        const e = pass === 0 ? 0.75 : 0;
        for (let j = 0; j < hh; j++) {
          let i0 = -1;
          for (let i = 0; i <= w; i++) {
            const on = i < w && O[j * w + i] === 1;
            if (on && i0 < 0) i0 = i;
            else if (!on && i0 >= 0) { g.fillRect(halls.x0 + i0 * HC - e, halls.z0 + j * HC - e, (i - i0) * HC + e * 2, HC + e * 2); i0 = -1; }
          }
        }
      }
    } else {
      g.beginPath();
      for (let i = 0; i <= SHAPE_N; i += 2) {
        const th = -Math.PI + (i * Math.PI * 2) / SHAPE_N, rr_ = shape.table[i], x = Math.cos(th) * rr_, y = Math.sin(th) * rr_;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.lineWidth = 4; g.strokeStyle = mix(floor, '#f6e8bb', 0.5); g.stroke(); g.fillStyle = floor; g.fill();
      g.save(); g.clip(); g.lineWidth = 14; g.strokeStyle = floorHi; g.globalAlpha = 0.4; g.stroke(); g.restore(); g.globalAlpha = 1;
    }
    // liquids
    if (feat.river || feat.nLakes > 0) {
      const lc = feat.liquid === 'LAVA' ? '#ff8a3a' : feat.liquid === 'CHASM' ? '#4a4258' : feat.liquid === 'ICE' ? '#cdeaf5' : C.water;
      g.fillStyle = lc; g.strokeStyle = lc;
      for (let i = 0; i < feat.nLakes; i++) { g.beginPath(); g.arc(feat.lx[i], feat.lz[i], feat.lr[i], 0, Math.PI * 2); g.fill(); }
      if (feat.river) {
        g.lineWidth = feat.hw * 2; g.lineCap = 'butt'; g.beginPath();
        for (let s = -ext - 6, first = true; s <= ext + 6; s += 2, first = false) { riverPoint(s, 0, mmPt); if (first) g.moveTo(mmPt[0], mmPt[1]); else g.lineTo(mmPt[0], mmPt[1]); }
        g.stroke(); g.strokeStyle = C.roadPaved; g.lineWidth = feat.bw * 2;
        for (let i = 0; i < feat.nb; i++) { riverPoint(feat.bridgeS[i], -feat.hw - 0.6, mmPt); g.beginPath(); g.moveTo(mmPt[0], mmPt[1]); riverPoint(feat.bridgeS[i], feat.hw + 0.6, mmPt); g.lineTo(mmPt[0], mmPt[1]); g.stroke(); }
        g.lineCap = 'round';
      }
    }
    // biome camp: the winding road, as a thick warm stroke
    if (campOn() && camp.cur) {
      const P = camp.cur; g.strokeStyle = C.roadDirt; g.lineWidth = 4; g.beginPath();
      for (let i = 0; i < P.n; i++) { if (i === 0) g.moveTo(P.px[i], P.pz[i]); else g.lineTo(P.px[i], P.pz[i]); }
      g.stroke();
    }
    // scenery: trees / rocks / columns as soft darker blobs of the ground colour
    const obs = world.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i], p = o.pos; if (!p) continue;
      if (treeKind(o.kind)) blob(g, p.x, p.z, Math.max(1.5, (o.radius ?? 1) * 1.5), mix(floor, '#1f5a2a', 0.55), mix(floor, '#3f8a45', 0.5));
      else disc(g, p.x, p.z, Math.max(0.8, (o.radius ?? 1) * 1.05), dark);
    }
  });
}

// ---- tracked quest target (indicator only: the minimap ring, no walking) ----
const tgt = { x: 0, z: 0, on: false };
function resolveTarget(): void {
  tgt.on = false;
  if (world.room.active) return;
  const ui = useUiStore.getState(), key = ui.trackedQuest, st = useGameStore.getState();
  let t: { x: number; z: number } | null = null;
  if (key.startsWith('side:')) {
    const d = NPC_QUEST_BY_ID[key.slice(5)];
    if (d) { const s = npcQuestStatus(d, st.npcQuests, st.heroRank); if (s === 'ACTIVE') t = npcQuestNav(d); else if (s === 'AVAILABLE') { const i = NPCS.findIndex((n) => n.name === d.giver); if (i >= 0) t = navNpc(i); } }
  } else if (key === 'main') t = mainNav();
  if (!t && key === '') {   // automatic: the main quest, else the first accepted side quest
    t = mainNav();
    if (!t) { const d = NPC_QUESTS.find((x) => npcQuestStatus(x, st.npcQuests, st.heroRank) === 'ACTIVE'); if (d) t = npcQuestNav(d); }
  }
  if (t) { tgt.x = t.x; tgt.z = t.z; tgt.on = true; }
}

// ---- markers ----
/** A little gate (arch) glyph: cream body, coloured opening. `s` = half-width in canvas px. */
function gate(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  g.fillStyle = C.cream; g.beginPath();
  g.moveTo(x - s, y + s); g.lineTo(x - s, y - s * 0.15); g.arc(x, y - s * 0.15, s, Math.PI, 0); g.lineTo(x + s, y + s); g.closePath(); g.fill();
  g.fillStyle = color; g.beginPath();
  g.moveTo(x - s * 0.52, y + s); g.lineTo(x - s * 0.52, y - s * 0.1); g.arc(x, y - s * 0.1, s * 0.52, Math.PI, 0); g.lineTo(x + s * 0.52, y + s); g.closePath(); g.fill();
}
function bubbleMark(g: CanvasRenderingContext2D, x: number, y: number, u: number, ch: string, col: string): void {
  disc(g, x, y, 5.6 * u, col); g.fillStyle = '#fff'; g.font = `800 ${8.5 * u}px Nunito, ui-rounded, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y + 0.6 * u);
}

/** Round Zelda-style minimap. Terrain is baked once per area / room; markers are drawn every frame from the world. */
export const Minimap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const acc = useRef(1);
  useRaf((dt, now) => {
    const c = ref.current; if (!c) return;
    const cw = c.clientWidth, want = Math.round(cw * Math.min(3, window.devicePixelRatio || 1));
    if (want > 0 && (c.width !== want || c.height !== want)) { c.width = want; c.height = want; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    const P = c.width, h = P / 2, u = P / SIZE;   // u: canvas px per design px
    const room = world.room.active;
    const area = room ? '' : world.village.area, town = area === 'TOWN';
    const view = room ? Math.min(shape.maxR + 4, 28) : town ? 34 : area === 'CAVE' ? 30 : 20;
    const k = h / view, p = world.player, px = p.pos.x, pz = p.pos.z;
    acc.current += dt;
    if (acc.current > 0.15) { acc.current = 0; resolveTarget(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, P, P);
    // ---- terrain (baked once per area / room)
    if (room) { const key = `R:${world.room.version}:${world.room.seed}:${world.room.biome}:${world.room.index}:${world.obstaclesVersion}:${shape.version}:${camp.ver}`; if (baked.key !== key) bakeRoom(); }
    else if (town) { const key = `T:${mapSeed}:${world.obstaclesVersion}:${rockfallCleared(useGameStore.getState().npcQuests) ? 1 : 0}:${gateMask()}`; if (baked.key !== key) bakeTown(); }
    else if (area !== 'CAVE') { if (baked.key !== `A:${area}`) bakeInterior(area); }
    if (area === 'CAVE') { ctx.fillStyle = '#6a6474'; ctx.fillRect(0, 0, P, P); }
    else if (baked.cv) {
      ctx.fillStyle = baked.bg; ctx.fillRect(0, 0, P, P);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(baked.cv, h + (baked.x0 - px) * k, h + (baked.z0 - pz) * k, baked.w * k, baked.h * k);
    }
    const sx = (x: number): number => h + (x - px) * k, sy = (z: number): number => h + (z - pz) * k;
    if (area === 'CAVE') { ctx.save(); ctx.translate(-px * k, -pz * k); ctx.lineJoin = 'round'; drawCaveMinimap(ctx, h, k, u); ctx.restore(); drawCaveFloorTag(ctx, h - 34 * u, P - 30 * u, u); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const lim = h * 1.1;   // draw markers only near the circle
    // ---- gates: the way out of an interior, town gate / portal / cave mouth / doors
    if (town) {
      gate(ctx, sx(GATE.x), sy(GATE.z), 6 * u, C.gold);
      gate(ctx, sx(PORTAL.front.x), sy(PORTAL.front.z), 6.5 * u, '#9d7cff');
      gate(ctx, sx(TOWER.door.x), sy(TOWER.door.z), 5.5 * u, '#c9a6ff');
      gate(ctx, sx(CAVE_DOOR.x), sy(CAVE_DOOR.z), 5.5 * u, '#6fd8f0');
      gate(ctx, sx(CASTLE_DOOR.x), sy(CASTLE_DOOR.z), 4.5 * u, '#e48a7c');
      gate(ctx, sx(CHURCH_DOOR.x), sy(CHURCH_DOOR.z), 4 * u, '#c7a2ff');
      gate(ctx, sx(TAVERN_DOOR.x), sy(TAVERN_DOOR.z), 4 * u, '#e9a24a');
      gate(ctx, sx(HOME_DOOR.x), sy(HOME_DOOR.z), 3.6 * u, '#e9a24a');
    } else if (area === 'CASTLE' || area === 'CHURCH' || area === 'TAVERN' || area === 'HOME') {
      const gz = area === 'CHURCH' ? NAVE.hd : area === 'TAVERN' ? TAP.hd : area === 'HOME' ? HOME_ROOM.hd : HALL.hd;
      gate(ctx, sx(0), sy(gz), 6 * u, C.gold);
    }
    // ---- run room: station, exits
    if (room) {
      const r = world.room;
      if (r.station.kind !== 'NONE') { disc(ctx, sx(r.station.x), sy(r.station.z), 4.2 * u, '#5fd6ff'); disc(ctx, sx(r.station.x), sy(r.station.z), 1.8 * u, '#fff'); }
      for (let i = 0; i < r.portals.length; i++) { const po = r.portals[i]; if (po.active) gate(ctx, sx(po.x), sy(po.z), 6 * u, portalLabel(po.plan, r.biome).color); }
    }
    // ---- horses (town), NPCs (cream dots; "!" bubble on quest givers)
    if (town) for (let i = 0; i < animals.length; i++) { if (ANIMALS[i].kind !== 'HORSE' || animals[i].ridden) continue; disc(ctx, sx(animals[i].x), sy(animals[i].z), 2.6 * u, '#d9a066'); }
    if (!room) {
      const mk = npcMarkers(), here = world.village.area;
      for (let i = 0; i < NPCS.length; i++) {
        if ((NPCS[i].area ?? 'TOWN') !== here) continue;
        const x = sx(npcs[i].x), y = sy(npcs[i].z); if (Math.abs(x - h) > lim || Math.abs(y - h) > lim) continue;
        disc(ctx, x, y, 3.1 * u, C.cream);
        const m = mk[i];
        if (m === 1) bubbleMark(ctx, x, y - 9 * u, u, '!', C.gold); else if (m === 3) bubbleMark(ctx, x, y - 9 * u, u, '?', C.gold); else if (m === 2) bubbleMark(ctx, x, y - 9 * u, u, '?', '#b9b4aa');
      }
    }
    // ---- enemies (red dots; elites bigger violet; the boss a big red dot with a soft ring)
    const es = world.enemies;
    let boss: typeof es[number] | null = null;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.active || e.state === 'DYING') continue;
      if (e.boss) { boss = e; continue; }
      const x = sx(e.pos.x), y = sy(e.pos.z); if (Math.abs(x - h) > lim || Math.abs(y - h) > lim) continue;
      if (e.elite) disc(ctx, x, y, 3.6 * u, '#c084fc'); else disc(ctx, x, y, 2.5 * u, C.red);
    }
    if (boss) { const x = sx(boss.pos.x), y = sy(boss.pos.z); ctx.globalAlpha = 0.35; disc(ctx, x, y, 11 * u, C.red); ctx.globalAlpha = 1; disc(ctx, x, y, 6.5 * u, '#ff3b3b'); disc(ctx, x, y, 2.4 * u, '#fff'); }
    // ---- tracked quest: a glowing yellow ring + dot; off the map it sits on the circle edge, pointing the way
    if (tgt.on) {
      const dx = (tgt.x - px) * k, dz = (tgt.z - pz) * k, d = Math.hypot(dx, dz), edge = h * 0.8, pulse = 1 + Math.sin(now * 5) * 0.12;
      const out = d > edge, f = out ? edge / d : 1, x = h + dx * f, y = h + dz * f;
      ctx.save(); ctx.shadowColor = 'rgba(255,210,60,.95)'; ctx.shadowBlur = 10 * u;
      ctx.lineWidth = 2.6 * u; ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, 7.5 * u * pulse, 0, Math.PI * 2); ctx.stroke();
      disc(ctx, x, y, 3.2 * u, C.gold); ctx.restore();
      if (out) {   // a small pointer outside the ring, towards the target
        const ax = dx / d, az = dz / d, bx = x + ax * 12 * u, by = y + az * 12 * u;
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(bx + ax * 5 * u, by + az * 5 * u); ctx.lineTo(bx - ax * 2 * u - az * 4.5 * u, by - az * 2 * u + ax * 4.5 * u); ctx.lineTo(bx - ax * 2 * u + az * 4.5 * u, by - az * 2 * u - ax * 4.5 * u); ctx.closePath(); ctx.fill();
      }
    }
    // ---- night: the map darkens with the time of day (town clock; a run keeps its start time) - drawn under the markers
    {
      const t = room ? world.runTime : town ? world.townTime : 0.25;
      // (owner) clock hour (TownClock: t 0 = 06:00): darkens from 17:00 (full by 20:00), lightens 04:00 - 07:00
      const hr = (6 + t * 24) % 24, nk = (room && world.runPhase === 0) ? 0 : hr >= 17 ? Math.min(1, (hr - 17) / 3) : hr < 4 ? 1 : hr < 7 ? (7 - hr) / 3 : 0;
      if (nk > 0.01 && area !== 'CAVE') { ctx.fillStyle = `rgba(12, 16, 46, ${(nk * 0.62).toFixed(3)})`; ctx.fillRect(0, 0, P, P); }
    }
    // ---- hero (owner: no smiley): a white-rimmed gold arrowhead pointing where the hero faces
    {
      const fx = Math.sin(p.facing), fz = Math.cos(p.facing), L = 9.5 * u, W = 6.4 * u, B = 4.2 * u;
      if (town && world.village.ride.on) { ctx.globalAlpha = 0.5; disc(ctx, h, h, 12 * u, '#d9a066'); ctx.globalAlpha = 1; }
      const tipx = h + fx * L, tipy = h + fz * L, lx = h - fx * B - fz * W, ly = h - fz * B + fx * W, rx = h - fx * B + fz * W, ry = h - fz * B - fx * W, nx = h - fx * 1.2 * u, ny = h - fz * 1.2 * u;
      ctx.save(); ctx.shadowColor = 'rgba(20,20,30,.45)'; ctx.shadowBlur = 4 * u; ctx.shadowOffsetY = 1.2 * u;
      ctx.beginPath(); ctx.moveTo(tipx, tipy); ctx.lineTo(lx, ly); ctx.lineTo(nx, ny); ctx.lineTo(rx, ry); ctx.closePath();
      ctx.fillStyle = C.gold; ctx.fill(); ctx.restore();
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.8 * u; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
  });
  return (
    <div className="pe relative mm-wrap" style={{ width: `${(SIZE * 1.2) / 14.4}rem`, height: `${(SIZE * 1.2) / 14.4}rem` }}>
      <canvas ref={ref} width={SIZE * 2} height={SIZE * 2} className="absolute inset-0 w-full h-full mm-canvas" />
      <span className="absolute left-1/2 grid place-items-center mm-north">N</span>
    </div>
  );
};
