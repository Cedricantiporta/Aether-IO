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
import { SHOP_POSITIONS, SHOP_TAB, shopFront } from '../../constants';
import { npcs, animals, TALK_R } from './npcs';
import { questDone, questNeedsKing, type Quest } from '../../quests';
import { npcQuestReady, npcQuestTurnIn, type NpcQuestDef } from '../../npcQuests';
import type { ShopTab } from '../../storeTypes';

export type NavAct = 'shop' | 'castle' | 'leave' | 'npc' | 'tower' | 'none';
export interface NavTarget {
  x: number; z: number;
  /** arrive within this distance of (x, z) */
  reach: number;
  act: NavAct; tab: ShopTab | ''; npc: number;
  /** true when (x, z) is only the castle door / exit on the way (the objective is in the other area) */
  hop: boolean;
  /** the objective is done in the wilds (the Adventure Portal) */
  field: boolean;
}
const mk = (): NavTarget => ({ x: 0, z: 0, reach: 2, act: 'none', tab: '', npc: -1, hop: false, field: false });
/** Talking distance the walker stops at (inside the E prompt radius). */
export const TALK_REACH = TALK_R - 0.9;

const inCastle = (): boolean => world.village.area === 'CASTLE';
function set(o: NavTarget, x: number, z: number, reach: number, act: NavAct, tab: ShopTab | '' = '', npc = -1, hop = false, field = false): NavTarget {
  o.x = x; o.z = z; o.reach = reach; o.act = act; o.tab = tab; o.npc = npc; o.hop = hop; o.field = field;
  return o;
}
const exit = (o: NavTarget): NavTarget => set(o, CASTLE_EXIT.x, CASTLE_EXIT.z, 2, 'leave', '', -1, true);
const door = (o: NavTarget): NavTarget => set(o, CASTLE_DOOR.x, CASTLE_DOOR.z + 2, 2.4, 'castle', '', -1, true);
/** The Adventure Portal (field objectives: kills, rescues, deliveries gathered in runs). */
function portal(o: NavTarget): NavTarget {
  if (inCastle()) { exit(o); o.field = true; return o; }
  return set(o, PORTAL.front.x, PORTAL.front.z, 2.2, 'none', '', -1, false, true);
}
/** Talk to NPC `i` (live position), through the castle door / exit when it lives in the other area. */
export function navNpc(i: number, o: NavTarget = mk()): NavTarget {
  const there = NPCS[i].area === 'CASTLE';
  if (there !== inCastle()) return there ? door(o) : exit(o);
  return set(o, npcs[i].x, npcs[i].z, TALK_REACH, 'npc', '', i);
}
export type Spot = StoryAt | 'SUMMON';
/** A shop counter / the quest board / the skill trainer / the tower door (opened on arrival). */
export function navSpot(at: Spot, o: NavTarget = mk()): NavTarget | null {
  if (at === 'BAG') return null;
  if (inCastle()) return exit(o);
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

const ACTION_SPOT: Record<string, Spot> = { buy_armor: 'ARMORY', brew_elixir: 'BREWER', brew: 'BREWER', tower_floor: 'TOWER', buy_potion: 'SUPPLIES', buy: 'SUPPLIES', buy_pet: 'PETS', summon: 'FORTUNE', upgrade: 'BLACKSMITH', craft: 'BLACKSMITH', store: 'WAREHOUSE', learn: 'TRAINER', accept: 'BOARD', quest: 'BOARD' };
const SIDE = mk();
/** Where an accepted NPC side quest continues: the turn-in NPC when ready, the TALK target, the farm chore, the shop of
 *  an ACTION objective, else the wilds. */
export function npcQuestNav(def: NpcQuestDef): NavTarget {
  const st = useGameStore.getState(), o = def.objective;
  const who = npcQuestReady(def, st.npcQuests, st.inventory) ? npcQuestTurnIn(def) : o.type === 'TALK' ? String(o.target) : '';
  if (who) { const i = NPCS.findIndex((n) => n.name === who); if (i >= 0) return navNpc(i, SIDE); }
  if (o.type === 'INTERACT') {
    if (inCastle()) return exit(SIDE);
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
  if (o.type === 'ACTION' && ACTION_SPOT[String(o.target)]) { const r = navSpot(ACTION_SPOT[String(o.target)], SIDE); if (r) return r; }
  return portal(SIDE);
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
