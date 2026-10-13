import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { Upgrade } from '../../types';
import { UpgradeIcon } from '../components/ItemIcon';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

type Tone = 'blue' | 'purple' | 'gold';
const toneOf = (u: Upgrade): Tone => (u.rarity === 'LEGENDARY' || u.rarity === 'MYTHIC' ? 'gold' : u.type.startsWith('SKILL') || u.rarity === 'EPIC' ? 'purple' : 'blue');
const RARITY_NAME = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

/** Laurel branch: leaves along an arc. Mirrored for the right side. */
const Laurel: React.FC<{ flip?: boolean }> = React.memo(({ flip }) => {
  const leaves: React.ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, a = 200 - t * 120;                   // angle along arc (deg)
    const r = 40, x = 50 + r * Math.cos((a * Math.PI) / 180), y = 62 + r * Math.sin((a * Math.PI) / 180) * 1.1;
    const rot = a - 90, len = 11 - t * 3;
    leaves.push(
      <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
        <path d={`M0 0 C${len * .7} ${-len * .5} ${len * .7} ${-len * 1.4} 0 ${-len * 1.9} C${-len * .7} ${-len * 1.4} ${-len * .7} ${-len * .5} 0 0Z`} transform="translate(5 0) rotate(40)" fill="url(#lw-g)" stroke="#2a1604" strokeWidth="1.2" strokeLinejoin="round" />
        <path d={`M0 0 C${len * .7} ${-len * .5} ${len * .7} ${-len * 1.4} 0 ${-len * 1.9} C${-len * .7} ${-len * 1.4} ${-len * .7} ${-len * .5} 0 0Z`} transform="translate(-5 0) rotate(-40)" fill="url(#lw-g)" stroke="#2a1604" strokeWidth="1.2" strokeLinejoin="round" />
      </g>,
    );
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden style={{ transform: flip ? 'scaleX(-1)' : undefined, overflow: 'visible' }}>
      <defs><linearGradient id="lw-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0a8" /><stop offset=".5" stopColor="#d9a43a" /><stop offset="1" stopColor="#7a4a10" /></linearGradient></defs>
      <path d="M62 16 C26 26 14 62 40 92" fill="none" stroke="#2a1604" strokeWidth="5" strokeLinecap="round" />
      <path d="M62 16 C26 26 14 62 40 92" fill="none" stroke="url(#lw-g)" strokeWidth="2.6" strokeLinecap="round" />
      <g transform="translate(-4 -2)">{leaves}</g>
    </svg>
  );
});
Laurel.displayName = 'Laurel';

const Banner: React.FC<{ wave: number }> = ({ wave }) => (
  <div className="rw-banner">
    <div className="rw-laurel l"><Laurel /></div>
    <div className="rw-laurel r"><Laurel flip /></div>
    <svg className="rw-ribbon-svg" viewBox="0 0 520 96" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rb-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a0" /><stop offset=".3" stopColor="#e2aa3c" /><stop offset=".7" stopColor="#b97a1c" /><stop offset="1" stopColor="#7a4a10" /></linearGradient>
        <linearGradient id="rb-gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6d77a" /><stop offset=".5" stopColor="#d8a23a" /><stop offset="1" stopColor="#a8701a" /></linearGradient>
      </defs>
      <path d="M8 24 L36 24 L36 80 L8 80 L22 52Z" fill="#7a4a10" stroke="#1a0d03" strokeWidth="3" strokeLinejoin="round" />
      <path d="M512 24 L484 24 L484 80 L512 80 L498 52Z" fill="#7a4a10" stroke="#1a0d03" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 14 Q260 4 490 14 L490 74 Q260 90 30 74Z" fill="url(#rb-g)" stroke="#1a0d03" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M44 22 Q260 13 476 22 L476 66 Q260 80 44 66Z" fill="url(#rb-gi)" stroke="#fff0b0" strokeOpacity=".7" strokeWidth="1.4" />
      <path d="M44 22 Q260 13 476 22" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
    </svg>
    <svg className="rw-crest" viewBox="0 0 48 48" aria-hidden>
      <defs><linearGradient id="cr-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0b0" /><stop offset=".5" stopColor="#d9a23a" /><stop offset="1" stopColor="#6a410c" /></linearGradient></defs>
      <circle cx="24" cy="24" r="20" fill="#1a1008" stroke="url(#cr-g)" strokeWidth="3" />
      <g stroke="#0d0703" strokeWidth="1" strokeLinejoin="round">
        <path d="M10 8 L28 26 L26 30 L8 12Z" fill="#dfe6f2" /><path d="M38 8 L20 26 L22 30 L40 12Z" fill="#dfe6f2" />
        <path d="M28 26 L34 32 L31 35 L25 29Z M20 26 L14 32 L17 35 L23 29Z" fill="url(#cr-g)" />
      </g>
    </svg>
    <div className="rw-banner-text">WAVE {Math.max(1, wave)} CLEARED</div>
  </div>
);

const Card: React.FC<{ opt: Upgrade; i: number; onPick: () => void }> = ({ opt, i, onPick }) => {
  const tone = toneOf(opt);
  const isSkill = opt.type.startsWith('SKILL');
  const unlock = opt.name.startsWith('UNLOCK: ');
  return (
    <motion.button className="rw-card" data-tone={tone} onClick={onPick}
      initial={{ rotateY: 100, y: 60, opacity: 0, scale: .8 }} animate={{ rotateY: 0, y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 15, delay: .25 + i * .16 }}
      whileHover={{ y: -12, scale: 1.04, transition: { type: 'spring', stiffness: 400, damping: 18 } }} whileTap={{ scale: .97 }}>
      <span className="rw-num">{i + 1}</span>
      <span className="rw-kind" {...tip(<SimpleTip title={RARITY_NAME(opt.rarity)} sub="Reward rarity" color={opt.rarity === 'COMMON' ? '#4b4b52' : undefined} />)}>{isSkill ? 'Skill' : 'Stat'}</span>
      <div className="rw-emblem"><div className="rw-emblem-in"><UpgradeIcon upgrade={opt} size={54} /></div></div>
      <div className="rw-title">
        {unlock ? <><span>Unlock:</span><span>{opt.name.slice(8)}</span></> : <span>{opt.name}</span>}
      </div>
      <div className="rw-desc rpg-parchment">{opt.description}</div>
      <div className="rw-select">Select</div>
    </motion.button>
  );
};

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
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center pe rw-root" style={{ zIndex: 100 }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: -70, opacity: 0, scale: .6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }} className="text-center rw-head">
        <Banner wave={wave} />
        <div className="rw-sub">Choose a reward</div>
      </motion.div>
      <div className="rw-cards" style={{ perspective: '1400px' }}>
        {options.map((opt, i) => <Card key={opt.id + i} opt={opt} i={i} onPick={() => select(opt)} />)}
      </div>
    </motion.div>
  );
};
