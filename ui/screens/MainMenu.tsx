import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, BookOpen, Settings, Trophy, Skull, Layers, ScrollText, Backpack, User, Store, Swords } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DIFFICULTY_MODS } from '../../constants';
import { questDone } from '../../quests';
import type { Difficulty } from '../../storeTypes';
import { Panel } from '../components/Frame';
import { Button } from '../components/Button';
import { HERO_META, HERO_ORDER } from '../lib/heroes';
import { HERO_COLOR } from '../lib/game';
import { HERO_ICON, Currency } from '../hud/TopBars';
import { RankPlate } from '../hud/Rank';
import { useUiStore } from '../uiStore';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

const DIFFS: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];
const DIFF_COLOR: Record<Difficulty, string> = { EASY: '#4ade80', NORMAL: '#e9b949', HARD: '#f08a3a', NIGHTMARE: '#c084fc' };

/** First-load title: the cinematic orbit camera shows the village behind it. */
export const TitleScreen: React.FC = () => {
  const setTitleDone = useUiStore((s) => s.setTitleDone);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') setTitleDone(true); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setTitleDone]);
  return (
    <div className="absolute inset-0 pe title-root" style={{ zIndex: 50 }}>
      <div className="absolute inset-x-0 bottom-0 h-[40%] lobby-fade-b pointer-events-none" />
      <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="absolute left-0 right-0 top-[1.6rem] flex flex-col items-center pointer-events-none">
        <div className="rpg-logo" style={{ fontSize: 'clamp(2.4rem, 5.2vw, 4.6rem)' }}>Aether Survivor</div>
        <div className="rpg-title mt-1 !text-[.95rem] tracking-[.35em]" style={{ color: '#f6e8c8', opacity: .9 }}>You are the village guard</div>
      </motion.div>
      <div className="absolute left-0 right-0 bottom-[2.2rem] flex flex-col items-center gap-3">
        <Button variant="primary" size="lg" pulse onClick={() => setTitleDone(true)} data-testid="enter-village"><Shield size={22} /> Enter the Village</Button>
        <div className="text-[.68rem] text-outline" style={{ color: '#e8d9b0', opacity: .85 }}>3D characters by KayKit (CC0) · Trees by Kenney (CC0)</div>
      </div>
    </div>
  );
};

const RecordsPanel: React.FC = () => {
  const { stats, rank } = useGameStore(useShallow((s) => ({ stats: s.gameStats, rank: s.heroRank })));
  return (
    <Panel className="p-4" data-testid="records">
      <div className="rpg-title text-base mb-2 flex items-center gap-2"><Trophy size={16} /> Records</div>
      <RankPlate className="mb-3" />
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[['Rank', rank], ['Runs', stats.totalRuns], ['Best Wave', stats.highestWave], ['Best CP', stats.highestCP]].map(([l, v]) => (
          <div key={l as string} className="rpg-frame text-center py-1.5">
            <div className="rpg-num text-lg text-[var(--gold-light)]">{(v as number).toLocaleString()}</div>
            <div className="rpg-label !text-[.5rem]">{l}</div>
          </div>
        ))}
      </div>
      <div className="rpg-label mb-1 flex items-center gap-1"><Layers size={11} /> By class{stats.bestRunClass ? ` · best: ${stats.bestRunClass}` : ''}</div>
      <div className="flex flex-col gap-1">
        {HERO_ORDER.map((h) => (
          <div key={h} className="flex items-center justify-between text-xs rpg-frame px-2 py-1">
            <span className="font-bold" style={{ color: HERO_COLOR[h] }}>{HERO_META[h].title}</span>
            <span className="text-[var(--text-dim)]">{stats.classRuns[h]} runs · wave <b className="text-white">{stats.classHighestWave[h]}</b></span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

const VBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; badge?: boolean; active?: boolean; id?: string }> = ({ icon, label, onClick, badge, active, id }) => (
  <div className="relative">
    <button className={`sqbtn pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} data-testid={id} {...tip(<SimpleTip title={label} />)}>{icon}</button>
    {badge && <span className="slot-plus" style={{ left: 'auto', right: '-.3rem', top: '-.35rem', zIndex: 8 }}>!</span>}
  </div>
);

/** The peaceful village HUD: rank, hero + difficulty, shortcuts and the big DEFEND button. */
export const VillageHUD: React.FC = () => {
  const { hero, difficulty, selectHero, setDifficulty, startGame, openShop, toggleInv, toggleChar, panel, claimable } = useGameStore(useShallow((s) => ({
    hero: s.hero, difficulty: s.difficulty, selectHero: s.selectHero, setDifficulty: s.setDifficulty, startGame: s.startGame,
    openShop: s.openSpecificShop, toggleInv: s.toggleInventory, toggleChar: s.toggleCharacterSheet,
    panel: s.isInventoryOpen || s.isShopOpen || s.isCharacterSheetOpen, claimable: s.quests.some(questDone),
  })));
  const openCodex = useUiStore((s) => s.openCodex);
  const openSettings = useUiStore((s) => s.openSettings);
  const recordsOpen = useUiStore((s) => s.recordsOpen);
  const setRecordsOpen = useUiStore((s) => s.setRecordsOpen);
  const modalOpen = useUiStore((s) => s.codexOpen || s.settingsOpen || !!s.confirm);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && !modalOpen && !panel) startGame(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [startGame, modalOpen, panel]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }} data-testid="village-hud">
      {/* top-left: rank + hero + difficulty */}
      {!panel && (
        <div className="absolute flex flex-col gap-2 pe hud-tl" style={{ left: '1.2rem', top: '1rem', width: '16.5rem' }}>
          <Panel slim className="p-2.5"><RankPlate /></Panel>
          <Panel slim className="p-2.5">
            <div className="rpg-label mb-1.5 flex items-center gap-1.5"><Swords size={12} /> Hero</div>
            <div className="flex gap-2">
              {HERO_ORDER.map((h) => {
                const Icon = HERO_ICON[h]; const sel = hero === h;
                return (
                  <button key={h} onClick={() => selectHero(h)} className="flex-1 flex flex-col items-center gap-1 pe" aria-label={HERO_META[h].title} data-testid={`hero-${h}`}
                    style={{ filter: sel ? 'none' : 'brightness(.7) saturate(.8)' }}>
                    <div className="rpg-medallion" style={{ ['--mc' as any]: HERO_COLOR[h], width: '3rem', height: '3rem', boxShadow: sel ? '0 0 14px rgba(233,185,73,.9)' : undefined }}><Icon size={22} /></div>
                    <span className="rpg-label !text-[.55rem]" style={{ color: sel ? 'var(--gold-light)' : undefined }}>{HERO_META[h].title}</span>
                  </button>
                );
              })}
            </div>
            <div className="rpg-label mt-2 mb-1 flex items-center gap-1.5"><Skull size={12} /> Difficulty</div>
            <div className="grid grid-cols-4 gap-1">
              {DIFFS.map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} className={`rpg-subtab pe ${difficulty === d ? 'is-active' : ''}`}
                  style={difficulty === d ? { background: `linear-gradient(${DIFF_COLOR[d]}, color-mix(in srgb, ${DIFF_COLOR[d]} 55%, #000))`, color: '#1a0e05', padding: '.3rem .1rem', fontSize: '.55rem', textAlign: 'center' } : { color: DIFF_COLOR[d], padding: '.3rem .1rem', fontSize: '.55rem', textAlign: 'center' }}>
                  {DIFFICULTY_MODS[d].label}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* top-right: currency + shortcuts + records */}
      {!panel && (
        <div className="absolute flex flex-col items-end gap-2.5 pe hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
          <Currency />
          <div className="flex gap-[.6rem]">
            <VBtn icon={<User size={24} />} label="Hero (C)" onClick={toggleChar} />
            <VBtn icon={<Backpack size={24} />} label="Bag (I)" onClick={toggleInv} />
            <VBtn icon={<Trophy size={24} />} label="Records" onClick={() => setRecordsOpen(!recordsOpen)} active={recordsOpen} id="open-records" />
            <VBtn icon={<BookOpen size={24} />} label="Codex" onClick={() => openCodex(true)} />
            <VBtn icon={<Settings size={24} />} label="Settings" onClick={() => openSettings(true)} id="open-settings" />
          </div>
          {recordsOpen && <div style={{ width: '22rem' }}><RecordsPanel /></div>}
        </div>
      )}

      {/* bottom: defend button + hints */}
      {!panel && (
        <div className="absolute left-0 right-0 bottom-[1.4rem] flex flex-col items-center gap-2 vh-bottom">
          <div className="pe">
            <Button variant="primary" size="lg" pulse onClick={startGame} data-testid="defend"><Shield size={22} fill="currentColor" /> DEFEND THE VILLAGE</Button>
          </div>
          <div className="text-[.72rem] text-outline" style={{ color: '#f6e8c8' }}>WASD walk · E or click a shop / the quest board · F harvest crystals &amp; ore · Enter to defend</div>
        </div>
      )}
    </div>
  );
};
