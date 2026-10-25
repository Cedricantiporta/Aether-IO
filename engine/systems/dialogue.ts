import { GOLD_SCALE } from '../../constants';
// NPC dialogue state (a tiny zustand store so the DOM box re-renders only when a line changes) + daily gifts.
// Order of what an NPC says: the message of a TALK quest you pass on ("heard"), then a side quest ready to hand in
// (paid on its last line), then the main quest (offer / delivery), else a side quest offer / reminder, else small talk
// (with one-off news after a guardian falls, the daily gift and a "come back at Lv N" hint).
import { create } from 'zustand';
import { NPCS } from '../townData';
import { events } from '../events';
import { useGameStore, makeItemById } from '../../store';
import { STORY } from '../../story';
import { storyHeld, liveStep, BEATS } from '../../questUnlocks';
import { storyTalk, acceptStory, rewardText } from './storyLogic';
import { acceptNpcQuest, completeNpcQuest, questDialogueFor, talkedTo, heardLines, npcRewardText } from './npcQuestLogic';
import { NPC_QUESTS, npcQuestLevelLocked, npcQuestMinLevel, npcQuestProgress, type NpcQuestDef } from '../../npcQuests';
import { takeNews } from '../npcLines';

/** `offer`: quest offered on the last line (Accept / Later; `story:<step>` = main quest); `turnIn`: NPC quest id paid out
 *  when line `turnInAt` is reached; `hint`: small objective / reward line shown under the LAST line. */
interface DialogueState { open: boolean; npc: number; name: string; role: string; accent: string; lines: string[]; idx: number; offer: string; turnIn: string; turnInAt: number; acceptLabel: string; hint: string }
export const useDialogue = create<DialogueState>(() => ({ open: false, npc: -1, name: '', role: '', accent: '#ffd36a', lines: [], idx: 0, offer: '', turnIn: '', turnInAt: -1, acceptLabel: 'Accept', hint: '' }));

/** A one-off conversation not tied to a town NPC (wanderers in run rooms): optional offer with its own button. */
let customAccept: (() => void) | null = null;
export function openCustomDialogue(name: string, role: string, accent: string, lines: string[], offer?: { label: string; accept: () => void }): void {
  customAccept = offer?.accept ?? null;
  useDialogue.setState({ open: true, npc: -1, name, role, accent, lines, idx: 0, offer: offer ? 'custom' : '', turnIn: '', turnInAt: -1, acceptLabel: offer?.label ?? 'Accept', hint: '' });
}

const lastConvo: number[] = NPCS.map(() => -1);
const guideStep: number[] = NPCS.map(() => 0);
const todayKey = () => new Date().toDateString();
const giftKey = (name: string) => 'aether.npcgift.' + name;
function giftAvailable(npc: number): boolean {
  const g0 = NPCS[npc].gift;
  if (!g0) return false;
  if (g0.quest) { const e = useGameStore.getState().npcQuests.q[g0.quest]; if (!e || e.s === 2) return false; }   // (owner: no gold before the quest is on)
  if (g0.once) { try { return !localStorage.getItem(g0.once); } catch { return true; } }
  try { return localStorage.getItem(giftKey(NPCS[npc].name)) !== todayKey(); } catch { return true; }
}
function claimGift(npc: number): void {
  const g = NPCS[npc].gift; if (!g || !giftAvailable(npc)) return;   // (re-checked: a gift is paid once per day / once ever)
  try { if (g.once) localStorage.setItem(g.once, '1'); else localStorage.setItem(giftKey(NPCS[npc].name), todayKey()); } catch { /* ignore */ }
  const st = useGameStore.getState();
  if (g.gold) st.addGold(g.gold * GOLD_SCALE);
  if (g.item) for (const it of makeItemById(g.item, g.qty ?? 1)) if (!st.addItemToInventory(it)) { st.addNotification('Bag is full!', 'red', 'WARNING'); break; }
  st.addNotification(g.text.replace(/^.*?\(/, '').replace(/\)$/, '') || 'Gift received', '#ffc861', 'SYSTEM');
}

export function dialogueOpen(): boolean { return useDialogue.getState().open; }

/** The hint under a main-quest offer: what comes next + what accepting pays. */
function storyHint(offer: string): string {
  const n = Number(offer.slice(6)), next = storyHeld(n + 1, useGameStore.getState().unlocks.n, useGameStore.getState().unlocks.wait) ? undefined : STORY[n + 1], rw = STORY[n] ? rewardText(STORY[n].reward) : '';
  return [next ? `Next: ${next.line}` : '', rw].filter(Boolean).join('  ·  ');
}
/** The hint under a side-quest offer / reminder. */
function sideHint(def: NpcQuestDef, mode: 'offer' | 'progress'): string {
  const st = useGameStore.getState(), o = def.objective;
  if (mode === 'progress') return o.type === 'TALK' ? def.summary : `${def.summary}  ·  ${npcQuestProgress(def, st.npcQuests, st.inventory)} / ${o.count}`;
  return [`Objective: ${def.summary}`, npcRewardText(def.reward)].filter(Boolean).join('  ·  ');
}

/** (owner 2026-10-25) Talking to the NPC a woken-up beat sent you to starts its quests (no quests by telepathy). Returns the
 *  lines that hand over a field main quest (a talk step with this NPC says its own lines instead; side quests are offered next). */
function meetBeats(name: string): string[] {
  const st = useGameStore.getState(), u = st.unlocks;
  if (!u.wait?.some((id) => BEATS.find((b) => b.id === id)?.who === name)) return [];
  const wait = u.wait.filter((id) => BEATS.find((b) => b.id === id)?.who !== name);
  useGameStore.setState({ unlocks: { ...u, wait } });
  const before = liveStep(st), step = liveStep(useGameStore.getState());
  if (!step || step === before || step.npc === name) return [];
  st.addNotification(`Main quest: ${step.title}`, '#f1d58e', 'SYSTEM');
  return ['There you are! I have been waiting for you.', `${step.line}. I am counting on you.`];
}

export function openDialogue(npc: number): void {
  const d = NPCS[npc]; if (!d) return;
  const meet = meetBeats(d.name);
  let ci: number;
  if (d.ordered) { ci = guideStep[npc]; guideStep[npc] = (ci + 1) % d.talk.length; }
  else { ci = Math.floor(Math.random() * d.talk.length); if (d.talk.length > 1 && ci === lastConvo[npc]) ci = (ci + 1) % d.talk.length; }
  lastConvo[npc] = ci;
  const lines = d.talk[ci].slice();
  // a message passed on for a TALK quest: the NPC answers it first (then talkedTo counts it)
  const heard = heardLines(d.name);
  talkedTo(d.name);
  // a side quest ready to hand in is paid first, even when this NPC also has the main quest (no blocked turn-ins)
  const nq0 = questDialogueFor(d.name);
  const pre: string[] = [...meet, ...heard];
  let turnIn = '', turnInAt = -1;
  if (nq0?.mode === 'turnin') { pre.push(...nq0.def.done); turnIn = nq0.def.id; turnInAt = pre.length - 1; }
  // main story: the step's NPC tells its part (replaces the ambient talk) and the chain moves on
  const story = storyTalk(d.name);
  if (story) {
    const all = [...pre, ...story.lines];
    show(npc, all, story.offer, turnIn, turnInAt, story.offer ? storyHint(story.offer) : '');
    return;
  }
  const nq = turnIn ? null : nq0;
  let offer = '', hint = '';
  if (nq) {
    const q = nq.def;
    const qLines = nq.mode === 'offer' ? q.intro.slice() : [q.progress];
    if (nq.mode === 'offer') offer = q.id;
    hint = sideHint(q, nq.mode === 'offer' ? 'offer' : 'progress');
    lines.length = 0;
    lines.push(...qLines);
    if (giftAvailable(npc)) lines.unshift(d.gift!.text);
    lines.unshift(...meet, ...heard);
  } else if (turnIn) {
    lines.length = 0;
    if (giftAvailable(npc)) lines.push(d.gift!.text);
    lines.push(...pre);
    turnInAt = lines.length - 1;   // paid on the last line (then it may roll on into this NPC's next quest)
  } else if (meet.length) {
    lines.length = 0; lines.push(...meet, ...heard);
  } else {
    const news = takeNews(d.name);   // one-off news after a guardian fell
    if (news) lines.unshift(news);
    lines.unshift(...heard);
    if (giftAvailable(npc)) lines.push(d.gift!.text);
    const st = useGameStore.getState(), later = NPC_QUESTS.find((q) => q.giver === d.name && npcQuestLevelLocked(q, st.npcQuests, st.heroRank));
    if (later) lines.push(`I may have a job for you once you are stronger. Come back at Lv ${npcQuestMinLevel(later)}.`);   // level-gated side quest
  }
  show(npc, lines, offer, turnIn, turnInAt, hint);
}
function show(npc: number, lines: string[], offer: string, turnIn: string, turnInAt: number, hint: string): void {
  const d = NPCS[npc];
  useDialogue.setState({ open: true, npc, name: d.name, role: d.role, accent: d.accent, lines, idx: 0, offer, turnIn, turnInAt, hint, acceptLabel: 'Accept' });
  onLine(npc, 0);
}

export function closeDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  useDialogue.setState({ open: false, npc: -1, offer: '', turnIn: '', turnInAt: -1, acceptLabel: 'Accept', hint: '' });
}

/** (owner) A short hero line ("You:: ...") right after the current one is not shown as its own page: it becomes the
 *  label of the Next / Close button (the hero's reply), and pressing it moves past it. */
export const REPLY_MAX = 72;
export function replyAt(lines: readonly string[], i: number): string | null {
  const l = lines[i];
  if (!l || !l.startsWith('You:: ')) return null;
  const t = l.slice(6);
  return t.length <= REPLY_MAX ? t : null;
}
/** Next line; on the last line closes. Reaching a gift line pays it out (once per day per NPC). */
export function advanceDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  const reply = replyAt(s.lines, s.idx + 1) !== null && !(s.offer && s.idx + 1 >= s.lines.length - 1);   // the button said the hero's reply: skip that line
  if (reply && s.idx + 1 < s.lines.length - 1) { onLine(s.npc, s.idx + 1); const idx = s.idx + 2; useDialogue.setState({ idx }); onLine(s.npc, idx); return; }
  if (s.offer && s.offer !== 'custom' && s.idx >= s.lines.length - 1) { acceptOffer(); return; }   // a quest offer: the single "Okay" button (E / Space too) = Accept   // main quest: the single "Okay" button (E / Space too) = what Accept did
  if (s.idx >= s.lines.length - 1 || reply) {
    if (reply) onLine(s.npc, s.idx + 1);
    const tab = s.npc >= 0 && !s.offer && !s.turnIn ? NPCS[s.npc].opens : undefined;
    const ship = s.npc >= 0 && !s.offer && !s.turnIn && !!NPCS[s.npc].ship;
    closeDialogue();
    if (tab) useGameStore.getState().openSpecificShop(tab);   // e.g. the Skill Trainer opens the skill panel
    if (ship) events.emit('hub', { kind: 'ship', n: 1 });     // the captain: the ticket offer (ui/hud/Dialogue)   // e.g. the Skill Trainer opens the skill panel
    return;
  }
  const idx = s.idx + 1;
  useDialogue.setState({ idx });
  onLine(s.npc, idx);
}

/** A line was reached: a gift line pays out (once per day per NPC); reaching the end of a turn-in pays the quest. */
function onLine(npc: number, idx: number): void {
  if (npc < 0) return;   // custom conversation
  const s = useDialogue.getState();
  if (s.lines[idx] === NPCS[npc].gift?.text && giftAvailable(npc)) claimGift(npc);
  if (s.turnIn && idx >= s.turnInAt) {
    const id = s.turnIn, atEnd = idx === s.lines.length - 1; useDialogue.setState({ turnIn: '', turnInAt: -1 });
    if (completeNpcQuest(id) && atEnd && !s.offer) {   // rewards paid: the talk rolls straight on into this NPC's next quest, if there is one
      const nq = questDialogueFor(s.name);
      if (nq?.mode === 'offer') useDialogue.setState({ lines: [...s.lines, ...nq.def.intro], offer: nq.def.id, hint: sideHint(nq.def, 'offer') });
    }
  }
}

/** Accept button / key on the last line of an offer. */
export function acceptOffer(): void {
  const s = useDialogue.getState();
  if (!s.open || !s.offer || s.idx < s.lines.length - 1) return;
  if (s.offer === 'custom') { const f = customAccept; customAccept = null; closeDialogue(); f?.(); return; }
  if (s.offer.startsWith('story:')) {   // main quest: take it; when the same NPC has more to say (next offer / a side quest), keep talking
    acceptStory(s.offer);
    const nx = storyTalk(s.name);
    if (nx) { useDialogue.setState({ lines: nx.lines, idx: 0, offer: nx.offer, turnIn: '', turnInAt: -1, hint: nx.offer ? storyHint(nx.offer) : '' }); return; }
    const nq = questDialogueFor(s.name);
    if (nq && nq.mode !== 'progress') {
      const turn = nq.mode === 'turnin';
      useDialogue.setState({ lines: turn ? nq.def.done.slice() : nq.def.intro.slice(), idx: 0, offer: turn ? '' : nq.def.id, turnIn: turn ? nq.def.id : '', turnInAt: turn ? nq.def.done.length - 1 : -1, hint: turn ? '' : sideHint(nq.def, 'offer') });
      if (turn) onLine(s.npc, 0);
      return;
    }
    closeDialogue(); return;
  }
  acceptNpcQuest(s.offer);
  closeDialogue();
}
