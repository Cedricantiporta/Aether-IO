// ============================================================================
// Story gates, runtime (data: engine/townGates.ts). Owns the blockers' colliders in the town collision world, announces an
// unlock (notification + chime + the render's removal animation) and has the safety check that no story step ever needs a
// place that is still behind a closed gate. Everything is derived from the saved story step, so there is no
// state of its own to save: refresh / new session / old save = the same gates.
// ============================================================================
import { useGameStore } from '../../store';
import { events } from '../events';
import { world } from '../world';
import { addTempCollider, removeTempCollider, type Collider } from '../mapgen';
import { findPath, invalidatePathGrid } from './townPath';
import { STORY } from '../../story';
import { GameStatus } from '../../types';
import { NPCS, NESTS, ANIMALS, HIDDEN_CAT, WHEEL_PIN, PORTAL, TOWER, CHAPEL_SIDE, VILLAGE_NODES } from '../townData';
import { SHOP_POSITIONS, shopFront } from '../../constants';
import { TRAINER_POS } from '../world';
import { CASTLE_DOOR } from '../castleData';
import { CHURCH_DOOR } from '../churchData';
import { TAVERN_DOOR } from '../tavernData';
import { HOME_DOOR } from '../homeData';
import { CAVE_DOOR } from '../caveData';
import { FISH_SPOTS, FISH_SPOT_R } from '../beachData';
import { NPC_QUESTS } from '../../npcQuests';
import { TOWN_GATES, GATE_PROMPT_R, gateDist2, gateFlags, gateMask, gateColliders, gateOpenAt, syncGateFlags, type GateId } from '../townGates';

const live: Partial<Record<GateId, Collider[]>> = {};
/** Gates that just opened and whose removal animation has not played yet (render/TownGates consumes them). */
export const gatePlay = new Set<GateId>();

/** True while the town's collision world is the active one (not a run room, castle, cave, chapel ...). */
const townLive = (): boolean => !world.room.active && world.village.area === 'TOWN' && useGameStore.getState().status === GameStatus.MENU;

function addCols(i: number): void {
  const g = TOWN_GATES[i];
  const list: Collider[] = [];
  for (const [x, z, r] of gateColliders(g)) { const c = addTempCollider(x, z, r, false); if (c) list.push(c); }
  live[g.id] = list;
}
function dropCols(i: number): void {
  const g = TOWN_GATES[i], list = live[g.id];
  if (list) for (const c of list) removeTempCollider(c);
  live[g.id] = undefined;
}

/** Called by village.placeVillageNodes right after the town's colliders are (re)built: syncs the flags and registers the closed gates' colliders. */
export function placeGateColliders(): void {
  const s = useGameStore.getState();
  syncGateFlags(s.story.step);
  for (const k of Object.keys(live)) live[k as GateId] = undefined;   // (mapgen rebuilt its grid: the old collider objects are gone)
  TOWN_GATES.forEach((g, i) => { known[g.id] = gateFlags[g.id]; if (!gateFlags[g.id]) addCols(i); });
  lastStep = s.story.step;
  world.obstaclesVersion++;
}

let lastStep = -1;
const known: Partial<Record<GateId, boolean>> = {};   // (the state this module last acted on; the flags may be synced earlier by npcQuestLogic)
function onStore(announce: boolean): void {
  const step = useGameStore.getState().story.step;
  const advanced = announce && step > lastStep && lastStep >= 0;
  lastStep = step;
  syncGateFlags(step);
  const inTown = townLive();
  let changed = false;
  TOWN_GATES.forEach((g, i) => {
    const o = gateFlags[g.id];
    if (known[g.id] === o) return;
    known[g.id] = o; changed = true;
    if (o) {   // opened
      if (inTown) dropCols(i); else live[g.id] = undefined;
      if (advanced) {
        gatePlay.add(g.id);
        queueMicrotask(() => { useGameStore.getState().addNotification(g.done, '#bfe9ff', 'SYSTEM'); events.emit('gateOpen', { id: g.id }); });
      }
    } else if (inTown) { dropCols(i); addCols(i); }   // closed again (debug: story set back)
  });
  if (changed) world.obstaclesVersion++;   // (the walk grid and the minimap rebuild)
}
setTimeout(() => {   // (deferred: the store module is still initialising while this one loads)
  onStore(false);
  useGameStore.subscribe((s, p) => { if (s.story.step !== p.story.step) onStore(true); });
}, 0);

export { gateFlags, gateMask };

// ------------------------------------------------------------------------------------------------ safety check ---
/** Everything a story step can ask the hero to reach, as [name, x, z, reach] (NPC homes + patrol points, shop fronts, doors, the portal, the tower). */
function stepTargets(i: number): [string, number, number, number][] {
  const step = STORY[i], out: [string, number, number, number][] = [];
  if (!step) return out;
  const npcAt = (name: string): void => {
    const n = NPCS.find((q) => q.name === name); if (!n) return;
    if (n.area === 'CASTLE') out.push([name + ' (castle door)', CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 2.4]);
    else if (n.area === 'CHURCH') out.push([name + ' (chapel door)', CHURCH_DOOR.x, CHURCH_DOOR.z + 1, 2.4]);
    else if (n.area === 'TAVERN') out.push([name + ' (tavern door)', TAVERN_DOOR.x, TAVERN_DOOR.z + 0.8, 2.4]);
    else if (n.area === 'CAVE') out.push([name + ' (cave door)', CAVE_DOOR.x, CAVE_DOOR.z, 2.4]);
    else { out.push([name + ' home', n.home[0], n.home[1], 2.2]); n.patrol?.forEach((p, k) => out.push([`${name} patrol ${k}`, p[0], p[1], 2.2])); }
  };
  if (step.npc) npcAt(step.npc);
  else if (step.at === 'TOWER') out.push(['tower door', TOWER.door.x, TOWER.door.z, 2.2]);
  else if (step.at === 'TRAINER') out.push(['skill trainer', TRAINER_POS[0], TRAINER_POS[2] + 2.6, 1.8]);
  else if (step.at) { const s = SHOP_POSITIONS.find((x) => (x.type as string) === step.at); if (s) { const f = shopFront(s, 3.2); out.push([`shop ${step.at}`, f.x, f.z, 1.8]); } else out.push(['portal', PORTAL.front.x, PORTAL.front.z, 2.2]); }
  else out.push(['portal', PORTAL.front.x, PORTAL.front.z, 2.2]);   // field steps: the Adventure Portal
  return out;
}
/** Always needed once the town opens, whatever the gates say: shop counters, doors, home, the portal, the hero's own errands. */
function coreTargets(): [string, number, number, number][] {
  const out: [string, number, number, number][] = [['portal', PORTAL.front.x, PORTAL.front.z, 1.0], ['castle door', CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 2.4], ['chapel door', CHURCH_DOOR.x, CHURCH_DOOR.z + 1, 2.4], ['chapel side', CHAPEL_SIDE.x, CHAPEL_SIDE.z, 1.8],
    ['tavern door', TAVERN_DOOR.x, TAVERN_DOOR.z + 0.8, 2.4], ['home door', HOME_DOOR.x, HOME_DOOR.z, 1.8], ['trainer', TRAINER_POS[0], TRAINER_POS[2] + 2.6, 1.8]];
  for (const s of SHOP_POSITIONS) { if (s.type === 'FISH' || s.type === 'MINE') continue; const f = shopFront(s, 3.2); out.push([`shop ${s.type}`, f.x, f.z, 1.8]); }
  const mine = SHOP_POSITIONS.find((s) => s.type === 'MINE'); if (mine) { const f = shopFront(mine, 3.2); out.push(['shop MINE', f.x, f.z, 1.8]); }   // (the camp stays open)
  return out;
}
/**
 * Dev / QA check (run in a town page, e.g. headless: `(await import('/engine/systems/townGatesLogic.ts')).gateSelfCheck()`).
 * For every story step it closes exactly the gates still closed at that step and verifies that a walk from the portal reaches
 * the step's targets AND every core place; with ALL gates closed it verifies every NPC side quest without a `gate` has a reachable
 * giver / turn-in / target; and it reports what each gate hides (a gate hiding nothing is a bug). Returns the failures
 * (empty = OK) followed by an info line per gate. The live gates are restored afterwards.
 */
export function gateSelfCheck(): string[] {
  const bad: string[] = [], info: string[] = [];
  if (world.village.area !== 'TOWN' || world.room.active) return ['gateSelfCheck: run it in the town'];
  const out = new Float32Array(2400), from = PORTAL.front;
  const liveSaved = TOWN_GATES.map((g) => !!live[g.id]);
  TOWN_GATES.forEach((g, i) => { if (live[g.id]) dropCols(i); });
  const reach = (x: number, z: number, r: number): boolean => { const n = findPath(from.x, from.z, x, z, r, out); return n > 0 || Math.hypot(x - from.x, z - from.z) <= r; };
  const withClosed = (closed: boolean[], fn: () => void): void => {
    TOWN_GATES.forEach((_, i) => { if (closed[i]) addCols(i); });
    invalidatePathGrid(); fn();
    TOWN_GATES.forEach((_, i) => { if (closed[i]) dropCols(i); });
    invalidatePathGrid();
  };
  // 1) per story step: the gates closed at that step must not hide the step's targets or any core place
  const seen = new Set<string>();
  for (let st = 0; st <= STORY.length; st++) {
    const closed = TOWN_GATES.map((g) => !gateOpenAt(g, st));
    const key = closed.map((c) => (c ? 1 : 0)).join('');
    const need = [...stepTargets(st), ...(seen.has(key) ? [] : coreTargets())];
    seen.add(key);
    withClosed(closed, () => { for (const [name, x, z, r] of need) if (!reach(x, z, r)) bad.push(`step ${st} (${STORY[st]?.id ?? 'end'}): ${name} unreachable with gates [${TOWN_GATES.filter((_, i) => closed[i]).map((g) => g.id).join(',')}] closed`); });
  }
  // 2) every gate hides something, and what: all gates closed, then one at a time
  const all = TOWN_GATES.map(() => true);
  const hidden = (closed: boolean[]): string[] => {
    const res: string[] = [];
    withClosed(closed, () => {
      for (const n of NPCS) { if (n.area) continue; if (!reach(n.home[0], n.home[1], 2.2)) res.push(n.name); }
      FISH_SPOTS.forEach((f, k) => { if (!reach(f.x, f.z, 0.8)) res.push('fish' + k); });
      const f = SHOP_POSITIONS.find((s) => s.type === 'FISH'); if (f) { const q = shopFront(f, 3.2); if (!reach(q.x, q.z, 1.8)) res.push('shop FISH'); }
      if (!reach(TOWER.door.x, TOWER.door.z, 0.8)) res.push('tower door');
      if (!reach(CAVE_DOOR.x, CAVE_DOOR.z, 1.2)) res.push('cave door');
    });
    return res;
  };
  TOWN_GATES.forEach((g, i) => {
    const only = TOWN_GATES.map((_, k) => k === i), h = hidden(only);
    info.push(`gate ${g.id} (opens at '${g.opens}') hides: ${h.join(', ') || (g.door ? '(its door only)' : 'NOTHING')}`);
    if (!h.length && !g.door) bad.push(`gate ${g.id} blocks nothing (a walk still gets round it)`);
  });
  // 2b) one prompt at a time: a gate's Look zone never overlaps a shop / NPC / door / fishing prompt zone (its own door excepted), and a door gate's door spot is inside its zone
  TOWN_GATES.forEach((g) => {
    const src: [string, number, number, number][] = [];
    for (const s of SHOP_POSITIONS) src.push([`shop ${s.type}`, s.position[0], s.position[2], 7]);   // (village.INTERACT_R)
    for (const n of NPCS) { if (n.area) continue; src.push([n.name, n.home[0], n.home[1], 3.8]); n.patrol?.forEach((p) => src.push([n.name + ' patrol', p[0], p[1], 3.8])); }   // (npcs.TALK_R)
    for (const [nm, d] of [['castle door', CASTLE_DOOR], ['chapel door', CHURCH_DOOR], ['tavern door', TAVERN_DOOR], ['home door', HOME_DOOR], ['chapel side door', CHAPEL_SIDE]] as const) src.push([nm, d.x, d.z, d.r]);
    src.push(['portal', PORTAL.front.x, PORTAL.front.z, 3.2]);
    for (const f of FISH_SPOTS) src.push(['fishing spot', f.x, f.z, FISH_SPOT_R]);
    if (g.id !== 'cave') src.push(['cave door', CAVE_DOOR.x, CAVE_DOOR.z, CAVE_DOOR.r]);
    if (g.id !== 'tower') src.push(['tower door', TOWER.door.x, TOWER.door.z, 4]);
    for (const [nm, x, z, r] of src) { const d = Math.sqrt(gateDist2(g, x, z)) - r - GATE_PROMPT_R; if (d < 0) bad.push(`gate ${g.id}: its Look pill zone overlaps the ${nm} prompt zone by ${(-d).toFixed(1)} m`); }
    if (g.door) { const door = g.id === 'cave' ? CAVE_DOOR : TOWER.door; if (Math.sqrt(gateDist2(g, door.x, door.z)) > GATE_PROMPT_R - 0.3) bad.push(`gate ${g.id}: the door spot is outside the Look pill zone`); }
  });
  // 3) side quests without a gate must be doable with ALL gates closed (giver, turn-in, TALK target, farm chores)
  withClosed(all, () => {
    for (const d of NPC_QUESTS) {
      if (d.gate) continue;
      const names = [d.giver, d.turnIn ?? d.giver, d.objective.type === 'TALK' ? String(d.objective.target) : ''].filter(Boolean);
      for (const nm of names) { const n = NPCS.find((q) => q.name === nm); if (!n || n.area) continue; if (!reach(n.home[0], n.home[1], 2.2)) bad.push(`side quest ${d.id}: ${nm} is behind a closed gate (give the quest a 'gate')`); }
      if (d.objective.type === 'INTERACT') {
        const t = String(d.objective.target);
        if (t === 'egg') NESTS.forEach((n, k) => { if (!reach(n[0], n[1], 1.6)) bad.push(`side quest ${d.id}: nest ${k} unreachable`); });
        if (t === 'cat' && !reach(HIDDEN_CAT.x, HIDDEN_CAT.z, 3)) bad.push(`side quest ${d.id}: the hidden cat is unreachable`);
        if (t === 'pin' && !reach(WHEEL_PIN.x, WHEEL_PIN.z, 3)) bad.push(`side quest ${d.id}: the wheel pin is unreachable`);
        if (t === 'milk') ANIMALS.forEach((a, k) => { if (a.kind === 'COW' && !reach(a.x, a.z, 2.2)) bad.push(`side quest ${d.id}: cow ${k} unreachable`); });
      }
    }
    for (const n of VILLAGE_NODES) if (!reach(n.x, n.z, 3.0)) info.push(`harvest node ${n.kind}@${n.x},${n.z} is behind a gate`);
  });
  TOWN_GATES.forEach((g, i) => { if (liveSaved[i]) addCols(i); });
  invalidatePathGrid();
  return [...bad.map((b) => 'FAIL ' + b), ...info];
}
