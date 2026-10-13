import React, { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

/** Boot screen driven by three's DefaultLoadingManager (drei useProgress). Fades out when assets are in (or after a safety timeout). */
export const LoadingScreen: React.FC = () => {
  const { progress, active, item, loaded, total } = useProgress();
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [minTime, setMinTime] = useState(false);
  useEffect(() => { const a = setTimeout(() => setMinTime(true), 700), b = setTimeout(() => setDone(true), 15000); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  useEffect(() => { if (minTime && !active && (progress >= 100 || total === 0)) { const t = setTimeout(() => setDone(true), 250); return () => clearTimeout(t); } }, [minTime, active, progress, total]);
  useEffect(() => { if (done) { const t = setTimeout(() => setGone(true), 600); return () => clearTimeout(t); } }, [done]);
  if (gone) return null;
  const p = Math.max(0, Math.min(100, done ? 100 : progress));
  return (
    <div className={`loading-screen pe ${done ? 'done' : ''}`} data-testid="loading-screen">
      <div className="wordmark" style={{ fontSize: 'clamp(1.8rem, 9vw, 3rem)', textAlign: 'center' }}>Aether Survivor</div>
      <div className="loading-bar">
        <div className="rpg-bar" style={{ ['--fill' as any]: p / 100 }}><div className="fill" /></div>
        <div className="flex justify-between mt-2" style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)' }}>
          <span>{done ? 'Ready' : 'Loading'}</span><span className="rpg-num">{Math.round(p)}%</span>
        </div>
        <div className="text-center mt-1" style={{ fontSize: 12, color: 'var(--fg-2)', minHeight: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!done && item ? `${loaded}/${total} · ${item.split('/').pop()}` : ''}</div>
      </div>
    </div>
  );
};
