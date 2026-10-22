import { feedReward } from '../../rewardFeed';
// NPC story quest logic (data in npcQuests.ts): accept, progress from engine events, turn-in + rewards, and the
// per-NPC marker cache read by render/Npcs.tsx. The state lives in the store (`npcQuests`, saved with the profile).
// Importing this module registers the event listeners (dialogue.ts imports it).
import { questXp } from '../../classLevels';
import { STORY } from '../../story';
import { storyWantsKill } from './storyLogic';
import { GOLD_SCALE, COLORS, PETS_POOL, ITEMS_POOL } from '../../constants';
import { useGameStore, makeItemById, instantiate } from '../../store';
import { events } from '../events';
import { world } from '../world';
import { LOOT_BY_ID, LOOT_TABLES, lootItem } from '../../loot';
import { spawnPickup } from './pickups';
import { Vector3 } from 'three';
import { BOSS_ROTATION } from '../enemyDefs';
import { addSpareFlasks } from './caveKit';
import { NPCS } from '../townData';
import { syncGateFlags, gateMask } from '../townGates';
import { GameStatus, type Item } from '../../types';
import {
  NPC_QUESTS, NPC_QUEST_BY_ID, npcQuestStatus, questGate, npcQuestReady, npcQuestTurnIn, npcMarker, npcQuestProgress, bagCount,
  type NpcQuestDef, type NpcQuestSave, type NpcObjective,
} from '../../npcQuests';

const save = (): NpcQuestSave => useGameStore.getState().npcQuests;
const notify = (msg: string, color: string = COLORS.uiAccent) => useGameStore.getState().addNotification(msg, color, 'SYSTEM');

/** (owner) abandon an accepted side quest: it goes back to being offered (progress lost; delivered goods stay in the bag). */
export function abandonNpcQuest(id: string): boolean {
  const st = useGameStore.getState(), e = st.npcQuests.q[id], def = NPC_QUEST_BY_ID[id];
  if (!def || !e || e.s !== 1) return false;
  const q = { ...st.npcQuests.q }; delete q[id];
  useGameStore.setState({ npcQuests: { ...st.npcQuests, q } });
  notify(`Quest abandoned: ${def.title}`);
  return true;
}

export function acceptNpcQuest(id: string): boolean {
  const def = NPC_QUEST_BY_ID[id], st = useGameStore.getState();
  if (!def || npcQuestStatus(def, st.npcQuests, st.heroRank) !== 'AVAILABLE') return false;
  useGameStore.setState({ npcQuests: { ...st.npcQuests, q: { ...st.npcQuests.q, [id]: { s: 1, p: 0 } } } });
  notify(`Quest accepted: ${def.title}`);
  return true;
}

/** Gear / pets are instantiated (affixes rolled); stackable goods go through makeItemById. */
function rewardItems(id: string, qty: number): Item[] {
  const tpl = PETS_POOL.find((i) => i.id === id) ?? ITEMS_POOL.find((i) => i.id === id);
  if (!tpl) return [];
  return tpl.type === 'PET' || tpl.type === 'WEAPON' || tpl.type === 'ARMOR' || tpl.type === 'HELMET' || tpl.type === 'GLOVES' || tpl.type === 'BOOTS' || tpl.type === 'ACCESSORY'
    ? Array.from({ length: qty }, () => instantiate(tpl)) : makeItemById(id, qty);
}

/** Removes `count` of a loot item from the bag (stacks shrink, empty stacks go). */
function takeLoot(inv: Item[], id: string, count: number): Item[] {
  const name = LOOT_BY_ID[id]?.name;
  let left = count;
  const out: Item[] = [];
  for (const it of inv) {
    if (left > 0 && it.type === 'LOOT' && it.name === name) {
      const q = it.quantity || 1, t = Math.min(q, left);
      left -= t;
      if (q - t > 0) out.push({ ...it, quantity: q - t });
    } else out.push(it);
  }
  return out;
}

/** Turn-in: removes delivered goods, pays gold / gems / shards / items. False (nothing changed) when the bag cannot hold the rewards. */
export function completeNpcQuest(id: string): boolean {
  const def = NPC_QUEST_BY_ID[id], st = useGameStore.getState();
  if (!def || !npcQuestReady(def, st.npcQuests, st.inventory)) return false;
  const before = st.inventory;
  let inv = before;
  const o = def.objective;
  if (o.type === 'DELIVER') inv = takeLoot(inv, (o.target as string), o.count);
  useGameStore.setState({ inventory: inv });
  const got: Item[] = [];
  for (const r of def.reward.items ?? []) {
    for (const it of rewardItems(r.id, r.qty ?? 1)) {
      got.push(it);
      if (!useGameStore.getState().addItemToInventory(it)) {
        useGameStore.setState({ inventory: before });
        notify('Bag is full! Make room, then come back.', 'red');
        return false;
      }
    }
  }
  const s = useGameStore.getState();
  useGameStore.setState({
    gold: s.gold + (def.reward.gold ?? 0) * GOLD_SCALE,
    gems: s.gems + (def.reward.gems ?? 0),
    npcQuests: { ...s.npcQuests, q: { ...s.npcQuests.q, [id]: { s: 2, p: def.objective.count } } },
  });
  if (def.reward.shards) s.addMaterial(def.reward.shards[0], def.reward.shards[1]);
  if (def.reward.flasks) { const n = addSpareFlasks(def.reward.flasks); if (n > 0) notify(`+${n} lantern oil flask${n === 1 ? '' : 's'} for the Crystal Cave`, '#ffd070'); }
  const qxp = questXp('SIDE', s.level); useGameStore.getState().addExperience(qxp);   // (owner) every quest pays EXP
  notify(`Quest complete: ${def.title}`);
  events.emit('hub', { kind: 'quest', n: 1 });   // (daily / weekly goals: 'Complete a quest')
  feedReward({ gold: (def.reward.gold ?? 0) * GOLD_SCALE, gems: def.reward.gems, items: got, shards: def.reward.shards?.[1], shardRarity: def.reward.shards?.[0], xp: qxp }, true);
  return true;
}

// ------------------------------------------------------------- progress ---
/** Adds progress to accepted quests whose objective matches. `hit` decides whether an objective listens to the event. */
function bump(type: NpcObjective['type'], amount: number, hit?: (o: NpcObjective) => boolean, absolute = false): void {
  const st = useGameStore.getState(), cur = st.npcQuests;
  let q: NpcQuestSave['q'] | null = null;
  for (const def of NPC_QUESTS) {
    const e = cur.q[def.id], o = def.objective;
    if (!e || e.s !== 1 || o.type !== type || e.p >= o.count || (hit && !hit(o))) continue;
    const p = Math.min(o.count, absolute ? Math.max(e.p, amount) : e.p + amount);
    if (p === e.p) continue;
    if (!q) q = { ...cur.q };
    q[def.id] = { s: 1, p };
    if (p >= o.count && o.type !== 'DELIVER') notify(`Objective complete: ${def.title}. Return to ${npcQuestTurnIn(def)}${st.status === GameStatus.PLAYING ? ' (tap the quest to teleport home)' : ''}.`);
  }
  if (q) useGameStore.setState({ npcQuests: { ...cur, q } });
}

/** Talking to an NPC: finishes TALK objectives that point at them. */
export function talkedTo(name: string): void { bump('TALK', 1, (o) => o.target === name); }
/** True when the NPC matters to an active quest right now: the main story step, a TALK target, or a giver / turn-in marker. */
export function questNpc(name: string): boolean {
  const st = useGameStore.getState();
  if (STORY[st.story.step]?.npc === name) return true;
  return NPC_QUESTS.some((d) => npcQuestStatus(d, st.npcQuests, st.heroRank) === 'ACTIVE'
    && ((d.objective.type === 'TALK' && d.objective.target === name) || (npcQuestTurnIn(d) === name && npcQuestReady(d, st.npcQuests, st.inventory))));
}
/** True when a ground item (by bag name) is still wanted by an active DELIVER quest (it gets a small gold light ray). */
export function questWantsItem(name: string): boolean {
  const st = useGameStore.getState();
  const step = STORY[st.story.step];   // the main story's current delivery
  if (step?.deliver && LOOT_BY_ID[step.deliver.id]?.name === name && bagCount(st.inventory, step.deliver.id) < step.deliver.count) return true;
  return NPC_QUESTS.some((d) => {
    if ((d.objective.type !== 'DELIVER' && d.objective.type !== 'COLLECT_LOOT') || npcQuestStatus(d, st.npcQuests, st.heroRank) !== 'ACTIVE') return false;
    const ids = Array.isArray(d.objective.target) ? d.objective.target : [d.objective.target];
    return ids.some((id) => LOOT_BY_ID[id as string]?.name === name) && !npcQuestReady(d, st.npcQuests, st.inventory);
  });
}
/** True when killing this enemy kind advances an active quest (main story or a side quest). */
export function questKill(kind: string, mini = false): boolean {
  const st = useGameStore.getState();
  if (storyWantsKill(kind, mini)) return true;
  return NPC_QUESTS.some((d) => d.objective.type === 'KILL_KIND' && d.objective.target === kind && npcQuestStatus(d, st.npcQuests, st.heroRank) === 'ACTIVE'
    && (st.npcQuests.q[d.id]?.p ?? 0) < d.objective.count);
}
events.on('hub', (e) => bump('ACTION', e.n, (o) => o.target === e.kind));
/** Farm / town actions (milk a cow, take an egg, find the cat). */
export function interacted(id: string): void { bump('INTERACT', 1, (o) => o.target === id); }
/** True while an accepted quest still needs this action. */
export function wantsInteract(id: string): boolean {
  const st = useGameStore.getState();
  return NPC_QUESTS.some((d) => d.objective.type === 'INTERACT' && d.objective.target === id && npcQuestStatus(d, st.npcQuests, st.heroRank) === 'ACTIVE' && (st.npcQuests.q[d.id]?.p ?? 0) < d.objective.count);
}

const BOSS_KINDS = new Set<string>(BOSS_ROTATION);
events.on('enemyDeath', (e) => {
  if (e.poof) return;
  bump('KILL_TOTAL', 1);
  bump('KILL_KIND', 1, (o) => o.target === e.kind);
  if (e.elite) bump('KILL_ELITE', 1);
  if (e.boss && BOSS_KINDS.has(e.kind)) {
    const cur = save();
    useGameStore.setState({ npcQuests: { ...cur, bossKills: { ...cur.bossKills, [e.kind]: (cur.bossKills[e.kind] || 0) + 1 } } });   // unlocks hidden quests
    bump('KILL_BOSS', 1, (o) => !o.target || o.target === e.kind);
  }
});
events.on('roomEnter', (e) => bump('REACH_BIOME', e.biome + 1, undefined, true));
events.on('pickup', (e) => {
  if (e.kind !== 'ITEM' || !e.name) return;
  // in town only the crystal cave counts as a "Crystal Cavern" (the run's last room type is stale there)
  const room = useGameStore.getState().status === GameStatus.MENU ? (world.village.area === 'CAVE' ? 'CRYSTAL' : '') : world.room.plan.type;
  bump('COLLECT_LOOT', 1, (o) => (!o.room || o.room === room) && (Array.isArray(o.target) ? o.target : [o.target]).some((id) => !!id && LOOT_BY_ID[id]?.name === e.name));
});

// -------------------------------------------------------------- markers ---
let mkSave: NpcQuestSave | null = null, mkInv: Item[] | null = null, mkRank = -1, mkGates = -1;
let mk: number[] = NPCS.map(() => 0);
/** Marker per NPC index (0 none, 1 "!", 2 grey "?", 3 gold "?"); recomputed only when the quest state / bag / rank changed. */
export function npcMarkers(): readonly number[] {
  const s = useGameStore.getState();
  if (s.npcQuests !== mkSave || s.inventory !== mkInv || s.heroRank !== mkRank || gateMask() !== mkGates) {
    mkSave = s.npcQuests; mkInv = s.inventory; mkRank = s.heroRank; mkGates = gateMask();
    mk = NPCS.map((d) => npcMarker(d.name, s.npcQuests, s.inventory, s.heroRank));
  }
  return mk;
}

/** What talking to `name` does: the quest to hand in, else the one to offer, else the unfinished one to remind about. */
export function questDialogueFor(name: string): { mode: 'turnin' | 'offer' | 'progress'; def: NpcQuestDef } | null {
  const s = useGameStore.getState();
  let offer: NpcQuestDef | null = null, prog: NpcQuestDef | null = null;
  for (const d of NPC_QUESTS) {
    const st = npcQuestStatus(d, s.npcQuests, s.heroRank);
    if (st === 'ACTIVE' && npcQuestTurnIn(d) === name) { if (npcQuestReady(d, s.npcQuests, s.inventory)) return { mode: 'turnin', def: d }; prog = prog ?? d; }
    else if (st === 'AVAILABLE' && d.giver === name) offer = offer ?? d;
  }
  if (offer) return { mode: 'offer', def: offer };
  return prog ? { mode: 'progress', def: prog } : null;
}

// side quests unlock after the main-story tutorial (story step 'king' reached = the town tutorial is done)
const GATE_STEP = Math.max(0, STORY.findIndex((st) => st.id === 'king'));
const syncGate = (step: number): void => { questGate.open = step >= GATE_STEP; syncGateFlags(step); };   // (+ the story gates, engine/townGates.ts: side quests behind a closed gate stay hidden)
setTimeout(() => {   // (deferred: this module loads while the store module is still initialising)
  syncGate(useGameStore.getState().story.step);
  useGameStore.subscribe((s, p) => { if (s.story !== p.story) syncGate(s.story.step); });
}, 0);

// ----------------------------------------------------------- quest drops ---
// While an accepted DELIVER quest still needs goods, monsters / harvest nodes that carry them drop them more often
// (25% per kill, harvest nodes always), so delivery side quests never turn into a 150-kill grind.
const _qd = new Vector3();
function wantedDrop(kind: string): string | null {
  const st = useGameStore.getState();
  const tbl = LOOT_TABLES[kind];
  if (!tbl) return null;
  for (const d of NPC_QUESTS) {
    const o = d.objective;
    if (o.type !== 'DELIVER' || st.npcQuests.q[d.id]?.s !== 1) continue;
    const id = String(o.target);
    if (tbl.includes(id) && npcQuestProgress(d, st.npcQuests, st.inventory) < o.count) return id;
  }
  return null;
}
function dropWanted(id: string, x: number, z: number): void {
  _qd.set(x + (Math.random() - 0.5) * 1.4, 0, z + (Math.random() - 0.5) * 1.4);
  spawnPickup('ITEM', _qd, 0, lootItem(LOOT_BY_ID[id]));
}
events.on('enemyDeath', (e) => {
  if (e.poof || Math.random() >= 0.25) return;
  const id = wantedDrop(e.kind);
  if (id) dropWanted(id, e.pos.x, e.pos.z);
});
events.on('crateBreak', (e) => { const id = wantedDrop(e.kind); if (id) dropWanted(id, e.pos.x, e.pos.z); });

/** "Rewards: 1,000 gold · 10 gems · Rare shards x15 · Health Potion x2" for a dialogue hint. */
export function npcRewardText(r: NpcQuestDef['reward']): string {
  const parts: string[] = [];
  parts.push(`${questXp('SIDE', useGameStore.getState().level).toLocaleString()} EXP`);
  if (r.gold) parts.push(`${(r.gold * GOLD_SCALE).toLocaleString()} gold`);
  if (r.gems) parts.push(`${r.gems} gems`);
  if (r.shards) parts.push(`${r.shards[0].charAt(0)}${r.shards[0].slice(1).toLowerCase()} shards x${r.shards[1]}`);
  if (r.flasks) parts.push(`Lantern Oil Flask x${r.flasks}`);
  for (const it of r.items ?? []) { const n = PETS_POOL.find((x) => x.id === it.id)?.name ?? ITEMS_POOL.find((x) => x.id === it.id)?.name ?? it.id; parts.push((it.qty ?? 1) > 1 ? `${n} x${it.qty}` : n); }
  return parts.length ? `Rewards: ${parts.join(' · ')}` : '';
}
/** Lines an NPC says when the hero passes on a message for an accepted TALK quest (said before talkedTo counts it). */
export function heardLines(name: string): string[] {
  const st = useGameStore.getState(), out: string[] = [];
  for (const d of NPC_QUESTS) {
    const o = d.objective;
    if (o.type === 'TALK' && o.target === name && d.heard && st.npcQuests.q[d.id]?.s === 1 && (st.npcQuests.q[d.id]?.p ?? 0) < o.count) out.push(...(Array.isArray(d.heard) ? d.heard : [d.heard]));
  }
  return out;
}
