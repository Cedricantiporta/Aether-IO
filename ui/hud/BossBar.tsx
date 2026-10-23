import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Ornate wide boss bar with skull ends, phase pips and a delayed white damage trail.
 *  `illusion` = index of a Malakar illusion: the same bar (name, X/X, pips) over the decoy, to confuse the player. */
export const BossBar: React.FC<{ illusion?: number }> = ({ illusion }) => {
  const root = useRef<HTMLDivElement>(null);
  const hp = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const shRow = useRef<HTMLDivElement>(null), shFill = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const val = useRef<HTMLSpanElement>(null);
  const pips = useRef<(HTMLElement | null)[]>([]);
  const stag = useRef<HTMLDivElement>(null);
  const stagLbl = useRef<HTMLDivElement>(null);
  const abil = useRef<HTMLDivElement>(null);
  const intRow = useRef<HTMLDivElement>(null), intFill = useRef<HTMLDivElement>(null), intLbl = useRef<HTMLSpanElement>(null);
  const st = useRef({ active: false, hp: '', trail: 1, trailS: '', name: '', title: '', val: -1, phase: -1, stag: '', staggered: false, abil: '', abilOn: false, int: '', intOn: false, intLbl: '' });

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
    // (owner) the real boss bar is docked top-centre under the gold / gems row; Malakar's illusion bars still float over the decoys
    if (root.current && !I) {
      const r = root.current;
      r.style.transform = `translate(${(window.innerWidth / 2 - r.offsetWidth / 2).toFixed(1)}px, var(--bb-top, 3.3rem))`;
      r.style.opacity = '1';
    } else if (root.current) {   // illusions: anchored above the decoy's head (clamped inside the screen)
      const r = root.current, W = window.innerWidth, H = window.innerHeight, hw = r.offsetWidth / 2;
      // off screen (or no anchor yet): parked top-centre, under the depth tracker
      const x = b.onScreen ? Math.min(W - hw - 8, Math.max(hw + 8, b.sx)) : W / 2;
      const y = b.onScreen ? Math.min(H - 40, Math.max(r.offsetHeight + 150, b.sy)) : r.offsetHeight + 150;
      r.style.transform = `translate(${(x - hw).toFixed(1)}px, ${(y - r.offsetHeight).toFixed(1)}px)`;
      r.style.opacity = b.onScreen ? '1' : '0.85';
    }
    {   // absorb shield row (light blue, tenths): only for the real boss bar, never an illusion's
      const fsh = !I && B.shield > 0 && B.shieldMax > 0 ? Math.min(1, B.shield / B.shieldMax) : 0;
      if (shRow.current) shRow.current.style.visibility = fsh > 0 ? 'visible' : 'hidden';
      if (shFill.current && fsh > 0) shFill.current.style.width = `${fsh * 100}%`;
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
    {   // interrupt meter (systems/interrupt.ts): only while the boss casts something stoppable
      const io = !I && b.interruptOn, fi = io ? Math.max(0, Math.min(1, b.interrupt)) : 0, fk = fi.toFixed(3);
      if (io !== s.intOn) { s.intOn = io; if (intRow.current) intRow.current.style.opacity = io ? '1' : '0'; }
      if (io && fk !== s.int) { s.int = fk; if (intFill.current) intFill.current.style.width = `${fi * 100}%`; }
      if (io && b.interruptLabel !== s.intLbl) { s.intLbl = b.interruptLabel; if (intLbl.current) intLbl.current.textContent = `Interrupt · ${b.interruptLabel}`; }
    }
    if (b.phase !== s.phase) {
      s.phase = b.phase;
      pips.current.forEach((el, i) => { if (el) el.dataset.on = i <= b.phase ? '1' : '0'; });
    }
  });

  return (
    <div ref={root} style={{ display: 'none', position: 'absolute', left: 0, top: 0, width: illusion === undefined ? 'min(26rem, 72vw)' : '10.5rem', zIndex: 4, pointerEvents: 'none', willChange: 'transform' }} data-testid={illusion === undefined ? 'boss-bar' : 'boss-bar-illusion'} className={`bb-slim${illusion === undefined ? ' bb-top' : ''}`}>
      <div ref={abil} data-testid="boss-ability" className="text-center rpg-title" style={{ opacity: 0, transition: 'opacity .15s, transform .15s', fontSize: '1.15rem', letterSpacing: '.18em', color: '#ffe27a', textShadow: '0 0 12px #ff8a00, 0 2px 0 #000', marginBottom: '.2rem', height: '1.4rem' }} />
      <div className="bb-name text-center leading-none">
        <span ref={name} className="bb-n" /><span ref={title} className="bb-t" />
      </div>
      {/* (owner, reference) long thin bar with diamond end caps, dark red fill, centred value, bright edge at the fill end */}
      <div className="bb-bar">
        <div ref={shRow} className="bb-shield" data-testid="boss-shield" style={{ visibility: 'hidden' }}>
          <div ref={shFill} className="bb-shield-fill" style={{ width: '0%' }} />
        </div>
        <div className="bb-track">
          <div ref={trail} className="bb-trail" style={{ width: '100%' }} />
          <div ref={hp} className="bb-fill" style={{ width: '100%' }} />
          <div className="bb-val rpg-num"><span ref={val} /></div>
        </div>
        {/* (owner: a slim bar, a bit bigger than a monster's, with a solid monster icon on the left) */}
        <svg className="bb-ic" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2C6.9 2 3 5.7 3 10.4c0 2.7 1.3 5 3.4 6.5V20c0 1.1.9 2 2 2h1.1v-2.4h1.4V22h2.2v-2.4h1.4V22h1.1c1.1 0 2-.9 2-2v-3.1c2.1-1.5 3.4-3.8 3.4-6.5C21 5.7 17.1 2 12 2zm-3.6 11.2a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm7.2 0a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2z" /></svg>
      </div>
      <div className="relative mx-auto mt-1" style={{ width: '70%', height: '.5rem', background: 'rgba(0,0,0,.35)', borderRadius: 999, overflow: 'hidden' }} title="Stagger">
        <div ref={stag} data-testid="stagger-bar" style={{ width: '0%', height: '100%', background: '#fff6e0', borderRadius: 999 }} />
      </div>
      <div ref={intRow} data-testid="boss-interrupt" style={{ opacity: 0, transition: 'opacity .15s' }}>
        <div className="text-center" style={{ fontSize: '.6rem', fontWeight: 700, color: '#bfe8ff', marginTop: '.2rem' }}><span ref={intLbl} /></div>
        <div className="relative mx-auto" style={{ width: '70%', height: '.45rem', background: 'rgba(0,0,0,.35)', borderRadius: 999, overflow: 'hidden' }}>
          <div ref={intFill} data-testid="interrupt-bar" style={{ width: '0%', height: '100%', background: '#7fd3ff', borderRadius: 999 }} />
        </div>
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
