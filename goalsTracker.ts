import { feedReward } from './rewardFeed';
// ============================================================================
// Goals + achievements tracker. Counts come from the typed event bus (kills, rooms, harvest, hub actions) and from
// store changes (gold spent, rank, mythic items, warehouse). Counts are BUFFERED in a module object and flushed into
// `store.meta` on discrete moments (room clear, boss, run end, hub action) or at most every FLUSH_MS - never per frame.
// Also exports the claim / equip actions used by the Goals panel. Imported once for its side effects (ui/GameUI.tsx).
// ============================================================================
import { useGameStore } from './store';
import { events } from './engine/events';
import { useUiStore } from './ui/uiStore';
import { COLORS } from './constants';
import { BIOMES } from './engine/roomDefs';
import {
  rollPeriods, STAT_KEYS, DAILY_BONUS_GEMS, WEEKLY_BONUS, allClaimed, goalClaimable,
  type MetaState, type StatKey, type GoalInst, type GoalReward,
} from './goals';
import { ACHIEVEMENTS, ACH_BY_ID, titleOf, type AchCtx } from './achievements';

const FLUSH_MS = 6000;
const buf: Record<StatKey, number> = { kills: 0, elites: 0, bosses: 0, rooms: 0, harvest: 0, spent: 0, upgrades: 0, summons: 0, quests: 0, flawless: 0 };
let bufBiomes: number[] = [];
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let hitThisRoom = false;

const add = (k: StatKey, n = 1): void => { buf[k] += n; dirty = true; if (!timer) timer = setTimeout(flush, FLUSH_MS); };
const reset = (): void => { for (const k of STAT_KEYS) buf[k] = 0; bufBiomes = []; dirty = false; };

const bump = (gs: GoalInst[], buffered: Record<StatKey, number>): GoalInst[] => {
  let changed = false;
  const out = gs.map((g) => {
    const n = buffered[g.stat];
    if (!n || g.progress >= g.target) return g;
    changed = true;
    return { ...g, progress: Math.min(g.target, g.progress + n) };
  });
  return changed ? out : gs;
};

const hasMythic = (s: ReturnType<typeof useGameStore.getState>): boolean => {
  for (const i of s.inventory) if (i.rarity === 'MYTHIC') return true;
  for (const i of s.warehouse) if (i.rarity === 'MYTHIC') return true;
  for (const i of Object.values(s.equipment)) if (i && (i as { rarity: string }).rarity === 'MYTHIC') return true;
  return false;
};

/** Merges buffered counts into store.meta, rolls day / week goals, and unlocks achievements. Safe to call any time. */
export function flush(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const s = useGameStore.getState();
  let m: MetaState = rollPeriods(s.meta);
  if (dirty) {
    const stats = { ...m.stats };
    for (const k of STAT_KEYS) stats[k] += buf[k];
    const bossBiomes = bufBiomes.length ? Array.from(new Set([...m.bossBiomes, ...bufBiomes])) : m.bossBiomes;
    m = { ...m, stats, bossBiomes, daily: bump(m.daily, buf), weekly: bump(m.weekly, buf) };
    reset();
  }
  // achievements
  const ctx: AchCtx = { meta: m, rank: s.heroRank, mythic: hasMythic(s), warehouse: s.warehouse.length };
  const fresh = ACHIEVEMENTS.filter((a) => !m.unlocked.includes(a.id) && a.value(ctx) >= a.target);
  if (fresh.length) m = { ...m, unlocked: [...m.unlocked, ...fresh.map((a) => a.id)] };
  if (m !== s.meta) useGameStore.setState({ meta: m });
  for (const a of fresh) {
    s.addNotification(`Achievement: ${a.name}${a.title ? `  -  title "${a.title}"` : ''}`, COLORS.uiAccent, 'SYSTEM', { label: 'View', onClick: () => useUiStore.getState().openGoals(true) });
  }
}

// ------------------------------------------------------------------ feeds --
events.on('enemyDeath', (e) => { if (e.poof) return; add('kills'); if (e.elite) add('elites'); if (e.boss) add('bosses'); });
events.on('crateBreak', (e) => { if (e.kind === 'CRYSTAL' || e.kind === 'ORE') add('harvest'); });
events.on('playerHit', () => { hitThisRoom = true; });
events.on('roomEnter', () => { hitThisRoom = false; });
events.on('runStart', () => { hitThisRoom = false; });
events.on('waveClear', () => { add('rooms'); if (!hitThisRoom) add('flawless'); flush(); });
events.on('biomeClear', (e) => { bufBiomes.push(e.biome % BIOMES.length); flush(); });
events.on('runEnd', flush);
events.on('hub', (e) => {
  if (e.kind === 'summon') add('summons', e.n);
  else if (e.kind === 'upgrade') add('upgrades', e.n);
  else if (e.kind === 'quest') add('quests', e.n);
  else return;
  flush();
});

// gold spent (any gold drop that is not a warehouse deposit), rank / mythic / warehouse achievements
let evalTimer: ReturnType<typeof setTimeout> | null = null;
useGameStore.subscribe((s, prev) => {
  if (s.meta !== prev.meta && s.meta.unlocked.length < prev.meta.unlocked.length) { reset(); return; }   // profile reset
  if (s.gold < prev.gold && s.warehouseGold === prev.warehouseGold && s.meta === prev.meta) add('spent', prev.gold - s.gold);
  if ((s.heroRank !== prev.heroRank || s.inventory !== prev.inventory || s.warehouse !== prev.warehouse || s.equipment !== prev.equipment) && !evalTimer) {
    evalTimer = setTimeout(() => { evalTimer = null; flush(); }, 800);
  }
});
if (typeof window !== 'undefined') {
  setInterval(flush, 30000);                                   // day / week rollover while the game stays open
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => { flush(); });
}
setTimeout(flush, 0);   // roll an expired day / week at startup and unlock anything already earned

// ------------------------------------------------------------ claim actions --
const notify = (msg: string) => useGameStore.getState().addNotification(msg, COLORS.uiAccent, 'SYSTEM');
const pay = (r: GoalReward): void => {
  const s = useGameStore.getState();
  useGameStore.setState({
    gems: s.gems + (r.gems ?? 0), gold: s.gold + (r.gold ?? 0),
    materials: r.shards ? { ...s.materials, COMMON: s.materials.COMMON + r.shards } : s.materials,
  });
  feedReward({ gold: r.gold, gems: r.gems, shards: r.shards });
};
const rewardMsg = (r: GoalReward): string => [r.gems ? `+${r.gems} gems` : '', r.gold ? `+${r.gold.toLocaleString()} gold` : '', r.shards ? `+${r.shards} shards` : ''].filter(Boolean).join('  ');

export function claimGoal(weekly: boolean, id: string): boolean {
  flush();
  const s = useGameStore.getState(), m = s.meta, list = weekly ? m.weekly : m.daily;
  const g = list.find((x) => x.id === id);
  if (!g || !goalClaimable(g)) return false;
  const next = list.map((x) => (x.id === id ? { ...x, claimed: true } : x));
  pay(g.reward);
  useGameStore.setState({ meta: weekly ? { ...m, weekly: next } : { ...m, daily: next } });
  notify(`Goal complete! ${rewardMsg(g.reward)}`);
  return true;
}
export const bonusReady = (m: MetaState, weekly: boolean): boolean => (weekly ? !m.weeklyBonus && allClaimed(m.weekly) : !m.dailyBonus && allClaimed(m.daily));
export function claimBonus(weekly: boolean): boolean {
  const s = useGameStore.getState(), m = s.meta;
  if (!bonusReady(m, weekly)) return false;
  const r: GoalReward = weekly ? WEEKLY_BONUS : { gems: DAILY_BONUS_GEMS };
  pay(r);
  useGameStore.setState({ meta: weekly ? { ...m, weeklyBonus: true } : { ...m, dailyBonus: true } });
  notify(`${weekly ? 'Weekly' : 'Daily'} bonus chest! ${rewardMsg(r)}`);
  return true;
}
export function claimAchievement(id: string): boolean {
  const s = useGameStore.getState(), m = s.meta, a = ACH_BY_ID[id];
  if (!a || !m.unlocked.includes(id) || m.claimed.includes(id)) return false;
  pay({ gems: a.gems });
  useGameStore.setState({ meta: { ...m, claimed: [...m.claimed, id] } });
  notify(`${a.name}: +${a.gems} gems`);
  return true;
}
/** Equips the title of achievement `id` (null = no title). Only unlocked titles can be worn. */
export function equipTitle(id: string | null): void {
  const m = useGameStore.getState().meta;
  if (id !== null && (!m.unlocked.includes(id) || !titleOf(id))) return;
  useGameStore.setState({ meta: { ...m, title: id } });
}
