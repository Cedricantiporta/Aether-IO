import React, { useRef } from 'react';
import { abilityState } from '../../engine/systems/abilities';
import { useRaf } from '../hooks/useRaf';

/** Brief light flash / vignette pulse at ultimate cast and impact (no sustained darkening). Written via refs, no re-renders. */
export const UltOverlay: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useRaf(() => {
    const el = ref.current; if (!el) return;
    const a = abilityState;
    const f = a.flash;
    const key = f.toFixed(3);
    if (key === last.current) return;
    last.current = key;
    if (f < 0.01) { el.style.opacity = '0'; return; }
    const [r, g, b] = a.flashRgb.map((v) => Math.round(v * 255));
    el.style.opacity = '1';
    el.style.background = `radial-gradient(ellipse at 50% 50%, rgba(${r},${g},${b},${(f * 0.12).toFixed(3)}) 0%, rgba(${r},${g},${b},${(f * 0.3).toFixed(3)}) 60%, rgba(${r},${g},${b},${(f * 0.65).toFixed(3)}) 100%)`;
  });
  return <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0, zIndex: 1 }} />;
};
