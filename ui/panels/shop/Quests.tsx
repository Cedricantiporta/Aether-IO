import React from 'react';
import { Coins, Gem, FlaskConical, Hexagon, Sword } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { questDone, questTitle, questFlavor, type Quest } from '../../../quests';
import { Button } from '../../components/Button';

const Chip: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <span className="rpg-badge !text-[.6rem] inline-flex items-center gap-1">{icon}{text}</span>
);

const RewardChips: React.FC<{ q: Quest }> = ({ q }) => {
  const r = q.reward;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {r.gold ? <Chip icon={<Coins size={11} />} text={`${r.gold} gold`} /> : null}
      {r.gems ? <Chip icon={<Gem size={11} />} text={`${r.gems} gems`} /> : null}
      {r.cores ? <Chip icon={<Hexagon size={11} />} text={`${r.cores} cores`} /> : null}
      {r.potions ? <Chip icon={<FlaskConical size={11} />} text={`${r.potions} HP + ${r.potions} MP potions`} /> : null}
      {r.item ? <Chip icon={<Sword size={11} />} text={`${r.item.charAt(0) + r.item.slice(1).toLowerCase()} gear`} /> : null}
    </div>
  );
};

export const QuestsTab: React.FC = () => {
  const { quests, claim } = useGameStore(useShallow((s) => ({ quests: s.quests, claim: s.claimQuest })));
  return (
    <div className="flex flex-col gap-3" data-testid="quests-tab">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Guard, the village needs you. Complete these tasks during your defense runs and come back for your reward.
        Progress is saved between runs.
      </div>
      {quests.map((q) => {
        const done = questDone(q);
        return (
          <div key={q.id} className="rpg-frame p-3 flex flex-col gap-2" data-testid="quest" data-done={done ? '1' : '0'}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="rpg-title text-base">{questTitle(q)}</span>
              <span className="rpg-num text-[var(--gold-light)]" data-testid="quest-progress">{Math.min(q.progress, q.target).toLocaleString()} / {q.target.toLocaleString()}</span>
            </div>
            <div className="text-xs text-[var(--text-dim)]">{questFlavor(q)}</div>
            <div className="rpg-bar thin" style={{ ['--bc' as any]: done ? '#4ade80' : '#e9b949', ['--fill' as any]: Math.min(1, q.progress / q.target) }}><div className="fill" /></div>
            <div className="flex items-center justify-between gap-2">
              <RewardChips q={q} />
              <Button size="sm" variant={done ? 'green' : 'default'} disabled={!done} onClick={() => claim(q.id)} data-testid="claim">{done ? 'Claim' : 'In progress'}</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
