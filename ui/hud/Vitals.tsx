import React, { useRef } from 'react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { motion } from 'framer-motion';
import { OrnateRing } from '../components/Ornate';

/** Diablo-style liquid orb. Fill + numbers updated through refs every frame. */
export const VitalOrb: React.FC<{ kind: 'hp' | 'mp' }> = ({ kind }) => {
  const max = useGameStore((s) => (kind === 'hp' ? s.stats.maxHealth : s.stats.maxMana));
  const root = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const maxRef = useRef(max); maxRef.current = max;
  const st = useRef({ fill: '', cur: -1, low: false });

  useRaf(() => {
    const m = Math.max(1, maxRef.current);
    const cur = Math.max(0, kind === 'hp' ? world.player.hp : world.player.mana);
    const f = Math.min(1, cur / m);
    const fs = f.toFixed(3);
    const s = st.current;
    if (root.current && fs !== s.fill) { s.fill = fs; root.current.style.setProperty('--fill', fs); }
    const c = Math.ceil(cur);
    if (txt.current && c !== s.cur) { s.cur = c; txt.current.textContent = String(c); }
    const low = kind === 'hp' && f < 0.3 && world.player.alive;
    if (root.current && low !== s.low) { s.low = low; root.current.dataset.low = low ? '1' : '0'; }
  });

  return (
    <div className="relative pe" style={{ width: '10.9rem', height: '10.9rem' }}>
      <div ref={root} className="orb" data-kind={kind} data-low="0" style={{ position: 'absolute', left: '50%', top: '50%', width: '7.1rem', height: '7.1rem', transform: 'translate(-50%,-50%)' }}>
        <div className="orb-glass">
          <div className="orb-fluid">
            <div className="orb-wave w2" />
            <div className="orb-wave w1" />
            <div className="orb-bubbles" />
          </div>
        </div>
        <div className="orb-text">
          <div><span ref={txt}>0</span><small>/ {Math.round(max)}</small></div>
        </div>
      </div>
      <OrnateRing id={`orb-${kind}`} spikes={8} />
    </div>
  );
};

export const XpBar: React.FC = () => {
  const { xp, need, level } = { xp: useGameStore((s) => s.experience), need: useGameStore((s) => s.experienceToNextLevel), level: useGameStore((s) => s.level) };
  const f = Math.min(1, Math.max(0, xp / Math.max(1, need)));
  return (
    <div className="relative w-full pe" style={{ paddingLeft: '1.3rem' }}>
      <div className="xp-bar" style={{ ['--fill' as any]: f }}>
        <div className="fill" />
        <div className="rpg-num text-outline" style={{ position: 'absolute', right: '.8rem', top: '50%', transform: 'translateY(-50%)', fontSize: '.72rem', color: '#fff', zIndex: 2 }}>{Math.floor(xp)} / {Math.floor(need)} XP</div>
      </div>
      <motion.div key={level} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="xp-medal absolute left-0 top-1/2" style={{ width: '1.9rem', height: '1.9rem', transform: 'translate(-30%,-50%)', zIndex: 3, fontSize: '.95rem' }}>
        {level}
      </motion.div>
    </div>
  );
};
