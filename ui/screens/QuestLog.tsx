// Quest window (MMO style): tabs Main / Side. Main: the story chapters on the left (expand to their steps:
// done / current / locked), the selected step on the right (chapter banner, story text, objective with progress,
// rewards, Track / Teleport). Side: NPC quests (active and offered).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText, Check, ChevronDown, Lock, MapPin, Navigation } from '../components/GoldIcons';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../components/Modal';
import { storyCap, liveStep } from '../../questUnlocks';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { GameStatus } from '../../types';
import { CHAPTERS, stepCount, storyIdx, STORY, type StoryStep } from '../../story';
import { NPC_QUESTS, npcQuestProgress, npcQuestReady, npcQuestStatus, npcQuestLevelLocked, npcQuestMinLevel, bagCount, type NpcReward, type NpcQuestDef } from '../../npcQuests';
import { GOLD_SCALE, ITEMS_POOL, PETS_POOL } from '../../constants';
import { LOOT_BY_ID } from '../../loot';
import { abandonNpcQuest } from '../../engine/systems/npcQuestLogic';
import { questXp } from '../../classLevels';
import { offerTeleport, trackAndGo } from '../hud/QuestTracker';
import { useNewMainQuest, useNewSideQuest } from '../lib/alerts';
import { mainQuestId, sideQuestId } from '../../questSeen';
import { ItemSlot } from '../components/ItemSlot';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { lootItem } from '../../loot';
import type { Item } from '../../types';

/** Track = the minimap marker / guide / tracker follow this quest AND the hero auto-paths there (offered quests: to the giver). */
const trackQuest = (key: string, title: string): void => { useUiStore.getState().setTrackedQuest(key); useGameStore.getState().addNotification('Tracking: ' + title, '#f1e2b8', 'SYSTEM'); trackAndGo(key); };
const itemName = (id: string) => ITEMS_POOL.find((i) => i.id === id)?.name ?? PETS_POOL.find((i) => i.id === id)?.name ?? LOOT_BY_ID[id]?.name ?? id;

// rewards as bag slots: the real item art (rarity tint, stack count, hover tooltip); gold / gems as coin / gem squares
const rewardItem = (id: string, qty: number): Item | null => {
  const tpl = ITEMS_POOL.find((i) => i.id === id) ?? PETS_POOL.find((i) => i.id === id);
  if (tpl) return { ...tpl, quantity: qty };
  const def = LOOT_BY_ID[id];
  return def ? lootItem(def, qty) : null;
};
const CurSlot: React.FC<{ icon: React.ReactNode; n: number; label: string }> = ({ icon, n, label }) => (
  <div className="qw-ri" {...tip(<SimpleTip title={`${n.toLocaleString()} ${label}`} />)}>
    <div className="rpg-slot fluid qw-cur">{icon}<span className="slot-qty">{n.toLocaleString()}</span></div>
  </div>
);
export const Rewards: React.FC<{ r: NpcReward; scale?: boolean; xp?: number }> = ({ r, scale, xp }) => {
  const g = (r as NpcReward).gold, gems = r.gems, items = (r as NpcReward).items;
  const list: [string, number][] = [...(items ?? []).map((it) => [it.id, it.qty ?? 1] as [string, number])];
  return (
    <div className="qw-rew">
      {!!xp && <CurSlot icon={<span className="qw-xp">EXP</span>} n={xp} label="EXP" />}
      {!!g && <CurSlot icon={<CoinGlyph size={34} />} n={scale ? g * GOLD_SCALE : g} label="Gold" />}
      {!!gems && <CurSlot icon={<GemGlyph size={34} />} n={gems} label="Gems" />}
      {list.map(([id, n]) => { const it = rewardItem(id, n); return it ? <div key={id} className="qw-ri"><ItemSlot item={it} fluid size="100%" iconSize="78%" qty={n} tooltip="none" compare={false} /></div> : null; })}
    </div>
  );
};

type Tab = 'MAIN' | 'SIDE';

export const QuestLog: React.FC = () => {
  const open = useUiStore((s) => s.questLogOpen), setOpen = useUiStore((s) => s.openQuestLog);
  const { story, nq, inv, rank, status, level, unlocks } = useGameStore(useShallow((s) => ({ story: s.story, nq: s.npcQuests, inv: s.inventory, rank: s.heroRank, status: s.status, level: s.level, unlocks: s.unlocks })));
  const cap = storyCap(unlocks.n);   // (owner, Hades-style) main steps past this are still locked: hidden until a death opens them
  const held = story.step > cap;
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [tab, setTab] = useState<Tab>('MAIN');
  const chapAll = useMemo(() => CHAPTERS.map((c, i) => ({ ...c, a: storyIdx(c.from), b: i + 1 < CHAPTERS.length ? storyIdx(CHAPTERS[i + 1].from) : STORY.length })), []);
  const chapIdx = chapAll.filter((c) => c.a <= cap);
  const curChap = Math.max(0, chapIdx.findIndex((c) => Math.min(story.step, cap) >= c.a && Math.min(story.step, cap) < c.b));
  const [openChap, setOpenChap] = useState<string>(() => chapIdx[curChap]?.id ?? 'pro');
  const [sel, setSel] = useState<number>(() => Math.min(story.step, cap, STORY.length - 1));
  const [sideSel, setSideSel] = useState<string>('');
  // opening the window jumps to the current chapter and step
  useEffect(() => { if (open) { setOpenChap(chapIdx[curChap]?.id ?? 'pro'); setSel(Math.min(story.step, cap, STORY.length - 1)); const u = useUiStore.getState(), t = u.questLogTab; if (t) { setTab(t); u.setQuestLogTab(''); }
    const f = u.questLogFocus;   // a tracker row opened the log on this quest
    if (f) { useUiStore.setState({ questLogFocus: '' }); if (f.startsWith('side:')) setSideSel(f.slice(5)); } } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const npcActive = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, rank) === 'ACTIVE');
  const npcOpen = NPC_QUESTS.filter((d) => npcQuestStatus(d, nq, rank) === 'AVAILABLE');
  // level-gated requests whose only blocker is the class level (lowest level first)
  const npcLocked = NPC_QUESTS.filter((d) => npcQuestLevelLocked(d, nq, rank)).sort((a, b) => npcQuestMinLevel(a) - npcQuestMinLevel(b));
  const step: StoryStep | undefined = STORY[sel];
  const chap = chapIdx.find((c) => sel >= c.a && sel < c.b) ?? chapIdx[0];
  const inRun = status === GameStatus.PLAYING;
  const mainTown = !!(step && (step.npc || step.at)) && !(step?.deliver && bagCount(inv, step.deliver.id) < step.deliver.count);   // continues in town right now
  const track = () => { setOpen(false); trackQuest('main', step?.title ?? 'main quest'); };
  const side = [...npcActive, ...npcOpen, ...npcLocked].find((d) => d.id === sideSel) ?? npcActive[0] ?? npcOpen[0] ?? npcLocked[0];

  // new-quest marks: dots live in the store (cleared once the quest is viewed); the NEW pills keep the ones that were new when the window opened
  const dotMain = useNewMainQuest(), dotSide = useNewSideQuest();
  const newAtOpen = useRef<string[]>([]);
  useEffect(() => { if (open) { const g = useGameStore.getState(), seen = g.questSeen ?? []; const ids = [mainQuestId(liveStep(g)), ...npcOpen.map((d) => sideQuestId(d.id))].filter((id) => id && !seen.includes(id)); newAtOpen.current = ids; } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = (id: string): boolean => newAtOpen.current.includes(id);
  const liveMainId = mainQuestId(liveStep({ story, unlocks }));
  useEffect(() => {
    if (!open) return;
    const ids: string[] = [];
    if (tab === 'MAIN' && sel === story.step) ids.push(liveMainId);
    if (tab === 'SIDE' && side && npcOpen.includes(side)) ids.push(sideQuestId(side.id));
    if (ids.length) useGameStore.getState().markQuestsSeen(ids);
  }, [open, tab, sel, story.step, liveMainId, side?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Quests" icon={<ScrollText size={20} />} width="min(62rem, 96vw)" z={250} full>
      <div className="qw" data-testid="quest-log">
        <div className="qw-tabs">
          {([['MAIN', 'Main'], ['SIDE', 'Side']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} className={`qw-tab pe ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{l}{t === 'SIDE' && npcActive.length > 0 && <span className="qw-n">{npcActive.length}</span>}{(t === 'MAIN' ? dotMain : dotSide) && <i className="red-dot" data-testid={`qw-dot-${t}`} />}</button>
          ))}
        </div>

        {tab === 'MAIN' && (
          <div className="qw-body">
            <div className="qw-list rpg-scroll">
              {chapIdx.map((c, ci) => {
                const locked = story.step < c.a, done = story.step >= c.b, isOpen = openChap === c.id;
                return (
                  <div key={c.id} className={`qw-chap ${locked ? 'locked' : ''} ${done ? 'done' : ''} ${isOpen ? 'open' : ''}`} data-ch={ci}>
                    <button className="qw-chap-h pe" onClick={() => !locked && setOpenChap(isOpen ? '' : c.id)}>
                      <span>{c.title}</span>{locked ? <Lock size={14} /> : done ? <Check size={15} /> : <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />}
                    </button>
                    {isOpen && !locked && STORY.slice(c.a, Math.min(c.b, cap + 1)).map((s, k) => {
                      const i = c.a + k, st = i < story.step ? 'done' : i === story.step ? 'cur' : 'lock';
                      return (
                        <button key={s.id} className={`qw-step pe ${st} ${sel === i ? 'sel' : ''}`} onClick={() => st !== 'lock' && setSel(i)} disabled={st === 'lock'}>
                          <span>{k + 1}. {st === 'lock' ? '???' : s.title}{st === 'cur' && isNew('main:' + s.id) && <b className="qw-new">NEW</b>}</span>
                          {st === 'done' ? <Check size={14} className="ok" /> : st === 'cur' ? <b className="qbadge">Q</b> : <Lock size={13} />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {held && story.step < STORY.length && <div className="qw-none">Nothing new right now. Rest in your bed at home: someone may come knocking.</div>}
            </div>
            {step ? (
              <div className="qw-det">
                <div className="qw-banner" data-ch={chapIdx.indexOf(chap)}>
                  <div className="qw-seal"><ScrollText size={20} /></div>
                  <div><em>{chap.title}</em><b>{step.title}</b></div>
                </div>
                <div className="qw-cols">
                  <div className="qw-text">
                    <p>{chap.blurb}</p>
                    {step.talk && sel <= story.step && <p className="qw-quote">“{(step.wait ?? step.talk)[0]}”{step.npc && <span>{step.npc}</span>}</p>}
                  </div>
                  <div className="qw-side">
                    <div className="qw-sec">Objective</div>
                    <div className="qw-obj">{sel < story.step ? <><Check size={14} /> Completed</> : <>{step.line}{stepCount(step) > 1 ? <b> {Math.min(story.p, stepCount(step))} / {stepCount(step)}</b> : null}</>}</div>
                    <div className="qw-sec">Rewards</div>
                    <Rewards r={step.reward} scale xp={questXp('STORY', level)} />
                  </div>
                </div>
                {sel === story.step && (
                  <div className="qw-btns">
                    <button className="qw-btn pe" onClick={track}><MapPin size={15} /> Track</button>
                    {inRun && mainTown && <button className="qw-btn gold pe" onClick={() => { setOpen(false); offerTeleport(); }}><Navigation size={15} /> Back to town</button>}
                  </div>
                )}
              </div>
            ) : <div className="qw-det"><div className="qw-banner"><div><b>The story is complete</b></div></div><div className="qw-text"><p>The Font shines again. Ascension awaits at the gate.</p></div></div>}
          </div>
        )}

        {tab === 'SIDE' && (
          <div className="qw-body">
            <div className="qw-list rpg-scroll">
              {npcActive.length === 0 && npcOpen.length === 0 && npcLocked.length === 0 && <div className="qw-none">No requests right now. Look for a blue ! above someone's head.</div>}
              {npcActive.length > 0 && <div className="qw-grp">Active</div>}
              {npcActive.map((d) => <SideRow key={d.id} d={d} sel={side?.id === d.id} onSel={setSideSel} ready={npcQuestReady(d, nq, inv)} />)}
              {npcOpen.length > 0 && <div className="qw-grp">Offered around town</div>}
              {npcOpen.map((d) => <SideRow key={d.id} d={d} sel={side?.id === d.id} onSel={setSideSel} offer fresh={isNew(sideQuestId(d.id))} />)}
              {npcLocked.length > 0 && <div className="qw-grp">Unlocks at a higher level</div>}
              {npcLocked.map((d) => <SideRow key={d.id} d={d} sel={side?.id === d.id} onSel={setSideSel} lockLv={npcQuestMinLevel(d)} />)}
            </div>
            {side && (() => {
              const active = npcActive.includes(side), ready = active && npcQuestReady(side, nq, inv), n = npcQuestProgress(side, nq, inv);
              const lockLv = npcLocked.includes(side) ? npcQuestMinLevel(side) : 0;
              return (
                <div className="qw-det">
                  <div className="qw-banner npc"><div className="qw-seal"><ScrollText size={20} /></div><div><em>{side.giver}</em><b>{side.title}</b></div></div>
                  <div className="qw-cols">
                    <div className="qw-text"><p className="qw-quote">“{side.intro[0]}”<span>{side.giver}</span></p></div>
                    <div className="qw-side">
                      <div className="qw-sec">Objective</div>
                      <div className="qw-obj">{lockLv ? <><Lock size={13} /> Requires Lv {lockLv} (you are Lv {rank}). {side.summary}</> : !active ? `Talk to ${side.giver} to start` : ready ? `Done! Return to ${side.turnIn ?? side.giver}.` : <>{side.summary}{side.objective.count > 1 ? <b> {n} / {side.objective.count}</b> : null}</>}</div>
                      <div className="qw-sec">Rewards</div>
                      <Rewards r={side.reward} scale xp={questXp('SIDE', level)} />
                    </div>
                  </div>
                  {active && <div className="qw-btns"><button className="qw-btn pe" onClick={() => { setOpen(false); trackQuest('side:' + side.id, side.title); }}><MapPin size={15} /> Track</button>
                    {!ready && <button className="qw-btn pe" data-testid="side-abandon" onClick={() => askConfirm({ title: `Abandon ${side.title}?`, body: `It goes back to ${side.giver}'s offers; your progress on it is lost.`, confirmLabel: 'Abandon', tone: 'danger', onConfirm: () => { abandonNpcQuest(side.id); } })}>Abandon</button>}</div>}
                  {!active && !lockLv && <div className="qw-btns"><button className="qw-btn pe" data-testid="side-track-offer" onClick={() => { setOpen(false); trackQuest('side:' + side.id, side.title); }}><MapPin size={15} /> Track</button></div>}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Modal>
  );
};

const SideRow: React.FC<{ d: NpcQuestDef; sel: boolean; onSel: (id: string) => void; ready?: boolean; offer?: boolean; fresh?: boolean; lockLv?: number }> = ({ d, sel, onSel, ready, offer, fresh, lockLv }) => (
  <button className={`qw-step pe ${sel ? 'sel' : ''} ${ready ? 'ready' : ''} ${lockLv ? 'lvlock' : offer ? 'offer' : 'cur'}`} onClick={() => onSel(d.id)} data-testid={lockLv ? 'side-locked' : undefined}>
    <span>{d.title} <em>· {d.giver}</em>{fresh && <b className="qw-new">NEW</b>}</span>
    {lockLv ? <b className="qw-lv"><Lock size={11} /> Lv {lockLv}</b> : ready ? <Check size={14} className="ok" /> : offer ? <b className="qbadge blue">!</b> : <b className="qbadge blue">Q</b>}
  </button>
);
