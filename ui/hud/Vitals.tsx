import React, { useRef } from 'react';
import { useGameStore } from '../../store';
import { world } from '../../engine/world';
import { useRaf } from '../hooks/useRaf';
import { motion } from 'framer-motion';

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
    <div className="relative pe" style={{ width: '7.4rem', height: '7.4rem' }}>
      <div ref={root} className="orb" data-kind={kind} data-low="0">
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
    </div>
  );
};

export const XpBar: React.FC = () => {
  const { xp, need, level } = { xp: useGameStore((s) => s.experience), need: useGameStore((s) => s.experienceToNextLevel), level: useGameStore((s) => s.level) };
  const f = Math.min(1, Math.max(0, xp / Math.max(1, need)));
  return (
    <div className="relative w-full pe" style={{ paddingLeft: '1.2rem', paddingRight: '1.2rem' }}>
      <div className="xp-bar" style={{ ['--fill' as any]: f }}>
        <div className="fill" />
      </div>
      <motion.div key={level} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="rpg-medallion absolute left-0 top-1/2" style={{ width: '2.1rem', height: '2.1rem', transform: 'translate(-30%,-50%)', ['--mc' as any]: '#8b5a16', zIndex: 3 }}>
        <span className="rpg-num text-[.8rem] leading-none text-[var(--gold-light)]" style={{ textShadow: '0 1px 2px #000' }}>{level}</span>
      </motion.div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 rpg-num text-[.62rem] text-white/90 text-outline" style={{ zIndex: 2 }}>{Math.floor(xp)} / {Math.floor(need)} XP</div>
    </div>
  );
};
