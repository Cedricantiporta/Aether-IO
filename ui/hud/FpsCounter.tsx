import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { perf } from '../../render/perf';

/** Small FPS / frame-cost readout (Settings > Graphics > Show FPS counter). Polled twice a second, outside the render loop. */
export const FpsCounter: React.FC = () => {
  const show = useGameStore((s) => s.settings.showFps);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return null;
  return (
    <div data-testid="fps" className="absolute rpg-num" style={{ left: 'calc(env(safe-area-inset-left, 0px) + .5rem)', bottom: '.4rem', zIndex: 900, fontSize: '.72rem', padding: '.15rem .45rem', borderRadius: '.3rem',
      background: 'rgba(10,7,9,.78)', color: perf.fps >= 50 ? '#9be37a' : perf.fps >= 28 ? '#ffd24a' : '#ff7a6a', pointerEvents: 'none' }}>
      {Math.round(perf.fps)} FPS · {perf.jsMs.toFixed(1)}ms · {perf.calls} dc · {(perf.tris / 1000).toFixed(0)}k tri{perf.level > 0 ? ` · Q-${perf.level}` : ''}
    </div>
  );
};
