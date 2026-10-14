// Level-up burst (MMO style): a radiant golden ring with "Level N", then the stat gains (combat power, attack,
// defense, max HP) with gold arrows. Snapshots the stats before the level and compares a moment after.
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, calculateTotalCP } from '../../store';
import { useGameEvent } from '../hooks/useEvent';

interface Burst { id: number; level: number; rows: [string, number][] }
const snap = () => { const s = useGameStore.getState().stats; return { cp: calculateTotalCP(s), atk: s.damage, def: s.defense, hp: s.maxHealth }; };

export const LevelUpBurst: React.FC = () => {
  const [b, setB] = useState<Burst | null>(null);
  const before = useRef(snap());
  // keep the "before" snapshot fresh while nothing is levelling (gear changes etc.)
  useEffect(() => useGameStore.subscribe((s, p) => { if (s.stats !== p.stats && s.level === p.level) before.current = snap(); }), []);
  useGameEvent('levelUp', (e) => {
    const b0 = before.current;
    setTimeout(() => {
      const a = snap(); before.current = a;
      const rows: [string, number][] = [['Combat Power', Math.round(a.cp - b0.cp)], ['Attack', Math.round((a.atk - b0.atk) * 10) / 10], ['Defense', Math.round((a.def - b0.def) * 10) / 10], ['Max HP', Math.round(a.hp - b0.hp)]];
      setB({ id: Date.now(), level: e.level, rows: rows.filter(([, v]) => v > 0) });
    }, 60);
  });
  useEffect(() => { if (!b) return; const t = setTimeout(() => setB(null), 2800); return () => clearTimeout(t); }, [b]);
  return (
    <div className="lvb-wrap pointer-events-none">
      <AnimatePresence>
        {b && (
          <motion.div key={b.id} className="lvb" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }}>
            <div className="lvb-ring">
              <i className="lvb-rays" />
              <svg viewBox="0 0 120 120" className="lvb-svg" aria-hidden>
                <defs><radialGradient id="lvbg" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#5a3e12" /><stop offset=".7" stopColor="#2a1c08" /><stop offset="1" stopColor="#120c04" /></radialGradient>
                  <linearGradient id="lvbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#e9b949" /><stop offset="1" stopColor="#8b5a16" /></linearGradient></defs>
                <circle cx="60" cy="60" r="50" fill="url(#lvbg)" stroke="url(#lvbs)" strokeWidth="3.5" />
                <circle cx="60" cy="60" r="43" fill="none" stroke="url(#lvbs)" strokeWidth="1" opacity=".8" />
                {Array.from({ length: 4 }, (_, i) => <path key={i} transform={`rotate(${i * 90} 60 60)`} d="M60 4 L64 12 L60 20 L56 12Z" fill="#f6dc8e" />)}
              </svg>
              <div className="lvb-txt"><span>Level</span><b>{b.level}</b></div>
            </div>
            {b.rows.length > 0 && (
              <div className="lvb-rows">
                {b.rows.map(([l, v], i) => (
                  <motion.div key={l} className={`lvb-row ${i === 0 ? 'main' : ''}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.08 }}>
                    <span>{l}</span><b>{v}<em>▲</em></b>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
