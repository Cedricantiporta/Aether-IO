import React, { useRef } from 'react';
import { combo, COMBO_WINDOW } from '../../engine/systems/combo';
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
      if (label.current) label.current.textContent = `COMBO ×${combo.stacks}`;
      if (root.current) { root.current.dataset.n = String(combo.stacks); root.current.classList.remove('combo-pop'); void root.current.offsetWidth; root.current.classList.add('combo-pop'); }
    }
    if (root.current) root.current.style.opacity = on ? '1' : '0';
    const p = (Math.max(0, combo.t) / COMBO_WINDOW).toFixed(3);
    if (p !== l.p) { l.p = p; ring.current?.setAttribute('stroke-dashoffset', String((1 - Math.max(0, combo.t) / COMBO_WINDOW) * 113)); }
    const f = combo.finisher > 0;
    if (f !== l.fin) { l.fin = f; if (fin.current) { fin.current.style.opacity = f ? '1' : '0'; if (f) { fin.current.classList.remove('combo-fin'); void fin.current.offsetWidth; fin.current.classList.add('combo-fin'); } } }
  });
  const pos: React.CSSProperties = touch
    ? { position: 'absolute', right: 'calc(env(safe-area-inset-right, 0px) + 1.2vw)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 34vh)', zIndex: 7 }
    : { position: 'absolute', left: '50%', bottom: '9.4rem', transform: 'translateX(-50%)', zIndex: 7 };
  return (
    <div className="pointer-events-none" style={pos} data-testid="combo-meter">
      <div ref={fin} style={{ position: 'absolute', left: '50%', bottom: '2.2rem', transform: 'translateX(-50%)', opacity: 0, fontSize: touch ? '1.1rem' : '1.7rem', fontWeight: 900, letterSpacing: '.2em', color: '#ffe27a', textShadow: '0 0 14px #ff9a00, 0 2px 0 #7a2a00', whiteSpace: 'nowrap' }}>FINISHER!</div>
      <div ref={root} data-n="0" className="combo-box" style={{ opacity: 0 }}>
        <svg width="34" height="34" viewBox="0 0 44 44" style={{ marginRight: '.45rem' }}>
          <circle cx="22" cy="22" r="18" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
          <circle ref={ring} cx="22" cy="22" r="18" fill="none" stroke="#ffd23a" strokeWidth="4" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="0" transform="rotate(-90 22 22)" />
        </svg>
        <span ref={label} className="combo-label">COMBO &times;0</span>
      </div>
    </div>
  );
};
