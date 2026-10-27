// Online co-op: a small pill at the top of the screen with the partner's name, class level, connection quality (ping), his HP bar and "Leave", plus (STEP 3)
//  - a DOWN banner: "<friend> is down" + the revive progress ring-bar while I stand next to him, an arrow pointing at him when he is far away,
//  - my own "You are down" banner with the revive progress my friend is giving me,
//  - the guest's "Host is choosing the way" line (with the exit the host stands at).
// Shown in town and in runs while a friend is connected. Reads the tiny net/coopStore slice (changes only at discrete moments); everything per-frame is written
// straight to the DOM from the shared rAF hook (no React re-render).
import React, { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCoop } from '../../net/coopStore';
import { leaveCoop } from '../../net/coop';
import { coopRoom } from '../../net/coopRoom';
import { world } from '../../engine/world';
import { portalLabel } from '../../engine/roomDefs';
import { useRaf } from '../hooks/useRaf';
import { F_ALIVE, F_DOWN, F_PAUSED, REVIVE_RANGE } from '../../net/protocol';

const anyPortal = (): boolean => { const p = world.room.portals; for (let i = 0; i < p.length; i++) if (p[i].active) return true; return false; };
/** green < 80 ms, amber < 180 ms, red above */
const pingColor = (ms: number): string => (ms === 0 ? '#9aa3ad' : ms < 80 ? '#6fe29b' : ms < 180 ? '#ffd36a' : '#ff8a80');

export const CoopHud: React.FC = () => {
  const { state, partner, ping, role } = useCoop(useShallow((s) => ({ state: s.state, partner: s.partner, ping: s.ping, role: s.role })));
  const bar = useRef<HTMLSpanElement>(null), fill = useRef<HTMLElement>(null);
  const banner = useRef<HTMLDivElement>(null), bannerText = useRef<HTMLSpanElement>(null), bannerFill = useRef<HTMLElement>(null), arrow = useRef<HTMLDivElement>(null);
  const name = partner?.n ?? 'Your friend';
  let last = -2, lastTxt = '', lastBanner = '', lastArrow = -999, lastProg = -1;
  useRaf(() => {
    const R = world.remote, down = R.active && ((R.flags | 0) & F_DOWN) !== 0;
    // ---- the partner's HP bar (world.remote.hp 0..1; down = an empty red bar)
    const v = R.active ? ((R.flags | 0) & F_ALIVE ? Math.max(0.02, Math.min(1, R.hp)) : 0) : -1;
    if (v !== last) {
      last = v;
      if (bar.current) bar.current.style.display = v < 0 ? 'none' : 'inline-block';
      if (fill.current) { fill.current.style.width = `${Math.round(Math.max(0, v) * 100)}%`; fill.current.style.background = v > 0.5 ? '#6fe29b' : v > 0.25 ? '#ffd36a' : '#ff8a80'; }
    }
    // ---- the banner (priority: I am down > my friend is down > the host picks the door)
    const me = world.player, inRoom = world.room.active;
    let txt = '', prog = -1, kind = '';
    if (me.downed) { kind = 'me'; prog = R.reviveIn; txt = R.active ? `You are down. ${name} can revive you: ${Math.round(R.reviveIn * 100)}%` : 'You are down...'; }
    else if (down) {
      kind = 'friend'; prog = coopRoom.reviveOut;
      const d = Math.hypot(R.x - me.pos.x, R.z - me.pos.z);
      txt = coopRoom.reviveOut > 0 ? `Reviving ${name}...` : d <= REVIVE_RANGE + 6 ? `${name} is down! Stand next to them to revive.` : `${name} is down! Run to them.`;
    } else if (R.active && ((R.flags | 0) & F_PAUSED) !== 0) { kind = 'pause'; txt = `${name} paused (the game keeps running)`; }
    else if (coopRoom.guest && inRoom && world.director.phase === 'CLEARED' && anyPortal()) {
      kind = 'door';
      const hl = coopRoom.hl, po = hl >= 0 && hl < world.room.portals.length ? world.room.portals[hl] : null;
      if (po && po.active) { const l = portalLabel(po.plan, world.room.biome); txt = `Host is choosing... heading for ${l.sub ? `${l.title} · ${l.sub}` : l.title}`; }
      else txt = 'Host is choosing the way...';
    } else if (coopRoom.guest && inRoom && world.director.phase === 'LEAVING') { kind = 'door'; txt = 'Following the host...'; }
    if (kind !== lastBanner || txt !== lastTxt) {
      lastBanner = kind; lastTxt = txt;
      const b = banner.current;
      if (b) { b.style.display = txt ? 'flex' : 'none'; b.dataset.kind = kind; if (bannerText.current) bannerText.current.textContent = txt; }
    }
    const pr = prog < 0 ? -1 : Math.round(prog * 100);
    if (pr !== lastProg) { lastProg = pr; if (bannerFill.current) { bannerFill.current.style.width = `${Math.max(0, pr)}%`; (bannerFill.current.parentElement as HTMLElement).style.display = pr < 0 ? 'none' : 'block'; } }
    // ---- the arrow towards a downed friend (screen space: the camera yaw turns the world offset into "up / right on the screen")
    let ang = -999;
    if (down && !me.downed && world.room.active) {
      const dx = R.x - me.pos.x, dz = R.z - me.pos.z;
      if (Math.hypot(dx, dz) > 7) {
        const y = world.camera.yaw, c = Math.cos(y), s = Math.sin(y);
        const sx = dx * c - dz * s, sz = dx * s + dz * c;
        ang = Math.round((Math.atan2(sx, -sz) * 180) / Math.PI);
      }
    }
    if (ang !== lastArrow) {
      lastArrow = ang;
      const a = arrow.current;
      if (a) { a.style.display = ang === -999 ? 'none' : 'block'; if (ang !== -999) a.style.transform = `translate(-50%, -50%) rotate(${ang}deg) translateY(-130px)`; }
    }
  });
  if (state !== 'connected' || !partner) return null;
  return (
    <>
      <div className="coop-hud" data-testid="coop-hud">
        <i className="coop-dot" style={{ background: pingColor(ping) }} />
        <span className="coop-hud-name">{partner.n}</span>
        <span className="coop-hud-sub">Lv {partner.l} · {ping ? `${ping} ms` : '...'}</span>
        <span ref={bar} className="coop-hud-hp" data-testid="coop-partner-hp" style={{ display: 'none' }}><i ref={fill} /></span>
        <button className="coop-hud-leave pe" onClick={leaveCoop} data-testid="coop-leave" title={role === 'host' ? 'Close the co-op room' : 'Leave the co-op'}>Leave</button>
      </div>
      <div ref={banner} className="coop-banner" data-testid="coop-banner" style={{ display: 'none' }}>
        <span ref={bannerText} />
        <b className="coop-banner-bar" style={{ display: 'none' }}><i ref={bannerFill} /></b>
      </div>
      <div ref={arrow} className="coop-arrow" data-testid="coop-arrow" style={{ display: 'none' }} />
    </>
  );
};
