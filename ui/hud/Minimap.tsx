import { HOME_ROOM } from '../../engine/homeData';
import { useGameStore } from '../../store';
import { TAP } from '../../engine/tavernData';
import React, { useRef } from 'react';
import { NAVE } from '../../engine/churchData';
import { world, ARENA_RADIUS, QUEST_POS, SHRINE_POS, TRAINER_POS } from '../../engine/world';
import { GATE, WALL_RUNS, WALL_TOWERS, LAKE, WALL, ROADS, TRAIL_ROCKS, ROCKFALL, ROCKFALL_BREAK, rockfallCleared, STABLE, ANIMALS } from '../../engine/townData';
import { animals } from '../../engine/systems/npcs';
import { HALL } from '../../engine/castleData';
import { CAVE_DOOR } from '../../engine/caveData';
import { drawCaveMinimap, drawCaveFloorTag } from './minimapCave';
import { isHarvestNode, islandRadius, mapSeed } from '../../engine/mapgen';
import { BEACH, DOCK } from '../../engine/beachData';
import { shape, SHAPE_N } from '../../engine/roomShape';
import { camp, campOn } from '../../engine/campPaths';
import { SHOP_POSITIONS } from '../../constants';
import { portalLabel } from '../../engine/roomDefs';
import { feat, riverPoint } from '../../engine/roomFeatures';
import { useRaf } from '../hooks/useRaf';

const mmPt: [number, number] = [0, 0];

const W = 284, H = 208; // css px (rectangular)
/** Sharp line icons for the shops, as polylines in unit space (-1..1, y down). Each entry: [closed, ...x,y pairs]. */
type Poly = [boolean, ...number[]];
const dia = (x: number, y: number, r: number): Poly => [true, x, y - r, x + r, y, x, y + r, x - r, y];
const SHOP_ICON: Record<string, Poly[]> = {
  SUPPLIES: [[false, -0.3, -0.85, -0.3, -0.3, -0.8, 0.8, 0.8, 0.8, 0.3, -0.3, 0.3, -0.85], [false, -0.5, -0.85, 0.5, -0.85], [false, -0.55, 0.3, 0.55, 0.3]],   // flask
  BLACKSMITH: [[true, -0.95, -0.35, 0.95, -0.35, 0.55, 0.05, 0.3, 0.05, 0.3, 0.45, 0.65, 0.8, -0.65, 0.8, -0.3, 0.45, -0.3, 0.05, -0.65, 0.05]],   // anvil
  ARMORY: [[true, -0.75, -0.85, 0.75, -0.85, 0.75, 0.05, 0, 0.9, -0.75, 0.05], [false, 0, -0.85, 0, 0.9]],   // shield
  PETS: [[true, -0.45, 0.8, 0.45, 0.8, 0, 0.15], dia(-0.62, -0.05, 0.2), dia(-0.22, -0.55, 0.2), dia(0.22, -0.55, 0.2), dia(0.62, -0.05, 0.2)],   // paw
  FORTUNE: [[true, -0.95, 0, 0, -0.6, 0.95, 0, 0, 0.6], dia(0, 0, 0.25)],   // eye
  WAREHOUSE: [[true, -0.75, -0.3, 0.75, -0.3, 0.75, 0.8, -0.75, 0.8], [false, -0.95, -0.25, 0, -0.9, 0.95, -0.25], [false, -0.25, 0.8, -0.25, 0.25, 0.25, 0.25, 0.25, 0.8]],   // storehouse
  TECH: [[true, 0, -0.9, 0.78, -0.45, 0.78, 0.45, 0, 0.9, -0.78, 0.45, -0.78, -0.45], dia(0, 0, 0.32)],   // hex nut
  BREWER: [[true, -0.8, -0.2, 0.8, -0.2, 0.55, 0.75, -0.55, 0.75], [false, -0.95, -0.2, 0.95, -0.2], dia(-0.25, -0.62, 0.14), dia(0.25, -0.75, 0.12)],   // cauldron
  FISH: [[true, -0.9, 0, -0.35, -0.5, 0.3, -0.35, 0.55, 0, 0.95, -0.5, 0.95, 0.5, 0.55, 0, 0.3, 0.35, -0.35, 0.5], dia(-0.5, -0.08, 0.1)],   // fish
  MINE: [[false, -0.42, -0.8, 0, -0.66, 0.35, -0.45, 0.66, -0.18, 0.9, 0.18], [false, -0.72, 0.9, 0.35, -0.45]],   // pickaxe
};
/** (owner) the horse stable: a horseshoe (open at the bottom) with nail dots */
const HORSESHOE: Poly[] = [[false, -0.55, 0.85, -0.78, 0.1, -0.7, -0.45, -0.35, -0.82, 0, -0.9, 0.35, -0.82, 0.7, -0.45, 0.78, 0.1, 0.55, 0.85], dia(-0.62, 0.05, 0.1), dia(0.62, 0.05, 0.1), dia(0, -0.62, 0.1)];
/** The town's walkable outline (polar island edge, recomputed when the map seed changes): x, z pairs. */
const ISLE_N = 180, isle = new Float32Array(ISLE_N * 2);
let isleSeed = -1;
function islePoints(): Float32Array {
  if (isleSeed !== mapSeed) {
    isleSeed = mapSeed;
    for (let i = 0; i < ISLE_N; i++) { const a = (i / ISLE_N) * Math.PI * 2, r = islandRadius(a) - 1.2; isle[i * 2] = Math.cos(a) * r; isle[i * 2 + 1] = Math.sin(a) * r; }
  }
  return isle;
}
/** Canvas pixels per css px of the design size W x H: follows the real displayed size x devicePixelRatio (owner: sharper map). */
let DPR = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

/** Rectangular minimap — drawn every frame from the world, no React state. */
export const Minimap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useRaf(() => {
    const c = ref.current; if (!c) return;
    { // keep the backing store 1:1 with screen pixels (the frame is sized in rem, so it rarely equals W css px)
      const cw = c.clientWidth; const want = Math.round(cw * Math.min(3, window.devicePixelRatio || 1));
      if (want > 0 && c.width !== want) { c.width = want; c.height = Math.round(want * H / W); }
      DPR = c.width / W;
    }
    const ctx = c.getContext('2d'); if (!ctx) return;
    const pw = W * DPR, ph = H * DPR, cx = ph / 2, R = cx - 3 * DPR, ox = (pw - ph) / 2;   // square frame of side ph, centred in the wider canvas
    const room = world.room.active;
    const area = room ? '' : world.village.area, town = area === 'TOWN';
    const rad = room ? shape.maxR : ARENA_RADIUS;
    // zoomed in around the hero (not the whole map): about 30 m of radius in view
    const view = room ? Math.min(rad + 4, 28) : 34;
    const k = R / view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.save();
    ctx.translate(ox, 0);
    ctx.beginPath(); ctx.rect(-ox, 0, pw, ph); ctx.clip();
    // parchment-dark map ground
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, pw * 0.6);
    g.addColorStop(0, '#30343a'); g.addColorStop(.7, '#24272c'); g.addColorStop(1, '#17191d');   // (owner: darker, greyer)
    ctx.fillStyle = g; ctx.fillRect(-ox, 0, pw, ph);
    ctx.translate(-world.player.pos.x * k, -world.player.pos.z * k);   // world content follows the hero (hero at the centre)
    // stage liquids (lakes, river / lava / chasm band) and their bridges
    if (room && (feat.river || feat.nLakes > 0)) {
      const lc = feat.liquid === 'LAVA' ? '#e0581a' : feat.liquid === 'CHASM' ? '#07050c' : '#2f7fb0';
      ctx.fillStyle = lc; ctx.strokeStyle = lc;
      for (let i = 0; i < feat.nLakes; i++) { ctx.beginPath(); ctx.arc(cx + feat.lx[i] * k, cx + feat.lz[i] * k, feat.lr[i] * k, 0, Math.PI * 2); ctx.fill(); }
      if (feat.river) {
        ctx.lineWidth = feat.hw * 2 * k; ctx.lineCap = 'butt'; ctx.beginPath();
        for (let s = -rad - 6, first = true; s <= rad + 6; s += 2, first = false) { riverPoint(s, 0, mmPt); const x = cx + mmPt[0] * k, y = cx + mmPt[1] * k; if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = feat.bw * 2 * k;
        for (let i = 0; i < feat.nb; i++) {
          riverPoint(feat.bridgeS[i], -feat.hw - 0.6, mmPt); ctx.beginPath(); ctx.moveTo(cx + mmPt[0] * k, cx + mmPt[1] * k);
          riverPoint(feat.bridgeS[i], feat.hw + 0.6, mmPt); ctx.lineTo(cx + mmPt[0] * k, cx + mmPt[1] * k); ctx.stroke();
        }
      }
    }
    // arena edge
    ctx.strokeStyle = 'rgba(233,185,73,.55)'; ctx.lineWidth = 2 * DPR; ctx.setLineDash([6 * DPR, 4 * DPR]);
    ctx.beginPath();
    if (room && campOn() && camp.cur) {
      // biome camp: the winding road (both edges of the walkable strip, filled)
      const P = camp.cur;
      ctx.beginPath();
      for (let i = 0; i < P.n; i++) { const x = cx + (P.px[i] + P.tz[i] * P.hw[i]) * k, y = cx + (P.pz[i] - P.tx[i] * P.hw[i]) * k; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      for (let i = P.n - 1; i >= 0; i--) ctx.lineTo(cx + (P.px[i] - P.tz[i] * P.hw[i]) * k, cx + (P.pz[i] + P.tx[i] * P.hw[i]) * k);
      ctx.closePath(); ctx.fillStyle = 'rgba(120,128,120,.22)'; ctx.fill();
    } else if (room) {
      // run room: the star-convex outline from the shape table (theta_i = -PI + i*TAU/N)
      for (let i = 0; i <= SHAPE_N; i += 4) {
        const th = -Math.PI + (i * Math.PI * 2) / SHAPE_N, rr = shape.table[i] * k;
        const x = cx + Math.cos(th) * rr, y = cx + Math.sin(th) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (town) {   // the island's walkable outline (narrow back trail, mining camp bay, beach ...), lightly filled
      const pts = islePoints();
      for (let i = 0; i < ISLE_N; i++) { const x = cx + pts[i * 2] * k, y = cx + pts[i * 2 + 1] * k; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fillStyle = 'rgba(120,128,120,.14)'; ctx.fill();
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (town) {   // roads: paved (pale) + the dirt paths outside the walls (brown), and the big boulders on the back trail
      ctx.lineCap = 'round';
      for (const r of ROADS) {
        ctx.strokeStyle = r.dirt ? 'rgba(170,140,100,.95)' : 'rgba(208,204,196,.85)';   // (crisper roads) ctx.lineWidth = Math.max(1.5 * DPR, r.w * k * (r.dirt ? 0.75 : 0.85));
        ctx.beginPath(); ctx.moveTo(cx + r.x1 * k, cx + r.z1 * k); ctx.lineTo(cx + r.x2 * k, cx + r.z2 * k); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.fillStyle = 'rgba(150,150,146,.85)';
      for (const [x, z, r] of TRAIL_ROCKS) { ctx.beginPath(); ctx.arc(cx + x * k, cx + z * k, r * k, 0, Math.PI * 2); ctx.fill(); }
      { const br = rockfallCleared(useGameStore.getState().npcQuests); ROCKFALL.forEach(([x, z, r], i) => { if (br && i === ROCKFALL_BREAK) return; ctx.beginPath(); ctx.arc(cx + x * k, cx + z * k, r * k, 0, Math.PI * 2); ctx.fill(); }); }   // (Erin's rockfall: the middle boulder breaks)
    }
    // indoor areas: the castle hall rectangle / the cave outline (filled rock floor), the way out, the cave's harvest nodes
    if (area === 'HOME') {
      ctx.fillStyle = 'rgba(138,100,64,.4)'; ctx.strokeStyle = 'rgba(200,170,130,.9)'; ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath(); ctx.rect(cx - HOME_ROOM.hw * k, cx - HOME_ROOM.hd * k, HOME_ROOM.hw * 2 * k, HOME_ROOM.hd * 2 * k); ctx.fill(); ctx.stroke();
    }
    if (area === 'TAVERN') {
      ctx.fillStyle = 'rgba(138,100,64,.4)'; ctx.strokeStyle = 'rgba(200,170,130,.9)'; ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath(); ctx.rect(cx - TAP.hw * k, cx - TAP.hd * k, TAP.hw * 2 * k, TAP.hd * 2 * k); ctx.fill(); ctx.stroke();
    }
    if (area === 'CHURCH') {
      ctx.fillStyle = 'rgba(120,112,98,.35)'; ctx.strokeStyle = 'rgba(190,184,170,.9)'; ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath(); ctx.rect(cx - NAVE.hw * k, cx - NAVE.hd * k, NAVE.hw * 2 * k, NAVE.hd * 2 * k); ctx.fill(); ctx.stroke();
    }
    if (area === 'CASTLE') {
      ctx.fillStyle = 'rgba(120,112,98,.35)'; ctx.strokeStyle = 'rgba(190,184,170,.9)'; ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath(); ctx.rect(cx - HALL.hw * k, cx - HALL.hd * k, HALL.hw * 2 * k, HALL.hd * 2 * k); ctx.fill(); ctx.stroke();
    } else if (area === 'CAVE') drawCaveMinimap(ctx, cx, k, DPR);   // floor outline, pools, stairs, ladder, flasks, veins, the way out
    if (area === 'CASTLE' || area === 'CHURCH' || area === 'TAVERN' || area === 'HOME') {   // the way out (gold arrow pointing south)
      const gx = cx, gy = cx + (area === 'CHURCH' ? NAVE.hd : area === 'TAVERN' ? TAP.hd : area === 'HOME' ? HOME_ROOM.hd : HALL.hd) * k;
      ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.moveTo(gx - 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx + 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx, gy + 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the lake west of the wall + the beach (sand strip, pier) on its southern half (village only)
    if (town) {
      ctx.fillStyle = 'rgba(47,111,148,.75)'; ctx.fillRect(cx + LAKE.x0 * k, cx + LAKE.z0 * k, (LAKE.x1 - LAKE.x0) * k, (LAKE.z1 - LAKE.z0) * k);
      ctx.fillStyle = 'rgba(196,172,118,.75)'; ctx.fillRect(cx + BEACH.shoreX * k, cx + BEACH.z0 * k, (WALL.x0 - BEACH.shoreX) * k, (BEACH.z1 - BEACH.z0) * k);
      ctx.fillStyle = 'rgba(138,100,64,.95)';
      ctx.fillRect(cx + DOCK.x1 * k, cx + (DOCK.z - DOCK.hw) * k, (BEACH.shoreX + 2 - DOCK.x1) * k, DOCK.hw * 2 * k);
      ctx.fillRect(cx + DOCK.head.x0 * k, cx + DOCK.head.z0 * k, (DOCK.head.x1 - DOCK.head.x0) * k, (DOCK.head.z1 - DOCK.head.z0) * k);
    }
    // town wall outline + towers (village only; the gate gap is the break in the south side)
    if (town) {
      ctx.strokeStyle = 'rgba(190,184,170,.9)'; ctx.lineWidth = 2.2 * DPR; ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const [x1, z1, x2, z2] of WALL_RUNS) { ctx.moveTo(cx + x1 * k, cx + z1 * k); ctx.lineTo(cx + x2 * k, cx + z2 * k); }
      ctx.stroke();
      ctx.fillStyle = '#c9c3b4';
      for (const t of WALL_TOWERS) { ctx.beginPath(); ctx.arc(cx + t.x * k, cx + t.z * k, (t.corner ? 2.6 : 2) * DPR, 0, Math.PI * 2); ctx.fill(); }
    }
    // obstacles
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    const obs = world.obstacles;
    for (let i = 0; (room || town) && i < obs.length; i++) {   // (the town's obstacles are not loaded indoors)
      const o = obs[i]; const p = (o as any).pos ?? (o as any).position; if (!p) continue;
      ctx.beginPath(); ctx.arc(cx + p.x * k, cx + p.z * k, Math.max(1, (o.radius ?? 1) * k), 0, Math.PI * 2); ctx.fill();
    }
    // exit portals + station (room) or shops (town)
    if (room) {
      const r = world.room;
      if (r.station.kind !== 'NONE') { ctx.fillStyle = '#5fd6ff'; ctx.fillRect(cx + r.station.x * k - 3 * DPR, cx + r.station.z * k - 3 * DPR, 6 * DPR, 6 * DPR); }
      for (let i = 0; i < r.portals.length; i++) {
        const po = r.portals[i]; if (!po.active) continue;
        ctx.fillStyle = portalLabel(po.plan, r.biome).color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * DPR;
        ctx.beginPath(); ctx.arc(cx + po.x * k, cx + po.z * k, 4.5 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    for (let si = 0; town && si < SHOP_POSITIONS.length; si++) {
      const s = SHOP_POSITIONS[si];
      const x = cx + s.position[0] * k, y = cx + s.position[2] * k;
      const b = 8.5 * DPR, u = 5.2 * DPR;
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(10,7,5,.9)'; ctx.strokeStyle = s.color; ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath(); ctx.rect(x - b, y - b, b * 2, b * 2); ctx.fill(); ctx.stroke();   // sharp square badge
      const icon = SHOP_ICON[s.type];
      if (icon) {
        ctx.lineWidth = 1.25 * DPR; ctx.beginPath();
        for (const poly of icon) {
          for (let j = 1; j < poly.length; j += 2) { const px = x + (poly[j] as number) * u, py = y + (poly[j + 1] as number) * u; if (j === 1) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
          if (poly[0]) ctx.closePath();
        }
        ctx.stroke();
      }
    }
    // village: quest board / altar / trainer (small gold-violet-orange dots) and the town gate (gold arrow, easy to spot)
    if (town) {
      // the crystal cave entrance (east, beyond the ring path): a dark disc with a cyan crystal
      { const x = cx + CAVE_DOOR.x * k, y = cx + CAVE_DOOR.z * k;
        ctx.fillStyle = 'rgba(13,7,3,.85)'; ctx.strokeStyle = '#6fe6ff'; ctx.lineWidth = 1.5 * DPR;
        ctx.beginPath(); ctx.arc(x, y, 7 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6fe6ff'; ctx.beginPath(); ctx.moveTo(x, y - 4.5 * DPR); ctx.lineTo(x + 3 * DPR, y); ctx.lineTo(x, y + 4.5 * DPR); ctx.lineTo(x - 3 * DPR, y); ctx.closePath(); ctx.fill(); }
      // (owner) the horse stable: a badge like the shops' (horseshoe), and each free horse as a small chestnut dot
      { const x = cx + STABLE.x * k, y = cx + (STABLE.paddock.z0 + STABLE.paddock.z1) / 2 * k, b = 8.5 * DPR, u = 5.2 * DPR;
        ctx.fillStyle = 'rgba(10,7,5,.9)'; ctx.strokeStyle = '#d9a066'; ctx.lineWidth = 1.2 * DPR;
        ctx.beginPath(); ctx.rect(x - b, y - b, b * 2, b * 2); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1.4 * DPR; ctx.beginPath();
        for (const poly of HORSESHOE) { for (let j = 1; j < poly.length; j += 2) { const px = x + (poly[j] as number) * u, py = y + (poly[j + 1] as number) * u; if (j === 1) ctx.moveTo(px, py); else ctx.lineTo(px, py); } if (poly[0]) ctx.closePath(); }
        ctx.stroke(); }
      for (let i = 0; i < animals.length; i++) {
        if (ANIMALS[i].kind !== 'HORSE' || animals[i].ridden) continue;
        ctx.fillStyle = '#c98a4a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1 * DPR;
        ctx.beginPath(); ctx.arc(cx + animals[i].x * k, cx + animals[i].z * k, 2.2 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      const dots: [number[], string][] = [[QUEST_POS, '#ffd24a'], [SHRINE_POS, '#b57cff'], [TRAINER_POS, '#ffb04a']];
      for (const [pp, col] of dots) {
        ctx.fillStyle = col; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.2 * DPR;
        ctx.beginPath(); ctx.arc(cx + pp[0] * k, cx + pp[2] * k, 3 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      const gx = cx + GATE.x * k, gy = cx + GATE.z * k;
      ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.moveTo(gx - 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx + 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx, gy + 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // enemies
    const es = world.enemies;
    let boss: typeof es[number] | null = null;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.active || e.state === 'DYING') continue;
      if (e.boss) { boss = e; continue; }
      const x = cx + e.pos.x * k, y = cx + e.pos.z * k;
      if (e.elite) { ctx.fillStyle = '#c084fc'; ctx.fillRect(x - 2.5 * DPR, y - 2.5 * DPR, 5 * DPR, 5 * DPR); }
      else { ctx.fillStyle = '#ef4444'; ctx.fillRect(x - 1.2 * DPR, y - 1.2 * DPR, 2.4 * DPR, 2.4 * DPR); }
    }
    if (boss) {
      const x = cx + boss.pos.x * k, y = cx + boss.pos.z * k;
      ctx.fillStyle = '#ff2a2a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.arc(x, y, 6 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `${9 * DPR}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☠', x, y + .5 * DPR);
    }
    // player arrow (facing: atan2(dx, dz) => canvas dir = (sin f, cos f))
    const p = world.player;
    const px2 = cx + p.pos.x * k, py2 = cx + p.pos.z * k;
    if (town && world.village.ride.on) {   // (owner) on horseback: a chestnut ring round the arrow
      ctx.strokeStyle = '#d9a066'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(px2, py2, 8.5 * DPR, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save(); ctx.translate(px2, py2); ctx.rotate(Math.PI - p.facing);
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
    ctx.beginPath(); ctx.moveTo(0, -6 * DPR); ctx.lineTo(4.5 * DPR, 5 * DPR); ctx.lineTo(0, 2.5 * DPR); ctx.lineTo(-4.5 * DPR, 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    if (area === 'CAVE') drawCaveFloorTag(ctx, ox + 6 * DPR, 6 * DPR, DPR);
  });
  return (
    <div className="pe relative" style={{ width: `${W / 14.4}rem`, height: `${H / 14.4}rem` }}>
      <canvas ref={ref} width={W * DPR} height={H * DPR} className="absolute inset-0 w-full h-full mm-canvas" />
      <span className="absolute left-1/2 grid place-items-center rpg-num mm-north">N</span>
    </div>
  );
};
