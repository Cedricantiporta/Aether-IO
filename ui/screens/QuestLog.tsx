// Quest log (menu button): the main story step, NPC quests and Quest Board quests with objectives, progress and rewards.
import React from 'react';
import { ScrollText, Crown, BookOpen, Coins, Gem, Package, Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { STORY } from '../../story';
import { NPC_QUESTS, npcQuestProgress, npcQuestReady, npcQuestStatus, type NpcReward } from '../../npcQuests';
import { activeQuests, questDone, questTitle, type QuestReward } from '../../quests';
import { GOLD_SCALE, ITEMS_POOL, PETS_POOL } from '../../constants';
import { LOOT_BY_ID } from '../../loot';

const itemName = (id: string) => ITEMS_POOL.find((i) => i.id === id)?.name ?? PETS_POOL.find((i) => i.id === id)?.name ?? LOOT_BY_ID[id]?.name ?? id;

const Rewards: React.FC<{ r: NpcReward | QuestReward; scale?: boolean }> = ({ r, scale }) => {
  const g = (r as NpcReward).gold, gems = r.gems, items = (r as NpcReward).items, cores = (r as QuestReward).cores, potions = (r as QuestReward).potions;
  return (
    <div className="ql-rew">
      {!!g && <span><Coins size={12} /> {(scale ? g * GOLD_SCALE : g).toLocaleString()}</span>}
      {!!gems && <span><Gem size={12} /> {gems}</span>}
      {!!cores && <span><Package size={12} /> {cores} Upgrade Core{cores > 1 ? 's' : ''}</span>}
      {!!potions && <span><Package size={12} /> {potions} potions</span>}
      {(items ?? []).map((it) => <span key={it.id}><Package size={12} /> {(it.qty ?? 1) > 1 ? `${it.qty}x ` : ''}{itemName(it.id)}</span>)}
    </div>
  );
};

export const QuestLog: React.FC = () => {
  const open = useUiStore((s) => s.questLogOpen), setOpen = useUiStore((s) => s.openQuestLog);
  const { story, nq, inv, rank, quests } = useGameStore(useShallow((s) => ({ story: s.story, nq: s.npcQuests, inv: s.inventory, rank: s.heroRank, quests: s.quests })));
  const main = STORY[story.step];
  const npcActive = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, rank) === 'ACTIVE');
  const npcOpen = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, rank) === 'AVAILABLE');
  const board = activeQuests(quests);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Quests" icon={<ScrollText size={20} />} width="40rem" z={250}>
      <div className="ql rpg-scroll" data-testid="quest-log">
        <div className="ql-h"><Crown size={14} /> Main story</div>
        {main ? (
          <div className="ql-card main">
            <b>{main.title}</b><span>{main.line}{main.kill ? ` (${Math.min(story.p, main.kill.count)} / ${main.kill.count})` : ''}</span>
            <Rewards r={main.reward} scale />
          </div>
        ) : <div className="ql-card main"><b>The story is complete</b><span>The Font shines again. Ascension awaits at the gate.</span></div>}
        {story.step > 0 && <div className="ql-done">{STORY.slice(0, story.step).map((s) => <span key={s.id}><Check size={11} /> {s.title}</span>)}</div>}

        <div className="ql-h"><BookOpen size={14} /> People of Aether</div>
        {npcActive.length === 0 && <div className="ql-none">No active requests. Look for a ! above someone's head.</div>}
        {npcActive.map((d) => {
          const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv);
          return (
            <div key={d.id} className={`ql-card npc ${ready ? 'ready' : ''}`}>
              <b>{d.title} <em>· {d.giver}</em></b><span>{ready ? `Done! Return to ${d.turnIn ?? d.giver}.` : `${d.summary}${d.objective.count > 1 ? ` (${n} / ${d.objective.count})` : ''}`}</span>
              <Rewards r={d.reward} scale />
            </div>
          );
        })}
        {npcOpen.length > 0 && <div className="ql-none">Offered around town: {npcOpen.map((d) => `${d.title} (${d.giver})`).join(', ')}</div>}

        <div className="ql-h"><ScrollText size={14} /> Quest Board (optional)</div>
        {board.length === 0 && <div className="ql-none">No bounties taken. The Quest Board in the plaza has new ones every day.</div>}
        {board.map((q) => (
          <div key={q.id} className={`ql-card board ${questDone(q) ? 'ready' : ''}`}>
            <b>{questTitle(q)}</b><span>{questDone(q) ? 'Done! Claim it at the Quest Board.' : `${Math.min(q.progress, q.target)} / ${q.target}`}</span>
            <Rewards r={q.reward} />
          </div>
        ))}
      </div>
    </Modal>
  );
};
