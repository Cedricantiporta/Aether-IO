// Main story chain runtime: talking to the step's NPC advances it (dialogue.ts), kills of the step's enemy kind count
// during runs (also champions / the depth-10 pre-boss for `goal` steps), freed captives count for rescue steps, town
// actions (`hub` events) count for shop steps, the ending finishes the Lich step. Also answers "where does the main quest continue?" for the guide
// arrow, the gate beacon and the tracker click (storyTarget).
import { events } from '../events';
import { useGameStore } from '../../store';
import { STORY, stepCount, type StoryAt, type StoryStep } from '../../story';
import { LOOT_BY_ID, LOOT_TABLES, lootItem } from '../../loot';
import { spawnPickup } from './pickups';
import { Vector3 } from 'three';
import { SHOP_POSITIONS, GOLD_SCALE, ITEMS_POOL } from '../../constants';
import type { Item } from '../../types';
import { NPCS, PORTAL, GATE, TOWER } from '../townData';
import { CASTLE_DOOR } from '../castleData';
import { world, TRAINER_POS } from '../world';
import { storyBias, BIOMES } from '../roomDefs';

/** Loot of `id` in the bag. */
function bagCount(id: string): number {
  const name = LOOT_BY_ID[id]?.name;
  let n = 0;
  for (const it of useGameStore.getState().inventory) if (it.type === 'LOOT' && it.name === name) n += it.quantity || 1;
  return n;
}
/** Removes `count` of loot `id` from the bag. */
function takeLoot(id: string, count: number): void {
  const name = LOOT_BY_ID[id]?.name;
  let left = count;
  const out: Item[] = [];
  for (const it of useGameStore.getState().inventory) {
    if (left > 0 && it.type === 'LOOT' && it.name === name) { const q = it.quantity || 1, t = Math.min(q, left); left -= t; if (q - t > 0) out.push({ ...it, quantity: q - t }); }
    else out.push(it);
  }
  useGameStore.setState({ inventory: out });
}

/** "Rewards: 1,000 gold · 10 gems · Upgrade Core x2" for a dialogue line. */
export function rewardText(r: StoryStep['reward']): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`${(r.gold * GOLD_SCALE).toLocaleString()} gold`);
  if (r.gems) parts.push(`${r.gems} gems`);
  for (const it of r.items ?? []) { const n = ITEMS_POOL.find((x) => x.id === it.id)?.name ?? it.id; parts.push((it.qty ?? 1) > 1 ? `${n} x${it.qty}` : n); }
  return parts.length ? `Rewards: ${parts.join(' · ')}` : '';
}
/** The current step's offer when `npcName` gives it: its lines, then Accept (takes the quest, the chain moves on) / Later. */
function storyOffer(npcName: string): { lines: string[]; offer: string } | null {
  const s = useGameStore.getState().story, step = STORY[s.step];
  if (!step || step.npc !== npcName || !step.talk || step.deliver) return null;
  return { lines: [`Main quest: ${step.title}`, ...step.talk], offer: `story:${s.step}` };
}
/** What the current step's NPC says (null when `npcName` is not part of the main quest right now). A talk step is offered
 *  (Accept / Later, see acceptStory); a delivery step hands the goods over when they are in the bag, pays the reward and
 *  rolls straight on into the next offer when that NPC gives it, else the NPC repeats what it needs. */
export function storyTalk(npcName: string): { lines: string[]; offer: string } | null {
  const st = useGameStore.getState(), s = st.story, step = STORY[s.step];
  if (!step || step.npc !== npcName || !step.talk) return null;
  if (!step.deliver) return storyOffer(npcName);
  const have = bagCount(step.deliver.id), need = step.deliver.count, name = LOOT_BY_ID[step.deliver.id]?.name ?? step.deliver.id;
  if (have < need) { if (have !== s.p) st.setStory(s.step, have); return { lines: [`Main quest: ${step.title}`, ...(step.wait ?? []), `(${name}: ${have} / ${need})`], offer: '' }; }
  takeLoot(step.deliver.id, need);
  st.setStory(s.step + 1, 0);
  const lines = [`Quest complete: ${step.title}`, ...step.talk];
  const rw = rewardText(step.reward); if (rw) lines.push(rw);
  const nx = storyOffer(npcName);
  if (nx) { lines.push(...nx.lines); return { lines, offer: nx.offer }; }
  return { lines, offer: '' };
}
/** Accept on a main-quest offer: completes the talk step (its reward is paid) and moves the chain on. */
export function acceptStory(offer: string): void {
  const n = Number(offer.slice(6)), st = useGameStore.getState();
  if (st.story.step === n) st.setStory(n + 1, 0);
}

function bumpStory(n: number): void {
  const st = useGameStore.getState(), s = st.story, step = STORY[s.step], c = step ? stepCount(step) : 0;
  const p = Math.min(c, s.p + n);
  if (p >= c) st.setStory(s.step + 1, 0); else st.setStory(s.step, p);
}
/** True when killing this enemy (kind, champion flag) right now advances the current main step: its kill kind, or a
 *  champion / the depth-10 pre-boss of the step's biome for `goal` steps (also used for the quest icon on targets). */
export function storyWantsKill(kind: string, mini = false): boolean {
  const step = STORY[useGameStore.getState().story.step];
  if (!step) return false;
  if (step.kill) return kind === step.kill.kind || (step.kill.kind === 'SLIME_KING' && kind === 'SPLITTER' && mini);   // SLIME_KING: the Greenwood's depth-10 mini-boss
  const g = step.goal;
  if (!g || !mini || !world.room.active) return false;
  const pre = !!world.room.plan.preboss, b = world.room.biome;
  if (g.kind === 'CHAMPION') return !pre && b >= g.biome;   // champion rooms / dark hero duels, not the pre-boss
  if (g.kind === 'PREBOSS') return pre && b % BIOMES.length === g.biome;
  return false;
}
const _drop = new Vector3();
events.on('enemyDeath', (e) => {
  const st = useGameStore.getState(), step = STORY[st.story.step];
  if (!step || e.poof) return;
  if ((step.kill || step.goal) && storyWantsKill(e.kind, !!e.mini)) bumpStory(1);
  // quest drops: while a delivery step still needs goods this enemy carries, they drop often (35%)
  const d = step.deliver ?? (step.kill ? STORY[st.story.step + 1]?.deliver : undefined);   // (also while hunting just before it)
  if (d && LOOT_TABLES[e.kind]?.includes(d.id) && Math.random() < 0.35 && bagCount(d.id) < d.count) {
    _drop.set(e.pos.x + (Math.random() - 0.5) * 1.4, 0, e.pos.z + (Math.random() - 0.5) * 1.4);
    spawnPickup('ITEM', _drop, 0, lootItem(LOOT_BY_ID[d.id]));
  }
});
events.on('hub', (e) => {
  const step = STORY[useGameStore.getState().story.step];
  if (step?.act && step.act.kind === e.kind) bumpStory(e.n);
});
events.on('towerFloor', (e) => {   // post-game Tower step: progress = the best floor cleared
  const st = useGameStore.getState(), step = STORY[st.story.step];
  if (step?.act?.kind !== 'tower_floor' || e.floor <= st.story.p) return;
  if (e.floor >= step.act.count) st.setStory(st.story.step + 1, 0); else st.setStory(st.story.step, e.floor);
});
events.on('captiveFreed', () => {   // rescue steps: a captive freed in the step's biome (or deeper)
  const step = STORY[useGameStore.getState().story.step];
  if (step?.goal?.kind === 'RESCUE' && world.room.biome >= step.goal.biome) bumpStory(1);
});
events.on('crateBreak', (e) => {   // a harvest node that yields what a delivery step needs always gives one
  const st = useGameStore.getState(), step = STORY[st.story.step], d = step?.deliver ?? (step?.kill ? STORY[st.story.step + 1]?.deliver : undefined);
  if (!d || !LOOT_TABLES[e.kind]?.includes(d.id) || bagCount(d.id) >= d.count) return;
  _drop.set(e.pos.x + (Math.random() - 0.5) * 1.4, 0, e.pos.z + (Math.random() - 0.5) * 1.4);
  spawnPickup('ITEM', _drop, 0, lootItem(LOOT_BY_ID[d.id]));
});
// Steps already satisfied by the current state (gear equipped by drag / auto-equip, a pet already owned) finish on their own.
function stateDone(kind: string, count: number): boolean {
  const s = useGameStore.getState(), eq = s.equipment;
  if (kind === 'equip') return !!eq.helmet;   // the Leather Cap step (new heroes start with every slot but the helmet filled)
  if (kind === 'buy_pet') return !!eq.pet;
  if (kind === 'tower_floor') return (s.progress.towerBest[s.hero] ?? 0) >= count;   // already climbed that high
  return false;
}
let lastEq: unknown = null, lastStep = -1;
setTimeout(() => useGameStore.subscribe((st) => {   // (deferred: store <-> engine import cycle)
  if (st.equipment === lastEq && st.story.step === lastStep) return;
  lastEq = st.equipment; lastStep = st.story.step;
  const step = STORY[st.story.step];
  storyBias.rescue = step?.goal?.kind === 'RESCUE'; storyBias.champion = step?.goal?.kind === 'CHAMPION';   // rooms roll these more often meanwhile
  const at = st.story.step;
  if (step?.act && stateDone(step.act.kind, step.act.count)) queueMicrotask(() => {
    const now = useGameStore.getState();
    if (now.story.step === at && stateDone(step.act!.kind, step.act!.count)) now.setStory(at + 1, 0);
  });
}), 0);
events.on('pickup', (e) => {   // delivery steps: the tracker counts the goods as they are picked up
  if (e.kind !== 'ITEM' || !e.name) return;
  const st = useGameStore.getState(), step = STORY[st.story.step];
  if (step?.deliver && LOOT_BY_ID[step.deliver.id]?.name === e.name && st.story.p < step.deliver.count) st.setStory(st.story.step, st.story.p + 1);
});
events.on('gameEnding', () => {
  const st = useGameStore.getState(), s = st.story;
  if (STORY[s.step]?.ending) st.setStory(s.step + 1, 0);
});


export interface StoryTarget { x: number; z: number; area: 'TOWN' | 'CASTLE'; npc: number; /** a shop counter / board step */ shop: boolean }
const T: StoryTarget = { x: 0, z: 0, area: 'TOWN', npc: -1, shop: false };
/** Shop counters / the quest board (where shop steps are done). */
function atPos(at: StoryAt): { x: number; z: number } | null {
  if (at === 'BAG') return null;
  if (at === 'BOARD') { const h = NPCS.find((n) => n.name === 'Hodge'); return h ? { x: h.home[0], z: h.home[1] } : null; }
  if (at === 'TRAINER') return { x: TRAINER_POS[0], z: TRAINER_POS[2] + 2.6 };
  if (at === 'TOWER') return { x: TOWER.door.x, z: TOWER.door.z };
  const sp = SHOP_POSITIONS.find((p) => p.type === at);
  const r = sp?.rot ?? 0;   // shops face +z, rotated by rot
  if (!sp) return at === 'BREWER' ? { x: GATE.x, z: GATE.z + 4 } : null;   // a shop not built (yet): the Brewer's hut is outside the gate
  return { x: sp.position[0] + Math.sin(r) * 3, z: sp.position[2] + Math.cos(r) * 3 };   // in front of the counter
}
/** Where the main quest continues right now (null when the chain is finished or the step is done from the bag).
 *  Talk / delivery steps point at the NPC, shop steps at the shop, field steps at the town gate. */
export function storyTarget(): StoryTarget | null {
  const s = useGameStore.getState().story, step = STORY[s.step];
  if (!step) return null;
  if (step.npc) {
    const i = NPCS.findIndex((n) => n.name === step.npc);
    if (i >= 0) { const n = NPCS[i]; T.x = n.home[0]; T.z = n.home[1]; T.area = n.area === 'CASTLE' ? 'CASTLE' : 'TOWN'; T.npc = i; T.shop = false; return T; }
  }
  if (step.at) {
    const p = atPos(step.at);
    if (!p) return null;
    T.x = p.x; T.z = p.z; T.area = 'TOWN'; T.npc = -1; T.shop = true; return T;
  }
  T.x = PORTAL.front.x; T.z = PORTAL.front.z; T.area = 'TOWN'; T.npc = -1; T.shop = false;   // field steps: the Adventure Portal
  return T;
}
/** The point to aim at from the current area (an NPC inside the castle is reached through the castle door). */
export function storyAim(area: 'TOWN' | 'CASTLE'): { x: number; z: number } | null {
  const t = storyTarget();
  if (!t) return null;
  if (t.area === area) return t;
  return area === 'TOWN' ? { x: CASTLE_DOOR.x, z: CASTLE_DOOR.z } : null;   // (castle -> town: the exit, handled by callers)
}
