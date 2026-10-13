import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, BookOpen, Settings, Trophy, Skull, Layers, Sword } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DIFFICULTY_MODS } from '../../constants';
import type { HeroClass } from '../../types';
import type { Difficulty } from '../../storeTypes';
import { Panel, Ribbon } from '../components/Frame';
import { Button } from '../components/Button';
import { HERO_META, HERO_ORDER, heroBars } from '../lib/heroes';
import { HERO_COLOR } from '../lib/game';
import { HERO_ICON } from '../hud/TopBars';
import { useUiStore } from '../uiStore';

const DIFFS: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];
const DIFF_COLOR: Record<Difficulty, string> = { EASY: '#4ade80', NORMAL: '#e9b949', HARD: '#f08a3a', NIGHTMARE: '#c084fc' };

const MiniBars: React.FC<{ hero: HeroClass; wide?: boolean }> = ({ hero }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
    {heroBars(hero).map((b) => (
      <div key={b.label} className="flex items-center gap-1.5">
        <span className="rpg-label !text-[.55rem] w-7">{b.label}</span>
        <div className="rpg-bar thin flex-1" style={{ ['--bc' as any]: b.color, ['--fill' as any]: Math.min(1, b.v) }}><div className="fill" /></div>
      </div>
    ))}
  </div>
);

const HeroCard: React.FC<{ hero: HeroClass; selected: boolean; onSelect: () => void; index: number }> = ({ hero, selected, onSelect, index }) => {
  const Icon = HERO_ICON[hero];
  const meta = HERO_META[hero];
  return (
    <motion.button initial={{ x: -60, opacity: 0 }} animate={{ x: selected ? 10 : 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: .1 + index * .08 }}
      whileHover={{ x: selected ? 10 : 6 }} onClick={onSelect}
      className="rpg-panel slim text-left w-full flex items-center gap-3 p-3 pe"
      style={{ borderImage: selected ? undefined : 'none', borderColor: selected ? undefined : '#2a170a', boxShadow: selected ? '0 0 0 2px #0d0703, inset 0 0 0 2px #0d0703, 0 0 26px rgba(233,185,73,.7), inset 0 0 40px rgba(233,185,73,.15)' : undefined, filter: selected ? 'none' : 'brightness(.8) saturate(.85)' }}>
      <div className="rpg-medallion" style={{ ['--mc' as any]: HERO_COLOR[hero], width: '3.8rem', height: '3.8rem' }}><Icon size={28} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <span className="rpg-title text-lg">{meta.title}</span>
          {selected && <span className="rpg-badge !text-[.55rem]">Selected</span>}
        </div>
        <div className="flex gap-1 my-1 flex-wrap">{meta.tags.map((t) => <span key={t} className="rpg-badge !text-[.55rem] !py-0">{t}</span>)}</div>
        <MiniBars hero={hero} />
      </div>
    </motion.button>
  );
};

export const MainMenu: React.FC = () => {
  const { hero, difficulty, stats, selectHero, setDifficulty, startGame } = useGameStore(useShallow((s) => ({
    hero: s.hero, difficulty: s.difficulty, stats: s.gameStats, selectHero: s.selectHero, setDifficulty: s.setDifficulty, startGame: s.startGame,
  })));
  const openCodex = useUiStore((s) => s.openCodex);
  const openSettings = useUiStore((s) => s.openSettings);
  const modalOpen = useUiStore((s) => s.codexOpen || s.settingsOpen);
  const meta = HERO_META[hero];

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === 'Enter') && !modalOpen) startGame(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [startGame, modalOpen]);

  return (
    <div className="absolute inset-0 pe" style={{ zIndex: 50 }}>
      {/* edge shading only: the 3D lobby must stay visible in the centre */}
      <div className="absolute inset-y-0 left-0 w-[34%] lobby-fade-l pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-[34%] lobby-fade-r pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] lobby-fade-b pointer-events-none" />

      {/* logo */}
      <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="absolute left-0 right-0 top-[1.2rem] flex flex-col items-center pointer-events-none">
        <div className="rpg-logo" style={{ fontSize: 'clamp(2.4rem, 5.2vw, 4.6rem)' }}>Aether Survivor</div>
        <div className="rpg-title mt-1 !text-[.95rem] tracking-[.35em]" style={{ color: '#f6e8c8', opacity: .9 }}>Hold the line · Endure the waves · Rise as legend</div>
      </motion.div>

      {/* left: hero + difficulty */}
      <div className="absolute flex flex-col gap-3" style={{ left: '1.6rem', top: '8.5rem', bottom: '5.5rem', width: '24rem' }}>
        <Ribbon tone="gold" className="self-start !text-[.85rem]" style={{ marginLeft: '1.2rem' }}>Choose your hero</Ribbon>
        <div className="flex flex-col gap-3 pr-2">
          {HERO_ORDER.map((h, i) => <HeroCard key={h} hero={h} index={i} selected={hero === h} onSelect={() => selectHero(h)} />)}
        </div>
        <Panel slim className="p-3 mt-1">
          <div className="rpg-label mb-2 flex items-center gap-1.5"><Skull size={12} /> Difficulty</div>
          <div className="grid grid-cols-4 gap-1.5">
            {DIFFS.map((d) => (
              <button key={d} onClick={() => setDifficulty(d)} className={`rpg-subtab pe ${difficulty === d ? 'is-active' : ''}`}
                style={difficulty === d ? { background: `linear-gradient(${DIFF_COLOR[d]}, color-mix(in srgb, ${DIFF_COLOR[d]} 55%, #000))`, color: '#1a0e05' } : { color: DIFF_COLOR[d], padding: '.4rem .2rem', fontSize: '.6rem', textAlign: 'center' }}>
                {DIFFICULTY_MODS[d].label}
              </button>
            ))}
          </div>
          <div className="text-xs mt-2 leading-snug" style={{ color: DIFF_COLOR[difficulty] }}>{DIFFICULTY_MODS[difficulty].desc}</div>
        </Panel>
      </div>

      {/* right: hero details + records */}
      <motion.div initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 22, delay: .15 }}
        className="absolute flex flex-col gap-3 rpg-scroll pr-2 pb-2" style={{ right: '1.6rem', top: '8.5rem', bottom: '5.5rem', width: '22rem' }}>
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="rpg-title text-xl">{meta.title}</div>
            <div className="rpg-label">{meta.tagline}</div>
          </div>
          <div className="rpg-parchment p-3 text-[.8rem] leading-snug mb-3">
            {hero === 'ARCHER' && 'A swift marksman who peppers the horde from afar. Trades toughness for speed and relentless attack rate.'}
            {hero === 'WIZARD' && 'An arcane master with a deep mana pool and devastating skills. Squishy, but spells never stop flowing.'}
            {hero === 'BARBARIAN' && 'An unbreakable tank with high defense and health regeneration. Stands in the thick of it and shrugs off blows.'}
          </div>
          <div className="rpg-frame p-2 mb-3 flex items-center gap-3">
            <Sword size={16} className="text-[var(--gold)]" />
            <div className="rpg-label">Weapon</div>
            <div className="ml-auto font-bold text-sm text-[var(--gold-light)]">{meta.weapon}</div>
          </div>
          <div className="flex flex-col gap-2">
            {meta.abilities.map((a) => (
              <div key={a.key} className="flex items-start gap-2">
                <span className="rpg-key sm mt-[.15rem]">{a.key}</span>
                <div className="leading-tight">
                  <div className="font-bold text-sm text-[var(--gold-light)]">{a.name}</div>
                  <div className="text-xs text-[var(--text-dim)]">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="rpg-title text-base mb-2 flex items-center gap-2"><Trophy size={16} /> Records</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[['Runs', stats.totalRuns], ['Best Wave', stats.highestWave], ['Best CP', stats.highestCP]].map(([l, v]) => (
              <div key={l as string} className="rpg-frame text-center py-1.5">
                <div className="rpg-num text-lg text-[var(--gold-light)]">{(v as number).toLocaleString()}</div>
                <div className="rpg-label !text-[.55rem]">{l}</div>
              </div>
            ))}
          </div>
          <div className="rpg-label mb-1 flex items-center gap-1 hide-short"><Layers size={11} /> By class{stats.bestRunClass ? ` · best: ${stats.bestRunClass}` : ''}</div>
          <div className="flex flex-col gap-1 hide-short">
            {HERO_ORDER.map((h) => (
              <div key={h} className="flex items-center justify-between text-xs rpg-frame px-2 py-1">
                <span className="font-bold" style={{ color: HERO_COLOR[h] }}>{HERO_META[h].title}</span>
                <span className="text-[var(--text-dim)]">{stats.classRuns[h]} runs · wave <b className="text-white">{stats.classHighestWave[h]}</b></span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => openCodex(true)}><BookOpen size={16} /> Codex</Button>
          <Button className="flex-1" onClick={() => openSettings(true)}><Settings size={16} /> Settings</Button>
        </div>
      </motion.div>

      {/* play + credits */}
      <div className="absolute left-0 right-0 bottom-[1rem] flex flex-col items-center gap-3 pointer-events-none">
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .3, type: 'spring', stiffness: 200, damping: 18 }} className="pointer-events-auto">
          <Button variant="primary" size="lg" pulse onClick={startGame}><Play size={22} fill="currentColor" /> Enter the Aether</Button>
        </motion.div>
        <div className="text-[.68rem] text-outline" style={{ color: '#e8d9b0', opacity: .85 }}>3D characters by KayKit (CC0) · Trees by Kenney (CC0)</div>
      </div>
    </div>
  );
};
