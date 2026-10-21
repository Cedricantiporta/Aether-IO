// MMO-style character slots. Each character is its own save (profile key), with a name, a class (fixed for that
// character) and an outfit tint. The index lives in localStorage; store.ts loads the ACTIVE character's profile at
// start-up, so switching characters = set active + reload the page (clean store, clean engine).
// The very first character (and any pre-slot save) uses the original profile key, so old saves become character #1.
import type { HeroClass, Item } from './types';
import { markShowcasePending } from './engine/showcase';

export interface CharEntry { id: string; name: string; hero: HeroClass; tint: string; created: number }
interface CharIndex { list: CharEntry[]; active: string }

const IDX = 'aether-survivor-chars-v1';
const BASE = 'aether-survivor-profile-v1';
const AUTOPLAY = 'aether-survivor-autoplay';
export const MAX_CHARS = 6;
/** Outfit tints (multiplied over the model's colours). */
export const TINTS: { id: string; name: string; c: string }[] = [
  { id: '#ffffff', name: 'Natural', c: '#ffffff' }, { id: '#ffb0a8', name: 'Crimson', c: '#ffb0a8' }, { id: '#a8c4ff', name: 'Azure', c: '#a8c4ff' },
  { id: '#b4f0a8', name: 'Verdant', c: '#b4f0a8' }, { id: '#d4b4ff', name: 'Violet', c: '#d4b4ff' }, { id: '#ffe2a0', name: 'Gilded', c: '#ffe2a0' },
  { id: '#9a9aa6', name: 'Shadow', c: '#9a9aa6' },
];

const HEROES: HeroClass[] = ['ARCHER', 'WIZARD', 'BARBARIAN', 'KNIGHT', 'NECROMANCER'];
const ls = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

function read(): CharIndex {
  const s = ls();
  try {
    const raw = s?.getItem(IDX);
    if (raw) {
      const r = JSON.parse(raw) as CharIndex;
      const list = Array.isArray(r.list) ? r.list.filter((c) => c && typeof c.id === 'string' && HEROES.includes(c.hero)) : [];
      return { list, active: list.some((c) => c.id === r.active) ? r.active : list[0]?.id ?? '' };
    }
    // first launch of the slot system: an existing save becomes character #1
    const old = s?.getItem(BASE);
    if (old) {
      let hero: HeroClass = 'ARCHER';
      try { const p = JSON.parse(old); if (HEROES.includes(p.hero)) hero = p.hero; } catch { /* ignore */ }
      const idx = { list: [{ id: 'c0', name: 'Guardian', hero, tint: '#ffffff', created: Date.now() }], active: 'c0' };
      write(idx);
      return idx;
    }
    // a brand-new install: lock that in now (the store is about to write a fresh save to the base key, which must
    // not be mistaken for an old save later); the first character created takes that base key
    const fresh = { list: [], active: '' };
    write(fresh);
    return fresh;
  } catch { /* ignore */ }
  return { list: [], active: '' };
}
function write(i: CharIndex): void { try { ls()?.setItem(IDX, JSON.stringify(i)); } catch { /* ignore */ } }

export const profileKeyFor = (id: string): string => (id === 'c0' || !id ? BASE : `${BASE}:${id}`);
export const characters = (): CharEntry[] => read().list;
export const activeChar = (): CharEntry | null => { const i = read(); return i.list.find((c) => c.id === i.active) ?? null; };
/** The save key store.ts loads (the active character's). */
export const activeProfileKey = (): string => profileKeyFor(read().active);

/** Saved level of a character's class (read from its profile; 1 when unknown). */
export function charLevel(c: CharEntry): number {
  try { const p = JSON.parse(ls()?.getItem(profileKeyFor(c.id)) ?? 'null'); return Math.max(1, Number(p?.classProg?.[c.hero]?.lv) || 1); } catch { return 1; }
}

/** Read-only: a character's saved equipped items (profile `equipment`; missing slots are null). Never throws. */
export type EquipSlotKey = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'accessory' | 'pet' | 'tool';
export function charEquipment(c: CharEntry): Record<EquipSlotKey, Item | null> {
  const out: Record<EquipSlotKey, Item | null> = { weapon: null, helmet: null, armor: null, gloves: null, boots: null, accessory: null, pet: null, tool: null };
  try {
    const eq = JSON.parse(ls()?.getItem(profileKeyFor(c.id)) ?? 'null')?.equipment;
    if (eq) for (const k of Object.keys(out) as EquipSlotKey[]) { const it = eq[k]; if (it && typeof it === 'object' && it.name) out[k] = it as Item; }
  } catch { /* ignore */ }
  return out;
}

/** Creates a character (becomes active) and returns it. The first one ever uses the base save key. */
export function createChar(name: string, hero: HeroClass, tint: string): CharEntry | null {
  const i = read();
  if (i.list.length >= MAX_CHARS) return null;
  const id = i.list.length === 0 ? 'c0' : `c${Date.now().toString(36)}`;
  const c: CharEntry = { id, name: name.trim().slice(0, 16) || 'Guardian', hero, tint, created: Date.now() };
  write({ list: [...i.list, c], active: id });
  markShowcasePending(id);   // (owner) the new character's first start: the fully powered showcase fight (engine/showcase.ts)
  return c;
}
export function setActiveChar(id: string): void { const i = read(); if (i.list.some((c) => c.id === id)) write({ ...i, active: id }); }
export function deleteChar(id: string): void {
  const i = read();
  const list = i.list.filter((c) => c.id !== id);
  try { ls()?.removeItem(profileKeyFor(id)); } catch { /* ignore */ }
  write({ list, active: i.active === id ? list[0]?.id ?? '' : i.active });
}
export function renameActive(name: string): void { const i = read(); write({ ...i, list: i.list.map((c) => (c.id === i.active ? { ...c, name: name.trim().slice(0, 16) || c.name } : c)) }); }

/** Reload into the game with the active character (skips the title / select screens once). */
export function enterWithReload(): void {
  try { sessionStorage.setItem(AUTOPLAY, '1'); } catch { /* ignore */ }
  location.reload();
}
/** True once after enterWithReload (consumed). */
export function takeAutoplay(): boolean {
  try { const v = sessionStorage.getItem(AUTOPLAY) === '1'; sessionStorage.removeItem(AUTOPLAY); return v; } catch { return false; }
}
