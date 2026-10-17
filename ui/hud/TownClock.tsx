import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

const label = (t: number) => (t < 0.04 || t >= 0.96 ? 'Dawn' : t < 0.2 ? 'Morning' : t < 0.31 ? 'Noon' : t < 0.43 ? 'Afternoon' : t < 0.58 ? 'Dusk' : t < 0.68 ? 'Evening' : 'Night');

/** Town only: a tiny sun / moon icon + the time of day. Written to DOM refs from the rAF hook (no setState). */
export const TownClock: React.FC = () => {
  const text = useRef<HTMLSpanElement>(null), sun = useRef<SVGSVGElement>(null), moon = useRef<SVGSVGElement>(null);
  const last = useRef(-1);
  useRaf(() => {
    const t = world.townTime, h = (6 + t * 24) % 24, min = Math.floor(h * 60);
    if (min === last.current || !text.current) return;
    last.current = min;
    text.current.textContent = `${label(t)} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    const night = t >= 0.55 && t < 0.97;
    if (sun.current) sun.current.style.display = night ? 'none' : '';
    if (moon.current) moon.current.style.display = night ? '' : 'none';
  });
  return (
    <div data-testid="town-clock" className="flex items-center gap-1.5 px-2 py-0.5 rounded-full pointer-events-none"
      style={{ background: 'rgba(10,8,6,0.62)', border: '1px solid rgba(200,150,46,0.45)', color: '#f1e2b8', fontSize: '.7rem', letterSpacing: '.04em' }}>
      <svg ref={sun} width="14" height="14" viewBox="-8 -8 16 16" fill="none" stroke="#ffd24a" strokeWidth="1.4" strokeLinecap="round">
        <circle r="3" fill="#ffd24a" />{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} x1={Math.cos(i * 0.785) * 5} y1={Math.sin(i * 0.785) * 5} x2={Math.cos(i * 0.785) * 7} y2={Math.sin(i * 0.785) * 7} />)}
      </svg>
      <svg ref={moon} width="14" height="14" viewBox="-8 -8 16 16" style={{ display: 'none' }}><path d="M2 -7 A7 7 0 1 0 7 3 A5.5 5.5 0 0 1 2 -7 Z" fill="#cfe0ff" /></svg>
      <span ref={text}>Morning 09:36</span>
    </div>
  );
};
