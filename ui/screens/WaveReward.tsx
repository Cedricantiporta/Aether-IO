import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Upgrade } from '../../types';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { Stars } from '../components/Stars';
import { RARITY_NAME } from '../theme';
import { device } from '../../engine/device';
import { ArcanaGlyph, tallArtKey, tallArtUrl, cardFrameUrl, cardBackdropUrl, RARITIES_ALL, preloadImages } from '../components/UpgradeIcons';

const Card: React.FC<{ opt: Upgrade; i: number; onPick: () => void }> = ({ opt, i, onPick }) => {
  const arcana = opt.rarity === 'LEGENDARY' || opt.rarity === 'MYTHIC' || opt.type === 'DEATH_DEFIANCE' || opt.type === 'SPECIAL';
  const art = tallArtKey(opt);
  const long = opt.name.length > 11;
  return (
    <motion.button className="rw-card tarot" data-rarity={opt.rarity} data-arcana={arcana ? '1' : '0'} onClick={onPick}
      initial={{ y: 40, opacity: 0, scale: .92 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: .1 + i * .08 }}
      whileHover={{ y: -6 }} whileTap={{ scale: .97 }}>
      <span className="tc">
        <span className="tc-win">
          {art
            ? <img className="tc-pic" src={tallArtUrl(art)} alt="" draggable={false} decoding="async" />
            : <>
                <img className="tc-pic bg" src={cardBackdropUrl(opt.rarity)} alt="" draggable={false} decoding="async" />
                <svg className="tc-glyph" viewBox="0 0 100 100" aria-hidden><ArcanaGlyph upgrade={opt} x={14} y={14} size={72} /></svg>
              </>}
        </span>
        <img className="tc-frame" src={cardFrameUrl(opt.rarity)} alt="" draggable={false} decoding="async" />
        {!device.touch && <span className="rw-num rpg-key">{i + 1}</span>}
        <span className={`tc-name${long ? ' long' : ''}`}>{opt.name}</span>
      </span>
      <div className="rw-body flex flex-col items-center gap-1 min-h-0 w-full">
        <Stars rarity={opt.rarity} />
        <span className="rw-rar" {...tip(<SimpleTip title={RARITY_NAME[opt.rarity]} sub={opt.special || opt.type === 'DEATH_DEFIANCE' ? 'Special ability \u00b7 lasts the whole run' : 'Reward rarity \u00b7 higher rarity = stronger bonus'} />)}>{RARITY_NAME[opt.rarity]}</span>
        <div className="rw-title"><span>{opt.name}</span></div>
        <div className="rw-desc">{opt.description}</div>
      </div>
    </motion.button>
  );
};

export const WaveReward: React.FC = () => {
  const { options, select, wave } = useGameStore(useShallow((s) => ({ options: s.upgradeOptions, select: s.selectUpgrade, wave: s.wave })));
  const boss = wave % 10 === 0;

  useEffect(() => { preloadImages([...RARITIES_ALL.map(cardFrameUrl), ...options.map((o) => tallArtKey(o)).filter((k): k is string => !!k).map(tallArtUrl)]); }, [options]);
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
        <div className="t">{boss ? 'Boss defeated' : 'Room cleared'}</div>
        <div className="s">Choose a reward · Depth {Math.max(1, wave)}</div>
      </div>
      <div className="rw-cards">
        {options.map((opt, i) => <Card key={opt.id + i} opt={opt} i={i} onPick={() => select(opt)} />)}
      </div>
    </motion.div>
  );
};
