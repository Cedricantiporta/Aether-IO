// Co-op wire protocol (pure TS, no imports from the game). Every message is a compact JSON array: [type, ...fields].
// Bump COOP_VERSION whenever a message layout / meaning changes: peers on different versions refuse each other with a clear message.
import type { HeroClass } from '../types';

export const COOP_VERSION = 3;
/** Peer ids on the broker are 'aether-' + room code. */
export const PEER_PREFIX = 'aether-';
/** Unambiguous letters only (no I / O / B / S / Z / 0 / 1 / 5 / 8 lookalikes). */
export const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY';
export const CODE_LEN = 4;

export const MSG = {
  HELLO: 0,   // [0, version, HeroSnap]            sent by both sides as soon as the link opens
  BYE: 1,     // [1, reason]                       polite close (reason shown to the other player)
  PING: 2,    // [2, sentAtMs]
  PONG: 3,    // [3, sentAtMs]                     echo of PING
  ROOM: 4,    // [4, rv, biome, index, plan, seed, first, mode]   host -> guest: enter this room (first = the run starts with it)
  LEAVING: 5, // [5, rv]                           host -> guest: the host walked into a portal (fade out)
  POS: 6,     // [6, rv, x*100, z*100, facing*100, moveBlend*100, flags, hp%]   both ways, ~16 Hz (integers)
  END: 7,     // [7]                               host -> guest: the host's run is over (back in town)
  // ---- STEP 2 (combat). Every message below starts with the room counter `rv`; a message of another room is dropped.
  SNAP: 8,    // [8, rv, seq, base64(Uint16 records)]   host -> guest, ~15 Hz: enemies, enemy shots, ids of live hostile zones (layouts in coopHost.ts / coopGuest.ts)
  META: 9,    // [9, rv, enemies[], zones[]]       host -> guest: the slow-changing half of new / changed entities (kind, max hp, scale ... / zone shape)
  EVT: 10,    // [10, rv, ev, ev, ...]             both ways: discrete FX moments, ev = [eventIdx, ...fields] (coopEvents.ts)
  DMG: 11,    // [11, rv, hits[], stats[]]         guest -> host, ~30 Hz: flat arrays, stride HIT_STRIDE / STAT_STRIDE; the guest's hits on the host's monsters
  HIT: 12,    // [12, rv, amount, pct*1000, kind, flags, kb*100, down*100, slow, tr, x*10, z*10, srcId]   host -> guest: a blow on the guest's hero (he applies his own defence)
  DEBUF: 13,  // [13, rv, type, dur*100, val*100, mode]   host -> guest: a status on the guest's hero (mode 0 normal, 1 freeze, 2 direct slow)
  KNOCK: 14,  // [14, rv, fromX*10, fromZ*10, force*100, down*100, cancel]   host -> guest: shove / knockdown
  KILL: 15,   // [15, rv, xp, gold, flags(1 elite, 2 boss), x*10, z*10]   host -> guest: a monster died, the guest earns the same XP / gold
  RST: 16,    // [16, rv, phase, wave, enemiesLeft, alive, portals[[x, z, type, reward, big, pre]]]   host -> guest: room state (on change + 1 Hz)
  BOSS: 17,   // [17, rv, active, hp, maxHp, phase, stagger*100, staggered, ability, abilityT, name, title, interrupt*100, interruptOn, interruptLabel, shield, shieldMax, final, stage, bossId]
  GP: 18,     // [18, rv, base64]                  both ways, ~15 Hz: the sender's own projectiles, drawn as harmless copies on the partner's screen
  // ---- STEP 3 (loot, cards, downed)
  REVIVE: 19, // [19, rv]                          both ways: "your friend finished reviving you" (the receiver stands up at ~30% HP)
  DROP: 20,   // [20, rv, kind, x*10, z*10, value, item]   host -> guest: the host's world dropped something; the guest gets HIS OWN copy (items are re-rolled for his class)
  REWARD: 21, // [21, rv, what, bonus]             host -> guest: a room reward only the guest's own client can open (0 = card choice, 1 = fountain)
  PZ: 22,     // [22, rv, zones[], fx[]]           both ways, ~8 Hz: the sender's own ground skill zones / falling arrows / meteors, drawn as harmless copies on the partner's screen
} as const;
/** DROP kinds (index on the wire; XP is never forwarded: kills pay both players directly) */
export const DROP_KINDS = ['GOLD', 'GEM', 'HEALTH', 'MANA', 'ITEM', 'SHARD', 'CRYSTAL'] as const;
/** how long a friend stays "there" without a position (room changes / hiccups) before a downed hero gives up waiting for him */
export const PARTNER_GRACE_MS = 8000;
/** seconds the partner must stand next to a downed hero, and the radius (u) he has to stay inside */
export const REVIVE_TIME = 3, REVIVE_RANGE = 2.6;

export const HIT_STRIDE = 11, STAT_STRIDE = 4;
/** damagePlayer kinds / DamageKind (index on the wire) */
export const DMG_KINDS = ['PHYSICAL', 'FIRE', 'ICE', 'POISON', 'MAGIC', 'LIGHTNING', 'TRUE'] as const;
/** StatusEffectType (index on the wire) */
export const STATUS_TYPES = ['SLOW', 'BURN', 'STUN', 'FREEZE', 'POISON', 'ARMOR_BREAK', 'CHILL'] as const;
/** PlayerDebuff (index on the wire) */
export const DEBUFF_TYPES = ['STUN', 'ROOT', 'SILENCE', 'DEFDOWN', 'BLIND', 'BURN', 'POISON', 'BLEED', 'SLOW'] as const;
export const ENEMY_STATES = ['SPAWN', 'CHASE', 'KITE', 'WINDUP', 'ATTACK', 'RECOVER', 'DYING'] as const;
export const ROOM_PHASES = ['FIGHT', 'CLEARED', 'LEAVING', 'BIOME_DONE'] as const;
export const EP_KINDS = ['ARROW', 'ORB', 'SLOW_ORB', 'BOSS_ORB', 'ROCK', 'FLAME', 'AXE', 'FIRE_BOLT', 'BOLT', 'ICE_SHARD', 'POISON_ARROW', 'BALLISTA', 'BIG_FLAME', 'FIRE_CRESCENT', 'DARK_CRESCENT'] as const;
export const PROJ_KINDS = ['ARROW', 'MAGIC', 'AXE', 'SLASH', 'HOLY_WAVE', 'FIREBALL', 'PIERCING_ARROW', 'BURNING_ARROW', 'FREEZING_ARROW', 'STORM', 'GIANT_AXE', 'ORBITAL_BLADE', 'PET_BOLT', 'RAIN_ARROW', 'GALE_ARROW', 'X_SLASH', 'SOUL_BOLT', 'BONE_SPEAR'] as const;
/** HIT flags */
export const HF_DOT = 1, HF_ENV = 2, HF_NODOT = 4, HF_PROJ = 8, HF_CRIT = 16;
/** DMG hit flags (guest -> host) */
export const DF_CRIT = 1, DF_DOT = 2, DF_BASIC = 4, DF_ABREAK = 8, DF_FROST = 16, DF_NOBACK = 32, DF_PLAYER = 64, DF_KNOCK = 128, DF_LAUNCH = 256;

/** POS flags */
export const F_ALIVE = 1, F_ATTACK = 2, F_DASH = 4, F_CAST = 8, F_DOWN = 16;

/** What the other player needs to draw your hero (all small). */
export interface HeroSnap {
  n: string;          // character name (<= 16)
  c: HeroClass;       // class
  t: string;          // outfit tint '#rrggbb'
  l: number;          // class level
  w: string;          // weapon rarity ('' none)
  g: string[];        // gear rarities: helmet, armor, gloves, boots, accessory ('' none)
  p: string;          // pet name ('' none)
  pr: string;         // pet rarity
}

const CLASSES: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number, d = 0): number => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Never trust the wire: rebuild a snapshot from untrusted JSON. */
export function sanitizeSnap(raw: unknown): HeroSnap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!CLASSES.includes(r.c as HeroClass)) return null;
  const g = Array.isArray(r.g) ? r.g.slice(0, 5).map((x) => str(x, 12)) : [];
  while (g.length < 5) g.push('');
  const t = str(r.t, 7);
  return { n: str(r.n, 16) || 'Friend', c: r.c as HeroClass, t: /^#[0-9a-fA-F]{6}$/.test(t) ? t : '#ffffff', l: Math.round(num(r.l, 1, 999, 1)), w: str(r.w, 12), g, p: str(r.p, 24), pr: str(r.pr, 12) };
}

const PLAN_STR = ['type', 'reward', 'obj', 'twist'] as const;
const PLAN_BOOL = ['preboss', 'epilogue', 'dream', 'shortcut'] as const;
/** The room plan crosses the wire as a plain object; keep only known fields of the right type. */
export function sanitizePlan(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k of PLAN_STR) if (r[k] !== undefined) { if (typeof r[k] !== 'string' || (r[k] as string).length > 24) return null; out[k] = r[k]; }
  for (const k of PLAN_BOOL) if (r[k]) out[k] = true;
  if (typeof out.type !== 'string' || typeof out.reward !== 'string') return null;
  if (r.gate !== undefined) out.gate = Math.round(num(r.gate, 0, 9));
  if (r.step !== undefined) out.step = Math.round(num(r.step, 0, 9));
  return out;
}

export const clampInt = (v: unknown, lo: number, hi: number, d = 0): number => Math.round(num(v, lo, hi, d));
export const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export function makeCode(rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}
/** Upper-cases, drops anything outside the alphabet; returns '' when it is not a full code. */
export function normaliseCode(raw: string): string {
  const s = raw.toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('');
  return s.length === CODE_LEN ? s : '';
}
