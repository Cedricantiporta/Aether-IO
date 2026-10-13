import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { abilityState } from '../../engine/systems/abilities';
import { useRaf } from '../hooks/useRaf';
import { useGameEvent } from '../hooks/useEvent';
import { tip } from '../components/Tooltip';

interface Props { icon: React.ReactNode; tooltip: React.ReactNode; color: string }

/** Desktop ultimate button (key R): charge fills clockwise, glows when ready. */
export const UltSlot: React.FC<Props> = ({ icon, tooltip, color }) => {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const last = useRef({ v: -1, ready: false, active: false });
  useRaf(() => {
    const p = world.player;
    const v = Math.floor(p.ult);
    const cd = abilityState.ultCd;
    const ready = p.ult >= 99.99 && p.ultT <= 0 && cd <= 0;
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
      if (txt.current) txt.current.textContent = ready ? 'R' : active ? '...' : cd > 0 ? `${Math.ceil(cd)}s` : `${Math.floor(p.ult)}%`;
    }
  });
  const shake = () => {
    const el = root.current; if (!el) return;
    el.classList.remove('slot-shake'); void el.offsetWidth; el.classList.add('slot-shake');
  };
  useGameEvent('onCooldown', (p) => { if (p.slot === 'r') shake(); });
  return (
    <div ref={root} data-ready="0" data-active="0" className="rbtn pe" {...tip(tooltip)} style={{ ['--s' as any]: '68px', ['--rc' as any]: color }}>
      <div className="rb-in">
        <span className="slot-icon" style={{ filter: 'saturate(.7) brightness(.8)' }}>{icon}</span>
        <div ref={fill} className="absolute inset-0" style={{ background: 'conic-gradient(rgba(10,12,20,0) calc(var(--ult,0)*360deg), rgba(10,12,20,.62) 0)' }} />
        <span ref={txt} className="rb-txt">0%</span>
      </div>
      <span className="rb-key rpg-key">R</span>
    </div>
  );
};
