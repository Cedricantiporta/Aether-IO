// Void gravity-flip banner (engine/systems/biomeHazards.ts): a big arrow + "GRAVITY SHIFT" for the 1.5 s warning, a small
// drift arrow while it is active. Reads the hazard state in the shared rAF loop and writes the DOM through refs.
import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { hz, HZ } from '../../engine/systems/biomeHazards';
import { useRaf } from '../hooks/useRaf';

export const BiomeHazardHud: React.FC = () => {
  const box = useRef<HTMLDivElement>(null), arrow = useRef<HTMLDivElement>(null), label = useRef<HTMLDivElement>(null);
  const sig = useRef('');
  useRaf((_dt, now) => {
    const el = box.current; if (!el) return;
    const f = hz.flip, on = world.room.active && hz.kind === HZ.VOID && f.state > 0;
    if (!on) { if (sig.current !== '') { sig.current = ''; el.style.opacity = '0'; } return; }
    const y = world.camera.yaw, c = Math.cos(y), s = Math.sin(y);
    const scx = f.dx * c - f.dz * s, scz = f.dx * s + f.dz * c;   // world dir -> screen dir (inverse of camRel)
    const deg = Math.round(Math.atan2(scx, -scz) * 180 / Math.PI);
    const warn = f.state === 1;
    const blink = warn ? (Math.floor(now * 8) % 2 ? 1 : 0.55) : 0.8;
    const key = `${deg}|${warn ? 1 : 0}|${blink}`;
    if (key === sig.current) return;
    sig.current = key;
    el.style.opacity = String(blink);
    el.style.transform = `translateX(-50%) scale(${warn ? 1 : 0.6})`;
    if (arrow.current) arrow.current.style.transform = `rotate(${deg - 90}deg)`;
    if (label.current) label.current.textContent = warn ? 'GRAVITY SHIFT' : 'DRIFTING';
  });
  return (
    <div ref={box} aria-hidden data-testid="gravity-banner" className="absolute pointer-events-none" style={{ left: '50%', top: '24%', zIndex: 4, opacity: 0, transform: 'translateX(-50%)', textAlign: 'center', transition: 'transform .15s' }}>
      <div ref={arrow} style={{ fontSize: '4.2rem', lineHeight: 1, color: '#d6b4ff', textShadow: '0 0 14px #9a5cff, 0 0 30px #6a2cff', display: 'inline-block' }}>&#10148;</div>
      <div ref={label} style={{ fontWeight: 800, letterSpacing: '.25em', fontSize: '1rem', color: '#e6d4ff', textShadow: '0 0 10px #8a4cff' }}>GRAVITY SHIFT</div>
    </div>
  );
};
