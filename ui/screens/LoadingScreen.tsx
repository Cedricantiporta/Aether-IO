import React, { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

/** Boot screen driven by three's DefaultLoadingManager (drei useProgress). Fades out when assets are in (or after a safety timeout). */
export const LoadingScreen: React.FC = () => {
  const { progress, active, total } = useProgress();
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [minTime, setMinTime] = useState(false);
  useEffect(() => { const a = setTimeout(() => setMinTime(true), 700), b = setTimeout(() => setDone(true), 15000); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  useEffect(() => { if (minTime && !active && (progress >= 100 || total === 0)) { const t = setTimeout(() => setDone(true), 250); return () => clearTimeout(t); } }, [minTime, active, progress, total]);
  useEffect(() => { if (done) { const t = setTimeout(() => setGone(true), 600); return () => clearTimeout(t); } }, [done]);
  if (gone) return null;
  const p = Math.max(0, Math.min(100, done ? 100 : progress));
  return (
    <div className={`loading-screen pe ${done ? 'done' : ''}`} data-testid="loading-screen"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(8,10,16,.15) 0%, rgba(8,10,16,.25) 55%, rgba(8,10,16,.85) 100%), url(${((import.meta as any).env?.BASE_URL || '/') + 'art/keyart.webp'})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="loading-bar">
        <div className="text-center" style={{ fontFamily: 'var(--font-title)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.12em', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.5)' }}>Loading…</div>
        <div className="xp-bar" style={{ ['--fill' as any]: p / 100, height: '1rem', marginTop: '.5rem' }}><div className="fill" /></div>
      </div>
    </div>
  );
};
