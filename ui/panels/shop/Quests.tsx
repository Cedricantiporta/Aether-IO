import React, { useEffect } from 'react';
import { Coins, Gem, FlaskConical, Hexagon, Sword } from 'lucide-react';
import { useGameStore } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { questDone, questTitle, questFlavor, activeQuests, questOffers, QUEST_MAX_ACTIVE, type Quest } from '../../../quests';
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

const QuestCard: React.FC<{ q: Quest; full: boolean }> = ({ q, full }) => {
  const { claim, accept, abandon } = useGameStore(useShallow((s) => ({ claim: s.claimQuest, accept: s.acceptQuest, abandon: s.abandonQuest })));
  const done = questDone(q);
  return (
    <div className="rpg-frame p-3 flex flex-col gap-2" data-testid={q.accepted ? 'quest' : 'quest-offer'} data-done={done ? '1' : '0'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="rpg-title text-base">{questTitle(q)}</span>
        {q.accepted && <span className="rpg-num text-[var(--gold-light)]" data-testid="quest-progress">{Math.min(q.progress, q.target).toLocaleString()} / {q.target.toLocaleString()}</span>}
      </div>
      <div className="text-xs text-[var(--text-dim)]">{questFlavor(q)}</div>
      {q.accepted && <div className="rpg-bar thin" style={{ ['--bc' as any]: done ? '#4ade80' : '#e9b949', ['--fill' as any]: Math.min(1, q.progress / q.target) }}><div className="fill" /></div>}
      <div className="flex items-center justify-between gap-2">
        <RewardChips q={q} />
        {q.accepted ? (
          <div className="flex gap-1.5">
            {!done && <Button size="sm" variant="default" onClick={() => abandon(q.id)} data-testid="abandon">Abandon</Button>}
            <Button size="sm" variant={done ? 'green' : 'default'} disabled={!done} onClick={() => claim(q.id)} data-testid="claim">{done ? 'Claim' : 'In progress'}</Button>
          </div>
        ) : (
          <Button size="sm" variant="primary" disabled={full} onClick={() => accept(q.id)} data-testid="accept">{full ? 'Slots full' : 'Accept'}</Button>
        )}
      </div>
    </div>
  );
};

export const QuestsTab: React.FC = () => {
  const { quests, refresh } = useGameStore(useShallow((s) => ({ quests: s.quests, refresh: s.refreshQuestBoard })));
  useEffect(() => { refresh(); }, [refresh]);
  const active = activeQuests(quests), offers = questOffers(quests);
  const full = active.length >= QUEST_MAX_ACTIVE;
  return (
    <div className="flex flex-col gap-3" data-testid="quests-tab">
      <div className="rpg-parchment p-3 text-[.8rem] leading-snug">
        Pick up to {QUEST_MAX_ACTIVE} quests from the board. Only accepted quests make progress during your runs.
        New offers are posted every day; abandoning a quest frees its slot.
      </div>
      <div className="rpg-title text-sm">Active quests ({active.length} / {QUEST_MAX_ACTIVE})</div>
      {active.length === 0 && <div className="text-xs text-[var(--text-dim)]">No quests taken yet. Accept one from the board below.</div>}
      {active.map((q) => <QuestCard key={q.id} q={q} full={full} />)}
      <div className="rpg-title text-sm mt-1">Board — today's offers</div>
      {offers.map((q) => <QuestCard key={q.id} q={q} full={full} />)}
    </div>
  );
};
