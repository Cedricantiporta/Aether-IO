// Minimap layer for the crystal cave (ui/hud/Minimap.tsx calls it inside its world transform): the floor outline, hazard
// pools, the stairs down (red = boarded up, cyan = open), the lucky ladder once found, oil flasks, veins (rare veins as
// big rarity-coloured diamonds) and the way out (gold arrow). `drawCaveFloorTag` puts "FLOOR n" on the frame.
import { world } from '../../engine/world';
import { caveLayout, RARE_COLOR } from '../../engine/caveData';
import { caveLava } from '../../engine/lavaFloor';

const diamond = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.75, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.75, y); ctx.closePath(); };

export function drawCaveMinimap(ctx: CanvasRenderingContext2D, cx: number, k: number, DPR: number): void {
  const cv = world.village.cave, L = caveLayout(cv.floor, cv.seed);
  ctx.fillStyle = 'rgba(70,64,58,.75)'; ctx.strokeStyle = 'rgba(150,140,128,.95)'; ctx.lineWidth = 2.2 * DPR;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, r = L.radius(a) * k; const x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // hazard pools
  if (L.pools.length) {
    ctx.fillStyle = L.hazard === 'LAVA' ? 'rgba(255,110,40,.85)' : 'rgba(110,230,80,.75)';
    for (const [x, z, r] of L.pools) { ctx.beginPath(); ctx.arc(cx + x * k, cx + z * k, r * k, 0, Math.PI * 2); ctx.fill(); }
  }
  { const cl = L.hazard === 'LAVA' ? caveLava(L) : null; if (cl) { ctx.fillStyle = 'rgba(255,110,40,.85)'; for (const d of cl.discs) { ctx.beginPath(); ctx.arc(cx + d.x * k, cx + d.z * k, Math.max(1, d.r * k), 0, Math.PI * 2); ctx.fill(); } } }
  // stairs down
  { const x = cx + L.down.x * k, y = cx + L.down.z * k, open = cv.left <= 0;
    ctx.fillStyle = open ? '#5fe0ff' : '#c0503a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
    ctx.beginPath(); ctx.rect(x - 5 * DPR, y - 5 * DPR, 10 * DPR, 10 * DPR); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d0703'; ctx.beginPath(); ctx.moveTo(x - 3 * DPR, y - 2 * DPR); ctx.lineTo(x + 3 * DPR, y - 2 * DPR); ctx.lineTo(x, y + 3 * DPR); ctx.closePath(); ctx.fill(); }
  // lucky ladder
  if (cv.ladderFound) { const x = cx + cv.lx * k, y = cx + cv.lz * k; ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.arc(x, y, 5 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#0d0703'; ctx.fillRect(x - 2.5 * DPR, y - 0.6 * DPR, 5 * DPR, 1.2 * DPR); ctx.fillRect(x - 2.5 * DPR, y - 3 * DPR, 1 * DPR, 6 * DPR); ctx.fillRect(x + 1.5 * DPR, y - 3 * DPR, 1 * DPR, 6 * DPR); }
  // oil flasks
  for (const f of cv.flasks) if (f.on) { ctx.fillStyle = '#ffb83a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.2 * DPR; ctx.beginPath(); ctx.arc(cx + f.x * k, cx + f.z * k, 3.2 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // veins
  for (let i = 0; i < L.nodes.length && i < world.crates.length; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    const x = cx + c.pos.x * k, y = cx + c.pos.z * k, t = cv.rare[i];
    if (t > 0) { ctx.fillStyle = RARE_COLOR[t]; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * DPR; diamond(ctx, x, y, 6 * DPR); ctx.fill(); ctx.stroke(); continue; }
    ctx.fillStyle = c.kind === 'CRYSTAL' ? '#6fe6ff' : c.kind === 'GOLD_VEIN' ? '#ffd24a' : '#c9a27a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.2 * DPR;
    ctx.beginPath(); ctx.arc(x, y, 3 * DPR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // the way out (Floor 1: to the town; deeper: the stairs back up)
  const gx = cx + L.exit.x * k, gy = cx + L.exit.z * k;
  ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
  ctx.beginPath(); ctx.moveTo(gx - 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx + 6 * DPR, gy - 4 * DPR); ctx.lineTo(gx, gy + 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
}

const TAGS = Array.from({ length: 32 }, (_, f) => (f === 1 ? 'CAVE · FLOOR 1' : 'FLOOR ' + f));
/** "FLOOR n" tag in the minimap's top-left corner (screen space). */
export function drawCaveFloorTag(ctx: CanvasRenderingContext2D, x: number, y: number, DPR: number): void {
  const f = world.village.cave.floor;
  ctx.font = `bold ${12 * DPR}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.lineWidth = 3 * DPR; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#9fe6ff';
  const s = TAGS[Math.min(TAGS.length - 1, f)];
  ctx.strokeText(s, x, y); ctx.fillText(s, x, y);
}
