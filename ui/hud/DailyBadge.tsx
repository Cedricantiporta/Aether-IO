// In-run Daily Trial indicator (under the room plaque): the trial's modifiers + a run clock. Mounted with the HUD,
// which only exists while a run is in progress, so `daily.on` (set at run start) is read once per mount.
import React, { useRef } from 'react';
import { CalendarDays } from '../components/GoldIcons';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { daily, DAILY_MODS } from '../../dailyChallenge';
import '../screens/daily.css';

export const DailyBadge: React.FC = () => {
  const clock = useRef<HTMLSpanElement>(null);
  const last = useRef(-1);
  useRaf(() => {
    const s = Math.floor(world.run.time);
    if (s === last.current || !clock.current) return;
    last.current = s;
    clock.current.textContent = `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  });
  const def = daily.on ? daily.def : null;
  if (!def) return null;
  return (
    <div className="dc-badge" data-testid="daily-badge">
      <span className="t"><CalendarDays size={12} /> Daily Trial</span>
      {def.mods.map((m) => <span key={m} className="m" style={{ ['--c' as string]: DAILY_MODS[m].color }} title={DAILY_MODS[m].desc}>{DAILY_MODS[m].name}</span>)}
      <span className="clock" ref={clock}>0:00</span>
    </div>
  );
};
