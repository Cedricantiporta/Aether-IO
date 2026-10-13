import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Ribbon } from '../components/Frame';
import { UpgradeIcon } from '../components/ItemIcon';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { RARITY_COLOR } from '../lib/game';

const KIND_LABEL = (type: string) => (type.startsWith('SKILL') ? 'Skill' : 'Stat');

export const WaveReward: React.FC = () => {
  const { options, select, wave } = useGameStore(useShallow((s) => ({ options: s.upgradeOptions, select: s.selectUpgrade, wave: s.wave })));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(e.code) && options[i]) select(options[i]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [options, select]);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center gap-7 pe" style={{ zIndex: 100, background: 'radial-gradient(ellipse at center, rgba(30,15,5,.55), rgba(5,2,1,.88))' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: -70, opacity: 0, scale: .6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }} className="text-center">
        <Ribbon tone="gold" style={{ fontSize: '2.2rem' }}>Wave {Math.max(1, wave - 0)} cleared</Ribbon>
        <div className="rpg-title mt-4 !text-[1rem] tracking-[.3em]" style={{ color: '#f6e8c8' }}>Choose a reward</div>
      </motion.div>
      <div className="flex gap-7 items-center" style={{ perspective: '1400px' }}>
        {options.map((opt, i) => (
          <motion.button key={opt.id + i} className="rpg-card" data-rarity={opt.rarity} onClick={() => select(opt)}
            initial={{ rotateY: 100, y: 60, opacity: 0, scale: .8 }} animate={{ rotateY: 0, y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 15, delay: .25 + i * .16 }}
            whileHover={{ y: -14, scale: 1.05, transition: { type: 'spring', stiffness: 400, damping: 18 } }} whileTap={{ scale: .97 }}>
            <span className="rpg-key" style={{ top: '-.75rem', fontSize: '.8rem', padding: '.05rem .6rem' }}>{i + 1}</span>
            <div className="w-full flex items-center justify-between">
              <span className="rpg-label !text-[.6rem]" style={{ color: RARITY_COLOR[opt.rarity] }}>{KIND_LABEL(opt.type)}</span>
              <span className="rpg-gem" data-rarity={opt.rarity} {...tip(<SimpleTip title={opt.rarity.charAt(0) + opt.rarity.slice(1).toLowerCase()} sub="Reward rarity" color={RARITY_COLOR[opt.rarity] === '#e5e7eb' ? '#4b4b52' : undefined} />)} />
            </div>
            <div className="card-art"><UpgradeIcon upgrade={opt} size={64} /></div>
            <div className="rpg-title text-[1.15rem] leading-tight" style={{ color: '#fff3d0' }}>{opt.name}</div>
            <div className="rpg-parchment w-full flex-1 p-2 text-[.8rem] leading-snug font-semibold flex items-center justify-center text-center">{opt.description}</div>
            <div className="rpg-btn rpg-btn-primary rpg-btn-sm w-full" style={{ pointerEvents: 'none' }}>Select</div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};
