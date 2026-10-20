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
    <div className={`loading-screen pe ${done ? 'done' : ''}`} data-testid="loading-screen"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(8,10,16,.15) 0%, rgba(8,10,16,.25) 55%, rgba(8,10,16,.85) 100%), url(${((import.meta as any).env?.BASE_URL || '/') + 'art/keyart.webp'})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="rpg-logo" style={{ fontSize: '2.6rem', whiteSpace: 'nowrap' }}>AETHER SURVIVOR</div>
      <div className="loading-bar">
        <div className="xp-bar" style={{ ['--fill' as any]: p / 100, height: '1.3rem' }}><div className="fill" /></div>
        <div className="flex justify-between mt-2" style={{ fontFamily: 'var(--font-title)', fontSize: '.72rem', letterSpacing: '.18em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          <span>{done ? 'Ready' : 'Loading the Aether'}</span><span className="rpg-num">{Math.round(p)}%</span>
        </div>
        <div className="text-center mt-1" style={{ fontSize: '.6rem', color: '#7a6a4a', minHeight: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!done && item ? `${loaded}/${total} · ${item.split('/').pop()}` : ''}</div>
      </div>
    </div>
  );
};
