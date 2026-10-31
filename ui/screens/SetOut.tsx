// Town gate "Set out" window: pick the run mode. Adventure = the six biomes + the Undying Throne (Ascension level
// selectable once the ending has been seen); Endless Tower = floor after floor, best floor recorded per class.
import React, { useState } from 'react';
import { Swords, Castle } from '../components/GoldIcons';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store';
import { TOWER_STEP } from '../../towerRewards';
import { TowerPage, AscensionPage, HubLock } from './TowerHub';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useGameEvent } from '../hooks/useEvent';
import { HERO_META } from '../lib/heroes';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { PORTAL, TOWER } from '../../engine/townData';
import { CalendarDays } from '../components/GoldIcons';
import { DailyCard, useDailyDay } from './DailyCard';
import { WavesCard } from './WavesCard';
import { UNLOCK_LV } from '../../unlocks';
import { Waves } from '../components/GoldIcons';
import { CoopLobby, lobbyInput } from './CoopLobby';
import { useCoop } from '../../net/coopStore';

type Mode = 'ADVENTURE' | 'TOWER';

export const SetOutWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('ADVENTURE');
  const [remote, setRemote] = useState(false);
  const [floorSel, setFloorSel] = useState<number | null>(null);   // Endless Tower: the floor to start from (null = the class best)
  const [tab, setTab] = useState<'RUN' | 'DAILY' | 'WAVES' | 'ASC'>('RUN');   // the tower hub: Endless Tower | Daily Trial | Endless Waves | Ascension (owner: all at the tower; the portal sets out on E)
  useGameEvent('openSetOut', (e) => {
    // (the gate window always opens now: the Daily Trial tab is a choice even before Ascension unlocks)
    setMode(e.mode); setTab(e.tab ?? 'RUN'); setFloorSel(null); setRemote(!!e.remote); setOpen(true);
  });   // gate = Adventure, the tower building = Endless Tower
  // walking off (e.g. on through the gate to the outskirts) closes it: it only stays while the hero stands at the gate / tower door
  useRaf(() => {
    if (!open || remote) return;
    const p = world.player.pos, at = mode === 'TOWER' ? TOWER.door : PORTAL.front;   // (was the old town gate: the window closed at once at the portal)
    if ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 > 7.5 * 7.5) setOpen(false);
  });
  const { progress, hero, startMode, setAscension, startDaily, startWaves } = useGameStore(useShallow((s) => ({ progress: s.progress, hero: s.hero, startMode: s.startMode, setAscension: s.setAscension, startDaily: s.startDaily, startWaves: s.startWaves })));
  const claimTower = useGameStore((s) => s.claimTowerMilestone);   // (hooks before the early return)
  const day = useDailyDay();
  const level = useGameStore((s) => s.level);
  const coopGuest = useCoop((s) => s.role === 'guest' && s.state === 'connected');   // a co-op guest never sets out: the host does
  if (!open) return null;
  const dailyLocked = level < UNLOCK_LV.DAILY, wavesLocked = level < UNLOCK_LV.WAVES;   // (unlocks.ts)
  const dailyDot = !dailyLocked && progress.daily.claimed !== day;   // today's reward still open
  const isDaily = tab === 'DAILY';
  const isWaves = tab === 'WAVES';
  const isAsc = tab === 'ASC';
  const featLocked = (isDaily && dailyLocked) || (isWaves && wavesLocked);
  const asc = Math.min(progress.ascension, progress.ascensionMax);
  const best = progress.towerBest[hero] ?? 0;
  const towerLocked = progress.endings <= 0;   // the Endless Tower opens after one full adventure (Void Herald defeated)
  const runLocked = tab === 'RUN' && mode === 'TOWER' && towerLocked;
  const claimed = progress.towerClaimed?.[hero] ?? [];
  const startFloor = Math.max(1, Math.min(Math.max(1, best), floorSel ?? best));
  let ready = false;   // a floor prize waits to be claimed (red dot on the Tower tab)
  for (let f = TOWER_STEP; f <= best; f += TOWER_STEP) if (!claimed.includes(f)) { ready = true; break; }
  const go = () => { if (coopGuest && mode === 'ADVENTURE' && tab === 'RUN') return; if (isAsc) { setOpen(false); return; } if (runLocked) return; if ((isDaily && dailyLocked) || (isWaves && wavesLocked)) return; setOpen(false); if (isDaily) startDaily(); else if (isWaves) startWaves(); else startMode(mode, 0, mode === 'TOWER' ? startFloor : 1); };
  const tabs: { id: typeof tab; label: string; icon: React.ReactNode; tid: string; dot?: boolean; lock?: number; hide?: boolean }[] = [
    { id: 'RUN', label: 'Tower', icon: <Castle size={15} />, tid: 'so-tab-run', dot: !towerLocked && ready },
    { id: 'DAILY', label: 'Daily Trial', icon: <CalendarDays size={15} />, tid: 'so-tab-daily', dot: dailyDot, lock: dailyLocked ? UNLOCK_LV.DAILY : undefined },
    { id: 'WAVES', label: 'Endless Waves', icon: <Waves size={15} />, tid: 'so-tab-waves', lock: wavesLocked ? UNLOCK_LV.WAVES : undefined },
    { id: 'ASC', label: 'Ascension', icon: <Swords size={15} />, tid: 'so-tab-asc', hide: progress.ascensionMax <= 0 },
  ];
  const goLabel = coopGuest && mode === 'ADVENTURE' && tab === 'RUN' ? 'Waiting for the host' : featLocked ? 'Locked' : isAsc ? 'Done' : isDaily ? 'Begin the Daily Trial' : isWaves ? 'Enter the arena' : mode === 'TOWER' ? (towerLocked ? 'Sealed' : tab === 'RUN' && startFloor > 1 ? `Enter the Tower · floor ${startFloor}` : 'Enter the Tower') : asc > 0 ? `Set out · Ascension ${asc}` : 'Set out';
  const goBtn = <Button className="w-full" variant="primary" size="lg" pulse={!runLocked && !featLocked && !isAsc} disabled={runLocked || featLocked || (coopGuest && mode === 'ADVENTURE' && tab === 'RUN')} onClick={go} data-testid="so-go">{goLabel}</Button>;
  const onConfirm = () => { if (lobbyInput.submit) lobbyInput.submit(); else go(); };
  if (mode === 'TOWER') {
    // the tower hub: a wide window, tabs as a pill column on the left (a row on top on narrow screens), one page on the right
    return (
      <Modal open={open} title="Tower Hub" icon={<Castle size={22} />} width="min(56rem, calc(100vw - 1.5rem))" z={160} onClose={() => setOpen(false)} onConfirm={onConfirm}>
        <div className="th-split" data-testid="tower-hub">
          <nav className="th-tabs" role="tablist">
            {tabs.filter((t) => !t.hide).map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`th-tab t-${t.id.toLowerCase()} pe ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={t.tid}>
                {tab === t.id && <motion.span layoutId="th-tab-bg" className="th-tab-bg" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                <span className="th-tab-ic">{t.icon}</span>
                <span className="th-tab-tx"><span className="th-tab-lb">{t.label}</span>{t.lock ? <small className="th-tab-lock"><span className="th-long">Unlocks at </span>Lv {t.lock}</small> : null}</span>
                {!t.lock && t.dot ? <i className="th-dot" /> : null}
              </button>
            ))}
          </nav>
          <div className="th-main">
            <div className="th-scroll">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} className="th-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .16 }}>
                  {featLocked && <HubLock testid="so-locked" title={isDaily ? 'Daily Trial' : 'Endless Waves'} text={`Unlocks at level ${isDaily ? UNLOCK_LV.DAILY : UNLOCK_LV.WAVES}. You are level ${level}.`} />}
                  {isDaily && !dailyLocked && <DailyCard />}
                  {isWaves && !wavesLocked && <WavesCard />}
                  {tab === 'RUN' && <TowerPage locked={towerLocked} heroTitle={HERO_META[hero].title} best={best} claimed={claimed} onClaim={claimTower} startFloor={startFloor} onStartFloor={setFloorSel} />}
                  {isAsc && <AscensionPage asc={asc} max={progress.ascensionMax} claimed={progress.ascClaimed ?? []} onSelect={setAscension} />}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="th-foot">{goBtn}</div>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={open} title="Set Out" icon={<Swords size={22} />} width="24rem" z={160} onClose={() => setOpen(false)} onConfirm={onConfirm}>
      <div>
        <div className="so-modes one" data-testid="setout">
          <div className="so-card on" data-testid="so-adventure">
            <Swords size={26} />
            <b>Adventure</b>
            <span>Seven realms, seven guardians, and the Undying Throne at the end of the Void.</span>
            <em>{progress.endings > 0 ? `Ending seen ${progress.endings}x` : 'Ending not yet seen'}</em>
          </div>
          <CoopLobby />
        </div>
        <div className="mt-3">{goBtn}</div>
      </div>
    </Modal>
  );
};
