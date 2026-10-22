import { trueEndingReady, trueEndingNeed } from '../../dreams';
// Main story chain runtime: talking to the step's NPC advances it (dialogue.ts), kills of the step's enemy kind count
// during runs (also champions / the depth-10 pre-boss for `goal` steps), freed captives count for rescue steps, town
// actions (`hub` events) count for shop steps, the ending finishes the Lich step. (Where the main quest continues for the guide
// arrow, the gate beacon and the tracker click: engine/systems/questNav.ts mainNav.)
import { questXp } from '../../classLevels';
import { events } from '../events';
import { useGameStore, makeItemById } from '../../store';
import { STORY, stepCount, type StoryStep } from '../../story';
import { LOOT_BY_ID, LOOT_TABLES, lootItem } from '../../loot';
import { spawnPickup } from './pickups';
import { Vector3 } from 'three';
import { GOLD_SCALE, ITEMS_POOL } from '../../constants';
import { GameStatus, type Item } from '../../types';
import { world } from '../world';
import { storyBias, BIOMES } from '../roomDefs';
import { liveStep } from '../../questUnlocks';

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
  parts.push(`${questXp('STORY', useGameStore.getState().level).toLocaleString()} EXP`);
  if (r.gold) parts.push(`${(r.gold * GOLD_SCALE).toLocaleString()} gold`);
  if (r.gems) parts.push(`${r.gems} gems`);
  for (const it of r.items ?? []) { const n = ITEMS_POOL.find((x) => x.id === it.id)?.name ?? it.id; parts.push((it.qty ?? 1) > 1 ? `${n} x${it.qty}` : n); }
  return parts.length ? `Rewards: ${parts.join(' · ')}` : '';
}
/** The current step's offer when `npcName` gives it: its lines, then Accept (takes the quest, the chain moves on) / Later. */
function storyOffer(npcName: string): { lines: string[]; offer: string } | null {
  const s = useGameStore.getState().story, step = liveStep(useGameStore.getState());   // (a still-locked step is not offered: questUnlocks.ts)
  if (!step || step.npc !== npcName || !step.talk || step.deliver) return null;
  return { lines: step.talk.slice(), offer: `story:${s.step}` };
}
/** What the current step's NPC says (null when `npcName` is not part of the main quest right now). A talk step is offered
 *  (Accept / Later, see acceptStory); a delivery step hands the goods over when they are in the bag, pays the reward and
 *  rolls straight on into the next offer when that NPC gives it, else the NPC repeats what it needs. */
export function storyTalk(npcName: string): { lines: string[]; offer: string } | null {
  const st = useGameStore.getState(), s = st.story, step = liveStep(st);
  if (!step || step.npc !== npcName || !step.talk) return null;
  if (!step.deliver) return storyOffer(npcName);
  const have = bagCount(step.deliver.id), need = step.deliver.count, name = LOOT_BY_ID[step.deliver.id]?.name ?? step.deliver.id;
  if (have < need) { if (have !== s.p) st.setStory(s.step, have); return { lines: [...(step.wait ?? []), `(${name}: ${have} / ${need})`], offer: '' }; }
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
  const step = liveStep(useGameStore.getState());
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
  const st = useGameStore.getState(), step = liveStep(st);
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
  const step = liveStep(useGameStore.getState());
  if (step?.act && step.act.kind === e.kind) bumpStory(e.n);
});
events.on('towerFloor', (e) => {   // post-game Tower step: progress = the best floor cleared
  const st = useGameStore.getState(), step = liveStep(st);
  if (step?.act?.kind !== 'tower_floor' || e.floor <= st.story.p) return;
  if (e.floor >= step.act.count) st.setStory(st.story.step + 1, 0); else st.setStory(st.story.step, e.floor);
});
events.on('captiveFreed', () => {   // rescue steps: a captive freed in the step's biome (or deeper)
  const step = liveStep(useGameStore.getState());
  if (step?.goal?.kind === 'RESCUE' && world.room.biome >= step.goal.biome) bumpStory(1);
});
events.on('crateBreak', (e) => {   // a harvest node that yields what a delivery step needs always gives one
  const st = useGameStore.getState(), step = liveStep(st), d = step?.deliver ?? (step?.kill ? STORY[st.story.step + 1]?.deliver : undefined);
  if (!d || !LOOT_TABLES[e.kind]?.includes(d.id) || bagCount(d.id) >= d.count) return;
  _drop.set(e.pos.x + (Math.random() - 0.5) * 1.4, 0, e.pos.z + (Math.random() - 0.5) * 1.4);
  spawnPickup('ITEM', _drop, 0, lootItem(LOOT_BY_ID[d.id]));
});
// Steps already satisfied by the current state (gear equipped by drag / auto-equip, a pet already owned) finish on their own.
function stateDone(kind: string, count: number): boolean {
  const s = useGameStore.getState(), eq = s.equipment;
  if (kind === 'equip') return !!eq.weapon && !eq.weapon.id.startsWith('start');   // the summoned class weapon (the starter one has a 'start' id)
  if (kind === 'buy_pet') return !!eq.pet;
  if (kind === 'tower_floor') return (s.progress.towerBest[s.hero] ?? 0) >= count;   // already climbed that high
  return false;
}
/** Live progress of the current main step for the tracker (delivery steps read the bag, so selling the goods shows). */
export function storyProgress(): number {
  const s = useGameStore.getState().story, step = STORY[s.step];
  if (step?.deliver) return Math.min(step.deliver.count, bagCount(step.deliver.id));
  return s.p;
}
let lastEq: unknown = null, lastStep = -1;
setTimeout(() => useGameStore.subscribe((st) => {   // (deferred: store <-> engine import cycle)
  if (st.equipment === lastEq && st.story.step === lastStep) return;
  const moved = lastStep >= 0 && st.story.step > lastStep;
  lastEq = st.equipment; lastStep = st.story.step;
  // finished a field step during a run and the chain continues in town: say how to get there (the tracker offers a teleport)
  const nx = liveStep(st);
  if (moved && st.status === GameStatus.PLAYING && nx && (nx.npc || nx.at) && !nx.deliver)
    queueMicrotask(() => useGameStore.getState().addNotification(`Next: ${nx.line}. Tap the main quest to teleport home.`, '#f1d58e', 'SYSTEM'));
  const step = liveStep(st);
  storyBias.rescue = step?.goal?.kind === 'RESCUE'; storyBias.champion = step?.goal?.kind === 'CHAMPION';   // rooms roll these more often meanwhile
  const at = st.story.step;
  // (fix) "Suit Up" needs a weapon the hero can wear: saves whose tutorial pull was a pet / high-level piece get the class
  // Common weapon once
  if (step?.id === 'equip' && !stateDone('equip', 1) && !st.inventory.some((i) => i.type === 'WEAPON' && i.classType === st.hero && !i.id.startsWith('start'))) queueMicrotask(() => {
    const now = useGameStore.getState();
    if (STORY[now.story.step]?.id !== 'equip') return;
    const w = makeItemById(`w_${now.hero.toLowerCase()}_0a`, 1)[0];
    if (w && now.addItemToInventory(w)) now.addNotification(`Received ${w.name}: equip it from your bag (I).`, '#f1d58e', 'ITEM');
  });
  if (step?.act && stateDone(step.act.kind, step.act.count)) queueMicrotask(() => {
    const now = useGameStore.getState();
    if (now.story.step === at && stateDone(step.act!.kind, step.act!.count)) now.setStory(at + 1, 0);
  });
}), 0);
events.on('pickup', (e) => {   // delivery steps: the tracker counts the goods as they are picked up
  if (e.kind !== 'ITEM' || !e.name) return;
  const st = useGameStore.getState(), step = liveStep(st);
  if (step?.deliver && LOOT_BY_ID[step.deliver.id]?.name === e.name && st.story.p < step.deliver.count) {
    const have = Math.min(step.deliver.count, bagCount(step.deliver.id));
    st.setStory(st.story.step, Math.max(st.story.p + 1, have));
    if (have >= step.deliver.count) st.addNotification(`You have all ${step.deliver.count} ${e.name}. Bring them to ${step.npc}${st.status === GameStatus.PLAYING ? ' (tap the main quest to teleport home)' : ''}.`, '#f1d58e', 'SYSTEM');
  }
});
events.on('gameEnding', () => {
  const st = useGameStore.getState(), s = st.story;
  if (!liveStep(st)?.ending) return;
  if (STORY[s.step].id === 'remember' && !trueEndingReady(st.progress.endings)) {   // (owner, Hades-like) not yet: the memory slips away
    st.addNotification(`Her words slip away as the Font pulls you home... (${trueEndingNeed(st.progress.endings)})`, '#fff3c4', 'SYSTEM');
    return;
  }
  st.setStory(s.step + 1, 0);
});
