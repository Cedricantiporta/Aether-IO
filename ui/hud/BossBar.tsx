import React, { useRef } from 'react';
import { Skull } from 'lucide-react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Ornate wide boss bar with skull ends, phase pips and a delayed white damage trail.
 *  `illusion` = index of a Malakar illusion: the same bar (name, X/X, pips) over the decoy, to confuse the player. */
export const BossBar: React.FC<{ illusion?: number }> = ({ illusion }) => {
  const root = useRef<HTMLDivElement>(null);
  const hp = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const val = useRef<HTMLSpanElement>(null);
  const pips = useRef<(HTMLElement | null)[]>([]);
  const stag = useRef<HTMLDivElement>(null);
  const stagLbl = useRef<HTMLDivElement>(null);
  const abil = useRef<HTMLDivElement>(null);
  const st = useRef({ active: false, hp: '', trail: 1, trailS: '', name: '', title: '', val: -1, phase: -1, stag: '', staggered: false, abil: '', abilOn: false });

  const view = useRef({ ...world.boss });   // reused copy of the boss hud for an illusion's bar (no per-frame alloc)
  useRaf((dt) => {
    const B = world.boss, s = st.current;
    const I = illusion === undefined ? null : world.illusionBars[illusion];
    let b = B;
    if (I) { b = Object.assign(view.current, B); b.hp = I.hp; b.maxHp = I.maxHp; b.sx = I.sx; b.sy = I.sy; b.onScreen = I.onScreen; }
    const on = B.active && (!I || I.active);
    if (on !== s.active) {
      s.active = on;
      if (root.current) root.current.style.display = on ? 'block' : 'none';
      if (on) { s.trail = b.hp / Math.max(1, b.maxHp); s.name = ''; s.title = ''; }
    }
    if (!on) return;
    if (I && !I.onScreen) { if (root.current) root.current.style.opacity = '0'; return; }
    // follow the boss: anchored above its head (clamped inside the screen)
    if (root.current) {
      const r = root.current, W = window.innerWidth, H = window.innerHeight, hw = r.offsetWidth / 2;
      // off screen (or no anchor yet): parked top-centre, under the depth tracker
      const x = b.onScreen ? Math.min(W - hw - 8, Math.max(hw + 8, b.sx)) : W / 2;
      const y = b.onScreen ? Math.min(H - 40, Math.max(r.offsetHeight + 150, b.sy)) : r.offsetHeight + 150;
      r.style.transform = `translate(${(x - hw).toFixed(1)}px, ${(y - r.offsetHeight).toFixed(1)}px)`;
      r.style.opacity = b.onScreen ? '1' : '0.85';
    }
    const f = Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp)));
    const fs = f.toFixed(4);
    if (hp.current && fs !== s.hp) { s.hp = fs; hp.current.style.width = `${f * 100}%`; }
    // damage trail: waits, then drains toward real hp
    if (s.trail > f) s.trail = Math.max(f, s.trail - dt * 0.18); else s.trail = f;
    const ts = s.trail.toFixed(4);
    if (trail.current && ts !== s.trailS) { s.trailS = ts; trail.current.style.width = `${s.trail * 100}%`; }
    if (name.current && b.name !== s.name) { s.name = b.name; name.current.textContent = b.name; }
    if (title.current && b.title !== s.title) { s.title = b.title; title.current.textContent = b.title; }
    const v = Math.ceil(b.hp);
    if (val.current && v !== s.val) { s.val = v; val.current.textContent = `${v.toLocaleString()} / ${Math.ceil(b.maxHp).toLocaleString()}`; }
    const sf = Math.max(0, Math.min(1, b.stagger));
    const sfs = b.staggered ? '1' : sf.toFixed(3);
    if (stag.current && sfs !== s.stag) { s.stag = sfs; stag.current.style.width = `${(b.staggered ? 1 : sf) * 100}%`; }
    if (b.staggered !== s.staggered) {
      s.staggered = b.staggered;
      if (stag.current) stag.current.style.background = b.staggered ? 'linear-gradient(180deg,#ffffff,#ff9a3a)' : 'linear-gradient(180deg,#fff27a,#e0a810)';
      if (stagLbl.current) stagLbl.current.style.opacity = b.staggered ? '1' : '0';
    }
    const ab = !I && b.abilityT > 0 && !!b.ability;
    if (abil.current) {
      if (b.ability !== s.abil) { s.abil = b.ability; abil.current.textContent = b.ability; }
      if (ab !== s.abilOn) { s.abilOn = ab; abil.current.style.opacity = ab ? '1' : '0'; abil.current.style.transform = ab ? 'scale(1)' : 'scale(.8)'; }
    }
    if (b.phase !== s.phase) {
      s.phase = b.phase;
      pips.current.forEach((el, i) => { if (el) el.dataset.on = i <= b.phase ? '1' : '0'; });
    }
  });

  return (
    <div ref={root} style={{ display: 'none', position: 'absolute', left: 0, top: 0, width: 'min(22rem, 46vw)', zIndex: 4, pointerEvents: 'none', willChange: 'transform' }} data-testid="boss-bar">
      <div ref={abil} data-testid="boss-ability" className="text-center rpg-title" style={{ opacity: 0, transition: 'opacity .15s, transform .15s', fontSize: '1.15rem', letterSpacing: '.18em', color: '#ffe27a', textShadow: '0 0 12px #ff8a00, 0 2px 0 #000', marginBottom: '.2rem', height: '1.4rem' }} />
      <div className="text-center leading-none mb-1">
        <div ref={name} className="rpg-title text-base" style={{ color: '#ffb3aa' }} />
        <div ref={title} className="rpg-label !text-[.65rem] mt-1" style={{ color: '#d9a8a0' }} />
      </div>
      <div className="relative flex items-center">
        <div className="rpg-medallion z-10" style={{ width: '2rem', height: '2rem', ['--mc' as any]: '#8e1c1f', marginRight: '-.6rem' }}><Skull size={14} /></div>
        <div className="rpg-bar flex-1" style={{ height: '1.05rem', borderWidth: 2, boxShadow: '0 0 0 2px #8b5a16, 0 0 0 4px #0d0703, inset 0 3px 8px rgba(0,0,0,.9), 0 6px 14px rgba(0,0,0,.6)' }}>
          <div ref={trail} className="absolute inset-y-0 left-0" style={{ width: '100%', background: 'rgba(255,255,255,.9)' }} />
          <div ref={hp} className="absolute inset-y-0 left-0" style={{ width: '100%', background: 'linear-gradient(180deg,#ff8a85,#d6252b 45%,#7e0f14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)' }} />
          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), rgba(0,0,0,.6) calc(10% - 2px) 10%)' }} />
          <div className="absolute inset-0 grid place-items-center rpg-num text-[.78rem] text-white text-outline"><span ref={val} /></div>
        </div>
        <div className="rpg-medallion z-10" style={{ width: '2rem', height: '2rem', ['--mc' as any]: '#8e1c1f', marginLeft: '-.6rem' }}><Skull size={14} /></div>
      </div>
      <div className="relative mx-auto mt-1" style={{ width: '70%', height: '.5rem', background: '#0d0703', border: '1px solid #3a2a14', borderRadius: 3, overflow: 'hidden' }} title="Stagger">
        <div ref={stag} data-testid="stagger-bar" style={{ width: '0%', height: '100%', background: 'linear-gradient(180deg,#fff27a,#e0a810)' }} />
      </div>
      <div ref={stagLbl} className="text-center rpg-label !text-[.6rem]" style={{ color: '#ffd23a', opacity: 0, letterSpacing: '.3em' }}>STAGGERED</div>
      <div className="flex justify-center gap-2 mt-1">
        {[0, 1, 2].map((i) => (
          <i key={i} ref={(el) => { pips.current[i] = el; }} data-on="0" className="boss-pip" />
        ))}
      </div>
      <style>{`.boss-pip{width:.7rem;height:.7rem;transform:rotate(45deg);border:2px solid #0d0703;background:#2a1c10}.boss-pip[data-on='1']{background:linear-gradient(135deg,#ffb3aa,#d6252b);box-shadow:0 0 8px #ff4a3a}`}</style>
    </div>
  );
};
