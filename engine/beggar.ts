// (owner 2026-10-25) The beggar by the plaza fountain: give him 1,000 gold once a day. Ten days IN A ROW and he reveals who he
// was, pays back 60,000 gold and leaves town for good. Missing a day starts the count again. Saved per character in localStorage.
import { useGameStore } from '../store';
import { activeChar } from '../characters';
import { feedReward } from '../rewardFeed';

export const BEGGAR_NAME = 'Old Tobin';
export const BEGGAR_GIFT = 1000, BEGGAR_DAYS = 10, BEGGAR_REWARD = 60000;
interface BeggarSave { streak: number; last: number; done: boolean }
const key = (): string => `aether.beggar.${activeChar()?.id ?? 'c0'}`;
const today = (): number => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
let cache: { k: string; v: BeggarSave } | null = null;
function load(): BeggarSave {
  const k = key();
  if (cache && cache.k === k) return cache.v;
  let v: BeggarSave = { streak: 0, last: -1, done: false };
  try { const raw = JSON.parse(localStorage.getItem(k) ?? 'null'); if (raw && typeof raw === 'object') v = { streak: Number(raw.streak) || 0, last: Number(raw.last) || -1, done: !!raw.done }; } catch { /* ignore */ }
  cache = { k, v };
  return v;
}
function save(v: BeggarSave): void { cache = { k: key(), v }; try { localStorage.setItem(key(), JSON.stringify(v)); } catch { /* ignore */ } }

/** He has left town for good (npcs.ts hides him). */
export const beggarGone = (): boolean => load().done;
/** Current streak (0 when a day was missed). */
export function beggarStreak(): number { const v = load(), t = today(); return v.last === t || v.last === t - 1 ? v.streak : 0; }
export const beggarGaveToday = (): boolean => load().last === today();

/** Give today's coin: false when already given today / too poor. Returns 'done' when the 10th day pays out. */
export function donateToBeggar(): 'ok' | 'done' | 'poor' | 'today' {
  const v = load(), t = today(), st = useGameStore.getState();
  if (v.done) return 'today';
  if (v.last === t) return 'today';
  if (st.gold < BEGGAR_GIFT) return 'poor';
  useGameStore.setState({ gold: st.gold - BEGGAR_GIFT });
  const streak = v.last === t - 1 ? v.streak + 1 : 1;
  if (streak >= BEGGAR_DAYS) {
    save({ streak, last: t, done: true });
    st.addGold(BEGGAR_REWARD);
    feedReward({ gold: BEGGAR_REWARD }, true);
    return 'done';
  }
  save({ streak, last: t, done: false });
  return 'ok';
}
