// Quest log (menu button): the main story step, NPC quests and Quest Board quests with objectives, progress and rewards.
import React, { useState } from 'react';
import { ScrollText, Crown, BookOpen, Coins, Gem, Package, Check, ChevronDown } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { stepCount, STORY } from '../../story';
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

/** Collapsible section (quest category) / row (one quest: title + short status, expands to details and rewards). */
const Section: React.FC<{ icon: React.ReactNode; title: string; count?: number; defaultOpen?: boolean; tone?: string; children: React.ReactNode }> = ({ icon, title, count, defaultOpen = true, tone, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ql-sec ${open ? 'open' : ''}`} data-tone={tone}>
      <button className="ql-h ql-toggle pe" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {icon} {title}{count !== undefined && <span className="ql-count">{count}</span>}
        <ChevronDown size={14} className="ql-chev" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <div className="ql-body">{children}</div>}
    </div>
  );
};
const Row: React.FC<{ cls: string; title: React.ReactNode; status: string; defaultOpen?: boolean; children?: React.ReactNode }> = ({ cls, title, status, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ql-card ${cls} ${open ? 'open' : ''}`}>
      <button className="ql-row pe" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <b>{title}</b><span className="ql-st">{status}</span><ChevronDown size={13} className="ql-chev" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && <div className="ql-det">{children}</div>}
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
  const prog = main && stepCount(main) > 1 ? `${Math.min(story.p, stepCount(main))} / ${stepCount(main)}` : '';
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Quests" icon={<ScrollText size={20} />} width="40rem" z={250}>
      <div className="ql rpg-scroll" data-testid="quest-log">
        <Section icon={<Crown size={14} />} title="Main story" tone="main">
          {main ? (
            <Row cls="main" title={main.title} status={prog || 'In progress'} defaultOpen>
              <span>{main.line}{prog ? ` (${prog})` : ''}</span>
              <Rewards r={main.reward} scale />
            </Row>
          ) : <div className="ql-card main"><b>The story is complete</b><span>The Font shines again. Ascension awaits at the gate.</span></div>}
          {story.step > 0 && (
            <Section icon={<Check size={13} />} title="Completed" count={story.step} defaultOpen={false}>
              {STORY.slice(0, story.step).reverse().map((s) => (
                <Row key={s.id} cls="done" title={s.title} status="Done"><span>{s.line}</span><Rewards r={s.reward} scale /></Row>
              ))}
            </Section>
          )}
        </Section>

        <Section icon={<BookOpen size={14} />} title="People of Aether" count={npcActive.length} tone="npc">
          {npcActive.length === 0 && <div className="ql-none">No active requests. Look for a blue ! above someone's head.</div>}
          {npcActive.map((d) => {
            const ready = npcQuestReady(d, nq, inv), n = npcQuestProgress(d, nq, inv);
            return (
              <Row key={d.id} cls={`npc ${ready ? 'ready' : ''}`} title={<>{d.title} <em>· {d.giver}</em></>} status={ready ? 'Ready' : d.objective.count > 1 ? `${n} / ${d.objective.count}` : 'Active'}>
                <span>{ready ? `Done! Return to ${d.turnIn ?? d.giver}.` : d.summary}</span>
                <Rewards r={d.reward} scale />
              </Row>
            );
          })}
          {npcOpen.length > 0 && (
            <Section icon={<BookOpen size={13} />} title="Offered around town" count={npcOpen.length} defaultOpen={false}>
              {npcOpen.map((d) => <Row key={d.id} cls="npc offer" title={<>{d.title} <em>· {d.giver}</em></>} status="Talk to start"><span>{d.summary}</span><Rewards r={d.reward} scale /></Row>)}
            </Section>
          )}
        </Section>

        <Section icon={<ScrollText size={14} />} title="Quest Board (optional)" count={board.length} tone="board">
          {board.length === 0 && <div className="ql-none">No bounties taken. The Quest Board in the plaza has new ones every day.</div>}
          {board.map((q) => (
            <Row key={q.id} cls={`board ${questDone(q) ? 'ready' : ''}`} title={questTitle(q)} status={questDone(q) ? 'Claim' : `${Math.min(q.progress, q.target)} / ${q.target}`}>
              <span>{questDone(q) ? 'Done! Claim it at the Quest Board.' : `${Math.min(q.progress, q.target)} / ${q.target}`}</span>
              <Rewards r={q.reward} />
            </Row>
          ))}
        </Section>
      </div>
    </Modal>
  );
};
