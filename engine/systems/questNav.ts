// ============================================================================
// Quest navigation: WHERE each quest continues, as one walk target in the hero's current area (the castle door /
// exit when the objective sits in the other area). Shared by the tracker auto-path (village.walkToMain / walkToQuest /
// walkToNpcObjective), the guide arrow and the tracker's distance readout, so all three always agree.
// NPC targets use the NPC's LIVE position (patrolling NPCs are followed by the walker). Pure TS, no React.
// ============================================================================
import { useGameStore } from '../../store';
import { world, QUEST_POS, TRAINER_POS } from '../world';
import { STORY, type StoryAt } from '../../story';
import { NPCS, NESTS, ANIMALS, HIDDEN_CAT, WHEEL_PIN, PORTAL, TOWER } from '../townData';
import { CASTLE_DOOR, CASTLE_EXIT } from '../castleData';
import { CAVE_DOOR, CAVE_EXIT, caveLayout } from '../caveData';
import { FISH_SPOTS, FISH_SPOT_R } from '../beachData';
import { isFishName } from '../../loot';
import { SHOP_POSITIONS, SHOP_TAB, shopFront } from '../../constants';
import { npcs, animals, TALK_R } from './npcs';
import { questDone, questNeedsKing, type Quest } from '../../quests';
import { npcQuestReady, npcQuestTurnIn, type NpcQuestDef } from '../../npcQuests';
import type { ShopTab } from '../../storeTypes';

export type NavAct = 'shop' | 'castle' | 'cave' | 'leave' | 'npc' | 'tower' | 'down' | 'none';
type Area = 'TOWN' | 'CASTLE' | 'CAVE';
export interface NavTarget {
  x: number; z: number;
  /** arrive within this distance of (x, z) */
  reach: number;
  act: NavAct; tab: ShopTab | ''; npc: number;
  /** true when (x, z) is only a door / exit on the way (the objective is in another area: castle hall, cave, town) */
  hop: boolean;
  /** the objective is done in the wilds (the Adventure Portal) */
  field: boolean;
}
const mk = (): NavTarget => ({ x: 0, z: 0, reach: 2, act: 'none', tab: '', npc: -1, hop: false, field: false });
/** Talking distance the walker stops at (inside the E prompt radius). */
export const TALK_REACH = TALK_R - 0.9;

const area = (): Area => world.village.area;
const inTown = (): boolean => world.village.area === 'TOWN';
/** The area an NPC lives in (town unless tagged). */
export const npcArea = (i: number): Area => (NPCS[i].area ?? 'TOWN') as Area;
function set(o: NavTarget, x: number, z: number, reach: number, act: NavAct, tab: ShopTab | '' = '', npc = -1, hop = false, field = false): NavTarget {
  o.x = x; o.z = z; o.reach = reach; o.act = act; o.tab = tab; o.npc = npc; o.hop = hop; o.field = field;
  return o;
}
/** The way out of the current interior (castle hall / crystal cave) back to town. */
const exit = (o: NavTarget): NavTarget => (area() === 'CAVE'
  ? set(o, CAVE_EXIT.x, CAVE_EXIT.z, 2, 'leave', '', -1, true)
  : set(o, CASTLE_EXIT.x, CASTLE_EXIT.z, 2, 'leave', '', -1, true));
/** From town: the door into `to` (castle hall / crystal cave). */
const door = (o: NavTarget, to: Area): NavTarget => (to === 'CAVE'
  ? set(o, CAVE_DOOR.x, CAVE_DOOR.z, 2.4, 'cave', '', -1, true)
  : set(o, CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 2.4, 'castle', '', -1, true));
/** The next hop towards area `to` (exit first when inside another interior), or null when already there. */
function hop(o: NavTarget, to: Area): NavTarget | null {
  const a = area();
  if (a === to) return null;
  return a !== 'TOWN' ? exit(o) : door(o, to);
}
/** The Adventure Portal (field objectives: kills, rescues, deliveries gathered in runs). */
function portal(o: NavTarget): NavTarget {
  if (!inTown()) { exit(o); o.field = true; return o; }
  return set(o, PORTAL.front.x, PORTAL.front.z, 2.2, 'none', '', -1, false, true);
}
/** Talk to NPC `i` (live position), through the castle door / cave mouth / exits when it lives in another area. */
export function navNpc(i: number, o: NavTarget = mk()): NavTarget {
  return hop(o, npcArea(i)) ?? set(o, npcs[i].x, npcs[i].z, TALK_REACH, 'npc', '', i);
}
export type Spot = StoryAt | 'SUMMON' | 'FISH' | 'MINE';
/** A shop counter / the quest board / the skill trainer / the tower door (opened on arrival). */
export function navSpot(at: Spot, o: NavTarget = mk()): NavTarget | null {
  if (at === 'BAG') return null;
  if (!inTown()) return exit(o);
  if (at === 'BOARD') return set(o, QUEST_POS[0], QUEST_POS[2] + 2.6, 1.8, 'shop', 'QUESTS');
  if (at === 'TRAINER') return set(o, TRAINER_POS[0], TRAINER_POS[2] + 2.6, 1.8, 'shop', 'SKILLS');
  if (at === 'TOWER') return set(o, TOWER.door.x + 1.2, TOWER.door.z, 2.2, 'tower');
  const s = SHOP_POSITIONS.find((x) => (x.type as string) === (at === 'SUMMON' ? 'FORTUNE' : at));
  if (!s) return portal(o);
  const f = shopFront(s, 3.2);
  return set(o, f.x, f.z, 1.8, 'shop', SHOP_TAB[s.type]);
}

const MAIN = mk();
/** Where the main quest continues (null: the chain is finished, or the step is done from the bag). */
export function mainNav(): NavTarget | null {
  const step = STORY[useGameStore.getState().story.step];
  if (!step) return null;
  if (step.npc) { const i = NPCS.findIndex((n) => n.name === step.npc); if (i >= 0) return navNpc(i, MAIN); }
  if (step.at) return navSpot(step.at, MAIN);
  return portal(MAIN);
}

const ACTION_SPOT: Record<string, Spot> = { buy_armor: 'ARMORY', brew_elixir: 'BREWER', brew: 'BREWER', tower_floor: 'TOWER', buy_potion: 'SUPPLIES', buy: 'SUPPLIES', buy_pet: 'PETS', summon: 'FORTUNE', upgrade: 'BLACKSMITH', craft: 'BLACKSMITH', store: 'WAREHOUSE', learn: 'TRAINER', accept: 'BOARD', quest: 'BOARD', buy_flask: 'MINE' };
const SIDE = mk();
/** Where an accepted NPC side quest continues: the turn-in NPC when ready, the TALK target, the farm chore, the shop of
 *  an ACTION objective, else the wilds. */
export function npcQuestNav(def: NpcQuestDef): NavTarget {
  const st = useGameStore.getState(), o = def.objective;
  const who = npcQuestReady(def, st.npcQuests, st.inventory) ? npcQuestTurnIn(def) : o.type === 'TALK' ? String(o.target) : '';
  if (who) { const i = NPCS.findIndex((n) => n.name === who); if (i >= 0) return navNpc(i, SIDE); }
  if (o.type === 'INTERACT') {
    if (!inTown()) return exit(SIDE);
    const p = world.player.pos, t = String(o.target);
    if (t === 'milk') {   // the nearest cow
      let bi = -1, bd = 1e9;
      for (let i = 0; i < animals.length; i++) { if (ANIMALS[i].kind !== 'COW') continue; const d = (animals[i].x - p.x) ** 2 + (animals[i].z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) return set(SIDE, animals[bi].x, animals[bi].z, 2.2, 'none');
    }
    if (t === 'egg') return set(SIDE, NESTS[1][0], NESTS[1][1] + 1.2, 1.4, 'none');
    if (t === 'cat') return set(SIDE, HIDDEN_CAT.x, HIDDEN_CAT.z, 2.4, 'none');
    if (t === 'pin') return set(SIDE, WHEEL_PIN.x, WHEEL_PIN.z, 2.2, 'none');
  }
  if (o.type === 'COLLECT_LOOT' && o.room === 'CRYSTAL') {   // gems from a crystal cave: the one east of town counts
    if (area() !== 'CAVE') return hop(SIDE, 'CAVE')!;
    const p = world.player.pos;   // inside: the nearest vein still standing
    let bx = 0, bz = 0, bd = 1e9;
    for (const c of world.crates) { if (!c.active) continue; const d = (c.pos.x - p.x) ** 2 + (c.pos.z - p.z) ** 2; if (d < bd) { bd = d; bx = c.pos.x; bz = c.pos.z; } }
    if (bd < 1e9) return set(SIDE, bx, bz, 2.4, 'none');
    return portal(SIDE);   // (all mined: a Crystal Cavern in the wilds)
  }
  if (o.type === 'ACTION') { const r = fieldAction(String(o.target)); if (r) return r; }
  if (o.type === 'ACTION' && ACTION_SPOT[String(o.target)]) { const r = navSpot(ACTION_SPOT[String(o.target)], SIDE); if (r) return r; }
  return portal(SIDE);
}

/** The nearest standing vein in the cave (Floor 1 when walking in from town). */
function nearestVein(o: NavTarget): NavTarget | null {
  const p = world.player.pos;
  let bx = 0, bz = 0, bd = 1e9;
  for (const c of world.crates) { if (!c.active) continue; const d = (c.pos.x - p.x) ** 2 + (c.pos.z - p.z) ** 2; if (d < bd) { bd = d; bx = c.pos.x; bz = c.pos.z; } }
  return bd < 1e9 ? set(o, bx, bz, 2.4, 'none') : null;
}
/** Tutorial actions done out in the village (not at a shop counter): fishing at the beach, selling to the Fishmonger,
 *  mining veins in the Crystal Cave, taking its stairs down to Floor 2. null = not one of them. */
function fieldAction(t: string): NavTarget | null {
  if (t === 'catch_fish' || (t === 'sell_fish' && !useGameStore.getState().inventory.some((i) => i.type === 'LOOT' && isFishName(i.name)))) {
    if (!inTown()) return exit(SIDE);
    const p = world.player.pos;   // the nearer shoreline spot (the pier end is over the water, off the walk grid)
    let best = FISH_SPOTS[1], bd = 1e9;
    for (const s of FISH_SPOTS) { if (s.x < -80) continue; const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }
    return set(SIDE, best.x, best.z, FISH_SPOT_R - 0.8, 'none');
  }
  if (t === 'sell_fish') return navSpot('FISH', SIDE);
  if (t === 'cave_vein' || t === 'cave_deep') {
    if (area() !== 'CAVE') return hop(SIDE, 'CAVE')!;
    const cv = world.village.cave;
    if (t === 'cave_vein' || cv.floor > 1) return nearestVein(SIDE) ?? exit(SIDE);
    if (cv.left > 0) return nearestVein(SIDE) ?? exit(SIDE);   // Floor 1: every vein first, then the stairs down
    const L = caveLayout(1);
    if (cv.oil <= 0 && L.bench) return set(SIDE, L.bench.x, L.bench.z, 2, 'none');   // (empty lantern: Grit's bench first)
    return set(SIDE, L.down.x, L.down.z, Math.max(1.5, L.down.r - 1), 'down');
  }
  return null;
}

const BOARD = mk();
/** Where a Quest Board bounty continues: claim at the board, the King, selling loot at the Potion Shop, else the wilds. */
export function boardQuestNav(q: Quest): NavTarget {
  const st = useGameStore.getState(), king = NPCS.findIndex((n) => n.king);
  if (questDone(q)) return navSpot('BOARD', BOARD)!;
  if (questNeedsKing(q) && king >= 0) return navNpc(king, BOARD);
  if (q.type === 'SELL_LOOT' && st.inventory.some((i) => i.type === 'LOOT')) return navSpot('SUPPLIES', BOARD)!;
  return portal(BOARD);
}

/** Straight-line distance from the hero to a target (for the tracker readout). */
export const navDist = (t: NavTarget): number => Math.hypot(t.x - world.player.pos.x, t.z - world.player.pos.z);
