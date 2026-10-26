// Boss invulnerable-phase HUD: attack-name banner + hint, the big countdown, an "INVULNERABLE" tag and a coloured screen-edge tint.
// Reads engine/systems/bossPhaseState `bp` in the shared rAF loop and writes the DOM through refs (no React state per frame).
import React, { useRef } from 'react';
import { bp } from '../../engine/systems/bossPhaseState';
import { useRaf } from '../hooks/useRaf';

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const BossPhaseHud: React.FC = () => {
  const box = useRef<HTMLDivElement>(null), name = useRef<HTMLDivElement>(null), sub = useRef<HTMLDivElement>(null);
  const cnt = useRef<HTMLDivElement>(null), tint = useRef<HTMLDivElement>(null), tag = useRef<HTMLDivElement>(null);
  const sig = useRef(''), tintSig = useRef('');
  useRaf(() => {
    const showB = bp.bannerT > 0;
    const s = `${showB}|${bp.name}|${bp.sub}|${bp.color}`;
    if (s !== sig.current) {
      sig.current = s;
      if (box.current) box.current.style.display = showB ? 'block' : 'none';
      if (name.current) { name.current.textContent = bp.name; name.current.style.color = hex(bp.color); }
      if (sub.current) sub.current.textContent = bp.sub;
    }
    if (box.current && showB) box.current.style.opacity = String(Math.min(1, bp.bannerT * 1.5));
    if (tint.current) {
      const o = bp.tint > 0.01 ? bp.tint.toFixed(2) : '0';
      const ts = `${o}|${bp.color}`;
      if (ts !== tintSig.current) {
        tintSig.current = ts;
        tint.current.style.opacity = o;
        tint.current.style.boxShadow = `inset 0 0 14vmin 3vmin ${hex(bp.color)}`;
      }
    }
    if (tag.current) tag.current.style.display = bp.on && bp.immune ? 'block' : 'none';
    if (cnt.current) {
      const show = bp.on && bp.count >= 0;
      cnt.current.style.display = show ? 'block' : 'none';
      if (show) { cnt.current.textContent = bp.count.toFixed(1); cnt.current.style.color = bp.count < 1.2 ? '#ff6a5a' : '#fff6d8'; }
    }
  });
  return (
    <>
      <div ref={tint} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0, zIndex: 2 }} />
      <div ref={box} style={{ position: 'absolute', pointerEvents: 'none', textAlign: 'center', display: 'none', top: '23%', left: 0, right: 0, zIndex: 4 }}>
        <div ref={name} style={{ fontSize: 'clamp(1.6rem, 5.5vw, 3rem)', fontWeight: 900, letterSpacing: '.12em', textShadow: '0 3px 0 rgba(0,0,0,.6), 0 0 18px rgba(0,0,0,.7)' }} />
        <div ref={sub} style={{ marginTop: 4, fontSize: 'clamp(.85rem, 2.4vw, 1.2rem)', fontWeight: 700, color: '#fff6d8', textShadow: '0 2px 0 rgba(0,0,0,.7)' }} />
      </div>
      <div ref={tag} style={{ position: 'absolute', pointerEvents: 'none', textAlign: 'center', display: 'none', top: '19.5%', left: 0, right: 0, zIndex: 4, fontSize: '.8rem', fontWeight: 800, letterSpacing: '.3em', color: '#bfe4ff', textShadow: '0 2px 0 rgba(0,0,0,.7)' }}>INVULNERABLE</div>
      <div ref={cnt} style={{ position: 'absolute', pointerEvents: 'none', textAlign: 'center', display: 'none', top: '33%', left: 0, right: 0, zIndex: 4, fontSize: 'clamp(2rem, 7vw, 3.6rem)', fontWeight: 900, textShadow: '0 3px 0 rgba(0,0,0,.7), 0 0 16px rgba(0,0,0,.6)' }} />
    </>
  );
};
