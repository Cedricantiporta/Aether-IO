import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, BookOpen, Settings, Trophy, Backpack, User } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DIFFICULTY_MODS } from '../../constants';
import type { Difficulty } from '../../storeTypes';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { HERO_META, HERO_ORDER } from '../lib/heroes';
import { HERO_COLOR } from '../lib/game';
import { HERO_ICON, Currency } from '../hud/TopBars';
import { RankPlate } from '../hud/Rank';
import { useUiStore } from '../uiStore';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { device } from '../../engine/device';

const DIFFS: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'NIGHTMARE'];
const DIFF_COLOR: Record<Difficulty, string> = { EASY: '#6fe3a0', NORMAL: '#f2a93b', HARD: '#f08a5a', NIGHTMARE: '#c3a0f6' };

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
      <div className="absolute inset-x-0 top-0 h-[35%] lobby-fade-t pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] lobby-fade-b pointer-events-none" />
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 20 }}
        className="absolute left-0 right-0 flex flex-col items-center pointer-events-none px-4 text-center" style={{ top: 'calc(var(--sat) + 8vh)' }}>
        <div className="wordmark">Aether Survivor</div>
        <div className="mt-2 text-sm font-semibold" style={{ color: 'rgba(243,241,234,.85)' }}>You are the village guard</div>
      </motion.div>
      <div className="absolute left-0 right-0 flex flex-col items-center gap-3 px-4" style={{ bottom: 'calc(var(--sab) + 6vh)' }}>
        <Button variant="primary" size="lg" pulse onClick={() => setTitleDone(true)} data-testid="enter-village"><Shield size={20} /> Enter the Village</Button>
        <div className="text-xs text-center" style={{ color: 'rgba(243,241,234,.6)' }}>3D characters by KayKit (CC0) · Trees by Kenney (CC0)</div>
      </div>
    </div>
  );
};

const RecordsPanel: React.FC = () => {
  const { stats, rank } = useGameStore(useShallow((s) => ({ stats: s.gameStats, rank: s.heroRank })));
  return (
    <div data-testid="records">
      <RankPlate className="mb-3" />
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[['Rank', rank], ['Runs', stats.totalRuns], ['Best wave', stats.highestWave], ['Best CP', stats.highestCP]].map(([l, v]) => (
          <div key={l as string} className="go-tile">
            <div className="v">{(v as number).toLocaleString()}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>
      <div className="rpg-label mb-1.5">By class{stats.bestRunClass ? ` · best: ${stats.bestRunClass}` : ''}</div>
      <div className="flex flex-col gap-1.5">
        {HERO_ORDER.map((h) => (
          <div key={h} className="flex items-center justify-between text-sm rpg-frame px-3 py-2">
            <span className="font-bold">{HERO_META[h].title}</span>
            <span className="text-[var(--fg-2)]">{stats.classRuns[h]} runs · wave <b className="text-[var(--fg)]">{stats.classHighestWave[h]}</b></span>
          </div>
        ))}
      </div>
    </div>
  );
};

const VBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; badge?: boolean; active?: boolean; id?: string }> = ({ icon, label, onClick, badge, active, id }) => (
  <button className={`iconbtn pe ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label} data-testid={id} {...tip(<SimpleTip title={label} />)}>
    {icon}{badge && <span className="dot" />}
  </button>
);

/** The peaceful village HUD: hero + difficulty select top-left, shortcuts top-right and the big DEFEND button. */
export const VillageHUD: React.FC = () => {
  const { hero, difficulty, selectHero, setDifficulty, startGame, toggleInv, toggleChar, panel } = useGameStore(useShallow((s) => ({
    hero: s.hero, difficulty: s.difficulty, selectHero: s.selectHero, setDifficulty: s.setDifficulty, startGame: s.startGame,
    toggleInv: s.toggleInventory, toggleChar: s.toggleCharacterSheet,
    panel: s.isInventoryOpen || s.isShopOpen || s.isCharacterSheetOpen,
  })));
  const openCodex = useUiStore((s) => s.openCodex);
  const openSettings = useUiStore((s) => s.openSettings);
  const recordsOpen = useUiStore((s) => s.recordsOpen);
  const setRecordsOpen = useUiStore((s) => s.setRecordsOpen);
  const modalOpen = useUiStore((s) => s.codexOpen || s.settingsOpen || !!s.confirm || s.recordsOpen);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && !modalOpen && !panel) startGame(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [startGame, modalOpen, panel]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }} data-testid="village-hud">
      {!panel && (
        <div className="hud-tl pe" style={{ width: '16rem' }}>
          <div className="glass p-3 flex flex-col gap-3">
            <RankPlate />
            <div className="flex justify-between">
              {HERO_ORDER.map((h) => {
                const Icon = HERO_ICON[h]; const sel = hero === h;
                return (
                  <button key={h} onClick={() => selectHero(h)} className={`hero-chip pe ${sel ? 'is-active' : ''}`} aria-label={HERO_META[h].title} data-testid={`hero-${h}`}>
                    <span className="rpg-medallion" style={{ ['--mc' as any]: HERO_COLOR[h] }}><Icon size={20} /></span>
                    <span>{HERO_META[h].title}</span>
                  </button>
                );
              })}
            </div>
            <div className="seg w-full" role="group" aria-label="Difficulty">
              {DIFFS.map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 ${difficulty === d ? 'is-active' : ''}`} style={{ ['--dc' as any]: DIFF_COLOR[d], padding: '0 4px', color: difficulty === d ? undefined : DIFF_COLOR[d] }}>
                  {DIFFICULTY_MODS[d].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!panel && (
        <div className="hud-tr pe" style={{ maxWidth: 'calc(100vw - 17rem - var(--sal) - var(--sar))' }}>
          <Currency gems />
          <div className="flex gap-2 flex-wrap justify-end">
            <VBtn icon={<User size={22} />} label="Hero (C)" onClick={toggleChar} />
            <VBtn icon={<Backpack size={22} />} label="Bag (I)" onClick={toggleInv} />
            <VBtn icon={<Trophy size={22} />} label="Records" onClick={() => setRecordsOpen(!recordsOpen)} active={recordsOpen} id="open-records" />
            <VBtn icon={<BookOpen size={22} />} label="Codex" onClick={() => openCodex(true)} />
            <VBtn icon={<Settings size={22} />} label="Settings" onClick={() => openSettings(true)} id="open-settings" />
          </div>
        </div>
      )}

      {!panel && (
        <div className="village-defend">
          <div className="pe">
            <Button variant="primary" size="lg" pulse onClick={startGame} data-testid="defend"><Shield size={20} fill="currentColor" /> Defend the village</Button>
          </div>
          {!device.touch && <div className="text-xs text-outline" style={{ color: 'rgba(243,241,234,.8)' }}>WASD walk · E talk · hold E to harvest · Enter to defend</div>}
        </div>
      )}

      <Modal open={recordsOpen} onClose={() => setRecordsOpen(false)} title="Records" icon={<Trophy size={22} />} width="28rem" z={220}>
        <RecordsPanel />
      </Modal>
    </div>
  );
};
