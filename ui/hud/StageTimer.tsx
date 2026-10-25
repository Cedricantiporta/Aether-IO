// (owner 2026-10-25) the stage time limit (engine/systems/director stageClock): hidden until the last 30 s, then a small
// countdown under the top bar; at 0 it reads "Time's up!" while the hero takes damage every second. DOM via refs in the shared rAF.
import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { stageClock, stageClockVisible } from '../../engine/systems/director';

export const StageTimer: React.FC = () => {
  const box = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null), last = useRef('');
  useRaf(() => {
    const el = box.current; if (!el || !txt.current) return;
    const on = world.room.active && stageClockVisible();
    el.style.opacity = on ? '1' : '0';
    if (!on) return;
    const left = stageClock.left, s = left > 0 ? `${Math.ceil(left)}s` : "Time's up!";
    if (s !== last.current) { last.current = s; txt.current.textContent = s; el.dataset.out = left > 0 ? '0' : '1'; }
  });
  return (
    <div ref={box} className="stage-timer" style={{ opacity: 0 }} data-testid="stage-timer">
      <span className="st-ico">⏳</span><span ref={txt} />
    </div>
  );
};
