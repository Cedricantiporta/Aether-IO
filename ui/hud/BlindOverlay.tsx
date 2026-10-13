import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** BLIND debuff: darkened, vignetted screen with a soft blur for the duration (written via refs). */
export const BlindOverlay: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useRaf(() => {
    const el = ref.current; if (!el) return;
    const t = world.player.blindT;
    const a = t <= 0 ? 0 : Math.min(1, t / 0.4);
    const key = a.toFixed(2);
    if (key === last.current) return;
    last.current = key;
    el.style.opacity = key;
    el.style.backdropFilter = a > 0 ? `blur(${(a * 3).toFixed(1)}px)` : 'none';
  });
  return <div ref={ref} className="blind-overlay" aria-hidden data-testid="blind-overlay" />;
};
