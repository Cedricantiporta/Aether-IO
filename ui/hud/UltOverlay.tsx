import React, { useRef } from 'react';
import { abilityState } from '../../engine/systems/abilities';
import { useRaf } from '../hooks/useRaf';

/** Full-screen darkening / colour tint while an ultimate is running (sky darkens). Written via refs, no re-renders. */
export const UltOverlay: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useRaf(() => {
    const el = ref.current; if (!el) return;
    const a = abilityState;
    const t = a.tint;
    const key = t.toFixed(3) + a.tintRgb.join(',');
    if (key === last.current) return;
    last.current = key;
    if (t < 0.004) { el.style.opacity = '0'; return; }
    const [r, g, b] = a.tintRgb.map((v) => Math.round(v * 255));
    el.style.opacity = '1';
    el.style.background = `radial-gradient(ellipse at 50% 50%, rgba(${r},${g},${b},${(t * 0.7).toFixed(3)}) 0%, rgba(${r},${g},${b},${(t * 0.8).toFixed(3)}) 55%, rgba(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)},${Math.min(0.95, t * 1.15).toFixed(3)}) 100%)`;
  });
  return <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0, zIndex: 1 }} />;
};
