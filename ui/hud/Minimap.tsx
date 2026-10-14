import React, { useRef } from 'react';
import { world, ARENA_RADIUS, QUEST_POS, SHRINE_POS, TRAINER_POS } from '../../engine/world';
import { GATE, WALL_RUNS, WALL_TOWERS } from '../../engine/townData';
import { shape, SHAPE_N } from '../../engine/roomShape';
import { SHOP_POSITIONS } from '../../constants';
import { portalLabel } from '../../engine/roomDefs';
import { useRaf } from '../hooks/useRaf';

const SIZE = 196; // css px
const DPR = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

/** Circular minimap — drawn every frame from the world, no React state. */
export const Minimap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useRaf(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const px = SIZE * DPR, cx = px / 2, R = cx - 3 * DPR;
    const room = world.room.active;
    const rad = room ? shape.maxR : ARENA_RADIUS;
    // zoomed in around the hero (not the whole map): about 30 m of radius in view
    const view = room ? Math.min(rad + 4, 28) : 34;
    const k = R / view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.clip();
    // parchment-dark map ground
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, R);
    g.addColorStop(0, '#2f4a2a'); g.addColorStop(.8, '#223a22'); g.addColorStop(1, '#14231a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
    ctx.translate(-world.player.pos.x * k, -world.player.pos.z * k);   // world content follows the hero (hero at the centre)
    // arena edge
    ctx.strokeStyle = 'rgba(233,185,73,.55)'; ctx.lineWidth = 2 * DPR; ctx.setLineDash([6 * DPR, 4 * DPR]);
    ctx.beginPath();
    if (room) {
      // run room: the star-convex outline from the shape table (theta_i = -PI + i*TAU/N)
      for (let i = 0; i <= SHAPE_N; i += 4) {
        const th = -Math.PI + (i * Math.PI * 2) / SHAPE_N, rr = shape.table[i] * k;
        const x = cx + Math.cos(th) * rr, y = cx + Math.sin(th) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else ctx.arc(cx, cx, rad * k, 0, Math.PI * 2);
    ctx.stroke(); ctx.setLineDash([]);
    // town wall outline + towers (village only; the gate gap is the break in the south side)
    if (!room) {
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
    for (let i = 0; i < obs.length; i++) {
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
    for (let si = 0; !room && si < SHOP_POSITIONS.length; si++) {
      const s = SHOP_POSITIONS[si];
      const x = cx + s.position[0] * k, y = cx + s.position[2] * k;
      ctx.fillStyle = s.color; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.rect(x - 3.5 * DPR, y - 3.5 * DPR, 7 * DPR, 7 * DPR); ctx.fill(); ctx.stroke();
    }
    // village: quest board / altar / trainer (small gold-violet-orange dots) and the town gate (gold arrow, easy to spot)
    if (!room) {
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
    ctx.save(); ctx.translate(px2, py2); ctx.rotate(Math.PI - p.facing);
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
    ctx.beginPath(); ctx.moveTo(0, -6 * DPR); ctx.lineTo(4.5 * DPR, 5 * DPR); ctx.lineTo(0, 2.5 * DPR); ctx.lineTo(-4.5 * DPR, 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
  });
  return (
    <div className="pe relative" style={{ width: `${SIZE / 14.4}rem`, height: `${SIZE / 14.4}rem` }}>
      <div className="absolute mm-ring" />
      <canvas ref={ref} width={SIZE * DPR} height={SIZE * DPR} className="absolute inset-0 w-full h-full rounded-full" />
      <span className="absolute left-1/2 grid place-items-center rpg-num" style={{ top: '-.85rem', width: '1.5rem', height: '1.5rem', transform: 'translateX(-50%)', borderRadius: '50%', fontSize: '.8rem', color: 'var(--gold-light)', background: 'radial-gradient(circle at 40% 30%, #3a342a, #0f0c09 75%)', boxShadow: '0 0 0 1.5px #c8962e, 0 0 0 3px #0a0709', zIndex: 2 }}>N</span>
    </div>
  );
};
