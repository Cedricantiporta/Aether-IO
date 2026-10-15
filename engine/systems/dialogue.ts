import { GOLD_SCALE } from '../../constants';
// NPC dialogue state (a tiny zustand store so the DOM box re-renders only when a line changes) + daily gifts.
import { create } from 'zustand';
import { NPCS } from '../townData';
import { useGameStore, makeItemById } from '../../store';
import { questDone } from '../../quests';
import { storyTalk, acceptStory } from './storyLogic';
import { acceptNpcQuest, completeNpcQuest, questDialogueFor, talkedTo } from './npcQuestLogic';
import { NPC_QUESTS, npcQuestLevelLocked, npcQuestMinLevel } from '../../npcQuests';

/** `offer`: NPC quest id offered on the last line (Accept / Later); `turnIn`: NPC quest id paid out on the last line. */
interface DialogueState { open: boolean; npc: number; name: string; role: string; accent: string; lines: string[]; idx: number; offer: string; turnIn: string; acceptLabel: string }
export const useDialogue = create<DialogueState>(() => ({ open: false, npc: -1, name: '', role: '', accent: '#ffd36a', lines: [], idx: 0, offer: '', turnIn: '', acceptLabel: 'Accept' }));

/** A one-off conversation not tied to a town NPC (wanderers in run rooms): optional offer with its own button. */
let customAccept: (() => void) | null = null;
export function openCustomDialogue(name: string, role: string, accent: string, lines: string[], offer?: { label: string; accept: () => void }): void {
  customAccept = offer?.accept ?? null;
  useDialogue.setState({ open: true, npc: -1, name, role, accent, lines, idx: 0, offer: offer ? 'custom' : '', turnIn: '', acceptLabel: offer?.label ?? 'Accept' });
}

const lastConvo: number[] = NPCS.map(() => -1);
const guideStep: number[] = NPCS.map(() => 0);
const todayKey = () => new Date().toDateString();
const giftKey = (name: string) => 'aether.npcgift.' + name;
function giftAvailable(npc: number): boolean {
  const g0 = NPCS[npc].gift;
  if (!g0) return false;
  if (g0.once) { try { return !localStorage.getItem(g0.once); } catch { return true; } }
  try { return localStorage.getItem(giftKey(NPCS[npc].name)) !== todayKey(); } catch { return true; }
}
function claimGift(npc: number): void {
  const g = NPCS[npc].gift; if (!g) return;
  try { if (g.once) localStorage.setItem(g.once, '1'); else localStorage.setItem(giftKey(NPCS[npc].name), todayKey()); } catch { /* ignore */ }
  const st = useGameStore.getState();
  if (g.gold) st.addGold(g.gold * GOLD_SCALE);
  if (g.item) for (const it of makeItemById(g.item, g.qty ?? 1)) if (!st.addItemToInventory(it)) { st.addNotification('Bag is full!', 'red', 'WARNING'); break; }
  st.addNotification(g.text.replace(/^.*?\(/, '').replace(/\)$/, '') || 'Gift received', '#ffc861', 'SYSTEM');
}

export function dialogueOpen(): boolean { return useDialogue.getState().open; }

export function openDialogue(npc: number): void {
  const d = NPCS[npc]; if (!d) return;
  let ci: number;
  if (d.ordered) { ci = guideStep[npc]; guideStep[npc] = (ci + 1) % d.talk.length; }
  else { ci = Math.floor(Math.random() * d.talk.length); if (d.talk.length > 1 && ci === lastConvo[npc]) ci = (ci + 1) % d.talk.length; }
  lastConvo[npc] = ci;
  const lines = d.talk[ci].slice();
  let kingPre = 0;   // royal lines added in front (kept when a quest dialogue replaces the ambient talk)
  if (d.king) {
    // royal quests: an audience is granted, finished bounties are reported (store.reportToKing)
    const r = useGameStore.getState().reportToKing();
    const pre: string[] = [];
    if (r.audience) pre.push('So you are the hero they speak of. You sought an audience, and you have it. Aether is glad to look upon you.');
    if (r.reports) pre.push(r.reports > 1 ? 'You bring word of great deeds done in my name. The crown is in your debt. See the Quest Board for your rewards.' : 'You bring word of a deed done in my name. The crown is in your debt. See the Quest Board for your reward.');
    if (pre.length) { lines.unshift(...pre); kingPre = pre.length; }
    else if (useGameStore.getState().quests.some((q) => q.accepted && q.needsKing && !q.reported)) lines.push('A royal commission awaits its end. Finish the deed, hero, then come and tell me of it.');
  }
  if (d.quest && useGameStore.getState().quests.some(questDone)) lines.push('Oh! One of your bounties is complete. Hurry to the Quest Board and claim your reward!');
  // NPC story quests (npcQuests.ts): a turn-in / offer / reminder replaces the ambient talk (the gift line stays, first)
  talkedTo(d.name);
  // main story: the step's NPC tells its part (replaces the ambient talk) and the chain moves on
  const story = storyTalk(d.name);
  if (story) {
    useDialogue.setState({ open: true, npc, name: d.name, role: d.role, accent: d.accent, lines: story.lines, idx: 0, offer: story.offer, turnIn: '' });
    onLine(npc, 0);
    return;
  }
  const nq = questDialogueFor(d.name);
  let offer = '', turnIn = '';
  if (nq) {
    const q = nq.def;
    const qLines = nq.mode === 'offer' ? [`New quest: ${q.title}`, ...q.intro] : nq.mode === 'turnin' ? q.done.slice() : [q.progress];
    if (nq.mode === 'offer') offer = q.id; else if (nq.mode === 'turnin') turnIn = q.id;
    lines.length = kingPre;
    lines.push(...qLines);
    if (giftAvailable(npc)) lines.unshift(d.gift!.text);
  } else {
    if (giftAvailable(npc)) lines.push(d.gift!.text);
    const st = useGameStore.getState(), later = NPC_QUESTS.find((q) => q.giver === d.name && npcQuestLevelLocked(q, st.npcQuests, st.heroRank));
    if (later) lines.push(`I may have a job for you once you are stronger. Come back at Lv ${npcQuestMinLevel(later)}.`);   // level-gated side quest
  }
  useDialogue.setState({ open: true, npc, name: d.name, role: d.role, accent: d.accent, lines, idx: 0, offer, turnIn });
  onLine(npc, 0);
}

export function closeDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  useDialogue.setState({ open: false, npc: -1, offer: '', turnIn: '', acceptLabel: 'Accept' });
}

/** Next line; on the last line closes. Reaching a gift line pays it out (once per day per NPC). */
export function advanceDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  if (s.idx >= s.lines.length - 1) { closeDialogue(); return; }
  const idx = s.idx + 1;
  useDialogue.setState({ idx });
  onLine(s.npc, idx);
}

/** A line was reached: a gift line pays out (once per day per NPC), the last line of a turn-in dialogue pays the quest rewards. */
function onLine(npc: number, idx: number): void {
  if (npc < 0) return;   // custom conversation
  const s = useDialogue.getState();
  if (s.lines[idx] === NPCS[npc].gift?.text && giftAvailable(npc)) claimGift(npc);
  if (s.turnIn && idx === s.lines.length - 1) {
    const id = s.turnIn; useDialogue.setState({ turnIn: '' });
    if (completeNpcQuest(id)) {   // rewards paid: the talk rolls straight on into this NPC's next quest, if there is one
      const nq = questDialogueFor(s.name);
      if (nq?.mode === 'offer') useDialogue.setState({ lines: [...s.lines, `New quest: ${nq.def.title}`, ...nq.def.intro], offer: nq.def.id });
    }
  }
}

/** Accept button / key on the last line of an offer. */
export function acceptOffer(): void {
  const s = useDialogue.getState();
  if (!s.open || !s.offer || s.idx < s.lines.length - 1) return;
  if (s.offer === 'custom') { const f = customAccept; customAccept = null; closeDialogue(); f?.(); return; }
  if (s.offer.startsWith('story:')) {   // main quest: take it; when the same NPC has more to say (next offer), keep talking
    acceptStory(s.offer);
    const nx = storyTalk(s.name);
    if (nx) { useDialogue.setState({ lines: nx.lines, idx: 0, offer: nx.offer, turnIn: '' }); return; }
    closeDialogue(); return;
  }
  acceptNpcQuest(s.offer);
  closeDialogue();
}
