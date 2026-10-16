// ============================================================================
// Daily & weekly goals: template pool, period keys (local calendar day / ISO week), deterministic rolling.
// Pure data + helpers (no store import, so storeTypes / store can use the types without a cycle).
// Gold rewards are written in "base" gold and multiplied by GOLD_SCALE here (same rule as every other gold payout).
// ============================================================================
import { GOLD_SCALE } from './constants';

/** Lifetime / period counters fed by engine events and store actions (see goalsTracker.ts). */
export type StatKey = 'kills' | 'elites' | 'bosses' | 'rooms' | 'harvest' | 'spent' | 'upgrades' | 'summons' | 'quests' | 'flawless'
  | 'trapKills' | 'barrelKills' | 'slamKills' | 'hazardKills';   // (environmental kills: achievements)

export interface GoalReward { gems?: number; gold?: number; shards?: number; crystals?: number }
export interface GoalInst { id: string; stat: StatKey; target: number; progress: number; claimed: boolean; reward: GoalReward }

export interface MetaState {
  day: string; week: string;
  daily: GoalInst[]; weekly: GoalInst[];
  dailyBonus: boolean; weeklyBonus: boolean;       // bonus chest claimed
  stats: Record<StatKey, number>;                  // lifetime counters
  bossBiomes: number[];                            // biome indices (0..5) whose boss was beaten
  unlocked: string[]; claimed: string[];           // achievement ids
  title: string | null;                            // equipped title (an achievement id)
}

export const STAT_KEYS: StatKey[] = ['kills', 'elites', 'bosses', 'rooms', 'harvest', 'spent', 'upgrades', 'summons', 'quests', 'flawless', 'trapKills', 'barrelKills', 'slamKills', 'hazardKills'];
export const emptyStats = (): Record<StatKey, number> => ({ kills: 0, elites: 0, bosses: 0, rooms: 0, harvest: 0, spent: 0, upgrades: 0, summons: 0, quests: 0, flawless: 0, trapKills: 0, barrelKills: 0, slamKills: 0, hazardKills: 0 });

export const DAILY_BONUS_GEMS = 60;
export const WEEKLY_BONUS: GoalReward = { gems: 400, crystals: 30 };
/** Aether Crystals (the summon currency) in the daily bonus chest; every goal pays some too (owner). */
export const DAILY_BONUS_CRYSTALS = 5;
/** Aether Crystals per achievement (by its gem reward). */
export const achCrystals = (gems: number): number => Math.max(2, Math.round(gems / 10));

// (the 'spent' goal lists base gold below; the real target is x GOLD_SCALE, and its text shows the real number)
interface Template { stat: StatKey; text: (n: number) => string; daily: number[]; weekly: number[] }
export const GOAL_POOL: Template[] = [
  { stat: 'kills', text: (n) => `Defeat ${n} enemies`, daily: [60, 100, 150], weekly: [600, 900, 1200] },
  { stat: 'elites', text: (n) => `Defeat ${n} elite enemies`, daily: [3, 5, 8], weekly: [25, 40, 60] },
  { stat: 'rooms', text: (n) => `Clear ${n} rooms`, daily: [5, 8, 12], weekly: [40, 60, 90] },
  { stat: 'bosses', text: (n) => (n === 1 ? 'Defeat a boss' : `Defeat ${n} bosses`), daily: [1], weekly: [4, 6, 8] },
  { stat: 'harvest', text: (n) => `Harvest ${n} crystals or ore veins`, daily: [6, 10, 15], weekly: [50, 80, 120] },
  { stat: 'spent', text: (n) => `Spend ${n.toLocaleString()} gold`, daily: [3000, 5000, 8000], weekly: [30000, 50000, 80000] },
  { stat: 'upgrades', text: (n) => (n === 1 ? 'Upgrade an item at the Blacksmith' : `Upgrade items at the Blacksmith ${n} times`), daily: [1, 2], weekly: [6, 10, 15] },
  { stat: 'summons', text: (n) => `Summon ${n} time${n > 1 ? 's' : ''}`, daily: [3, 5, 10], weekly: [30, 50, 80] },
  { stat: 'quests', text: (n) => (n === 1 ? 'Complete a quest' : `Complete ${n} quests`), daily: [1, 2], weekly: [6, 10, 14] },
  { stat: 'flawless', text: (n) => (n === 1 ? 'Clear a room without taking damage' : `Clear ${n} rooms without taking damage`), daily: [1, 2], weekly: [5, 8, 12] },
];
const TPL = Object.fromEntries(GOAL_POOL.map((t) => [t.stat, t])) as Record<StatKey, Template>;
export const goalText = (g: GoalInst): string => TPL[g.stat].text(g.target);

// ---------------------------------------------------------------- periods --
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** ISO-8601 week key of the local calendar date, e.g. "2026-W42". */
export const weekKey = (d: Date = new Date()): string => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);                       // Thursday of this ISO week decides the year
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${pad(w)}`;
};
/** ms until the next local midnight. */
export const msToNextDay = (now: Date = new Date()): number => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
/** ms until the next local Monday 00:00 (the start of the next ISO week). */
export const msToNextWeek = (now: Date = new Date()): number => {
  const dow = (now.getDay() + 6) % 7;                            // Mon = 0
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - dow)).getTime() - now.getTime();
};
export const fmtDuration = (ms: number): string => {
  const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d > 0 ? `${d}d ${h}h` : `${h}h ${pad(mm)}m`;
};

// ------------------------------------------------------------------ rolling --
const hashSeed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** 3 distinct goals for a period; deterministic for a given key so a reload never rerolls. */
export function rollGoals(weekly: boolean, key: string): GoalInst[] {
  const rnd = mulberry(hashSeed((weekly ? 'w:' : 'd:') + key));
  const pool = GOAL_POOL.slice();
  const out: GoalInst[] = [];
  for (let i = 0; i < 3; i++) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const opts = weekly ? t.weekly : t.daily;
    const target = opts[Math.floor(rnd() * opts.length)] * (t.stat === 'spent' ? GOLD_SCALE : 1);   // 'spent' counts real (scaled) gold
    let reward: GoalReward;
    if (!weekly) reward = { gems: 20 + 5 * Math.floor(rnd() * 5) };                                   // 20..40
    else {
      const k = rnd();
      reward = k < 0.5 ? { gems: 150 + 25 * Math.floor(rnd() * 7) }                                   // 150..300
        : k < 0.8 ? { gold: (2000 + 500 * Math.floor(rnd() * 5)) * GOLD_SCALE }                      // 20k..40k gold (scaled)
          : { shards: 100 + 50 * Math.floor(rnd() * 5) };                                            // 100..300 common shards
    }
    reward.crystals = weekly ? 10 + 5 * Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3);   // daily 2..4, weekly 10..20
    out.push({ id: `${weekly ? 'w' : 'd'}${i}`, stat: t.stat, target, progress: 0, claimed: false, reward });
  }
  return out;
}

export const rewardText = (r: GoalReward): string => [r.crystals ? `${r.crystals} Aether Crystals` : '', r.gems ? `${r.gems} gems` : '', r.gold ? `${r.gold.toLocaleString()} gold` : '', r.shards ? `${r.shards} shards` : ''].filter(Boolean).join(' + ');

// ------------------------------------------------------------- persistence --
export const freshMeta = (now: Date = new Date()): MetaState => {
  const day = dayKey(now), week = weekKey(now);
  return { day, week, daily: rollGoals(false, day), weekly: rollGoals(true, week), dailyBonus: false, weeklyBonus: false, stats: emptyStats(), bossBiomes: [], unlocked: [], claimed: [], title: null };
};

const strs = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
const nn = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? Math.max(0, v) : 0);
const goals = (a: unknown): GoalInst[] | null => {
  if (!Array.isArray(a) || a.length !== 3) return null;
  const out: GoalInst[] = [];
  for (const g of a) {
    if (!g || typeof g !== 'object' || !STAT_KEYS.includes((g as GoalInst).stat) || !(nn((g as GoalInst).target) > 0)) return null;
    const x = g as GoalInst, r = (x.reward ?? {}) as GoalReward;
    out.push({ id: String(x.id), stat: x.stat, target: nn(x.target), progress: Math.min(nn(x.progress), nn(x.target)), claimed: !!x.claimed, reward: { gems: nn(r.gems) || undefined, gold: nn(r.gold) || undefined, shards: nn(r.shards) || undefined, crystals: nn(r.crystals) || (x.id?.[0] === 'w' ? 10 : 2) } });
  }
  return out;
};

/** Validates a saved meta block and rolls new goals if the day / week changed since it was saved. */
export function sanitizeMeta(m: unknown, now: Date = new Date()): MetaState {
  const f = freshMeta(now);
  if (!m || typeof m !== 'object') return f;
  const o = m as Partial<MetaState>;
  const st = emptyStats();
  for (const k of STAT_KEYS) st[k] = nn(o.stats?.[k]);
  const out: MetaState = {
    ...f, stats: st,
    bossBiomes: Array.isArray(o.bossBiomes) ? o.bossBiomes.filter((x) => typeof x === 'number' && x >= 0 && x < 7) : [],
    unlocked: strs(o.unlocked), claimed: strs(o.claimed), title: typeof o.title === 'string' ? o.title : null,
  };
  const d = goals(o.daily), w = goals(o.weekly);
  if (o.day === f.day && d) { out.daily = d; out.dailyBonus = !!o.dailyBonus; }
  if (o.week === f.week && w) { out.weekly = w; out.weeklyBonus = !!o.weeklyBonus; }
  return out;
}

/** Rolls fresh goals when the calendar day / ISO week changed. Returns the same object when nothing changed. */
export function rollPeriods(m: MetaState, now: Date = new Date()): MetaState {
  const day = dayKey(now), week = weekKey(now);
  if (m.day === day && m.week === week) return m;
  const n = { ...m };
  if (m.day !== day) { n.day = day; n.daily = rollGoals(false, day); n.dailyBonus = false; }
  if (m.week !== week) { n.week = week; n.weekly = rollGoals(true, week); n.weeklyBonus = false; }
  return n;
}

export const goalClaimable = (g: GoalInst): boolean => !g.claimed && g.progress >= g.target;
export const allClaimed = (gs: GoalInst[]): boolean => gs.every((g) => g.claimed);
