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
import { ArcanaGlyph, cardArtKey, cardArtUrl } from '../components/UpgradeIcons';
import { ARCANA_NUMERAL } from '../../engine/runCards';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Rich arcana-style art for the emblem window (Legendary / Mythic / Death Defiance / specials): rays, clouds or flames, halo, glyph. */
const ArcanaScene: React.FC<{ opt: Upgrade }> = ({ opt }) => {
  const mythic = opt.rarity === 'MYTHIC';
  const id = React.useId().replace(/:/g, '');
  const c1 = mythic ? '#ff5040' : '#ffd24a', c2 = mythic ? '#5a0610' : '#5a3a10', c3 = mythic ? '#12040a' : '#140a1c';
  return (
    <svg className="arc-scene" viewBox="0 0 160 220" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={`bg${id}`} cx="50%" cy="42%" r="75%"><stop offset="0" stopColor={c2} /><stop offset=".6" stopColor={c3} /><stop offset="1" stopColor="#050308" /></radialGradient>
        <radialGradient id={`gl${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={c1} stopOpacity=".75" /><stop offset="1" stopColor={c1} stopOpacity="0" /></radialGradient>
        <linearGradient id={`fl${id}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff3a1a" /><stop offset=".6" stopColor="#ff9a2a" /><stop offset="1" stopColor="#ffd24a" stopOpacity="0" /></linearGradient>
        <filter id={`bl${id}`}><feGaussianBlur stdDeviation="5" /></filter>
      </defs>
      <rect width="160" height="220" fill={`url(#bg${id})`} />
      <g fill={c1} opacity=".2">{Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, w = 0.11; return <path key={i} d={`M80 92 L${80 + Math.cos(a - w) * 200} ${92 + Math.sin(a - w) * 200} L${80 + Math.cos(a + w) * 200} ${92 + Math.sin(a + w) * 200}Z`} />; })}</g>
      <circle cx="80" cy="92" r="58" fill={`url(#gl${id})`} />
      <circle cx="80" cy="92" r="47" fill="none" stroke={c1} strokeWidth="1" opacity=".7" /><circle cx="80" cy="92" r="52" fill="none" stroke={c1} strokeWidth=".6" strokeDasharray="2 4" opacity=".6" />
      {mythic
        ? <g filter={`url(#bl${id})`} opacity=".9">{[10, 38, 66, 94, 122, 150].map((x, i) => <path key={x} d={`M${x - 16} 220 C${x - 10} 190 ${x + 6} 180 ${x} ${150 - (i % 2) * 14} C${x + 14} 178 ${x + 22} 196 ${x + 18} 220Z`} fill={`url(#fl${id})`} />)}</g>
        : <g filter={`url(#bl${id})`} fill="#f4dcae" opacity=".5"><ellipse cx="20" cy="212" rx="50" ry="18" /><ellipse cx="90" cy="218" rx="60" ry="20" /><ellipse cx="150" cy="208" rx="40" ry="16" /></g>}
      <g fill="#fff" opacity=".8">{[[22, 30], [128, 24], [40, 150], [136, 140], [12, 90], [148, 84], [100, 14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1 : 1.5} />)}</g>
      <ArcanaGlyph upgrade={opt} x={34} y={46} size={92} />
    </svg>
  );
};
const CORNER = 'M2 16 V6 C2 3.5 3.5 2 6 2 H16 M2 9 C6 9 9 6 9 2';

const Card: React.FC<{ opt: Upgrade; i: number; onPick: () => void }> = ({ opt, i, onPick }) => {
  const arcana = opt.rarity === 'LEGENDARY' || opt.rarity === 'MYTHIC' || opt.type === 'DEATH_DEFIANCE' || opt.type === 'SPECIAL';
  const numeral = ARCANA_NUMERAL[opt.special ?? opt.type] ?? ROMAN[i] ?? String(i + 1);
  const art = cardArtKey(opt);
  return (
    <motion.button className="rw-card" data-rarity={opt.rarity} data-arcana={arcana ? '1' : '0'} onClick={onPick}
      initial={{ y: 40, opacity: 0, scale: .92 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: .1 + i * .08 }}
      whileHover={{ y: -6 }} whileTap={{ scale: .97 }}>
      {!device.touch && <span className="rw-num rpg-key" style={{ color: '#f3f1ea' }}>{i + 1}</span>}
      <span className="rw-rar" {...tip(<SimpleTip title={RARITY_NAME[opt.rarity]} sub={opt.special || opt.type === 'DEATH_DEFIANCE' ? 'Special ability \u00b7 lasts the whole run' : 'Reward rarity \u00b7 higher rarity = stronger bonus'} />)}>{RARITY_NAME[opt.rarity]}</span>
      <span className="rw-roman">{arcana ? '' : ROMAN[i] ?? i + 1}</span>
      <div className={`rw-emblem${arcana ? ' arc' : ''}${art ? ' has-art' : ''}`}>
        {art && <img className="rw-art" src={cardArtUrl(art)} alt="" draggable={false} decoding="async" />}
        {arcana ? <>
          {!art && <ArcanaScene opt={opt} />}
          {['a', 'b', 'c', 'd'].map((k) => <svg key={k} className={`arc-cor ${k}`} viewBox="0 0 18 18" aria-hidden><path d={CORNER} /></svg>)}
          <span className="arc-num">{numeral}</span>
        </> : !art && <UpgradeIcon upgrade={opt} size={64} />}
      </div>
      <div className="rw-body flex flex-col items-center gap-1.5 min-h-0 flex-1 w-full">
        <Stars rarity={opt.rarity} />
        <div className="rw-title"><span>{opt.name}</span></div>
        <div className="rw-desc">{opt.description}</div>
      </div>
    </motion.button>
  );
};

export const WaveReward: React.FC = () => {
  const { options, select, wave } = useGameStore(useShallow((s) => ({ options: s.upgradeOptions, select: s.selectUpgrade, wave: s.wave })));
  const boss = wave % 10 === 0;

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
