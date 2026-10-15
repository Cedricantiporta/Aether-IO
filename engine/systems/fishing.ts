// ============================================================================
// Lakeside fishing (town only). At a fishing spot (engine/beachData FISH_SPOTS: the pier end + two shore spots) the
// "Fish" pill casts the line: CAST (bobber flies out) -> WAIT 2-6 s -> BITE (bobber dips, "!", ~1.1 s to hook with
// E / tap) -> REEL minigame (a marker bounces along a bar; press E / tap while it is inside the green zone; rarer fish
// need 2-3 hits, move faster and have smaller zones; 2 misses are forgiven) -> RESULT (fish in the bag as stackable
// LOOT, see loot.ts FISH_DEFS). Moving, dashing or opening a panel reels the line in.
// Per-frame state lives in world.fishing; the render layer (render/Beach.tsx) draws rod / line / bobber from it and
// ui/hud/FishingHud.tsx shows the bar. Persistent bits (rod level, catch count) are in localStorage
// 'aether-survivor-fishing-v1' (like the harvest / hermit saves), so the store contract stays untouched.
// ============================================================================
import { Vector3 } from 'three';
import { world } from '../world';
import { events } from '../events';
import { useGameStore } from '../../store';
import { FISH_SPOTS, FISH_SPOT_R } from '../beachData';
import { LOOT_BY_ID, FISH_IDS, lootItem, isFishName } from '../../loot';
import { GOLD_SCALE, RARITY_LABEL_COLOR } from '../../constants';
import type { Rarity } from '../../types';

export const FISH = { IDLE: 0, CAST: 1, WAIT: 2, BITE: 3, REEL: 4, RESULT: 5 } as const;

// ------------------------------------------------------------------ rods + save
export interface RodDef { name: string; price: number; wait: number; zone: number; luck: number; bite: number; desc: string }
/** Fishing rods (bought from the Fishmonger). wait = bite wait multiplier, zone = green-zone width multiplier,
 *  luck = rarity bonus, bite = hook window (s). */
export const RODS: RodDef[] = [
  { name: 'Willow Rod', price: 0, wait: 1, zone: 1, luck: 1, bite: 1.1, desc: 'A bent stick and some string. It works.' },
  { name: 'Oak Rod', price: 8000 * GOLD_SCALE, wait: 0.8, zone: 1.2, luck: 1.15, bite: 1.3, desc: 'Faster bites, a wider reel zone, slightly rarer fish.' },
  { name: 'Aether Rod', price: 40000 * GOLD_SCALE, wait: 0.6, zone: 1.4, luck: 1.35, bite: 1.5, desc: 'Hums over the water. The big ones notice it.' },
];
const KEY = 'aether-survivor-fishing-v1';
interface FishSave { rod: number; caught: number; log: Record<string, number> }
let save: FishSave | null = null;
function load(): FishSave {
  if (save) return save;
  save = { rod: 0, caught: 0, log: {} };
  try {
    const r = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (r) { const j = JSON.parse(r); save.rod = Math.max(0, Math.min(RODS.length - 1, Number(j.rod) || 0)); save.caught = Number(j.caught) || 0; if (j.log && typeof j.log === 'object') save.log = j.log; }
  } catch { /* ignore */ }
  return save;
}
function persist(): void { try { if (typeof localStorage !== 'undefined' && save) localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } }
/** Subscribers (the fish shop UI) are told when the rod / log changes. */
const subs = new Set<() => void>();
export function onFishSave(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
const changed = (): void => { persist(); subs.forEach((f) => f()); };
export const rodLevel = (): number => load().rod;
export const fishCaught = (): number => load().caught;
export const fishLog = (id: string): number => load().log[id] ?? 0;

/** Buys the next rod (gold). Returns true on success. */
export function buyRod(): boolean {
  const s = load(), st = useGameStore.getState(), next = RODS[s.rod + 1];
  if (!next) return false;
  if (st.gold < next.price) { st.addNotification('Not enough gold for the ' + next.name + '.', '#ff8a7a', 'WARNING'); return false; }
  st.addGold(-next.price);
  s.rod++; changed();
  st.addNotification(`Bought the ${next.name}!`, '#7fd8ff', 'SYSTEM');
  return true;
}

/** Sells every fish stack in the bag (full value, like monster loot). Returns the gold gained. */
export function sellAllFish(): number {
  const st = useGameStore.getState();
  const fish = st.inventory.filter((i) => i.type === 'LOOT' && isFishName(i.name));
  if (fish.length === 0) { st.addNotification('No fish to sell.', '#ffffff', 'SYSTEM'); return 0; }
  let total = 0, count = 0;
  for (const i of fish) { const q = i.quantity || 1; total += i.price * q; count += q; }
  useGameStore.setState({ gold: st.gold + total, inventory: st.inventory.filter((i) => !fish.includes(i)) });
  st.addQuestProgress('SELL_LOOT', count);
  events.emit('hub', { kind: 'sell_fish', n: count });
  st.addNotification(`Sold ${count} fish for ${total.toLocaleString()}G`, 'yellow', 'SYSTEM');
  return total;
}

// ------------------------------------------------------------------ fish table
/** Rarity weights of a bite (luck shifts toward rarer fish like loot.rollLoot). */
const RW: Record<Rarity, number> = { COMMON: 66, RARE: 24, EPIC: 8, LEGENDARY: 1.7, MYTHIC: 0.25 };
const R_ORDER: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/** Species weight inside its rarity (the boot is a rarer "common"). */
const SPECIES_W: Record<string, number> = { fish_boot: 0.45, fish_minnow: 1.2, fish_perch: 1, fish_trout: 1.1, fish_pike: 0.9 };
/** Reel minigame per rarity: marker speed (bar widths / s), zone width (0..1), hits needed. */
const REEL: Record<Rarity, { speed: number; zone: number; need: number }> = {
  // (owner: the rarer the fish the narrower the target - the rarest ones are a sliver)
  COMMON: { speed: 0.85, zone: 0.34, need: 1 }, RARE: { speed: 1.15, zone: 0.22, need: 2 }, EPIC: { speed: 1.45, zone: 0.13, need: 2 },
  LEGENDARY: { speed: 1.75, zone: 0.075, need: 3 }, MYTHIC: { speed: 2.1, zone: 0.045, need: 3 },
};
export function rollFish(luck: number): string {
  let total = 0;
  for (let i = 0; i < R_ORDER.length; i++) total += RW[R_ORDER[i]] * Math.pow(luck, i);
  let r = Math.random() * total, rar: Rarity = 'COMMON';
  for (let i = 0; i < R_ORDER.length; i++) { r -= RW[R_ORDER[i]] * Math.pow(luck, i); if (r <= 0) { rar = R_ORDER[i]; break; } }
  const ids = FISH_IDS.filter((id) => LOOT_BY_ID[id].rarity === rar);
  let wt = 0; for (const id of ids) wt += SPECIES_W[id] ?? 1;
  let q = Math.random() * wt;
  for (const id of ids) { q -= SPECIES_W[id] ?? 1; if (q <= 0) return id; }
  return ids[0];
}

// ------------------------------------------------------------------ flow
const F = world.fishing;
const _pos = new Vector3();
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
function setState(s: number, dur: number): void { F.state = s; F.t = 0; F.dur = dur; F.ver++; }

/** Nearest fishing spot within reach of (x, z), or -1. */
export function fishSpotNear(x: number, z: number): number {
  let best = -1, bd = FISH_SPOT_R * FISH_SPOT_R;
  for (let i = 0; i < FISH_SPOTS.length; i++) { const s = FISH_SPOTS[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
export const fishingActive = (): boolean => F.state !== FISH.IDLE;

/** Casts the line from spot `i` (the "Fish" pill / E). */
export function startFishing(i: number): void {
  const s = FISH_SPOTS[i], p = world.player; if (!s) return;
  if (world.village.area !== 'TOWN') return;
  F.spot = i; F.fish = ''; F.ok = false; F.hits = 0; F.misses = 0; F.flash = 0;
  F.sx = p.pos.x; F.sz = p.pos.z;
  const side = rnd(-1.4, 1.4);
  F.bx = s.x + s.dx * s.dist - s.dz * side; F.bz = s.z + s.dz * s.dist + s.dx * side;
  p.facing = Math.atan2(F.bx - p.pos.x, F.bz - p.pos.z);
  p.vel.x = p.vel.z = 0; p.anim.castT = 1;
  world.village.go.on = false;
  setState(FISH.CAST, 0.6);
  events.emit('fishing', { kind: 'cast' });
}
/** Reels the line in (no fish). */
export function stopFishing(msg = ''): void {
  if (F.state === FISH.IDLE) return;
  setState(FISH.IDLE, 0); F.spot = -1;
  if (msg) useGameStore.getState().addNotification(msg, '#cfe6ff', 'SYSTEM');
}
function escape(msg: string): void {
  F.fish = ''; F.ok = false; setState(FISH.RESULT, 1.6);
  events.emit('fishing', { kind: 'escape' });
  _pos.set(F.bx, 0.6, F.bz); events.emit('floatText', { pos: _pos, text: msg, color: 0xcfe6ff, scale: 0.9 });
}
function newZone(): void {
  // the next green zone appears away from the marker
  for (let k = 0; k < 6; k++) { const c = rnd(0.12 + F.zoneW / 2, 0.88 - F.zoneW / 2); F.zoneC = c; if (Math.abs(c - F.marker) > 0.28) break; }
}
function catchFish(): void {
  const st = useGameStore.getState(), def = LOOT_BY_ID[F.fish], p = world.player;
  if (!def) { escape('It got away...'); return; }
  const item = lootItem(def);
  if (!st.canPickUp(item)) { useGameStore.getState().addNotification('Your bag is full! The fish slips back into the lake.', '#ff8a7a', 'WARNING'); escape('Bag full'); return; }
  st.addItemToInventory(item);
  F.ok = true; setState(FISH.RESULT, 2.0);
  const sv = load(); sv.caught++; sv.log[def.id] = (sv.log[def.id] ?? 0) + 1; changed();
  _pos.set(p.pos.x, p.pos.y, p.pos.z);
  events.emit('pickup', { pos: _pos, kind: 'ITEM', value: 1, rarity: def.rarity, name: def.name });
  events.emit('fishing', { kind: 'catch' });
  events.emit('hub', { kind: 'catch_fish', n: 1 });   // (the fishing tutorial)
  st.addNotification(`Caught a ${def.name}!`, RARITY_LABEL_COLOR[def.rarity] ?? '#ffffff', 'SYSTEM');
}

/** E / tap while fishing. */
export function fishAction(): void {
  const rod = RODS[load().rod];
  switch (F.state) {
    case FISH.WAIT: stopFishing('You reel in the line.'); break;
    case FISH.BITE: {
      const s = FISH_SPOTS[F.spot];
      F.fish = rollFish((s ? s.luck : 1) * rod.luck);
      const r = REEL[LOOT_BY_ID[F.fish].rarity];
      F.need = r.need; F.speed = r.speed; F.zoneW = Math.min(0.6, r.zone * rod.zone); F.hits = 0; F.misses = 0; F.maxMiss = 2;
      F.marker = 0; F.dir = 1; newZone(); F.flash = 1;
      setState(FISH.REEL, 14);
      events.emit('fishing', { kind: 'hit' });
      break;
    }
    case FISH.REEL: {
      F.ver++;   // (HUD redraws the pips)
      if (Math.abs(F.marker - F.zoneC) <= F.zoneW / 2) {
        F.hits++; F.flash = 1;
        if (F.hits >= F.need) { catchFish(); return; }
        events.emit('fishing', { kind: 'hit' });
        F.zoneW *= 0.9; F.speed *= 1.1; newZone();
      } else {
        F.misses++; F.flash = -1;
        events.emit('fishing', { kind: 'miss' });
        if (F.misses > F.maxMiss) escape('It got away...');
      }
      break;
    }
    case FISH.RESULT: if (F.t > 0.5 && F.spot >= 0) startFishing(F.spot); break;
    default: break;
  }
}

/** Per village frame (before the pills). Handles E, cancels on movement / panels, runs the timers. Allocation-free. */
export function updateFishing(dt: number): void {
  if (F.state === FISH.IDLE) return;
  const p = world.player, inp = world.input, k = inp.keys, st = useGameStore.getState();
  F.flash = F.flash > 0 ? Math.max(0, F.flash - dt * 3) : Math.min(0, F.flash + dt * 3);
  const moving = k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight
    || (inp.joy.active && inp.joy.x * inp.joy.x + inp.joy.z * inp.joy.z > 0.09) || p.dashT > 0 || world.village.go.on;
  if (moving || (p.pos.x - F.sx) ** 2 + (p.pos.z - F.sz) ** 2 > 4 || world.village.area !== 'TOWN') { stopFishing(F.state === FISH.RESULT ? '' : 'You reel in the line.'); return; }
  if (st.isShopOpen || st.isInventoryOpen || st.isCharacterSheetOpen) { stopFishing(); return; }
  p.vel.x = p.vel.z = 0;
  if (inp.pressed.KeyE) fishAction();
  if (F.state === FISH.IDLE) return;
  F.t += dt;
  const rod = RODS[load().rod];
  switch (F.state) {
    case FISH.CAST:
      if (F.t >= F.dur) { setState(FISH.WAIT, Math.max(1.2, rnd(2, 6) * rod.wait)); events.emit('fishing', { kind: 'splash' }); }
      break;
    case FISH.WAIT:
      if (F.t >= F.dur) {
        setState(FISH.BITE, rod.bite);
        events.emit('fishing', { kind: 'bite' });
        _pos.set(F.bx, 1.2, F.bz); events.emit('floatText', { pos: _pos, text: '!', color: 0xffd24a, scale: 1.8 });
      }
      break;
    case FISH.BITE:
      if (F.t >= F.dur) escape('Too slow!');
      break;
    case FISH.REEL: {
      F.marker += F.dir * F.speed * dt;
      if (F.marker >= 1) { F.marker = 1; F.dir = -1; } else if (F.marker <= 0) { F.marker = 0; F.dir = 1; }
      if (F.t >= F.dur) escape('The line snapped!');
      break;
    }
    case FISH.RESULT:
      if (F.t >= F.dur) { setState(FISH.IDLE, 0); }
      break;
  }
}
