// ============================================================================
// Daily Challenge ("Daily Trial"): one challenge per local calendar day, the same for every player that day.
// The date string seeds a mulberry32 RNG that picks 2-3 run modifiers, a biome, the floor sequence and the room
// layout seeds. A trial is a short tower-style climb (DAILY_FLOORS round arenas, the last one a champion) played with
// the player's current character; clearing it scores the run (floors, kills, time, damage taken x modifier bonus).
// Rewards are paid once per day (with a streak bonus); retries only chase the day's best score.
//
// Pure data + engine state (no React, no store import). The store persists progress.daily; the director reads
// `daily` / `dailyMods`; engine/systems/dailyRun.ts handles completion.
// ============================================================================
import { BIOMES } from './engine/roomDefs';
import type { RoomPlan, RoomType } from './engine/types';
import type { Rarity } from './types';
import { waves } from './endlessWaves';

export const DAILY_FLOORS = 5;

export type DailyModId = 'GLASS' | 'ELITES' | 'DRY' | 'HASTE' | 'HORDE' | 'IRONHIDE' | 'BLOOD';
export interface DailyModDef { id: DailyModId; name: string; desc: string; color: string; bonus: number }
/** `bonus`: added to the score multiplier (harder modifier = more score). */
export const DAILY_MODS: Record<DailyModId, DailyModDef> = {
  GLASS: { id: 'GLASS', name: 'Glass Cannon', desc: '+50% damage dealt, +50% damage taken', color: '#ff7a5a', bonus: 0.25 },
  ELITES: { id: 'ELITES', name: 'Elite Swarm', desc: 'Every floor is an elite floor, +1 elite each', color: '#c084fc', bonus: 0.3 },
  DRY: { id: 'DRY', name: 'Dry Flasks', desc: 'Potions cannot be used', color: '#ef5f55', bonus: 0.2 },
  HASTE: { id: 'HASTE', name: 'Haste', desc: 'You move 25% faster, monsters 20% faster', color: '#7fe0ff', bonus: 0.1 },
  HORDE: { id: 'HORDE', name: 'Horde', desc: '+50% monsters, each 20% frailer', color: '#f1c14a', bonus: 0.2 },
  IRONHIDE: { id: 'IRONHIDE', name: 'Ironhide', desc: 'Monsters have +40% health', color: '#b8c2cc', bonus: 0.2 },
  BLOOD: { id: 'BLOOD', name: 'Bloodthirst', desc: 'Healing -60%, but every kill heals 3% max HP', color: '#d9364a', bonus: 0.15 },
};
const MOD_IDS = Object.keys(DAILY_MODS) as DailyModId[];

export interface DailyDef {
  day: string;            // local date key YYYY-MM-DD
  seed: number;
  mods: DailyModId[];
  biome: number;          // BIOMES index (enemy roster + palette of the trial)
  plans: RoomPlan[];      // floor 1..DAILY_FLOORS
  finale: 'MINIBOSS' | 'DUEL';
}

// ------------------------------------------------------------------ dates ---
const pad = (n: number) => (n < 10 ? '0' : '') + n;
/** Local calendar date key, e.g. "2026-10-15". */
export function dayKey(d: Date = new Date()): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseKey(k: string): Date { const [y, m, d] = k.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
/** The day before `k`. */
export function prevDay(k: string): string { const d = parseKey(k); d.setDate(d.getDate() - 1); return dayKey(d); }
/** Seconds until the next local midnight. */
export function secondsToReset(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}

// -------------------------------------------------------------------- rng ---
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, DailyDef>();
/** The challenge of day `day` (deterministic: same day, same challenge for everyone). */
export function dailyFor(day: string = dayKey()): DailyDef {
  const hit = cache.get(day); if (hit) return hit;
  const seed = hashStr('aether-daily:' + day);
  const rnd = mulberry32(seed);
  const n = rnd() < 0.4 ? 3 : 2;
  const pool = MOD_IDS.slice(), mods: DailyModId[] = [];
  while (mods.length < n && pool.length) mods.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const biome = Math.floor(rnd() * BIOMES.length);
  const finale: DailyDef['finale'] = rnd() < 0.35 ? 'DUEL' : 'MINIBOSS';
  const elites = mods.includes('ELITES');
  const plans: RoomPlan[] = [];
  for (let f = 1; f <= DAILY_FLOORS; f++) {
    if (f === DAILY_FLOORS) { plans.push({ type: finale, reward: 'NONE' }); continue; }
    const type: RoomType = elites || f === 3 || rnd() < 0.2 ? 'ELITE' : 'COMBAT';
    const r = rnd();
    plans.push({ type, reward: r < 0.5 ? 'CARD' : r < 0.7 ? 'GOLD' : r < 0.85 ? 'SHARDS' : 'GEMS' });
  }
  const def: DailyDef = { day, seed, mods, biome, plans, finale };
  cache.set(day, def);
  return def;
}

export const dailyBiomeName = (d: DailyDef): string => BIOMES[d.biome % BIOMES.length].name;
/** Score multiplier of a day's modifiers. */
export const dailyMult = (d: DailyDef): number => 1 + d.mods.reduce((s, m) => s + DAILY_MODS[m].bonus, 0);

// ---------------------------------------------------------------- rewards ---
export interface DailyReward { gold: number; gems: number; shards: number; shardRarity: Rarity; bonusShards: number; bonusRarity: Rarity }
/** Paid on the first completion of the day. `streak` = consecutive days completed, counting today. */
export function dailyReward(streak: number): DailyReward {
  const s = Math.max(1, streak), k = 1 + 0.1 * Math.min(6, s - 1);   // +10% per streak day, up to +60% (day 7)
  const week = s % 7 === 0;                                          // every 7th day: an Epic shard on top
  return { gold: Math.round(3000 * k / 10) * 10, gems: Math.round(40 * k) + (week ? 60 : 0), shards: 3 + Math.min(3, Math.floor((s - 1) / 2)), shardRarity: 'RARE', bonusShards: week ? 1 : 0, bonusRarity: 'EPIC' };
}

// ------------------------------------------------------------------ score ---
export interface DailyResult {
  day: string; score: number; floors: number; kills: number; time: number; taken: number;   // taken = damage taken in max-HP units
  parts: { floors: number; kills: number; time: number; noHit: number; mult: number };
}
export function dailyScore(def: DailyDef, floors: number, kills: number, time: number, damageTaken: number, maxHp: number): DailyResult {
  const taken = damageTaken / Math.max(1, maxHp);
  const parts = {
    floors: floors * 1000,
    kills: kills * 20,
    time: Math.max(0, Math.round(3000 - time * 5)),        // 10 minutes = no time bonus
    noHit: Math.max(0, Math.round(2000 * (1 - taken / 5))),   // 5 full health bars of damage = no bonus
    mult: dailyMult(def),
  };
  const score = Math.round((parts.floors + parts.kills + parts.time + parts.noHit) * parts.mult);
  return { day: def.day, score, floors, kills, time, taken, parts };
}

// --------------------------------------------------------------- persisted ---
export interface DailySave { day: string; best: number; tries: number; claimed: string; lastDone: string; streak: number; bestEver: number }
export const emptyDaily = (): DailySave => ({ day: '', best: 0, tries: 0, claimed: '', lastDone: '', streak: 0, bestEver: 0 });
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function sanitizeDaily(raw: unknown): DailySave {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const k = (v: unknown) => (typeof v === 'string' && DAY_RE.test(v) ? v : '');
  return { day: k(o.day), best: n(o.best), tries: n(o.tries), claimed: k(o.claimed), lastDone: k(o.lastDone), streak: n(o.streak), bestEver: n(o.bestEver) };
}
/** Streak as shown today: broken (0) when neither today nor yesterday was completed. */
export function liveStreak(s: DailySave, today: string = dayKey()): number {
  return s.lastDone === today || s.lastDone === prevDay(today) ? s.streak : 0;
}

// ------------------------------------------------------- engine run state ---
/** The daily trial being played (on = this run is a daily; set at run start, never per frame). */
export const daily = { on: false, def: null as DailyDef | null, result: null as DailyResult | null, rewarded: false, newBest: false, endT: -1 };
/** Modifier multipliers read by combat / player / runMods (all neutral outside a daily run). */
export const dailyMods = { dealt: 1, taken: 1, heal: 1, noPotions: false, playerSpeed: 1, hp: 1, spawn: 1, enemySpeed: 1, elites: 0, killHeal: 0 };

function resetMods(): void {
  Object.assign(dailyMods, { dealt: 1, taken: 1, heal: 1, noPotions: false, playerSpeed: 1, hp: 1, spawn: 1, enemySpeed: 1, elites: 0, killHeal: 0 });
}
export function armDaily(def: DailyDef): void {
  resetMods();
  daily.on = true; daily.def = def; daily.result = null; daily.rewarded = false; daily.newBest = false; daily.endT = -1;
  const m = dailyMods;
  for (const id of def.mods) switch (id) {
    case 'GLASS': m.dealt *= 1.5; m.taken *= 1.5; break;
    case 'ELITES': m.elites += 1; break;
    case 'DRY': m.noPotions = true; break;
    case 'HASTE': m.playerSpeed *= 1.25; m.enemySpeed *= 1.2; break;
    case 'HORDE': m.spawn *= 1.5; m.hp *= 0.8; break;
    case 'IRONHIDE': m.hp *= 1.4; break;
    case 'BLOOD': m.heal *= 0.4; m.killHeal = 0.03; break;
  }
}
export function disarmDaily(): void { resetMods(); daily.on = false; daily.def = null; daily.endT = -1; }

// director hooks (only meaningful while daily.on)
export const dailyPlan = (f: number): RoomPlan => daily.def!.plans[Math.max(0, Math.min(DAILY_FLOORS - 1, f - 1))];
export const dailyBiome = (): number => daily.def!.biome;
export const dailyRoomSeed = (f: number): number => (Math.imul(daily.def!.seed ^ 0x5bd1e995, f + 1) ^ (f * 0x27d4eb2d)) >>> 0;
export const dailyDepth = (f: number): number => 3 + f * 2;
/** HUD labels for tower-style runs. */
export const climbTitle = (): string => (daily.on ? 'Daily Trial' : waves.on ? 'Endless Waves' : 'Endless Tower');
export const climbFloor = (floor: number): string => (daily.on ? `Floor ${floor}/${DAILY_FLOORS}` : waves.on ? `Wave ${floor}` : `Floor ${floor}`);
