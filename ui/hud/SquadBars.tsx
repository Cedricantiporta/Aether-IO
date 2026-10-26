import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Dark hero squad (owner 2026-10-26: up to 6 dark heroes at once): a small name + hp bar floats over each hero's head while two or more fight.
 *  Data: world.darkBars (engine/systems/darkHero.ts fills hp, render/CameraRig the screen anchor). Written to the DOM through refs, no re-render. */
const N = 6;
export const SquadBars: React.FC = () => {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const fills = useRef<(HTMLDivElement | null)[]>([]);
  const names = useRef<(HTMLSpanElement | null)[]>([]);
  const st = useRef({ names: Array<string>(N).fill(''), w: Array<string>(N).fill('') });
  useRaf(() => {
    let live = 0;
    for (let k = 0; k < N; k++) if (world.darkBars[k].active) live++;
    const W = window.innerWidth, H = window.innerHeight;
    for (let k = 0; k < N; k++) {
      const b = world.darkBars[k], r = rows.current[k];
      if (!r) continue;
      const on = live >= 2 && b.active && b.onScreen;
      if (!on) { if (r.style.display !== 'none') r.style.display = 'none'; continue; }
      if (r.style.display !== 'block') r.style.display = 'block';
      const x = Math.min(W - 60, Math.max(60, b.sx)), y = Math.min(H - 40, Math.max(120, b.sy));
      r.style.transform = `translate(${(x - 55).toFixed(1)}px, ${(y - 26).toFixed(1)}px)`;
      const w = `${(Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp))) * 100).toFixed(1)}%`;
      if (w !== st.current.w[k]) { st.current.w[k] = w; const f = fills.current[k]; if (f) f.style.width = w; }
      if (b.name !== st.current.names[k]) { st.current.names[k] = b.name; const n = names.current[k]; if (n) n.textContent = b.name; }
    }
  });
  return (
    <>
      {Array.from({ length: N }, (_, k) => (
        <div key={k} ref={(el) => { rows.current[k] = el; }} data-testid={`squad-bar-${k}`}
          style={{ display: 'none', position: 'absolute', left: 0, top: 0, width: 110, pointerEvents: 'none', willChange: 'transform', zIndex: 3 }}>
          <div style={{ textAlign: 'center', fontSize: '.62rem', fontWeight: 800, color: '#e9d5ff', textShadow: '0 1px 2px #000, 0 0 6px #7c3aed', lineHeight: 1.1, marginBottom: 2 }}><span ref={(el) => { names.current[k] = el; }} /></div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(10,4,24,.72)', border: '1.5px solid #2b1747', overflow: 'hidden' }}>
            <div ref={(el) => { fills.current[k] = el; }} style={{ width: '100%', height: '100%', borderRadius: 999, background: 'linear-gradient(180deg,#ff8fb0,#c026d3)' }} />
          </div>
        </div>
      ))}
    </>
  );
};
