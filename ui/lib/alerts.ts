// Red-dot alerts for the quick menu: better equippable gear (Bag), new Codex entries or claimable rewards (Codex),
// unspent skill points (Skills). "Seen" state is per device (localStorage) and cleared when the panel is opened.
import { create } from 'zustand';
import { useGameStore, calculateItemCP, RANK_REQ, questFree } from '../../store';
import { SKILLS_INFO } from '../../constants';
import { activeDefs, dashKey, isDashKey } from '../../abilityDefs';
import { unlockLevel, skillCost, DASH_UNLOCK_LV } from '../../classLevels';
import { RECIPES, canCraft } from '../../crafting';
import type { HeroClass, Item, ItemType } from '../../types';
import { canUseClass } from '../../itemClass';
import type { Equipment } from '../../storeTypes';
import { CODEX_KEYS, type CodexTab } from '../../codexData';
import { allocBlock, talentPointsTotal, talentsOf, talentsSpent } from '../../talents';
import { allClaimed, goalClaimable } from '../../goals';

const KEY = 'aether-survivor-seen-v1';
interface Seen { items: string[]; codex: number }
const load = (): Seen => { try { const r = localStorage.getItem(KEY); if (r) { const s = JSON.parse(r); return { items: Array.isArray(s.items) ? s.items : [], codex: Number(s.codex) || 0 }; } } catch { /* ignore */ } return { items: [], codex: -1 }; };
const save = (s: Seen) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

export const useSeen = create<Seen & { markBag: () => void; markCodex: () => void }>((set, get) => ({
  ...load(),
  markBag: () => { const items = useGameStore.getState().inventory.map((i) => i.id); const n = { items, codex: get().codex }; save(n); set(n); },
  markCodex: () => { const n = { items: get().items, codex: codexCount() }; save(n); set(n); },
}));

const codexCount = (): number => { const d = useGameStore.getState().discovered as unknown as Record<string, string[]>; let n = 0; for (const k in d) n += d[k]?.length ?? 0; return n; };
// first launch: everything already owned / discovered counts as seen
if (useSeen.getState().codex < 0) { useSeen.getState().markBag(); useSeen.getState().markCodex(); }

const SLOT: [keyof Equipment, ItemType][] = [['weapon', 'WEAPON'], ['helmet', 'HELMET'], ['armor', 'ARMOR'], ['gloves', 'GLOVES'], ['boots', 'BOOTS'], ['accessory', 'ACCESSORY'], ['pet', 'PET']];
/** Any wearable bag item that beats what is equipped in its slot. */
export function hasBetterGear(inv: Item[], eq: Equipment, hero: string, rank: number): boolean {
  for (const [slot, type] of SLOT) {
    const cur = eq[slot] as Item | null; const cp = cur ? calculateItemCP(cur) : -1;
    for (const i of inv) if (i.type === type && rank >= RANK_REQ[i.rarity] && canUseClass(i, hero as HeroClass) && calculateItemCP(i) > cp) return true;
  }
  return false;
}

/** Ids of bag items that beat what is equipped in their slot (usable by this hero at this level): red dot on the item + its tab. */
export function betterGearIds(inv: Item[], eq: Equipment, hero: string, rank: number): Set<string> {
  const out = new Set<string>();
  for (const [slot, type] of SLOT) {
    const cur = eq[slot] as Item | null; const cp = cur ? calculateItemCP(cur) : -1;
    for (const i of inv) if (i.type === type && rank >= RANK_REQ[i.rarity] && canUseClass(i, hero as HeroClass) && calculateItemCP(i) > cp) out.add(i.id);
  }
  return out;
}

/** Bag dot: equippable gear better than what is worn, or newly looted / rewarded items not looked at yet. */
export function useBagAlert(): boolean {
  return useGameStore((s) => s.inventory.some((i) => i.isNew) || hasBetterGear(s.inventory, s.equipment, s.hero, s.heroRank));
}
export function useCodexAlert(): boolean {
  const seen = useSeen((s) => s.codex);
  return useGameStore((s) => {
    const d = s.discovered as unknown as Record<string, string[]>; let n = 0; for (const k in d) n += d[k]?.length ?? 0;
    if (n > seen) return true;
    return (Object.keys(CODEX_KEYS) as CodexTab[]).some((t) => !s.codexClaimed.includes(t) && CODEX_KEYS[t].length > 0 && CODEX_KEYS[t].every((k) => (d[t] ?? []).includes(k)));
  });
}
/** Unspent run skill points / permanent talent points (the dot stays until they are spent). */
/** Something the Skill Trainer can teach right now: an unlocked skill below max whose SP cost is affordable (owner: no dot
 *  when the points don't cover any lesson). */
/** `kind` narrows it to the Skill Trainer's Active / Passive tab (owner: red dots on those tabs too). */
export function canTrainSkill(s: ReturnType<typeof useGameStore.getState>, kind?: 'ACTIVE' | 'PASSIVE'): boolean {
  if (questFree(s, 'train') && kind !== 'PASSIVE') return true;
  if (s.skillPoints <= 0) return false;
  const h = s.hero, act: string[] = [...activeDefs(h).map((a) => a.slot), dashKey(h), 'ult'],
    pas: string[] = Object.entries(SKILLS_INFO).filter(([k, i]: [string, any]) => i.type === 'PASSIVE' && k !== 'dash' && (!i.classType || i.classType === h)).map(([k]) => k);
  const keys = kind === 'ACTIVE' ? act : kind === 'PASSIVE' ? pas : [...act, ...pas];
  return keys.some((k) => {
    const lvl = (s.skillLevels as any)[k] ?? 0;
    if (lvl >= 5 || (lvl === 0 && s.level < unlockLevel(h, k)) || (isDashKey(h, k) && s.level < DASH_UNLOCK_LV)) return false;
    return s.skillPoints >= skillCost(k, lvl, isDashKey(h, k));
  });
}
export function canBuyTalent(s: ReturnType<typeof useGameStore.getState>): boolean {
  const ranks = s.talents[s.hero], free = talentPointsTotal(s.heroRank) - talentsSpent(ranks);
  return free > 0 && talentsOf(s.hero).some((n) => allocBlock(n, ranks, free, s.heroRank) === null);
}
/** Any Workshop recipe the hero can forge right now (owner: red dot on the Blacksmith and on the recipe). */
export function canCraftAny(s: ReturnType<typeof useGameStore.getState>): boolean {
  const st = { materials: s.materials, gold: s.gold, inventory: s.inventory, heroRank: s.heroRank, maxInventorySlots: s.maxInventorySlots };
  for (const k in RECIPES) { const r = RECIPES[k]; if (r.hero === s.hero && canCraft(st, r).length === 0) return true; }
  return false;
}
export const useRunSkillAlert = (): boolean => useGameStore(canTrainSkill);
export const useTalentAlert = (): boolean => useGameStore(canBuyTalent);   // only when something can actually be bought
export const useCraftAlert = (): boolean => useGameStore(canCraftAny);
export const useSkillAlert = (): boolean => { const a = useRunSkillAlert(), b = useTalentAlert(); return a || b; };
/** Claimable goal / bonus chest / achievement reward (the dot stays until everything is claimed). */
export const useGoalsAlert = (): boolean => useGameStore((s) => {
  const m = s.meta;
  return m.daily.some(goalClaimable) || m.weekly.some(goalClaimable) || (!m.dailyBonus && allClaimed(m.daily)) || (!m.weeklyBonus && allClaimed(m.weekly))
    || m.unlocked.some((id) => !m.claimed.includes(id));
});
