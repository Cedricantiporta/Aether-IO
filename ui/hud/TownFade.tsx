import React, { useRef } from 'react';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';

/** Full-screen black overlay for the ~0.4 s castle door transitions (opacity follows world.village.fade). */
export const TownFade: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(-1);
  useRaf(() => {
    const f = Math.round(world.village.fade * 100) / 100;
    if (f === last.current || !ref.current) return;
    last.current = f;
    ref.current.style.opacity = String(f);
    ref.current.style.visibility = f > 0 ? 'visible' : 'hidden';
  });
  return <div ref={ref} className="town-fade" data-testid="town-fade" />;
};
