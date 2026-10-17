// Bounty Board (owner: a centred popup laid out like the Quest window): today's offers and the taken bounties on the
// left, the selected bounty on the right (banner, flavour, objective, rewards) with Accept / Abandon / Claim.
import { questXp } from '../../../classLevels';
import React, { useEffect, useState } from 'react';
import { ScrollText, Check, Lock } from '../../components/GoldIcons';
import { useGameStore, questSlotsUsed, questSlotsFull } from '../../../store';
import { useShallow } from 'zustand/react/shallow';
import { questDone, questNeedsKing, questTitle, questFlavor, activeQuests, questOffers, QUEST_MAX_ACTIVE, type Quest } from '../../../quests';
import { Modal } from '../../components/Modal';
import { Rewards } from '../../screens/QuestLog';

const progressText = (q: Quest): string => (q.type === 'AUDIENCE' ? (questDone(q) ? 'Done' : 'Pending') : `${Math.min(q.progress, q.target).toLocaleString()} / ${q.target.toLocaleString()}`);

export const QuestsTab: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { quests, refresh, claim, accept, abandon } = useGameStore(useShallow((s) => ({ quests: s.quests, refresh: s.refreshQuestBoard, claim: s.claimQuest, accept: s.acceptQuest, abandon: s.abandonQuest })));
  useEffect(() => { refresh(); }, [refresh]);
  const active = activeQuests(quests).slice().sort((a, b) => Number(questDone(b)) - Number(questDone(a))), offers = questOffers(quests);   // (owner) completed bounties always first
  const slots = useGameStore((s) => questSlotsUsed(s));
  const full = useGameStore((s) => questSlotsFull(s));
  const [selId, setSel] = useState('');
  const q = [...active, ...offers].find((x) => x.id === selId) ?? active[0] ?? offers[0];
  const done = q ? questDone(q) : false, king = q ? questNeedsKing(q) : false;
  const row = (x: Quest) => {
    const d = x.accepted && questDone(x);
    return (
      <button key={x.id} className={`qw-step pe ${q?.id === x.id ? 'sel' : ''} ${x.accepted ? (d ? 'done ready' : 'cur') : 'offer'}`} onClick={() => setSel(x.id)} data-testid={x.accepted ? 'quest' : 'quest-offer'} data-done={d ? '1' : '0'}>
        <span>{questTitle(x)}{x.accepted && !d && <em> · {progressText(x)}</em>}</span>
        {d ? <Check size={14} className="ok" /> : x.accepted ? <b className="qbadge">Q</b> : <b className="qbadge blue">!</b>}
      </button>
    );
  };
  return (
    <Modal open onClose={onClose} title="Bounty Board" icon={<ScrollText size={20} />} width="min(62rem, 96vw)" z={250} full portal>
      <div className="qw" data-testid="quests-tab">
        <div className="qw-body">
          <div className="qw-list rpg-scroll">
            <div className="qw-chap open"><div className="qw-chap-h"><span>Quest slots · {slots} / {QUEST_MAX_ACTIVE}</span></div>
              {active.length === 0 && <div className="qw-none">No bounties taken yet. Pick one below.</div>}
              {active.map(row)}
            </div>
            <div className="qw-chap open"><div className="qw-chap-h"><span>Today's offers</span>{full && <Lock size={14} />}</div>
              {offers.length === 0 && <div className="qw-none">No new offers today. Come back tomorrow.</div>}
              {offers.map(row)}
            </div>
          </div>
          {q ? (
            <div className="qw-det">
              <div className="qw-banner">
                <div className="qw-seal"><ScrollText size={20} /></div>
                <div><em>{q.accepted ? 'Bounty · taken' : 'Bounty · offer'}</em><b>{questTitle(q)}</b></div>
              </div>
              <div className="qw-cols">
                <div className="qw-text">
                  <p>{questFlavor(q)}</p>
                  <p className="qw-quote">“Only accepted bounties make progress during your runs. New offers are posted every day.”<span>Hodge, Bounty Clerk</span></p>
                </div>
                <div className="qw-side">
                  <div className="qw-sec">Objective</div>
                  <div className="qw-obj">{q.accepted && done ? <><Check size={14} /> Completed</> : <>{questTitle(q)}{q.accepted && <b> {progressText(q)}</b>}</>}</div>
                  {q.accepted && king && <div className="qw-obj" data-testid="quest-king">{q.type === 'AUDIENCE' ? 'Talk to the King in the castle keep' : 'Report to the King in the castle'}</div>}
                  <div className="qw-sec">Rewards</div>
                  <Rewards r={q.reward} xp={questXp('BOUNTY', useGameStore.getState().level)} />
                  {q.reward.item && <div className="qw-obj" style={{ marginTop: '.3rem' }}>+ one {q.reward.item.charAt(0) + q.reward.item.slice(1).toLowerCase()} gear piece</div>}
                </div>
              </div>
              <div className="qw-btns">
                {q.accepted ? (<>
                  {!done && <button className="qw-btn pe" onClick={() => abandon(q.id)} data-testid="abandon">Abandon</button>}
                  <button className={`qw-btn pe ${done ? 'gold' : ''}`} disabled={!done} onClick={() => claim(q.id)} data-testid="claim">{done ? 'Claim' : king ? 'See the King' : 'In progress'}</button>
                </>) : (
                  <button className="qw-btn gold pe" disabled={full} onClick={() => accept(q.id)} data-testid="accept">{full ? 'Slots full' : 'Accept'}</button>
                )}
              </div>
            </div>
          ) : <div className="qw-det"><div className="qw-text"><p>The board is empty.</p></div></div>}
        </div>
      </div>
    </Modal>
  );
};
