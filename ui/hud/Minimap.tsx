import React, { useRef } from 'react';
import { world, ARENA_RADIUS } from '../../engine/world';
import { SHOP_POSITIONS } from '../../constants';
import { useRaf } from '../hooks/useRaf';

const SIZE = 148; // css px
const DPR = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

/** Circular minimap — drawn every frame from the world, no React state. */
export const Minimap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useRaf(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const px = SIZE * DPR, cx = px / 2, R = cx - 3 * DPR;
    const k = R / (ARENA_RADIUS + 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.clip();
    // parchment-dark map ground
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, R);
    g.addColorStop(0, '#2f4a2a'); g.addColorStop(.8, '#223a22'); g.addColorStop(1, '#14231a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
    // arena edge
    ctx.strokeStyle = 'rgba(233,185,73,.55)'; ctx.lineWidth = 2 * DPR; ctx.setLineDash([6 * DPR, 4 * DPR]);
    ctx.beginPath(); ctx.arc(cx, cx, ARENA_RADIUS * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // obstacles
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    const obs = world.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i]; const p = (o as any).pos ?? (o as any).position; if (!p) continue;
      ctx.beginPath(); ctx.arc(cx + p.x * k, cx + p.z * k, Math.max(1, (o.radius ?? 1) * k), 0, Math.PI * 2); ctx.fill();
    }
    // shops
    for (const s of SHOP_POSITIONS) {
      const x = cx + s.position[0] * k, y = cx + s.position[2] * k;
      ctx.fillStyle = s.color; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
      ctx.beginPath(); ctx.rect(x - 3.5 * DPR, y - 3.5 * DPR, 7 * DPR, 7 * DPR); ctx.fill(); ctx.stroke();
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
    ctx.fillStyle = '#7fd1ff'; ctx.strokeStyle = '#0d0703'; ctx.lineWidth = 1.5 * DPR;
    ctx.beginPath(); ctx.moveTo(0, -6 * DPR); ctx.lineTo(4.5 * DPR, 5 * DPR); ctx.lineTo(0, 2.5 * DPR); ctx.lineTo(-4.5 * DPR, 5 * DPR); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
  });
  return (
    <div className="pe relative" style={{ width: `${SIZE / 14.4}rem`, height: `${SIZE / 14.4}rem` }}>
      <div className="absolute rounded-full" style={{ inset: '-.45rem', background: 'conic-gradient(from 20deg, #fff0b0, #b9812e, #6a410c, #d8a23c, #fff0b0, #b9812e, #6a410c, #d8a23c, #fff0b0)', boxShadow: '0 0 0 2px #0d0703, 0 8px 18px rgba(0,0,0,.7)' }} />
      <div className="absolute rounded-full" style={{ inset: '-.12rem', background: '#0d0703' }} />
      <canvas ref={ref} width={SIZE * DPR} height={SIZE * DPR} className="absolute inset-0 w-full h-full rounded-full" />
      {['N'].map((l) => <span key={l} className="absolute left-1/2 -translate-x-1/2 -top-[.95rem] rpg-key sm" style={{ position: 'absolute', top: '-1.15rem' }}>{l}</span>)}
    </div>
  );
};
