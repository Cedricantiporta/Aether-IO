// Online co-op: a small pill at the top of the screen with the partner's name, class level, connection quality (ping) and "Leave".
// Shown in town and in runs while a friend is connected. Reads the tiny net/coopStore slice (changes only at discrete moments).
import React, { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCoop } from '../../net/coopStore';
import { leaveCoop } from '../../net/coop';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { F_ALIVE } from '../../net/protocol';

/** green < 80 ms, amber < 180 ms, red above */
const pingColor = (ms: number): string => (ms === 0 ? '#9aa3ad' : ms < 80 ? '#6fe29b' : ms < 180 ? '#ffd36a' : '#ff8a80');

export const CoopHud: React.FC = () => {
  const { state, partner, ping, role } = useCoop(useShallow((s) => ({ state: s.state, partner: s.partner, ping: s.ping, role: s.role })));
  const bar = useRef<HTMLSpanElement>(null), fill = useRef<HTMLElement>(null);
  let last = -2;
  // the partner's hero HP (net/coop.ts keeps world.remote.hp 0..1 from his position stream), written straight to the DOM: no re-render
  useRaf(() => {
    const R = world.remote, v = R.active ? ((R.flags | 0) & F_ALIVE ? Math.max(0.02, Math.min(1, R.hp)) : 0) : -1;
    if (v === last) return;
    last = v;
    if (bar.current) bar.current.style.display = v < 0 ? 'none' : 'inline-block';
    if (fill.current) { fill.current.style.width = `${Math.round(Math.max(0, v) * 100)}%`; fill.current.style.background = v > 0.5 ? '#6fe29b' : v > 0.25 ? '#ffd36a' : '#ff8a80'; }
  });
  if (state !== 'connected' || !partner) return null;
  return (
    <div className="coop-hud" data-testid="coop-hud">
      <i className="coop-dot" style={{ background: pingColor(ping) }} />
      <span className="coop-hud-name">{partner.n}</span>
      <span className="coop-hud-sub">Lv {partner.l} · {ping ? `${ping} ms` : '...'}</span>
      <span ref={bar} className="coop-hud-hp" data-testid="coop-partner-hp" style={{ display: 'none' }}><i ref={fill} /></span>
      <button className="coop-hud-leave pe" onClick={leaveCoop} data-testid="coop-leave" title={role === 'host' ? 'Close the co-op room' : 'Leave the co-op'}>Leave</button>
    </div>
  );
};
