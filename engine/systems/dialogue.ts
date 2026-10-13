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
  if (!NPCS[npc].gift) return false;
  try { return localStorage.getItem(giftKey(NPCS[npc].name)) !== todayKey(); } catch { return true; }
}
function claimGift(npc: number): void {
  const g = NPCS[npc].gift; if (!g) return;
  try { localStorage.setItem(giftKey(NPCS[npc].name), todayKey()); } catch { /* ignore */ }
  const st = useGameStore.getState();
  if (g.gold) st.addGold(g.gold);
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
