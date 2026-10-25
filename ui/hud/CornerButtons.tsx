import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { Swords } from '../components/GoldIcons';

/**
 * Bottom-right (desktop): just the AUTO pill (toggles world.autoBattle, no key). Dash lives on the action bar (Space) and E
 * already interacts / mounts, so the old horse + dash corner buttons are gone.
 */
export const CornerButtons: React.FC = () => {
  const autoEl = useRef<HTMLButtonElement>(null), last = useRef(false);
  useRaf(() => {
    const a = world.autoBattle.on;
    if (a !== last.current && autoEl.current) { last.current = a; autoEl.current.classList.toggle('on', a); }
  });
  return (
    <div className="corner-btns pe" data-testid="corner-btns">
      <button ref={autoEl} className="cb cb-big" data-testid="cb-auto" aria-label="Auto battle" {...tip(<SimpleTip title="Auto battle" sub="Toggle (no hotkey)" body="Hunts the nearest enemy and casts ready skills by itself." />)}
        onClick={() => { world.autoBattle.on = !world.autoBattle.on; }}>
        <span className="auto-ring" aria-hidden /><Swords size={16} /><span className="cb-auto">AUTO</span>
      </button>
    </div>
  );
};
