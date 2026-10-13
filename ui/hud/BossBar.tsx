import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Thin boss bar: name, hp with a delayed damage trail, stagger line and phase dots. */
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
      if (stag.current) stag.current.style.background = b.staggered ? '#ffc73a' : '#7db8ff';
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
    <div ref={root} className="boss-bar" style={{ display: 'none' }}>
      <div ref={abil} data-testid="boss-ability" className="text-center text-sm font-extrabold" style={{ opacity: 0, transition: 'opacity .15s, transform .15s', color: '#ffd27a', textShadow: '0 1px 6px rgba(0,0,0,.7)', height: '1.3rem' }} />
      <div className="text-center leading-tight mb-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,.7)' }}>
        <span ref={name} className="font-extrabold text-sm" style={{ color: '#ffb3aa' }} />
        <span ref={title} className="text-xs font-semibold ml-2" style={{ color: 'rgba(243,241,234,.7)' }} />
      </div>
      <div className="relative overflow-hidden" style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.12)' }}>
        <div ref={trail} className="absolute inset-y-0 left-0" style={{ width: '100%', background: 'rgba(255,255,255,.8)' }} />
        <div ref={hp} className="absolute inset-y-0 left-0" style={{ width: '100%', background: '#ef5f55' }} />
      </div>
      <div className="relative mx-auto mt-1" style={{ width: '60%', height: 3, background: 'rgba(0,0,0,.4)', borderRadius: 2, overflow: 'hidden' }} title="Stagger">
        <div ref={stag} data-testid="stagger-bar" style={{ width: '0%', height: '100%', background: '#7db8ff' }} />
      </div>
      <div ref={stagLbl} className="text-center text-xs font-bold" style={{ color: '#ffd23a', opacity: 0 }}>Staggered</div>
      <div className="flex justify-center gap-2 mt-1">
        {[0, 1, 2].map((i) => (
          <i key={i} ref={(el) => { pips.current[i] = el; }} data-on="0" className="boss-pip" />
        ))}
      </div>
      <span ref={val} className="sr-only" />
    </div>
  );
};
