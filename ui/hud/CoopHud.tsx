// Online co-op: a small pill at the top of the screen with the partner's name, class level, connection quality (ping) and "Leave".
// Shown in town and in runs while a friend is connected. Reads the tiny net/coopStore slice (changes only at discrete moments).
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCoop } from '../../net/coopStore';
import { leaveCoop } from '../../net/coop';

/** green < 80 ms, amber < 180 ms, red above */
const pingColor = (ms: number): string => (ms === 0 ? '#9aa3ad' : ms < 80 ? '#6fe29b' : ms < 180 ? '#ffd36a' : '#ff8a80');

export const CoopHud: React.FC = () => {
  const { state, partner, ping, role } = useCoop(useShallow((s) => ({ state: s.state, partner: s.partner, ping: s.ping, role: s.role })));
  if (state !== 'connected' || !partner) return null;
  return (
    <div className="coop-hud" data-testid="coop-hud">
      <i className="coop-dot" style={{ background: pingColor(ping) }} />
      <span className="coop-hud-name">{partner.n}</span>
      <span className="coop-hud-sub">Lv {partner.l} · {ping ? `${ping} ms` : '...'}</span>
      <button className="coop-hud-leave pe" onClick={leaveCoop} data-testid="coop-leave" title={role === 'host' ? 'Close the co-op room' : 'Leave the co-op'}>Leave</button>
    </div>
  );
};
