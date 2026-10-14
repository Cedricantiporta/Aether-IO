import { GOLD_SCALE } from '../../constants';
// NPC dialogue state (a tiny zustand store so the DOM box re-renders only when a line changes) + daily gifts.
import { create } from 'zustand';
import { NPCS } from '../townData';
import { useGameStore, makeItemById } from '../../store';
import { questDone } from '../../quests';

interface DialogueState { open: boolean; npc: number; name: string; role: string; accent: string; lines: string[]; idx: number }
export const useDialogue = create<DialogueState>(() => ({ open: false, npc: -1, name: '', role: '', accent: '#ffd36a', lines: [], idx: 0 }));

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
  if (d.king) {
    // royal quests: an audience is granted, finished bounties are reported (store.reportToKing)
    const r = useGameStore.getState().reportToKing();
    const pre: string[] = [];
    if (r.audience) pre.push('So you are the hero they speak of. You sought an audience, and you have it. Aether is glad to look upon you.');
    if (r.reports) pre.push(r.reports > 1 ? 'You bring word of great deeds done in my name. The crown is in your debt. See the Quest Board for your rewards.' : 'You bring word of a deed done in my name. The crown is in your debt. See the Quest Board for your reward.');
    if (pre.length) lines.unshift(...pre);
    else if (useGameStore.getState().quests.some((q) => q.accepted && q.needsKing && !q.reported)) lines.push('A royal commission awaits its end. Finish the deed, hero, then come and tell me of it.');
  }
  if (d.quest && useGameStore.getState().quests.some(questDone)) lines.push('Oh! One of your bounties is complete. Hurry to the Quest Board and claim your reward!');
  if (giftAvailable(npc)) lines.push(d.gift!.text);
  useDialogue.setState({ open: true, npc, name: d.name, role: d.role, accent: d.accent, lines, idx: 0 });
}

export function closeDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  useDialogue.setState({ open: false, npc: -1 });
}

/** Next line; on the last line closes. Reaching a gift line pays it out (once per day per NPC). */
export function advanceDialogue(): void {
  const s = useDialogue.getState();
  if (!s.open) return;
  if (s.idx >= s.lines.length - 1) { closeDialogue(); return; }
  const idx = s.idx + 1;
  useDialogue.setState({ idx });
  if (idx === s.lines.length - 1 && s.lines[idx] === NPCS[s.npc].gift?.text && giftAvailable(s.npc)) claimGift(s.npc);
}
