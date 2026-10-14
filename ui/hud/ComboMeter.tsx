import React, { useRef } from 'react';
import { combo, COMBO_WINDOW, comboTier } from '../../engine/systems/combo';
import { useRaf } from '../hooks/useRaf';

/** "COMBO xN" counter with a timer ring and a flashy FINISHER! text. Per-frame values are written via refs. */
export const ComboMeter: React.FC<{ touch?: boolean }> = ({ touch }) => {
  const root = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const last = useRef({ stacks: -1, p: '', fin: false });
  useRaf(() => {
    const l = last.current;
    const on = combo.stacks > 0 && combo.t > 0;
    if (combo.stacks !== l.stacks) {
      l.stacks = combo.stacks;
      if (label.current) label.current.textContent = `${combo.stacks} HITS`;
      if (root.current) { root.current.dataset.n = String(comboTier()); if (combo.stacks % 10 === 0) { root.current.classList.remove('combo-pop'); void root.current.offsetWidth; root.current.classList.add('combo-pop'); } }
    }
    if (root.current) root.current.style.opacity = on ? '1' : '0';
    const p = (Math.max(0, combo.t) / COMBO_WINDOW).toFixed(3);
    if (p !== l.p) { l.p = p; ring.current?.setAttribute('stroke-dashoffset', String((1 - Math.max(0, combo.t) / COMBO_WINDOW) * 113)); }
    const f = combo.finisher > 0;
    if (f !== l.fin) { l.fin = f; if (fin.current) { fin.current.style.opacity = f ? '1' : '0'; if (f) { fin.current.classList.remove('combo-fin'); void fin.current.offsetWidth; fin.current.classList.add('combo-fin'); } } }
  });
  // sits in the top-centre column under the run plaque (in flow, so it never covers the skill bar / passive icons)
  const pos: React.CSSProperties = { position: 'relative', height: '2.4rem', display: 'flex', justifyContent: 'center', zIndex: 7 };
  return (
    <div className="pointer-events-none" style={pos} data-testid="combo-meter">
      <div ref={fin} style={{ position: 'absolute', left: '50%', top: '-.2rem', transform: 'translateX(-50%)', opacity: 0, fontSize: touch ? '1rem' : '1.3rem', fontWeight: 900, letterSpacing: '.2em', color: '#ffe27a', textShadow: '0 0 14px #ff9a00, 0 2px 0 #7a2a00', whiteSpace: 'nowrap' }}>FINISHER!</div>
      <div ref={root} data-n="0" className="combo-box" style={{ opacity: 0 }}>
        <svg width="26" height="26" viewBox="0 0 44 44" style={{ marginRight: '.45rem' }}>
          <circle cx="22" cy="22" r="18" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
          <circle ref={ring} cx="22" cy="22" r="18" fill="none" stroke="#ffd23a" strokeWidth="4" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="0" transform="rotate(-90 22 22)" />
        </svg>
        <span ref={label} className="combo-label">COMBO &times;0</span>
      </div>
    </div>
  );
};
