// Town gate "Set out" window: pick the run mode. Adventure = the six biomes + the Undying Throne (Ascension level
// selectable once the ending has been seen); Endless Tower = floor after floor, best floor recorded per class.
import { milestoneLabel, TOWER_STEP } from '../../towerRewards';
import React, { useState } from 'react';
import { Swords, Castle, ChevronLeft, ChevronRight, Trophy } from '../components/GoldIcons';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useGameEvent } from '../hooks/useEvent';
import { ASCENSIONS, ascRewardText } from '../../ascension';
import { HERO_META } from '../lib/heroes';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { PORTAL, TOWER } from '../../engine/townData';
import { CalendarDays } from '../components/GoldIcons';
import { DailyCard, useDailyDay } from './DailyCard';
import { WavesCard } from './WavesCard';
import { UNLOCK_LV } from '../../unlocks';
import { Waves } from '../components/GoldIcons';

type Mode = 'ADVENTURE' | 'TOWER';

export const SetOutWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('ADVENTURE');
  const [remote, setRemote] = useState(false);
  const [tab, setTab] = useState<'RUN' | 'DAILY' | 'WAVES' | 'ASC'>('RUN');   // the tower hub: Endless Tower | Daily Trial | Endless Waves | Ascension (owner: all at the tower; the portal sets out on E)
  useGameEvent('openSetOut', (e) => {
    // (the gate window always opens now: the Daily Trial tab is a choice even before Ascension unlocks)
    setMode(e.mode); setTab(e.tab ?? 'RUN'); setRemote(!!e.remote); setOpen(true);
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
  // milestones: every reached, unclaimed 10th floor (claimable) + the next three ahead (locked)
  const reachedTop = Math.floor(best / TOWER_STEP) * TOWER_STEP;
  const ms: { floor: number; state: 'claim' | 'locked' }[] = [];
  for (let f = TOWER_STEP; f <= reachedTop; f += TOWER_STEP) if (!claimed.includes(f)) ms.push({ floor: f, state: 'claim' });
  for (let k = 1; k <= 3; k++) ms.push({ floor: reachedTop + k * TOWER_STEP, state: 'locked' });
  const go = () => { if (isAsc) { setOpen(false); return; } if (runLocked) return; if ((isDaily && dailyLocked) || (isWaves && wavesLocked)) return; setOpen(false); if (isDaily) startDaily(); else if (isWaves) startWaves(); else startMode(mode); };
  return (
    <Modal open={open} title={mode === 'TOWER' ? 'Endless Tower' : 'Set Out'} ribbon tone="gold" width={mode === 'TOWER' ? 'min(56rem, calc(100vw - 1.5rem))' : '24rem'} z={160} onClose={() => setOpen(false)} onConfirm={go}>
      {/* (owner) the tower hub is wide: the tabs are a column on the left, the page on the right */}
      <div className={mode === 'TOWER' ? 'so-split' : ''}>
      {mode === 'TOWER' && (
        <div className="so-tabs so-tabs-side" role="tablist">
          <button className={`so-tab pe ${tab === 'RUN' ? 'on' : ''}`} onClick={() => setTab('RUN')} data-testid="so-tab-run"><Castle size={14} /> Tower</button>
          <button className={`so-tab pe ${tab === 'DAILY' ? 'on' : ''}`} onClick={() => setTab('DAILY')} data-testid="so-tab-daily"><CalendarDays size={14} /> Daily Trial{dailyLocked ? <small className="so-lock">Lv {UNLOCK_LV.DAILY}</small> : dailyDot && <i className="dot" />}</button>
          <button className={`so-tab pe ${tab === 'WAVES' ? 'on' : ''}`} onClick={() => setTab('WAVES')} data-testid="so-tab-waves"><Waves size={14} /> Endless Waves{wavesLocked && <small className="so-lock">Lv {UNLOCK_LV.WAVES}</small>}</button>
          {progress.ascensionMax > 0 && <button className={`so-tab pe ${tab === 'ASC' ? 'on' : ''}`} onClick={() => setTab('ASC')} data-testid="so-tab-asc"><Swords size={14} /> Ascension</button>}
        </div>
      )}
      <div className="so-page">
      {((isDaily && dailyLocked) || (isWaves && wavesLocked)) && <div className="so-locked" data-testid="so-locked">
        <b>{isDaily ? 'Daily Trial' : 'Endless Waves'}</b>
        <span>Unlocks at level {isDaily ? UNLOCK_LV.DAILY : UNLOCK_LV.WAVES}. You are level {level}.</span>
      </div>}
      {isDaily && !dailyLocked && <DailyCard />}
      {isWaves && !wavesLocked && <WavesCard />}
      {!isDaily && !isWaves && !isAsc && <div className="so-modes one" data-testid="setout">
        {mode === 'ADVENTURE' && <div className="so-card on" data-testid="so-adventure">
          <Swords size={26} />
          <b>Adventure</b>
          <span>Seven realms, seven guardians, and the Undying Throne at the end of the Void.</span>
          <em>{progress.endings > 0 ? `Ending seen ${progress.endings}x` : 'Ending not yet seen'}</em>
        </div>}
        {mode === 'TOWER' && <div className="so-card on" data-testid="so-tower">
          <Castle size={26} />
          <b>Endless Tower</b>
          <span>Climb floor after floor. Elites every 3rd, a champion every 5th, a boss every 10th floor.</span>
          <em>{towerLocked ? 'Sealed: finish a full adventure (defeat the Void Herald at the end of the Void) to open the tower.' : <><Trophy size={11} /> Best floor ({HERO_META[hero].title}): {best || '-'}</>}</em>
        </div>}
        {mode === 'TOWER' && !towerLocked && (
          <div className="so-ms" data-testid="tower-milestones">
            <div className="rpg-label !text-[.65rem] mb-1">Milestone rewards · every {TOWER_STEP}th floor</div>
            {ms.map((m) => (
              <div key={m.floor} className={`so-ms-row ${m.state}`}>
                <b>F{m.floor}</b>
                <span>{milestoneLabel(m.floor)}</span>
                {m.state === 'claim'
                  ? <button className="so-ms-claim pe" onClick={() => claimTower(m.floor)} data-testid={`tower-claim-${m.floor}`}>Claim</button>
                  : <i>Reach floor {m.floor}</i>}
              </div>
            ))}
          </div>
        )}
      </div>}
      {isAsc && (
        <div className="so-asc" data-testid="so-asc">
          <div className="text-[.72rem] mb-2" style={{ color: 'var(--text-dim)' }}>The Ascension level for your next adventure through the Adventure Portal.</div>
          {progress.ascensionMax === 0 ? (
            <div className="so-asc-lock">Defeat the Void Herald at the end of the Void to unlock <b>Ascension</b>: harder runs with bigger rewards.</div>
          ) : (<>
            <div className="flex items-center justify-between">
              <span className="rpg-label !text-[.7rem]">Ascension</span>
              <span className="flex items-center gap-2">
                <button className="so-step pe" disabled={asc <= 0} onClick={() => setAscension(asc - 1)} aria-label="Lower"><ChevronLeft size={16} /></button>
                <span className="rpg-num text-xl text-[var(--gold-light)] w-8 text-center" data-testid="so-asc-lv">{asc}</span>
                <button className="so-step pe" disabled={asc >= progress.ascensionMax} onClick={() => setAscension(asc + 1)} aria-label="Raise"><ChevronRight size={16} /></button>
                <span className="text-[.65rem]" style={{ color: 'var(--text-dim)' }}>/ {progress.ascensionMax}</span>
              </span>
            </div>
            <ul className="so-asc-list">
              {ASCENSIONS.slice(0, Math.max(1, asc)).map((a) => <li key={a.lv} className={a.lv <= asc ? 'on' : ''}><b>{a.lv}</b> {a.name} <span>- {a.hardship}</span></li>)}
            </ul>
            <div className="so-asc-reward">{asc > 0 ? `Rewards: +${Math.round(asc * 12)}% gold, loot luck and xp` : 'No Ascension: the standard adventure.'}</div>
            <div className="so-asc-reward" data-testid="so-asc-first">{(progress.ascClaimed ?? []).includes(asc) ? `First-clear reward at Ascension ${asc}: claimed.` : `First clear of Ascension ${asc} pays: ${ascRewardText(asc)}.`}</div>
          </>)}
        </div>
      )}
      <Button className="w-full mt-3" variant="primary" size="lg" pulse={!runLocked && !featLocked && !isAsc} disabled={runLocked || featLocked} onClick={go} data-testid="so-go">{featLocked ? 'Locked' : isAsc ? 'Done' : isDaily ? 'Begin the Daily Trial' : isWaves ? 'Enter the arena' : mode === 'TOWER' ? (towerLocked ? 'Sealed' : 'Enter the Tower') : asc > 0 ? `Set out · Ascension ${asc}` : 'Set out'}</Button>
      </div>
      </div>
    </Modal>
  );
};
