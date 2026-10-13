import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import { tip } from '../components/Tooltip';
import { OrnateRing } from '../components/Ornate';

interface Props { icon: React.ReactNode; tooltip: React.ReactNode; color: string }

/** Ornate ultimate slot: radial charge fill that glows and pulses when ready (key R). */
export const UltSlot: React.FC<Props> = ({ icon, tooltip, color }) => {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const last = useRef({ v: -1, ready: false, active: false });
  useRaf(() => {
    const p = world.player;
    const v = Math.floor(p.ult);
    const ready = p.ult >= 99.99 && p.ultT <= 0;
    const active = p.ultT > 0;
    const l = last.current;
    if (v !== l.v && fill.current && txt.current) {
      l.v = v;
      fill.current.style.setProperty('--ult', String(p.ult / 100));
      txt.current.textContent = ready ? 'R' : `${v}%`;
    }
    if (ready !== l.ready || active !== l.active) {
      l.ready = ready; l.active = active;
      root.current?.setAttribute('data-ready', ready ? '1' : '0');
      root.current?.setAttribute('data-active', active ? '1' : '0');
      if (txt.current) txt.current.textContent = ready ? 'R' : active ? '...' : `${Math.floor(p.ult)}%`;
    }
  });
  const shake = () => {
    const el = root.current; if (!el) return;
    el.classList.remove('slot-shake'); void el.offsetWidth; el.classList.add('slot-shake');
  };
  useGameEvent('onCooldown', (p) => { if (p.slot === 'r') shake(); });
  return (
    <div className="relative pe ult-slot" {...tip(tooltip)} style={{ ['--uc' as any]: color, width: '6.2rem', height: '6.2rem', flex: 'none', margin: '0 .3rem' }}>
      <style>{`
        .ult-slot .ult-core{position:absolute;inset:17%;border-radius:50%;overflow:hidden;background:#07050a;box-shadow:inset 0 0 12px #000}
        .ult-slot .ult-core .ico{position:absolute;inset:0;filter:grayscale(.85) brightness(.55);transition:filter .3s}
        .ult-slot[data-ready="1"] .ult-core .ico,.ult-slot[data-active="1"] .ult-core .ico{filter:none}
        .ult-slot .ult-fill{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,color-mix(in srgb,var(--uc) 70%,transparent) calc(var(--ult,0)*360deg),transparent 0);mix-blend-mode:screen;pointer-events:none}
        .ult-slot .ult-glow{position:absolute;inset:6%;border-radius:50%;pointer-events:none;opacity:0;box-shadow:0 0 18px 4px var(--uc),inset 0 0 14px var(--uc)}
        .ult-slot[data-ready="1"] .ult-glow{opacity:1;animation:ultPulse 1.1s ease-in-out infinite}
        .ult-slot[data-active="1"] .ult-glow{opacity:1;animation:ultPulse .35s ease-in-out infinite}
        .ult-slot .ult-txt{position:absolute;left:0;right:0;bottom:12%;text-align:center;font-weight:800;font-size:.8rem;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000;z-index:4;pointer-events:none}
        .ult-slot[data-ready="1"] .ult-txt{color:#ffe9a0;font-size:1.05rem;bottom:34%}
        @keyframes ultPulse{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.07);opacity:1}}
      `}</style>
      <div ref={root} data-ready="0" data-active="0" style={{ position: 'absolute', inset: 0 }}>
        <div className="ult-glow" />
        <div className="ult-core"><div className="ico">{icon}</div><div ref={fill} className="ult-fill" /></div>
        <OrnateRing id="ult" spikes={8} />
        <span ref={txt} className="ult-txt">0%</span>
      </div>
      <span className="rpg-key">R</span>
    </div>
  );
};
