// Co-op wire protocol (pure TS, no imports from the game). Every message is a compact JSON array: [type, ...fields].
// Bump COOP_VERSION whenever a message layout / meaning changes: peers on different versions refuse each other with a clear message.
import type { HeroClass } from '../types';

export const COOP_VERSION = 1;
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
} as const;

/** POS flags */
export const F_ALIVE = 1, F_ATTACK = 2, F_DASH = 4, F_CAST = 8;

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
