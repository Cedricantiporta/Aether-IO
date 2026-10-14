// Town gate "Set out" window: pick the run mode. Adventure = the six biomes + the Undying Throne (Ascension level
// selectable once the ending has been seen); Endless Tower = floor after floor, best floor recorded per class.
import React, { useState } from 'react';
import { Swords, Castle, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useGameEvent } from '../hooks/useEvent';
import { ASCENSIONS } from '../../ascension';
import { HERO_META } from '../lib/heroes';
import { useRaf } from '../hooks/useRaf';
import { world } from '../../engine/world';
import { GATE, TOWER } from '../../engine/townData';

type Mode = 'ADVENTURE' | 'TOWER';

export const SetOutWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('ADVENTURE');
  useGameEvent('openSetOut', (e) => { setMode(e.mode); setOpen(true); });   // gate = Adventure, the tower building = Endless Tower
  // walking off (e.g. on through the gate to the outskirts) closes it: it only stays while the hero stands at the gate / tower door
  useRaf(() => {
    if (!open) return;
    const p = world.player.pos, at = mode === 'TOWER' ? TOWER.door : { x: GATE.x, z: GATE.z - 1 };
    if ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 > 7.5 * 7.5) setOpen(false);
  });
  const { progress, hero, startMode, setAscension } = useGameStore(useShallow((s) => ({ progress: s.progress, hero: s.hero, startMode: s.startMode, setAscension: s.setAscension })));
  if (!open) return null;
  const asc = Math.min(progress.ascension, progress.ascensionMax);
  const best = progress.towerBest[hero] ?? 0;
  const towerLocked = progress.endings <= 0;   // the Endless Tower opens after one full adventure (Malakar defeated)
  const go = () => { if (mode === 'TOWER' && towerLocked) return; setOpen(false); startMode(mode); };
  return (
    <Modal open={open} title={mode === 'TOWER' ? 'Endless Tower' : 'Set Out'} ribbon tone="gold" width="24rem" z={160} onClose={() => setOpen(false)} onConfirm={go}>
      <div className="so-modes one" data-testid="setout">
        {mode === 'ADVENTURE' && <div className="so-card on" data-testid="so-adventure">
          <Swords size={26} />
          <b>Adventure</b>
          <span>Six biomes, six guardians, and the Undying Throne at the end of the Void.</span>
          <em>{progress.endings > 0 ? `Ending seen ${progress.endings}x` : 'Ending not yet seen'}</em>
        </div>}
        {mode === 'TOWER' && <div className="so-card on" data-testid="so-tower">
          <Castle size={26} />
          <b>Endless Tower</b>
          <span>Climb floor after floor. Elites every 3rd, a champion every 5th, a boss every 10th floor.</span>
          <em>{towerLocked ? 'Sealed: finish a full adventure (defeat Malakar at the end of the Void) to open the tower.' : <><Trophy size={11} /> Best floor ({HERO_META[hero].title}): {best || '-'}</>}</em>
        </div>}
      </div>
      {mode === 'ADVENTURE' && (
        <div className="so-asc" data-testid="so-asc">
          {progress.ascensionMax === 0 ? (
            <div className="so-asc-lock">Defeat Malakar at the end of the Void to unlock <b>Ascension</b>: harder runs with bigger rewards.</div>
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
          </>)}
        </div>
      )}
      <Button className="w-full mt-3" variant="primary" size="lg" pulse={!(mode === 'TOWER' && towerLocked)} disabled={mode === 'TOWER' && towerLocked} onClick={go} data-testid="so-go">{mode === 'TOWER' ? (towerLocked ? 'Sealed' : 'Enter the Tower') : asc > 0 ? `Set out · Ascension ${asc}` : 'Set out'}</Button>
    </Modal>
  );
};
