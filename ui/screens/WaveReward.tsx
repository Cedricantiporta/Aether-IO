import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Upgrade } from '../../types';
import { UpgradeIcon } from '../components/ItemIcon';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { Stars } from '../components/Stars';
import { RARITY_NAME } from '../theme';
import { device } from '../../engine/device';

type Tone = 'blue' | 'purple' | 'gold';
const toneOf = (u: Upgrade): Tone => (u.rarity === 'LEGENDARY' || u.rarity === 'MYTHIC' ? 'gold' : u.type.startsWith('SKILL') || u.rarity === 'EPIC' ? 'purple' : 'blue');

const Card: React.FC<{ opt: Upgrade; i: number; onPick: () => void }> = ({ opt, i, onPick }) => {
  const tone = toneOf(opt);
  const isSkill = opt.type.startsWith('SKILL');
  const unlock = opt.name.startsWith('UNLOCK: ');
  return (
    <motion.button className="rw-card" data-tone={tone} data-rarity={opt.rarity} onClick={onPick}
      initial={{ y: 40, opacity: 0, scale: .92 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: .1 + i * .08 }}
      whileHover={{ y: -6 }} whileTap={{ scale: .97 }}>
      {!device.touch && <span className="rw-num rpg-key" style={{ color: '#f3f1ea' }}>{i + 1}</span>}
      <span className="rw-kind" {...tip(<SimpleTip title={RARITY_NAME[opt.rarity]} sub="Reward rarity" />)}>{isSkill ? 'Skill' : 'Stat'}</span>
      <div className="rw-emblem"><UpgradeIcon upgrade={opt} size={48} /></div>
      <div className="rw-body flex flex-col items-center gap-1.5 min-h-0 flex-1 w-full">
        <Stars rarity={opt.rarity} />
        <div className="rw-title">
          {unlock ? <><span>Unlock</span><span>{opt.name.slice(8)}</span></> : <span>{opt.name}</span>}
        </div>
        <div className="rw-desc">{opt.description}</div>
      </div>
      <div className="rw-select">Select</div>
    </motion.button>
  );
};

export const WaveReward: React.FC = () => {
  const { options, select, wave } = useGameStore(useShallow((s) => ({ options: s.upgradeOptions, select: s.selectUpgrade, wave: s.wave })));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (m && options[+m[1] - 1]) select(options[+m[1] - 1]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [options, select]);

  return (
    <motion.div className="absolute inset-0 pe rw-root" style={{ zIndex: 100 }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="rw-head">
        <div className="t">Wave {Math.max(1, wave)} cleared</div>
        <div className="s">Choose a reward</div>
      </div>
      <div className="rw-cards">
        {options.map((opt, i) => <Card key={opt.id + i} opt={opt} i={i} onPick={() => select(opt)} />)}
      </div>
    </motion.div>
  );
};
