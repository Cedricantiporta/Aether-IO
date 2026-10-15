// ============================================================================
// Crystal cave (village area 'CAVE'): Floor 1 is the persistent hub chamber (exit to the town, the old miner Grit and his
// lantern bench, 8 veins that regrow 24 h after the last one is taken). Its stairs down stay LOCKED until every vein on the
// floor is harvested; the same rule holds on every floor below.
//
// TRIPS: going down from Floor 1 starts a trip. Floors 2+ are generated fresh for every trip (seeded sizes, twin chambers,
// lava / poison themes, rare veins, a lucky ladder under a vein on ~30% of floors), so the depth you reach varies trip to
// trip. The lantern oil is ONE timer for the whole trip: it drains on Floor 2 and below and never refills between floors
// (oil flasks lying on some floors / dropped by cave monsters add a little). Climbing the stairs you arrived by ends the
// trip safely and BANKS the haul (back to Floor 1, everything kept). Oil running out = the scene goes pitch black (~1.3 s)
// and you wake up on Floor 1 having lost the whole trip's haul (gold, shards and items gathered below Floor 1); falling to
// monsters / hazards is the same cave-in. Floor-1 harvests and anything banked earlier are never touched.
// Refills at Grit's bench: free once per day, then gold. Lantern upgrades (capacity) cost gems or shards. The deepest floor
// ever reached is the personal best (profile progress.caveBest; the lantern level is progress.caveLantern).
// Layouts / tables: engine/caveData.ts. Drawn by render/CaveInterior.tsx, HUD ui/hud/CaveHud.tsx, panel ui/panels/LanternPanel.tsx.
// ============================================================================
import { Vector3 } from 'three';
import { create } from 'zustand';
import { world, MAX_CRATES, CAM_PITCH0 } from '../world';
import {
  caveLayout, forgetCaveLayouts, CAVE_MAX_FLOOR, CAVE_GOODS, LANTERN_BASE, LANTERN_STEP, LANTERN_MAX_LV, LANTERN_COST, REFILL_PRICE, FLASK_OIL,
  FLASK_FLOOR_CHANCE, FLASK_DROP_CHANCE, HIDDEN_LADDER_CHANCE, MONSTER_FLOOR, RARE_NAME, RARE_COLOR, bonusShards, caveMonsterCount, depthOf,
  goldVeinMul, rareHardness, rareVeinChance, rollDepthRarity, rollRareTier, tradeGoodChance, veinHardness, type CaveNodeKind,
} from '../caveData';
import { CRATE_HP, HARVEST_NAME, installInterior } from '../mapgen';
import { useGameStore } from '../../store';
import { spawnPickup, petCollect } from './pickups';
import { spawnEnemy } from './enemies';
import { damagePlayer, addShake } from './combat';
import { resetNpcs, bubbles } from './npcs';
import { closeDialogue, dialogueOpen } from './dialogue';
import { LOOT_BY_ID, lootItem } from '../../loot';
import { sfxCave } from '../audio';
import type { EnemyKind } from '../types';
import { events } from '../events';
import { UNLOCK_LV } from '../../unlocks';
import { spareFlasks, takeSpareFlask, SPARE_FLASK_OIL } from './caveKit';
import type { Rarity } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const SAVE_KEY = 'aether-survivor-cave-v2';
const OLD_KEY = 'aether-survivor-cave-harvest-v1';
const RARITIES: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
/** Floor 1's veins (24 h regrow after the last one) + the lantern's oil and the day of the last free refill. */
interface CaveSave { broken: number[]; rare: number[]; clearedAt: number; oil: number; freeDay: string }
let save: CaveSave = { broken: [], rare: [], clearedAt: 0, oil: -1, freeDay: '' };
let loaded = false;
const num = (x: unknown, d = 0): number => (typeof x === 'number' && isFinite(x) ? x : d);
const today = (): string => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const F1N = caveLayout(1).nodes.length;

function load(): void {
  loaded = true;
  save = { broken: [], rare: new Array(F1N).fill(0), clearedAt: 0, oil: -1, freeDay: '' };
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(SAVE_KEY);
    const ok = (i: unknown) => typeof i === 'number' && i >= 0 && i < F1N && (i | 0) === i;
    if (raw) {
      const s = JSON.parse(raw) ?? {};
      save.broken = Array.isArray(s.broken) ? [...new Set<number>(s.broken.filter(ok))] : [];
      save.rare = Array.from({ length: F1N }, (_, i) => Math.max(0, Math.min(4, Math.floor(num(Array.isArray(s.rare) ? s.rare[i] : 0)))));
      save.clearedAt = Math.max(0, num(s.clearedAt));
      save.oil = num(s.oil, -1);
      save.freeDay = typeof s.freeDay === 'string' ? s.freeDay.slice(0, 12) : '';
    } else {
      const old = localStorage.getItem(OLD_KEY);   // v1 (single-floor cave): { broken, clearedAt }
      if (old) {
        const o = JSON.parse(old) ?? {};
        save.broken = Array.isArray(o.broken) ? [...new Set<number>(o.broken.filter(ok))] : [];
        save.clearedAt = Math.max(0, num(o.clearedAt));
        localStorage.removeItem(OLD_KEY);
      }
      persist();
    }
  } catch { /* ignore */ }
}
function persist(): void { try { if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } }

export const lanternLevel = (): number => Math.max(0, Math.min(LANTERN_MAX_LV, useGameStore.getState().progress.caveLantern ?? 0));
export const caveBest = (): number => Math.max(1, useGameStore.getState().progress.caveBest ?? 1);
export const oilMaxFor = (lv: number): number => LANTERN_BASE + LANTERN_STEP * lv;
const setProgress = (p: { caveLantern?: number; caveBest?: number }) => { const st = useGameStore.getState(); useGameStore.setState({ progress: { ...st.progress, ...p } }); };

// ------------------------------------------------------------- trip state ---
interface DeepFloor { broken: number[]; rare: number[]; ladder: number }
/** Floors of the current trip (fresh every trip). */
const deep = new Map<number, DeepFloor>();
let tripSeed = 0;
/** The hero's gold / shards / bag when the trip started (a cave-in takes back everything gained since). */
let tripSnap: { gold: number; mat: Record<Rarity, number>; inv: Map<string, number> } | null = null;
let cueT = 0;
let caveInWhy: '' | 'OIL' | 'DOWN' = '';
let hazardT = 0, poisonLeft = 0;
const v3 = new Vector3();
/** Monster slots of this floor (for oil-flask drops) + their last positions. */
const mons = new Int16Array(16).fill(-1), monX = new Float32Array(16), monZ = new Float32Array(16);

function floorState(f: number): { broken: number[]; rare: number[]; ladder: number } {
  if (f === 1) {
    if (save.clearedAt > 0 && Date.now() - save.clearedAt >= DAY_MS) {   // Floor 1 regrows (fresh rare-vein rolls)
      save.broken = []; save.clearedAt = 0;
      save.rare = Array.from({ length: F1N }, () => (Math.random() < rareVeinChance(1) ? rollRareTier(1, Math.random()) : 0));
      persist();
    }
    return { broken: save.broken, rare: save.rare, ladder: -1 };
  }
  let s = deep.get(f);
  if (!s) {
    const n = caveLayout(f, tripSeed).nodes.length;
    s = { broken: [], rare: Array.from({ length: n }, () => (Math.random() < rareVeinChance(f) ? rollRareTier(f, Math.random()) : 0)), ladder: Math.random() < HIDDEN_LADDER_CHANCE ? Math.floor(Math.random() * n) : -1 };
    deep.set(f, s);
  }
  return s;
}

/** Test / debug: force vein `i` of the current floor to a rare tier (0..4), intact again. */
export function debugSetRare(i: number, tier: number): void {
  const cv = world.village.cave, s = floorState(cv.floor), c = world.crates[i]; if (!c || i >= s.rare.length) return;
  s.rare[i] = tier; cv.rare[i] = tier; c.maxHp = c.hp = Math.round(CRATE_HP[c.kind] * veinHardness(cv.floor) * rareHardness(tier)); c.active = true;
  const k = s.broken.indexOf(i); if (k >= 0) s.broken.splice(k, 1);
  cv.left = caveLayout(cv.floor, cv.seed).nodes.length - s.broken.length;
  if (cv.floor === 1) { save.clearedAt = 0; persist(); }
  cv.ver++;
}
/** Test / debug: Floor 1 grows back now. */
export function debugRegrowFloor1(): void { if (!loaded) load(); save.broken = []; save.clearedAt = 0; persist(); }
/** Test / debug: jump straight to floor `floor` of a trip with seed `seed` (as if arriving from above). */
export function debugTrip(seed: number, floor: number): void {
  if (world.village.cave.floor === 1 || seed !== tripSeed) { deep.clear(); forgetCaveLayouts(); }
  tripSeed = seed | 0; enterFloor(Math.max(2, floor), 'ABOVE');
}
export const debugTripSeed = (): number => tripSeed;
/** Test / debug: put the lucky ladder of the current deep floor under vein `i`. */
export function debugSetLadder(i: number): void { const cv = world.village.cave; if (cv.floor < 2) return; floorState(cv.floor).ladder = i; cv.ladder = i; cv.ladderFound = false; }

function placeFloor(f: number): void {
  const cv = world.village.cave, L = caveLayout(f, cv.seed), s = floorState(f);
  for (const c of world.crates) { c.active = false; c.respawnT = 0; c.hitFlash = 0; }
  cv.rare.fill(0);
  L.nodes.forEach((n, i) => {
    if (i >= MAX_CRATES) return;
    const c = world.crates[i], tier = s.rare[i] | 0;
    c.kind = n.kind; c.pos.set(n.x, 0, n.z); c.rot = i * 1.3 + f;
    c.maxHp = c.hp = Math.round(CRATE_HP[n.kind] * veinHardness(f) * rareHardness(tier));
    c.active = s.broken.indexOf(i) === -1; c.respawnT = 0;
    cv.rare[i] = tier;
  });
  cv.ladder = s.ladder; cv.ladderFound = s.ladder >= 0 && s.broken.indexOf(s.ladder) !== -1;
  if (s.ladder >= 0) { cv.lx = L.nodes[s.ladder].x; cv.lz = L.nodes[s.ladder].z; }
  cv.left = L.nodes.length - s.broken.length;
  // an oil flask lies somewhere on some deep floors
  for (const fl of cv.flasks) fl.on = false;
  if (f > 1 && Math.random() < FLASK_FLOOR_CHANCE) {
    for (let g = 0; g < 50; g++) {
      const a = Math.random() * Math.PI * 2, r = L.radius(a) * (0.45 + Math.random() * 0.35), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (L.pools.some(([px, pz, pr]) => (x - px) ** 2 + (z - pz) ** 2 < (pr + 1) ** 2)) continue;
      dropFlask(x, z); break;
    }
  }
}
function dropFlask(x: number, z: number): void {
  for (const fl of world.village.cave.flasks) if (!fl.on) { fl.on = true; fl.x = x; fl.z = z; world.village.cave.ver++; return; }
}

const KINDS: EnemyKind[][] = [['BAT', 'SLIME'], ['BAT', 'SLIME', 'SCARAB', 'ROCK_CRAB'], ['BAT', 'SCARAB', 'ROCK_CRAB', 'CRYSTAL_GOLEMITE', 'ZOMBIE']];
function spawnMonsters(f: number): void {
  for (const e of world.enemies) if (e.active) e.active = false;
  world.enemyGrid.clear();
  mons.fill(-1);
  const n = Math.min(mons.length, caveMonsterCount(f)); if (!n) return;
  const L = caveLayout(f, world.village.cave.seed), pool = KINDS[f <= 4 ? 0 : f <= 7 ? 1 : 2];
  world.director.wave = 1 + f;   // their strength
  let made = 0;
  for (let g = 0; g < 200 && made < n; g++) {
    const a = Math.random() * Math.PI * 2, r = L.radius(a) * (0.25 + Math.random() * 0.5), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((x - L.spawn.x) ** 2 + (z - L.spawn.z) ** 2 < 100) continue;   // never on top of the arrival stairs
    if (L.pools.some(([px, pz, pr]) => (x - px) ** 2 + (z - pz) ** 2 < (pr + 1) ** 2)) continue;
    const e = spawnEnemy(pool[Math.floor(Math.random() * pool.length)], v3.set(x, 0, z));
    if (e) { e.facing = Math.atan2(L.spawn.x - x, L.spawn.z - z); mons[made] = e.id; monX[made] = x; monZ[made] = z; made++; }
  }
}

/** Puts the hero on floor `f`. arrive: TOWN (walked in), ABOVE (stairs / a ladder down), UP (back on Floor 1 by the stairs down). */
function enterFloor(f: number, arrive: 'TOWN' | 'ABOVE' | 'UP'): void {
  if (!loaded) load();
  const v = world.village, cv = v.cave, p = world.player, C = world.camera, st = useGameStore.getState();
  closeDialogue(); useLanternPanel.setState({ open: false });
  for (const b of bubbles) b.active = false;
  // unlooted drops on the floor you leave are lost (owner rule: loot it before you go); town drops coming in are scooped up
  for (const o of world.pickups) if (o.active) { if (arrive === 'TOWN') petCollect(o); else o.active = false; }
  world.itemPickupsVersion++;
  for (const z of world.zones) z.active = false;   // ground effects / shots of the last floor stay behind
  for (const pr of world.projectiles) pr.active = false;
  v.area = 'CAVE';
  cv.floor = f; cv.seed = f === 1 ? 0 : tripSeed;
  if (f > caveBest()) setProgress({ caveBest: f });
  cv.best = caveBest();
  if (f === 1 && arrive === 'TOWN') tutorialVeins();   // (before the veins are placed)
  placeFloor(f);
  const L = caveLayout(f, cv.seed);
  installInterior(L.colliders);
  resetNpcs();
  spawnMonsters(f);
  cv.combat = f >= MONSTER_FLOOR;
  if (!cv.combat || arrive !== 'ABOVE') p.hp = st.stats.maxHealth;
  p.alive = true; p.vel.set(0, 0, 0); p.dashT = 0; p.anim.moveBlend = 0;
  cv.oilMax = oilMaxFor(lanternLevel());
  if (arrive === 'TOWN') {   // the lantern's oil is kept between visits (a brand-new lantern starts full)
    if (save.oil < 0) save.oil = cv.oilMax;
    cv.oil = Math.min(cv.oilMax, save.oil);
  }
  if (f === 1) tripSnap = null;
  else if (!tripSnap) tripSnap = { gold: st.gold, mat: { ...st.materials }, inv: new Map(st.inventory.map((it) => [it.id, it.quantity ?? 1])) };
  cv.dark = 0;
  if (arrive === 'UP') { p.pos.set(L.down.x, 0, L.down.z + 3.4); p.facing = 0; }
  else { p.pos.set(L.spawn.x, 0, L.spawn.z); p.facing = Math.PI; }
  C.yaw = 0; C.dist = 0.8; C.pitch = CAM_PITCH0;
  hazardT = 0; poisonLeft = 0;
  cv.ver++; v.areaVer++;
  if (f > 1 && arrive === 'ABOVE') {
    events.emit('hub', { kind: 'cave_deep', n: 1 });   // (the mining tutorial: reach Floor 2)
    const note = L.hazard === 'LAVA' ? ' Lava pools: do not stand in them!' : L.hazard === 'POISON' ? ' Poison puddles: keep out!' : '';
    st.addNotification(`Crystal Cave: Floor ${f}${L.twin ? ' (twin chambers)' : ''}.${note}`, L.hazard === 'LAVA' ? '#ff8a4a' : L.hazard === 'POISON' ? '#8aff6a' : '#9fe6ff', 'SYSTEM');
  }
}
/** The mining tutorial (npcQuests 'dorn_mine') needs veins on Floor 1: when it is active and Floor 1 was mined out (24 h
 *  regrow), Grit has already cleared fresh rubble - the floor regrows at once (called before the veins are placed). */
function tutorialVeins(): void {
  const q = useGameStore.getState().npcQuests.q.dorn_mine;
  if (!q || q.s !== 1 || q.p >= 3) return;
  if (F1N - save.broken.length >= 3 - q.p) return;
  save.broken = []; save.clearedAt = 0; persist();
}
function endTrip(): void { deep.clear(); forgetCaveLayouts(); tripSnap = null; save.oil = world.village.cave.oil; persist(); }
/** What this trip has gathered so far (the haul at risk; all zero on Floor 1). Reused object. */
const haul = { gold: 0, shards: 0, items: 0 };
export function tripHaul(): typeof haul {
  haul.gold = 0; haul.shards = 0; haul.items = 0;
  if (!tripSnap || world.village.area !== 'CAVE') return haul;
  const st = useGameStore.getState();
  haul.gold = Math.max(0, st.gold - tripSnap.gold);
  for (const r of RARITIES) haul.shards += Math.max(0, st.materials[r] - (tripSnap.mat[r] ?? 0));
  for (const it of st.inventory) haul.items += Math.max(0, (it.quantity ?? 1) - (tripSnap.inv.get(it.id) ?? 0));
  return haul;
}
/** Cave-in: takes back everything the trip gathered (gold, shards, new items / extra stack counts). */
function loseTripHaul(): string {
  if (!tripSnap) return '';
  const h = tripHaul(), snap = tripSnap, st = useGameStore.getState(), mat = { ...st.materials };
  for (const r of RARITIES) mat[r] = Math.min(mat[r], snap.mat[r] ?? 0);
  const inventory = st.inventory.filter((it) => snap.inv.has(it.id)).map((it) => { const q = snap.inv.get(it.id)!; return (it.quantity ?? 1) > q ? { ...it, quantity: q } : it; });
  useGameStore.setState({ gold: Math.min(st.gold, snap.gold), materials: mat, inventory });
  world.itemPickupsVersion++;
  return h.gold || h.shards || h.items ? ` Lost: ${h.gold.toLocaleString()} gold, ${h.shards} shard${h.shards === 1 ? '' : 's'}, ${h.items} item${h.items === 1 ? '' : 's'}.` : '';
}

/** Walking in from the town (pending 'CAVE'). */
export function enterCave(): void { caveInWhy = ''; enterFloor(1, 'TOWN'); }
/** Leaving to the town: fights end, HP back to full. */
export function leaveCave(): void {
  const cv = world.village.cave;
  cv.combat = false; cv.floor = 1; cv.seed = 0;
  if (loaded) { save.oil = cv.oil; persist(); }
  useLanternPanel.setState({ open: false });
  for (const e of world.enemies) if (e.active) e.active = false;
  for (const z of world.zones) z.active = false;
  for (const pr of world.projectiles) pr.active = false;
  for (const o of world.pickups) o.active = false;   // unlooted drops stay behind (lost)
  world.itemPickupsVersion++;
  world.player.hp = useGameStore.getState().stats.maxHealth;
}
/** At full black: 'DOWN' = one floor deeper (stairs / lucky ladder; from Floor 1 a new trip starts), 'UP' = back to Floor 1. */
export function switchCaveFloor(dir: 'DOWN' | 'UP'): void {
  const cv = world.village.cave;
  if (dir === 'DOWN') {
    if (cv.floor === 1) { deep.clear(); forgetCaveLayouts(); tripSeed = (Math.random() * 1e9) | 0; }
    enterFloor(Math.min(CAVE_MAX_FLOOR, cv.floor + 1), 'ABOVE'); return;
  }
  const why = caveInWhy; caveInWhy = '';
  const lost = why ? loseTripHaul() : '';   // a cave-in: the whole trip's haul stays in the dark
  const deepest = cv.floor;
  endTrip();
  enterFloor(1, 'UP');
  if (why) {
    addShake(0.6);
    useGameStore.getState().addNotification((why === 'OIL' ? 'Your lantern went out... you lost your loot. You wake up on Floor 1.' : 'You collapse in the dark... you lost your loot. Grit drags you back up to Floor 1.') + lost, '#ff9a5a', 'WARNING');
  } else if (deepest > 1) useGameStore.getState().addNotification(`Back on Floor 1 with your haul. Trip depth: Floor ${deepest} (best: Floor ${caveBest()}).`, '#9fe6ff', 'SYSTEM');
}
function caveIn(why: 'OIL' | 'DOWN'): void {
  const v = world.village;
  if (v.pending) return;
  caveInWhy = why; v.pending = 'UP';
  if (why === 'OIL') v.fade = 1;   // (already pitch black: no fade-out flash back to light)
}

// --------------------------------------------------------------- yields ---
function at(x: number, z: number): Vector3 { return v3.set(x + (Math.random() - 0.5) * 2.4, 0, z + (Math.random() - 0.5) * 2.4); }
function good(kind: CaveNodeKind, rarity: number, x: number, z: number): void {
  const def = LOOT_BY_ID[CAVE_GOODS[kind][Math.max(0, Math.min(4, rarity))]];
  if (def) spawnPickup('ITEM', at(x, z), 0, lootItem(def));
}
/** Extra drops of a vein on floor `f` (on top of the normal harvest drops): the depth bonus + a rare vein's guarantee. */
export function caveYield(kind: CaveNodeKind, tier: number, f: number, x: number, z: number): void {
  const n = Math.min(1, bonusShards(kind, f));   // (owner: one shard per drop)
  for (let k = 0; k < n; k++) spawnPickup('SHARD', at(x, z), rollDepthRarity(f, Math.random()));
  if (kind !== 'GOLD_VEIN' && Math.random() < tradeGoodChance(f)) good(kind, rollDepthRarity(f, Math.random()), x, z);
  if (kind === 'GOLD_VEIN' && depthOf(f) > 0) { const each = Math.round(30 * (goldVeinMul(f) - 1)); for (let k = 0; k < 5; k++) spawnPickup('GOLD', at(x, z), each); }
  if (tier > 0) {   // rare vein: guaranteed shards + a trade good of its tier, and a purse of gold
    const cnt = 1;   // (owner: one shard per drop)
    for (let k = 0; k < cnt; k++) spawnPickup('SHARD', at(x, z), tier);
    good(kind, tier, x, z);
    for (let k = 0; k < 3; k++) spawnPickup('GOLD', at(x, z), 25 * tier);
    useGameStore.getState().addNotification(`${RARE_NAME[tier]} cracked open!`, RARE_COLOR[tier], 'ITEM');
  }
}

// ------------------------------------------------------------------ update ---
/** Called every village frame while in the cave. Returns true while cave monsters are alive (run the enemy sim). */
export function updateCave(dt: number): boolean {
  const v = world.village, cv = v.cave, p = world.player;
  if (v.area !== 'CAVE') return false;
  if (!loaded) load();
  const f = cv.floor, L = caveLayout(f, cv.seed), s = floorState(f);
  // veins that just broke: record, pay the depth / rare bonus, reveal a lucky ladder
  let changed = false;
  const n = Math.min(L.nodes.length, MAX_CRATES);
  for (let i = 0; i < n; i++) {
    const c = world.crates[i];
    if (c.active || s.broken.indexOf(i) !== -1) { if (!c.active) c.respawnT = 0; continue; }
    c.respawnT = 0;
    s.broken.push(i); changed = true;
    caveYield(L.nodes[i].kind, s.rare[i] | 0, f, c.pos.x, c.pos.z);
    events.emit('hub', { kind: 'cave_vein', n: 1 });   // (the mining tutorial)
    if (i === s.ladder) {
      cv.ladderFound = true; cv.lx = c.pos.x; cv.lz = c.pos.z; cv.ver++;
      useGameStore.getState().addNotification('A lucky ladder under the rubble! It leads one floor down.', '#ffe08a', 'SYSTEM');
    }
  }
  if (changed) {
    cv.left = n - s.broken.length;
    if (f === 1) { if (cv.left === 0 && save.clearedAt === 0) save.clearedAt = Date.now(); persist(); }
    if (cv.left === 0 && f < CAVE_MAX_FLOOR) useGameStore.getState().addNotification(`Every vein taken: the stairs to Floor ${f + 1} are open!`, '#9fe6ff', 'SYSTEM');
  }
  const busy = !!v.pending || dialogueOpen() || useLanternPanel.getState().open;
  // lantern oil: one timer for the whole trip below Floor 1. Empty: ~1.3 s blackout, then the cave-in
  if (f > 1 && !v.pending) {
    if (!busy || cv.oil <= 0) cv.oil = Math.max(0, cv.oil - dt);
    if (cv.oil <= 0 && cv.dark < 0.4 && takeSpareFlask()) {   // a spare flask from the Mining Supplies pours itself in
      cv.oil = Math.min(cv.oilMax, SPARE_FLASK_OIL); cv.dark = 0;
      useGameStore.getState().addNotification(`Your lantern sputters... you pour in a spare flask. +${SPARE_FLASK_OIL} s (${spareFlasks()} left).`, '#ffd070', 'ITEM');
    }
    if (cv.oil <= 0) {
      if (cv.dark === 0) sfxCave('blackout');
      cv.dark = Math.min(1, cv.dark + dt / 1.3);
      if (cv.dark >= 1) caveIn('OIL');
    } else {
      const k = cv.oil / cv.oilMax;
      cueT -= dt;
      if (k < 0.1 && cueT <= 0) { sfxCave('heartbeat'); cueT = 0.85; }
      else if (k < 0.25 && cueT <= 0) { sfxCave('tick'); cueT = 1.6; }
    }
  }
  // oil flasks: walk over one to top up the lantern
  for (let i = 0; i < cv.flasks.length; i++) {
    const fl = cv.flasks[i]; if (!fl.on) continue;
    if ((p.pos.x - fl.x) ** 2 + (p.pos.z - fl.z) ** 2 < 1.6 * 1.6) {
      fl.on = false; cv.ver++; cv.oil = Math.min(cv.oilMax, cv.oil + FLASK_OIL);
      useGameStore.getState().addNotification(`Oil flask! +${FLASK_OIL} s of lantern light.`, '#ffd070', 'ITEM');
    }
  }
  // hazard pools: burn / poison while standing in them (poison lingers a moment)
  if (L.pools.length && !busy) {
    let inPool = false;
    for (let i = 0; i < L.pools.length; i++) { const q = L.pools[i]; if ((p.pos.x - q[0]) ** 2 + (p.pos.z - q[1]) ** 2 < q[2] * q[2]) { inPool = true; break; } }
    if (inPool && L.hazard === 'POISON') poisonLeft = 2;
    hazardT -= dt; poisonLeft = Math.max(0, poisonLeft - dt);
    if ((inPool || poisonLeft > 0) && hazardT <= 0) {
      hazardT = 0.5;
      const max = useGameStore.getState().stats.maxHealth;
      damagePlayer(max * (L.hazard === 'LAVA' ? 0.05 : 0.025), { dot: true, kind: L.hazard === 'LAVA' ? 'FIRE' : 'POISON' });
    }
  }
  // cave monsters: an oil flask now and then from the fallen ones
  for (let i = 0; i < mons.length; i++) {
    const id = mons[i]; if (id < 0) continue;
    const e = world.enemies[id];
    if (e.active && e.state !== 'DYING') { monX[i] = e.pos.x; monZ[i] = e.pos.z; continue; }
    mons[i] = -1;
    if (Math.random() < FLASK_DROP_CHANCE) dropFlask(monX[i], monZ[i]);
  }
  // deep floors: real HP (slow regen); falling = a cave-in, never a game over
  if (cv.combat) {
    const max = useGameStore.getState().stats.maxHealth;
    if (p.hp <= 0 || !p.alive) { p.alive = true; p.hp = 1; caveIn('DOWN'); }
    else p.hp = Math.min(max, p.hp + max * 0.004 * dt);
  }
  // Grit's panel closes when you walk away from the bench
  if (useLanternPanel.getState().open && (!L.bench || (p.pos.x - L.bench.x) ** 2 + (p.pos.z - L.bench.z) ** 2 > 36)) useLanternPanel.setState({ open: false });
  if (!cv.combat) return false;
  for (let i = 0; i < world.enemies.length; i++) if (world.enemies[i].active) return true;
  return false;
}

// ------------------------------------------------------------ interaction ---
type Push = (key: 'E' | 'F', verb: string, label: string, shop: '', node: number, d2: number, act: 'leave' | 'down' | 'up' | 'bench' | 'harvest', color?: string) => void;
const LOCKED = Array.from({ length: 13 }, (_, n) => `Harvest all veins to go deeper (${n} left)`);
const FLOOR = Array.from({ length: CAVE_MAX_FLOOR + 2 }, (_, n) => `Floor ${n}`);
const LADDER = Array.from({ length: CAVE_MAX_FLOOR + 2 }, (_, n) => `Lucky ladder to Floor ${n}`);
const HARVEST_R2 = 3.6 * 3.6;
/** Below Floor 1 needs class level UNLOCK_LV.CAVE (unlocks.ts); Floor 1 + Grit are open to everyone. */
export const caveLocked = (): boolean => useGameStore.getState().level < UNLOCK_LV.CAVE;
const CAVE_LOCK_LABEL = `Deeper floors · Unlocks at Lv ${UNLOCK_LV.CAVE}`;
/** The cave's interaction pills (exit / stairs / ladder / lantern bench / veins). */
export function scanCave(push: Push, px: number, pz: number): void {
  const cv = world.village.cave, f = cv.floor, L = caveLayout(f, cv.seed);
  const q = (x: number, z: number) => (x - px) ** 2 + (z - pz) ** 2;
  let d = q(L.exit.x, L.exit.z);
  if (d < L.exit.r * L.exit.r) { if (f === 1) push('E', 'Leave', 'Crystal Cave', '', -1, d, 'leave'); else push('E', 'Climb out', 'back up to Floor 1', '', -1, d, 'up'); }
  d = q(L.down.x, L.down.z);
  if (d < L.down.r * L.down.r && f < CAVE_MAX_FLOOR) {
    if (f === 1 && caveLocked()) push('E', 'Locked', CAVE_LOCK_LABEL, '', 0, d, 'down', '#ff9a7a');
    else if (cv.left > 0) push('E', 'Locked', LOCKED[Math.min(12, cv.left)], '', 0, d, 'down', '#ff9a7a');
    else if (f === 1 && cv.oil <= 0) push('E', 'Lantern empty', 'refill at Grit\'s bench', '', 0, d, 'down', '#ff9a7a');
    else push('E', 'Descend', FLOOR[f + 1], '', 0, d, 'down');
  }
  if (cv.ladderFound && f < CAVE_MAX_FLOOR) { d = q(cv.lx, cv.lz); if (d < 9) push('E', 'Descend', LADDER[f + 1], '', 1, d - 0.5, 'down', '#ffe08a'); }
  if (L.bench) { d = q(L.bench.x, L.bench.z); if (d < L.bench.r * L.bench.r) push('E', 'Open', 'Grit\'s Lantern Bench', '', 0, d, 'bench', '#ffd08a'); }
  for (let i = 0; i < L.nodes.length && i < MAX_CRATES; i++) {
    const c = world.crates[i]; if (!c.active) continue;
    d = q(c.pos.x, c.pos.z); if (d >= HARVEST_R2) continue;
    const t = cv.rare[i];
    push('E', 'Harvest', t > 0 ? RARE_NAME[t] : HARVEST_NAME[c.kind] ?? 'Vein', '', i, d, 'harvest', t > 0 ? RARE_COLOR[t] : '');
  }
}
/** E on a cave pill (stairs / ladder / climb out / bench). */
export function interactCave(act: string, node: number): void {
  const v = world.village, cv = v.cave, st = useGameStore.getState();
  if (act === 'up') { v.pending = 'UP'; return; }
  if (act === 'down') {
    if (cv.floor === 1 && caveLocked()) { st.addNotification(`The deep cave unlocks at Lv ${UNLOCK_LV.CAVE}. Floor 1 is yours to mine until then.`, '#ff9a7a', 'WARNING'); return; }
    if (node === 0 && cv.left > 0) { st.addNotification(`The way down is blocked by rubble. Harvest every vein first (${cv.left} left).`, '#ff9a7a', 'WARNING'); return; }
    if (cv.floor === 1 && cv.oil <= 0) { st.addNotification('Your lantern is empty. Refill it at Grit\'s bench before going down.', '#ff9a7a', 'WARNING'); return; }
    v.pending = 'DOWN'; return;
  }
  if (act === 'bench') useLanternPanel.setState({ open: true });
}

// --------------------------------------------------------- Grit's panel ---
/** Grit's lantern panel (ui/panels/LanternPanel.tsx): open flag. */
export const useLanternPanel = create<{ open: boolean }>(() => ({ open: false }));
export const freeRefillToday = (): boolean => { if (!loaded) load(); return save.freeDay !== today(); };
/** Refill the lantern: free once per day, then REFILL_PRICE gold. */
export function refillLantern(): boolean {
  if (!loaded) load();
  const cv = world.village.cave, st = useGameStore.getState();
  if (cv.oil >= cv.oilMax - 0.5) { st.addNotification('The lantern is already full.', '#ffd08a', 'SYSTEM'); return false; }
  if (save.freeDay !== today()) save.freeDay = today();
  else {
    const price = REFILL_PRICE(lanternLevel());
    if (st.gold < price) { st.addNotification(`Not enough gold (${price.toLocaleString()} needed).`, '#ff7a7a', 'WARNING'); return false; }
    useGameStore.setState({ gold: st.gold - price });
  }
  cv.oil = cv.oilMax; save.oil = cv.oil; persist();
  st.addNotification(`Lantern refilled: ${Math.round(cv.oilMax)} s of light.`, '#ffd08a', 'SYSTEM');
  return true;
}
/** Bigger lantern (+capacity), paid with gems or shards (LANTERN_COST). The new capacity is filled up too. */
export function upgradeLantern(pay: 'GEMS' | 'SHARDS'): boolean {
  if (!loaded) load();
  const st = useGameStore.getState(), lv = lanternLevel(), cv = world.village.cave;
  if (lv >= LANTERN_MAX_LV) return false;
  const c = LANTERN_COST[lv];
  if (pay === 'GEMS') {
    if (st.gems < c.gems) { st.addNotification(`Not enough gems (${c.gems} needed).`, '#ff7a7a', 'WARNING'); return false; }
    useGameStore.setState({ gems: st.gems - c.gems });
  } else {
    if ((st.materials[c.shard] ?? 0) < c.shards) { st.addNotification(`Not enough ${c.shard.toLowerCase()} shards (${c.shards} needed).`, '#ff7a7a', 'WARNING'); return false; }
    useGameStore.setState({ materials: { ...st.materials, [c.shard]: st.materials[c.shard] - c.shards } });
  }
  setProgress({ caveLantern: lv + 1 });
  const add = oilMaxFor(lv + 1) - cv.oilMax;
  cv.oilMax = oilMaxFor(lv + 1); cv.oil = Math.min(cv.oilMax, cv.oil + add); save.oil = cv.oil; persist();
  useGameStore.getState().addNotification(`Bigger lantern! Capacity ${cv.oilMax} s.`, '#ffd08a', 'SYSTEM');
  return true;
}
