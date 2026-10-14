// Full-screen class selection (Korean MMO style): class list on the left, the 3D hero centred in the scene
// (CameraRig frames it while `charSelect` is on), emblem + role + profile bars + difficulty + Confirm on the right.
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import type { HeroClass } from '../../types';
import type { Difficulty } from '../../storeTypes';
import { DIFFICULTY_MODS } from '../../constants';
import { HERO_META, HERO_ORDER } from '../lib/heroes';
import { HERO_ICON } from '../hud/TopBars';

const ROLE: Record<HeroClass, string> = { ARCHER: 'Ranged  |  Damage', WIZARD: 'Ranged  |  Magic', BARBARIAN: 'Melee  |  Defense', KNIGHT: 'Melee  |  Tank' };
const BLURB: Record<HeroClass, string> = {
  ARCHER: 'A swift marksman who looses arrows on the run and never stops moving.',
  WIZARD: 'A master of the arcane who bends fire, ice and gravity to clear the field.',
  BARBARIAN: 'An unbreakable warrior who wades into the horde and laughs at pain.',
  KNIGHT: 'A sworn guardian in plate who cuts wide arcs of steel and calls down holy light.',
};
const COMPLEXITY: Record<HeroClass, number> = { ARCHER: 2, WIZARD: 3, BARBARIAN: 1, KNIGHT: 2 };
const PROFILE: Record<HeroClass, [string, number][]> = {
  ARCHER: [['Attack', 4], ['Defense', 1], ['Range', 5], ['Mobility', 5], ['Control', 2]],
  WIZARD: [['Attack', 5], ['Defense', 1], ['Range', 4], ['Mobility', 2], ['Control', 5]],
  BARBARIAN: [['Attack', 4], ['Defense', 5], ['Range', 1], ['Mobility', 3], ['Control', 3]],
  KNIGHT: [['Attack', 3], ['Defense', 5], ['Range', 2], ['Mobility', 3], ['Control', 4]],
};
const DIFFS: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];

/** Gold ring emblem with the class glyph. */
export const ClassEmblem: React.FC<{ hero: HeroClass; size: string; lit?: boolean }> = ({ hero, size, lit }) => {
  const Icon = HERO_ICON[hero];
  return (
    <div className={`cs-emblem ${lit ? 'lit' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs><linearGradient id={`cse-${hero}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#c9a052" /><stop offset="1" stopColor="#7d5c26" /></linearGradient></defs>
        <circle cx="50" cy="50" r="46" fill="rgba(10,10,12,.55)" stroke={`url(#cse-${hero})`} strokeWidth="2.5" />
        <circle cx="50" cy="50" r="39" fill="none" stroke={`url(#cse-${hero})`} strokeWidth="1" strokeDasharray="2 3" />
        {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <path key={i} d={`M${50 + Math.cos(a) * 42} ${50 + Math.sin(a) * 42} L${50 + Math.cos(a) * 47} ${50 + Math.sin(a) * 47}`} stroke="#e9cf8a" strokeWidth={i % 3 ? 1 : 2.2} />; })}
      </svg>
      <Icon className="cs-emblem-ico" strokeWidth={1.6} />
    </div>
  );
};

export const CharacterSelect: React.FC = () => {
  const hero = useGameStore((s) => s.hero);
  const difficulty = useGameStore((s) => s.difficulty);
  const selectHero = useGameStore((s) => s.selectHero);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const setCharSelect = useUiStore((s) => s.setCharSelect);
  const confirm = () => setCharSelect(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') confirm();
      const i = HERO_ORDER.indexOf(hero);
      if (e.key === 'ArrowDown' || e.key === 's') selectHero(HERO_ORDER[(i + 1) % HERO_ORDER.length]);
      if (e.key === 'ArrowUp' || e.key === 'w') selectHero(HERO_ORDER[(i + HERO_ORDER.length - 1) % HERO_ORDER.length]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const meta = HERO_META[hero];
  return (
    <div className="absolute inset-0 pe cs-root" style={{ zIndex: 55 }} data-testid="char-select">
      <div className="cs-vig" />
      <div className="cs-head">Choose your class</div>

      <div className="cs-list">
        {HERO_ORDER.map((h, i) => (
          <motion.button key={h} className={`cs-item ${hero === h ? 'on' : ''}`} onClick={() => selectHero(h)} data-testid={`cs-${h}`}
            initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.07 }}>
            <ClassEmblem hero={h} size="4.6rem" lit={hero === h} />
            <span>{HERO_META[h].title}</span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={hero} className="cs-info" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
          <ClassEmblem hero={hero} size="6rem" lit />
          <div className="cs-name">{meta.title}</div>
          <div className="cs-role">{ROLE[hero]}</div>
          <div className="cs-blurb">{BLURB[hero]}</div>
          <div className="cs-row"><span>Complexity</span><span className="cs-stars">{[1, 2, 3].map((n) => <i key={n} className={n <= COMPLEXITY[hero] ? 'on' : ''} />)}</span></div>
          <div className="cs-sep" />
          <div className="cs-bars">
            {PROFILE[hero].map(([l, v]) => (
              <div key={l} className="cs-bar"><span>{l}</span><div>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= v ? 'on' : ''} />)}</div></div>
            ))}
          </div>
          <div className="cs-sep" />
          <div className="cs-weapon">Weapon: <b>{meta.weapon}</b></div>
          <div className="cs-diffs">
            {DIFFS.map((d) => <button key={d} className={`cs-diff ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>{DIFFICULTY_MODS[d].label}</button>)}
          </div>
          <button className="cs-confirm" onClick={confirm} data-testid="cs-confirm">Confirm</button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
