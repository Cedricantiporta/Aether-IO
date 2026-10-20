import React, { useRef } from 'react';
import { forceAutoCast } from '../../engine/systems/aim';
import { dismount } from '../../engine/systems/village';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { useInputMode, PAD_LABEL } from '../lib/inputMode';
import { PadBtn } from '../components/PadBtn';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { PaintedIcon } from '../components/SkillIcons';
import { Swords } from '../components/GoldIcons';
import { useGameStore } from '../../store';
import { dashDef } from '../../abilityDefs';

/** Presses a real key binding (same path the action-bar slots use). */
function pressKey(code: string): void {
  forceAutoCast.on = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); setTimeout(() => { forceAutoCast.on = false; }, 120); }, 60);
}

/** Horse glyph (solid gold, same style as GoldIcons). */
const Horse: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#f1d58e" stroke="#2a1a05" strokeWidth=".6" strokeLinejoin="round">
    <path d="M4 21v-5.6c0-3 1.4-5.6 4-7.4l1.4-4.4 2.6 2.2 3.2-.6 3 3.4-2 2.2-1.8-.2-1.4 1.8 1.2 3.4V21h-2.2l-.8-3.6-2.4.6-.8 3H4Z" />
    <circle cx="14.2" cy="8.6" r=".9" fill="#2a1a05" stroke="none" />
  </svg>
);

/**
 * Bottom-right (desktop): mount / dash / AUTO. Labels are the real bindings from engine/input.ts:
 * horse = E (interact: mounts a nearby stable horse, dismounts when riding), dash = Space, AUTO = no key (toggles world.autoBattle).
 */
export const CornerButtons: React.FC = () => {
  const pad = useInputMode((m) => m.pad);
  const hero = useGameStore((s) => s.hero);
  const autoEl = useRef<HTMLButtonElement>(null), rideEl = useRef<HTMLButtonElement>(null), last = useRef({ a: false, r: false });
  useRaf(() => {
    const l = last.current, a = world.autoBattle.on, r = world.village.ride.on;
    if (a !== l.a && autoEl.current) { l.a = a; autoEl.current.classList.toggle('on', a); }
    if (r !== l.r && rideEl.current) { l.r = r; rideEl.current.classList.toggle('on', r); }
  });
  const key = (code: string, label: string) => (pad && PAD_LABEL[code] ? <PadBtn b={PAD_LABEL[code]} className="pad-badge" /> : <span className="cb-key">{label}</span>);
  return (
    <div className="corner-btns pe" data-testid="corner-btns">
      <button ref={rideEl} className="cb cb-sm" data-testid="cb-ride" aria-label="Mount / dismount" {...tip(<SimpleTip title="Horse" sub="[E] interact" body="Mount a stable horse when you stand next to it; press again to dismount." />)}
        onClick={() => { if (world.village.ride.on) dismount(); else pressKey('KeyE'); }}>
        <Horse />{key('KeyE', 'E')}
      </button>
      <button className="cb cb-sm" data-testid="cb-dash" aria-label="Dash" {...tip(<SimpleTip title={`Dash: ${dashDef(hero).name}`} sub="[Space]" />)} onClick={() => pressKey('Space')}>
        <span className="cb-ic"><PaintedIcon id={dashDef(hero).icon} /></span>{key('Space', 'Space')}
      </button>
      <button ref={autoEl} className="cb cb-big" data-testid="cb-auto" aria-label="Auto battle" {...tip(<SimpleTip title="Auto battle" sub="Toggle (no hotkey)" body="Hunts the nearest enemy and casts ready skills by itself." />)}
        onClick={() => { world.autoBattle.on = !world.autoBattle.on; }}>
        <Swords size={22} /><span className="cb-auto">AUTO</span>
      </button>
    </div>
  );
};
