import { CaveHud } from '../hud/CaveHud';
import { TitleLogo } from '../components/TitleLogo';
import { LanternPanel } from '../panels/LanternPanel';
import { HelmGlyph, BagGlyph, TrophyGlyph, BookGlyph, GearGlyph, SkillGlyph, GoalGlyph } from '../components/MenuGlyphs';
import { useBagAlert, useCodexAlert, useSkillAlert, useGoalsAlert } from '../lib/alerts';
import { ActionBar } from '../hud/ActionBar';
import { QuestTracker } from '../hud/QuestTracker';
import { TownProfile } from '../hud/TownProfile';
import { SkillRow, ExpStrip } from '../hud/Vitals';
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, BookOpen, Settings, Trophy, Skull, Layers, ScrollText, Backpack, User, Store, Swords } from '../components/GoldIcons';
import { device } from '../../engine/device';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DIFFICULTY_MODS } from '../../constants';
import { questDone } from '../../quests';
import type { Difficulty } from '../../storeTypes';
import { Panel } from '../components/Frame';
import { Button } from '../components/Button';
import { HERO_META, HERO_ORDER } from '../lib/heroes';
import { ClassEmblem } from './CharacterSelect';
import { HERO_COLOR } from '../lib/game';
import { HERO_ICON, Currency, MenuButtons, PlayerPlate } from '../hud/TopBars';
import { Minimap } from '../hud/Minimap';
import { VitalBars } from '../hud/Vitals';
import { RankPlate } from '../hud/Rank';
import { useUiStore } from '../uiStore';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';

const DIFFS: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];
const DIFF_COLOR: Record<Difficulty, string> = { EASY: '#4ade80', NORMAL: '#e9b949', HARD: '#f08a3a', NIGHTMARE: '#c084fc' };

/** First-load title: the cinematic orbit camera shows the village behind it. */
export const TitleScreen: React.FC = () => {
  const setCharSelect = useUiStore((s) => s.setCharSelect);
  const setTitleDone = (_: boolean) => setCharSelect(true);   // title -> class selection -> village
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') setTitleDone(true); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setCharSelect]);
  return (
    <div className="absolute inset-0 pe title-root" style={{ zIndex: 50 }}>
      <div className="absolute inset-x-0 bottom-0 h-[40%] lobby-fade-b pointer-events-none" />
      <div className="absolute inset-0 title-shade pointer-events-none" />
      <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="absolute left-0 right-0 top-[1.6rem] flex flex-col items-center pointer-events-none">
        <TitleLogo sub="Guardians of the Font" />
      </motion.div>
      <div className="absolute left-0 right-0 bottom-[2.2rem] flex flex-col items-center gap-3">
        <Button variant="primary" size="lg" pulse onClick={() => setTitleDone(true)} data-testid="enter-village"><Shield size={22} /> Enter</Button>
        <div className="text-[.68rem] text-outline" style={{ color: '#e8d9b0', opacity: .85 }}>3D characters by KayKit (CC0) · Trees by Kenney (CC0)</div>
      </div>
    </div>
  );
};

export const RecordsPanel: React.FC = () => {
  const { stats, rank } = useGameStore(useShallow((s) => ({ stats: s.gameStats, rank: s.heroRank })));
  return (
    <Panel className="p-4" data-testid="records">
      <div className="rpg-title text-base mb-2 flex items-center gap-2"><Trophy size={16} /> Records</div>
      <RankPlate className="mb-3" />
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[['Level', rank], ['Runs', stats.totalRuns], ['Best Wave', stats.highestWave], ['Best CP', stats.highestCP]].map(([l, v]) => (
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
    {badge && <i className="red-dot" />}
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
  const openGoals = useUiStore((s) => s.openGoals);
  const bagDot = useBagAlert(), codexDot = useCodexAlert(), skillDot = useSkillAlert(), goalDot = useGoalsAlert();
  const setCharSelect = useUiStore((s) => s.setCharSelect);
  const openSettings = useUiStore((s) => s.openSettings);
  const recordsOpen = useUiStore((s) => s.recordsOpen);
  const setRecordsOpen = useUiStore((s) => s.setRecordsOpen);
  const modalOpen = useUiStore((s) => s.codexOpen || s.goalsOpen || s.settingsOpen || !!s.confirm);
  const showMap = useGameStore((s) => s.settings.showMinimap !== false);


  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }} data-testid="village-hud">
      {/* same HUD as in runs: vitals + plate + quest tracker (left), gold + gems (centre), menu + minimap (right) */}
      {!panel && (
        <div className="absolute hud-tl flex flex-col gap-2 pe" style={{ left: '1.2rem', top: '1rem' }}>
          <VitalBars /><PlayerPlate />
          <div className="qt-left"><QuestTracker /></div>
        </div>
      )}
      {!panel && <div className="absolute left-0 right-0 flex justify-center hud-tc" style={{ top: '.8rem' }}><div className="pe hud-cur"><Currency /></div></div>}
      {!panel && (
        <div className="absolute flex flex-col items-end gap-3 pe hud-tr" style={{ right: '1.2rem', top: '1rem' }}>
          <MenuButtons />
          {showMap && <div className="hud-mm hud-mm-top"><Minimap /></div>}
        </div>
      )}

      {/* bottom: skill bar (skills + dash work in town) + hint (runs start at the town gate) */}
      {!panel && !device.touch && (
        <div className="absolute left-0 right-0 flex flex-col items-center vh-bottom hud-bottom" style={{ bottom: '1.5rem' }}>
          <SkillRow><ActionBar /></SkillRow>
        </div>
      )}
      {!panel && <ExpStrip />}
      {/* crystal cave: floor / lantern meter / haul at risk + Grit's lantern bench */}
      <CaveHud />
      <LanternPanel />
    </div>
  );
};
