import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { tripHaul, caveBest } from '../../engine/systems/cave';
import { useRaf } from '../hooks/useRaf';

/** Crystal cave HUD (village area CAVE): floor title + best + veins left, the lantern meter (orange under 25 %, red and
 *  pulsing under 10 %, a big countdown in the last 10 s), the haul at risk on deep floors, a dark vignette when the oil
 *  is nearly gone and the pitch-black blackout when it runs out. Written to the DOM from the shared rAF loop (no React
 *  re-renders). */
export const CaveHud: React.FC = () => {
  const root = useRef<HTMLDivElement>(null), title = useRef<HTMLDivElement>(null), sub = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), time = useRef<HTMLSpanElement>(null);
  const risk = useRef<HTMLDivElement>(null), count = useRef<HTMLDivElement>(null), vig = useRef<HTMLDivElement>(null), black = useRef<HTMLDivElement>(null);
  const last = useRef({ on: false, floor: -1, left: -1, best: -1, sec: -1, state: '', risk: '', cd: -1, slow: 0 });
  useRaf((dt, now) => {
    const r = root.current; if (!r) return;
    const v = world.village, cv = v.cave, on = v.area === 'CAVE', L = last.current;
    if (on !== L.on) { L.on = on; r.style.display = on ? '' : 'none'; if (!on && black.current) black.current.style.opacity = '0'; }
    if (!on) return;
    const deep = cv.floor > 1, k = cv.oilMax > 0 ? cv.oil / cv.oilMax : 1;
    if (cv.floor !== L.floor || cv.left !== L.left || cv.best !== L.best) {
      L.floor = cv.floor; L.left = cv.left; L.best = cv.best;
      if (title.current) title.current.textContent = `Crystal Cave · Floor ${cv.floor}`;
      if (sub.current) sub.current.textContent = `${cv.left > 0 ? `${cv.left} vein${cv.left === 1 ? '' : 's'} left` : 'Stairs down open'} · Best: Floor ${Math.max(cv.best, caveBest())}`;
    }
    const sec = Math.ceil(cv.oil);
    if (sec !== L.sec && time.current) { L.sec = sec; time.current.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
    if (fill.current) fill.current.style.width = `${Math.max(0, Math.min(100, k * 100)).toFixed(1)}%`;
    const state = !deep ? 'safe' : k < 0.1 ? 'crit' : k < 0.25 ? 'low' : 'ok';
    if (state !== L.state && fill.current && bar.current) {
      L.state = state;
      fill.current.style.background = state === 'crit' ? 'linear-gradient(90deg,#b0201a,#ff4a3a)' : state === 'low' ? 'linear-gradient(90deg,#c0601a,#ffa03a)' : 'linear-gradient(90deg,#c98a2a,#ffe08a)';
      bar.current.style.animation = state === 'crit' ? 'cave-pulse .5s ease-in-out infinite alternate' : state === 'low' ? 'cave-pulse 1.1s ease-in-out infinite alternate' : 'none';
    }
    if (bar.current) bar.current.style.opacity = deep && k < 0.25 ? String(0.75 + 0.25 * Math.abs(Math.sin(now * 17) * Math.sin(now * 5.3))) : '1';   // flicker
    // haul at risk (re-read from the store a few times a second)
    L.slow -= dt;
    if (L.slow <= 0 && risk.current) {
      L.slow = 0.4;
      const h = tripHaul(), s = deep ? `At risk: ${h.gold.toLocaleString()} gold · ${h.shards} shard${h.shards === 1 ? '' : 's'} · ${h.items} item${h.items === 1 ? '' : 's'}` : 'Floor 1 is safe ground';
      if (s !== L.risk) { L.risk = s; risk.current.textContent = s; risk.current.style.color = deep ? '#ffcf9a' : '#9fe6ff'; }
    }
    const cd = deep && cv.oil > 0 && cv.oil <= 10 ? Math.ceil(cv.oil) : -1;
    if (cd !== L.cd && count.current) { L.cd = cd; count.current.textContent = cd > 0 ? String(cd) : ''; count.current.style.display = cd > 0 ? '' : 'none'; }
    if (vig.current) vig.current.style.opacity = deep && k < 0.1 ? String(0.55 + 0.25 * Math.sin(now * 7.4)) : deep && k < 0.25 ? '0.3' : '0';
    if (black.current) black.current.style.opacity = String(cv.dark);
  });
  const glass = { background: 'rgba(8,10,14,.62)', border: '1px solid rgba(201,150,46,.45)', borderRadius: '.35rem' };
  return (
    <div ref={root} className="pointer-events-none" style={{ display: 'none' }} data-testid="cave-hud">
      <div ref={vig} className="fixed inset-0" style={{ opacity: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(40,0,0,.85) 100%)', transition: 'opacity .3s', zIndex: 5 }} />
      <div className="absolute flex flex-col items-center" style={{ left: '50%', transform: 'translateX(-50%)', top: 'max(.6rem, env(safe-area-inset-top, 0px))', width: 'min(22rem, 62vw)', zIndex: 6 }}>
        <div ref={title} style={{ font: '600 clamp(.85rem, 2.6vw, 1.05rem) Georgia, serif', color: '#f2d58a', textShadow: '0 1px 3px #000', letterSpacing: '.06em' }} />
        <div ref={sub} style={{ fontSize: 'clamp(.62rem, 2vw, .74rem)', color: '#d8d2c4', textShadow: '0 1px 2px #000' }} />
        <div ref={bar} className="flex items-center gap-2" style={{ ...glass, marginTop: '.3rem', padding: '.25rem .45rem', width: '100%' }} data-testid="lantern-meter">
          <span style={{ fontSize: 'clamp(.6rem, 1.9vw, .72rem)', color: '#ffe08a', fontWeight: 700, letterSpacing: '.08em' }}>LANTERN</span>
          <div style={{ flex: 1, height: 'clamp(.55rem, 1.8vw, .7rem)', background: 'rgba(255,255,255,.08)', borderRadius: '.2rem', overflow: 'hidden', border: '1px solid rgba(0,0,0,.6)' }}>
            <div ref={fill} style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg,#c98a2a,#ffe08a)', boxShadow: '0 0 8px rgba(255,200,90,.6)' }} />
          </div>
          <span ref={time} className="rpg-num" style={{ fontSize: 'clamp(.7rem, 2.2vw, .85rem)', color: '#fff', minWidth: '2.6rem', textAlign: 'right' }} />
        </div>
        <div ref={risk} style={{ fontSize: 'clamp(.6rem, 1.9vw, .72rem)', marginTop: '.2rem', textShadow: '0 1px 2px #000' }} data-testid="cave-risk" />
      </div>
      <div ref={count} className="fixed rpg-num" style={{ display: 'none', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', font: '800 clamp(3.5rem, 14vw, 7rem) Georgia, serif', color: '#ff4a3a', textShadow: '0 0 18px rgba(255,40,20,.8), 0 3px 6px #000', zIndex: 7 }} data-testid="cave-countdown" />
      <div ref={black} className="fixed inset-0" style={{ opacity: 0, background: '#000', zIndex: 8 }} />
      <style>{'@keyframes cave-pulse { from { transform: scale(1); box-shadow: 0 0 0 rgba(255,60,40,0); } to { transform: scale(1.04); box-shadow: 0 0 16px rgba(255,60,40,.7); } }'}</style>
    </div>
  );
};
