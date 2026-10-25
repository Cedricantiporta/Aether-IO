import React, { useRef, useState } from 'react';
import { world } from '../../engine/world';
import { useGameStore } from '../../store';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { Swords } from '../components/GoldIcons';

/** (owner 2026-10-25) A shiny two-arc ring that spins round an icon while its toggle is on (an SVG, so no stylesheet can hide it). */
export const SpinRing: React.FC<{ on: boolean }> = ({ on }) => (
  <svg className={`spin-ring ${on ? 'on' : ''}`} viewBox="0 0 40 40" aria-hidden>
    <defs>
      <linearGradient id="spinRingG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff8d8" /><stop offset="1" stopColor="#ffbf3a" /></linearGradient>
    </defs>
    <g className="spin-ring-g">
      <path d="M20 3 A17 17 0 0 1 37 20" />
      <path d="M20 37 A17 17 0 0 1 3 20" />
    </g>
  </svg>
);

/**
 * Bottom-right (desktop): the AUTO pill (toggles world.autoBattle, no key; the PATH pill was removed 2026-10-25).
 * It shows a spinning ring while on. Dash lives on the action bar (Space).
 */
export const CornerButtons: React.FC = () => {
  const [auto, setAuto] = useState(world.autoBattle.on), last = useRef(auto);
  useRaf(() => { if (world.autoBattle.on !== last.current) { last.current = world.autoBattle.on; setAuto(last.current); } });   // (re-renders only when it flips)
  return (
    <div className="corner-btns pe" data-testid="corner-btns">
      <button className={`cb cb-big ${auto ? 'on' : ''}`} data-testid="cb-auto" aria-label="Auto battle" {...tip(<SimpleTip title="Auto battle" sub="Toggle (no hotkey)" body="Fights enemies in reach and casts ready skills by itself (chasing: see Settings)." />)}
        onClick={() => { world.autoBattle.on = !world.autoBattle.on; last.current = world.autoBattle.on; setAuto(last.current); }}>
        <span className="cb-ic-wrap"><SpinRing on={auto} /><Swords size={16} /></span><span className="cb-auto">AUTO</span>
      </button>
    </div>
  );
};
