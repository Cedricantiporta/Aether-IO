import React, { useRef } from 'react';
import { Skull } from 'lucide-react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Ornate wide boss bar with skull ends, phase pips and a delayed white damage trail. */
export const BossBar: React.FC = () => {
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

  useRaf((dt) => {
    const b = world.boss, s = st.current;
    if (b.active !== s.active) {
      s.active = b.active;
      if (root.current) root.current.style.display = b.active ? 'block' : 'none';
      if (b.active) { s.trail = b.hp / Math.max(1, b.maxHp); s.name = ''; s.title = ''; }
    }
    if (!b.active) return;
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
    if (val.current && v !== s.val) { s.val = v; val.current.textContent = v.toLocaleString(); }
    const sf = Math.max(0, Math.min(1, b.stagger));
    const sfs = b.staggered ? '1' : sf.toFixed(3);
    if (stag.current && sfs !== s.stag) { s.stag = sfs; stag.current.style.width = `${(b.staggered ? 1 : sf) * 100}%`; }
    if (b.staggered !== s.staggered) {
      s.staggered = b.staggered;
      if (stag.current) stag.current.style.background = b.staggered ? 'linear-gradient(180deg,#fff2a0,#ffb020)' : 'linear-gradient(180deg,#9ad0ff,#3a7ad0)';
      if (stagLbl.current) stagLbl.current.style.opacity = b.staggered ? '1' : '0';
    }
    const on = b.abilityT > 0 && !!b.ability;
    if (abil.current) {
      if (b.ability !== s.abil) { s.abil = b.ability; abil.current.textContent = b.ability; }
      if (on !== s.abilOn) { s.abilOn = on; abil.current.style.opacity = on ? '1' : '0'; abil.current.style.transform = on ? 'scale(1)' : 'scale(.8)'; }
    }
    if (b.phase !== s.phase) {
      s.phase = b.phase;
      pips.current.forEach((el, i) => { if (el) el.dataset.on = i <= b.phase ? '1' : '0'; });
    }
  });

  return (
    <div ref={root} style={{ display: 'none', width: 'min(44rem, 52vw)' }}>
      <div ref={abil} data-testid="boss-ability" className="text-center rpg-title" style={{ opacity: 0, transition: 'opacity .15s, transform .15s', fontSize: '1.15rem', letterSpacing: '.18em', color: '#ffe27a', textShadow: '0 0 12px #ff8a00, 0 2px 0 #000', marginBottom: '.2rem', height: '1.4rem' }} />
      <div className="text-center leading-none mb-1">
        <div ref={name} className="rpg-title text-xl" style={{ color: '#ffb3aa' }} />
        <div ref={title} className="rpg-label !text-[.65rem] mt-1" style={{ color: '#d9a8a0' }} />
      </div>
      <div className="relative flex items-center">
        <div className="rpg-medallion z-10" style={{ width: '3rem', height: '3rem', ['--mc' as any]: '#8e1c1f', marginRight: '-.9rem' }}><Skull size={22} /></div>
        <div className="rpg-bar flex-1" style={{ height: '1.5rem', borderWidth: 3, boxShadow: '0 0 0 2px #8b5a16, 0 0 0 4px #0d0703, inset 0 3px 8px rgba(0,0,0,.9), 0 6px 14px rgba(0,0,0,.6)' }}>
          <div ref={trail} className="absolute inset-y-0 left-0" style={{ width: '100%', background: 'rgba(255,255,255,.9)' }} />
          <div ref={hp} className="absolute inset-y-0 left-0" style={{ width: '100%', background: 'linear-gradient(180deg,#ff8a85,#d6252b 45%,#7e0f14)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)' }} />
          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), rgba(0,0,0,.6) calc(10% - 2px) 10%)' }} />
          <div className="absolute inset-0 grid place-items-center rpg-num text-[.78rem] text-white text-outline"><span ref={val} /></div>
        </div>
        <div className="rpg-medallion z-10" style={{ width: '3rem', height: '3rem', ['--mc' as any]: '#8e1c1f', marginLeft: '-.9rem' }}><Skull size={22} /></div>
      </div>
      <div className="relative mx-auto mt-1" style={{ width: '70%', height: '.42rem', background: '#0d0703', border: '1px solid #3a2a14', borderRadius: 3, overflow: 'hidden' }} title="Stagger">
        <div ref={stag} data-testid="stagger-bar" style={{ width: '0%', height: '100%', background: 'linear-gradient(180deg,#9ad0ff,#3a7ad0)' }} />
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
