// Room objective banner (under the depth tracker) + the Darkness twist overlay. Reads world.roomEvt in the shared rAF
// loop and writes the DOM through refs (no per-frame React state).
import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { OBJ_NAME, TWIST_NAME, TWIST_DESC } from '../../engine/roomDefs';

export const RoomEventHud: React.FC = () => {
  const box = useRef<HTMLDivElement>(null), title = useRef<HTMLDivElement>(null), line = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), dark = useRef<HTMLDivElement>(null);
  const sig = useRef('');
  useRaf(() => {
    const e = world.roomEvt, live = world.room.active;
    const darkOn = live && e.twist === 'DARK' && world.director.phase === 'FIGHT';
    if (dark.current) dark.current.style.opacity = darkOn ? '1' : '0';
    const show = live && (!!e.obj || !!e.twist);
    let t = '', l = '', k = -1, col = '#f1d58e';
    if (show) {
      if (e.obj) {
        t = OBJ_NAME[e.obj];
        if (e.state === 2) { l = 'Complete!'; col = '#9be86a'; }
        else if (e.state === 3) { l = 'Failed'; col = '#ff8a7a'; }
        else if (e.state === 4) l = 'Free the captive: press E at the cage';
        else if (e.obj === 'DEFEND' || e.obj === 'RESCUE') { l = e.obj === 'DEFEND' ? 'Keep monsters off the totem' : 'Keep monsters off the cage'; k = e.hp / Math.max(1, e.maxHp); }
        else if (e.obj === 'GOBLIN') { l = e.enemy >= 0 ? `Catch it! ${Math.max(0, Math.ceil(e.tmax - e.t))}s` : 'Something glitters nearby...'; if (e.enemy >= 0) k = Math.max(0, 1 - e.t / e.tmax); }
        else if (e.obj === 'HUNT') { l = e.enemy >= 0 ? `Kill the marked monster: ${Math.max(0, Math.ceil(e.tmax - e.t))}s` : 'Marking the bounty...'; if (e.enemy >= 0) k = Math.max(0, 1 - e.t / e.tmax); }
      }
      if (e.twist) { const tw = `${TWIST_NAME[e.twist]}: ${TWIST_DESC[e.twist]}`; if (!t) { t = TWIST_NAME[e.twist]; l = TWIST_DESC[e.twist]; } else l += ` · ${TWIST_NAME[e.twist]}`; if (!e.obj) col = '#c9b6ff'; void tw; }
    }
    const s = `${show}|${t}|${l}|${col}`;
    if (s !== sig.current) {
      sig.current = s;
      if (box.current) box.current.style.display = show ? 'block' : 'none';
      if (title.current) { title.current.textContent = t; title.current.style.color = col; }
      if (line.current) line.current.textContent = l;
    }
    if (bar.current) bar.current.style.display = k >= 0 ? 'block' : 'none';
    if (fill.current && k >= 0) { fill.current.style.width = `${(k * 100).toFixed(1)}%`; fill.current.style.background = k > 0.5 ? '#9be86a' : k > 0.25 ? '#ffc24a' : '#ff5a4a'; }
  });
  return (
    <>
      {/* Darkness twist: only a small circle around the hero stays lit */}
      <div ref={dark} className="absolute inset-0 pointer-events-none" style={{ opacity: 0, transition: 'opacity .8s', zIndex: 2,
        background: 'radial-gradient(circle at 50% 56%, rgba(0,0,0,0) 0, rgba(0,0,0,0) 14%, rgba(4,4,12,.86) 34%, rgba(2,2,8,.96) 60%)' }} />
      <div ref={box} className="absolute pointer-events-none" data-testid="room-objective" style={{ display: 'none', left: '50%', top: '8.4rem', transform: 'translateX(-50%)', zIndex: 6, textAlign: 'center', minWidth: '16rem' }}>
        <div ref={title} style={{ fontFamily: 'var(--font-title)', fontWeight: 800, fontSize: '1rem', letterSpacing: '.06em', textShadow: '0 2px 0 #000, 0 0 10px rgba(0,0,0,.8)' }} />
        <div ref={line} style={{ fontSize: '.78rem', color: '#f4ead2', textShadow: '0 1px 2px #000' }} />
        <div ref={bar} style={{ display: 'none', margin: '.3rem auto 0', width: '12rem', height: '.4rem', background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.25)' }}>
          <div ref={fill} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
    </>
  );
};
