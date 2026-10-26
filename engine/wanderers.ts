import { bedWake } from './systems/village';
import { announceUnlock } from './deathFlow';
import { wake } from './dreamFx';
import { trueEndingReady, dreamView, dreamLines, markDreamSeen, dreamsSeen, DREAMS } from '../dreams';
import { storyIdx } from '../story';
// ============================================================================
// Wanderers: memorable characters met now and then in a cleared adventure room (beyond the King and the townsfolk).
// Each has a short story told over the run (their lines follow the biome) and one offer: a rest by the fire, a
// prophecy, a gamble, a bounty or supplies. At most one per room, two per biome, each met once per run.
// The director spawns them (maybeWanderer) and routes the E-interaction here (talkWanderer); render/Wanderer.tsx
// draws the one standing in the room.
// ============================================================================
import { world } from './world';
import { events } from './events';
import { useGameStore, makeItemById } from '../store';
import { GOLD_SCALE } from '../constants';
import { openCustomDialogue } from './systems/dialogue';
import { spawnPickup } from './systems/pickups';
import { isSpawnable } from './systems/enemies';
import { rarityForDepth, BIOMES, bossNameIn } from './roomDefs';
import { BOSS_NAMES } from './enemyDefs';
import { runInfo, shipState } from './runMods';
import type { CharKey } from '../render/characters';

export interface WandererDef {
  id: string; name: string; title: string; model: CharKey; tint: string; accent: string;
  biomes: number[];
  /** story lines per biome index (falls back to the first) */
  lines: Record<number, string[]> & { 0: string[] };
  offer: string;   // button label
  /** (owner cameo) KEETO: all-black clothes + a blade in each hand */
  look?: 'DUAL_BLACK';
}

export const WANDERERS: readonly WandererDef[] = [
  { id: 'ALDRIC', name: 'Ser Aldric', title: 'The Last Oathsworn', model: 'KNIGHT', tint: '#b8c4d8', accent: '#c8d4e6', biomes: [0, 1, 2, 4],
    lines: {
      0: ['Hold, friend. I am Aldric, last of the Oathsworn. We swore to guard the old king, and we failed him.', 'Malakar was his court mage once. He drank the Aether until it drank him back.', 'Sit a while. My fire is small, but it mends.'],
      1: ['These halls were our home. I walked them in white steel when the banners still hung straight.', 'Gorath\'s tread cracks the stone now. Even the castle forgets us.', 'Rest by my fire before you go deeper.'],
      4: ['The cold reminds me of the night the castle fell. Malakar did not need an army. He needed one open door.', 'Warm yourself, hero. You will need the strength.'],
    },
    offer: 'Rest by the fire' },
  { id: 'LYRA', name: 'Lyra', title: 'The Wandering Seer', model: 'WIZARD', tint: '#d8c0ff', accent: '#c8a8ff', biomes: [0, 1, 2, 3, 4, 5, 6],
    lines: { 0: ['I have seen you before, in the smoke. You keep coming back, do you not? The Aether will not let you rest.', 'Cross my palm with patience and I will tell you what waits at the end of this road.'] },
    offer: 'Hear the prophecy' },
  { id: 'MAGS', name: 'Old Mags', title: 'The Gambler', model: 'ROGUE', tint: '#f0d8a0', accent: '#e8c070', biomes: [1, 2, 3, 4, 5],
    lines: { 0: ['Ha! A live one. Name\'s Mags. I deal in luck, and luck is the only coin that spends down here.', 'Toss me some gold. Heads, you walk away with something shiny. Tails, well, the dark keeps it.'] },
    offer: 'Gamble' },
  { id: 'FEN', name: 'Brother Fen', title: 'The Gravedigger', model: 'BARBARIAN', tint: '#9a9488', accent: '#b0a890', biomes: [1, 5, 6],
    lines: { 0: ['Too many dead walk these roads, and too few stay buried. I bury what I can.', 'Thin their numbers for me. Thirty of them, and I will pay you from the graves\' own purses.'] },
    offer: 'Take the bounty' },
  { id: 'KAELEN', name: 'Kaelen', title: 'The Lost Scout', model: 'ARCHER', tint: '#c8e0b0', accent: '#9bd26a', biomes: [0, 2, 3, 4, 5, 6],
    lines: {
      0: ['Easy! I am a scout from Aether Village. Or I was, before the forest swallowed my patrol.', 'I have more potions than sense left. Take some; you will put them to better use.'],
      2: ['The sand eats tracks faster than I can read them. Something huge walks under the dunes. Stay clear of the deep sand.', 'Here, take my spare flasks.'],
      3: ['I swam here. Do not ask. The crabs here pinch, the pirates pinch harder, and the Hydra eats both.', 'Take these, they are only a little salty.'],
      6: ['I followed a light into the Void and could not find the way back. If you reach the Herald, end it for all of us.', 'Take these. I will not be needing them.'],
    },
    offer: 'Take the supplies' },
  // (owner: anime cameo) a black-clad dual-wielding swordsman (Riruru the slime is a monster: systems/riruru.ts)
  { id: 'KEETO', name: 'Keeto', title: 'The Black Swordsman', model: 'ARCHER', tint: '#16161c', accent: '#8fa8ff', biomes: [1, 2, 3, 4, 5], look: 'DUAL_BLACK',
    lines: { 0: [
      'Relax, I am not a monster. Just a solo player. I work better alone.',
      'Most fighters carry one sword. I found out the hard way that one is not enough.',
      'Sixteen hits, faster than they can blink. That is the whole trick. Want me to show you a few moves?',
    ] },
    offer: 'Spar with Keeto' },
  // the ship start (never met at random): the captain waits in the first camp and hands out a card deck (store.chooseShipDeck)
  { id: 'RHEA', name: 'Captain Rhea Saltwind', title: 'Ship Captain', model: 'KNIGHT', tint: '#f3e3c3', accent: '#6fd0e0', biomes: [],
    lines: { 0: [
      'Welcome ashore, hero! The Gull Queen drops her guests wherever the tide is kindest. Here, mostly.',
      'You skipped the long road through three realms. A fighter should not skip the tools that road gives.',
      'So I packed five decks of cards, ready to wear. Pick the one that suits you and I will open the way.',
    ] },
    offer: 'Choose a deck' },
  // the epilogue (never met at random): the light Malakar stole, waiting in a forest clearing after the final fight
  { id: 'KEEPER', name: 'Aelia', title: 'Keeper of the Font', model: 'WIZARD', tint: '#ffffff', accent: '#fff3c4', biomes: [],
    lines: { 0: [
      'You came through again. You always do. You will not remember this; you never do.',
      'I am Aelia. For ten years I have been light in a jar, the warmth Malakar snatched back from the dark.',
      'Listen, quickly, before the Font takes you home: the man on my father\'s throne is not my father. He wanted to marry me. I said no.',
      'He changed the oath. Every time you return, the Font takes what you saw here. Ask Wren about the blank pages.',
      'There. It is starting. Goodbye, guard. Again.',
    ], 1: [
      'You came through. And you are holding the old oath. Good. This time it will stay with you.',
      'Aldric was a prince who wanted my hand. I refused him, and my father refused him. So he went to the Hollow beneath the Font, and it gave him everything my father had.',
      'The beasts you fight out there were my father\'s protectors. His knights, his dragon, his captain. Gorath... Gorath was my father. I died the night they changed. Mostly. Malakar caught what was left.',
      'You have been sent to fetch me for the man who did it. Do not forget it. Go home. Tell Wren. Then come and find me in the castle.',
    ], 2: [
      'You again! Out here, for old times\' sake? I do miss the trees.',
      'Malakar is resting a little easier tonight. You did that.',
      'Go home, guard. The throne is very uncomfortable, and I would like someone to complain to.',
    ] },
    offer: 'Return home' },
];

/** Captain Rhea's parting line once the deck is chosen (director.shipChosen). */
export const RHEA_GOODBYE = 'Fair winds, hero! Go show those Isles who the crabs should fear.';

/** The wanderer in the current room (render reads it). */
export const wander = { on: false, def: 0, x: 0, z: 0, used: false, ver: 0 };
const met = new Set<string>();
let perBiome = 0, lastBiome = -1;
const bounty = { on: false, need: 30, got: 0, biome: 0 };

export function resetWanderers(): void { met.clear(); perBiome = 0; lastBiome = -1; bounty.on = false; clearWanderer(); }
export function clearWanderer(): void { if (wander.on) { wander.on = false; wander.ver++; } }

const CHANCE = 0.12;   // at most one wanderer per biome, and often none
/** A fight room was cleared: maybe a wanderer is waiting in it. */
export function maybeWanderer(biome: number, index: number, type: string, gateOrFinal: boolean): void {
  if (runInfo.mode !== 'ADVENTURE' || gateOrFinal || index < 1) return;
  if (type !== 'COMBAT' && type !== 'ELITE' && type !== 'TREASURE') return;
  const b = biome % BIOMES.length;
  if (b !== lastBiome) { lastBiome = b; perBiome = 0; }
  if (perBiome >= 1 || Math.random() >= CHANCE) return;
  const pool = WANDERERS.map((w, i) => i).filter((i) => !met.has(WANDERERS[i].id) && WANDERERS[i].biomes.includes(b) && !(WANDERERS[i].id === 'FEN' && bounty.on));
  if (!pool.length) return;
  const i = pool[Math.floor(Math.random() * pool.length)];
  // a free spot a few steps from the hero
  const p = world.player.pos;
  for (let t = 0; t < 16; t++) {
    const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 3;
    const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    if (!isSpawnable(x, z)) continue;
    met.add(WANDERERS[i].id); perBiome++;
    wander.on = true; wander.def = i; wander.x = x; wander.z = z; wander.used = false; wander.ver++;
    useGameStore.getState().addNotification(`${WANDERERS[i].name}, ${WANDERERS[i].title}, is resting here.`, WANDERERS[i].accent, 'SYSTEM');
    return;
  }
}

/** The biome camp's waystation: a traveller (a wanderer of this biome not met yet this run) is resting by the fire. */
export function placeCampWanderer(biome: number, x: number, z: number): void {
  if (runInfo.mode !== 'ADVENTURE') return;
  const b = biome % BIOMES.length;
  const pool = WANDERERS.map((w, i) => i).filter((i) => !met.has(WANDERERS[i].id) && WANDERERS[i].biomes.includes(b) && !(WANDERERS[i].id === 'FEN' && bounty.on));
  if (!pool.length) return;
  const i = pool[Math.floor(Math.random() * pool.length)];
  met.add(WANDERERS[i].id);
  wander.on = true; wander.def = i; wander.x = x; wander.z = z; wander.used = false; wander.ver++;
}

function linesFor(d: WandererDef): string[] {
  const b = world.room.biome % BIOMES.length;
  return (d.lines[b] ?? d.lines[0]).slice();
}

/** The ship start: Captain Rhea stands by the camp fire (director.enterRoom). */
export function placeShipCaptain(x: number, z: number): void {
  wander.on = true; wander.def = WANDERERS.findIndex((w) => w.id === 'RHEA'); wander.x = x; wander.z = z; wander.used = false; wander.ver++;
}

/** The epilogue: Aelia stands in the clearing (director.onCleared of the epilogue room). */
export function placeKeeper(x: number, z: number): void {
  wander.on = true; wander.def = WANDERERS.findIndex((w) => w.id === 'KEEPER'); wander.x = x; wander.z = z; wander.used = false; wander.ver++;
}

/** Aelia's words at the end: 0 = the Font makes you forget (hints), 1 = the run you remember (story 'remember'), 2 = she is queen. */
function keeperStage(): number {
  const step = useGameStore.getState().story.step;
  return step >= storyIdx('wren4') ? 2 : step === storyIdx('remember') && trueEndingReady(useGameStore.getState().progress.endings) ? 1 : 0;   // (true ending only on the 10th clear, every dream seen)
}

/** E at the wanderer: their story, then the offer (once). */
export function talkWanderer(): void {
  if (!wander.on || shipState.open) return;
  const d = WANDERERS[wander.def], st = useGameStore.getState();
  if (d.id === 'KEEPER' && world.room.plan.dream) {   // (owner) a Font dream: her lines, then you wake in town
    const dr = dreamView.pending;
    openCustomDialogue('Aelia', `A dream at the Font${dr ? ` · ${dr.title}` : ''}`, d.accent, dr ? dreamLines(dr, useGameStore.getState().hero) : ['...'], { label: 'Wake up', accept: () => {
      if (dr) markDreamSeen(Math.max(dreamsSeen(), DREAMS.indexOf(dr) + 1));
      dreamView.pending = null;
      wake(() => { bedWake.on = true; useGameStore.getState().resetGame(); announceUnlock(2200); });   // (slow fade to gold, then home: awake in bed; then who came knocking while you slept)
    } });
    return;
  }
  if (d.id === 'KEEPER') {   // her words, then the ending slides and home
    openCustomDialogue(d.name, d.title, d.accent, (d.lines[keeperStage()] ?? d.lines[0]).slice(), { label: d.offer, accept: () => { if (!wander.used) { wander.used = true; events.emit('gameEnding', {}); } } });
    return;
  }
  if (d.id === 'RHEA') {   // the deck choice opens a window (ui/screens/ShipDecks.tsx); afterwards only a goodbye
    if (!shipState.lock) { openCustomDialogue(d.name, d.title, d.accent, [RHEA_GOODBYE]); return; }
    openCustomDialogue(d.name, d.title, d.accent, linesFor(d), { label: d.offer, accept: () => { if (shipState.lock) shipState.open = true; } });
    return;
  }
  const lines = linesFor(d);
  if (wander.used) { openCustomDialogue(d.name, d.title, d.accent, ['Safe travels. May we meet again on a kinder road.']); return; }
  const b = world.room.biome % BIOMES.length;
  let label = d.offer;
  if (d.id === 'MAGS') { label = `Gamble ${gambleCost(b).toLocaleString()} gold`; }
  if (d.id === 'LYRA') {
    const boss = bossNameIn(BIOMES[b].boss, b);
    lines.push(`At the end of ${BIOMES[b].name} waits ${boss.name}, ${boss.title}. I see fire, and a crown of ash, and you still standing.`);
  }
  openCustomDialogue(d.name, d.title, d.accent, lines, { label, accept: () => accept(d, b) });
  void st;
}

const gambleCost = (b: number): number => (60 + 25 * b) * GOLD_SCALE * 10;   // (owner) x10

function accept(d: WandererDef, b: number): void {
  const st = useGameStore.getState(), p = world.player;
  switch (d.id) {
    case 'ALDRIC': {
      const before = p.hp;
      p.hp = st.stats.maxHealth; p.mana = st.stats.maxMana;
      events.emit('heal', { pos: p.pos, amount: p.hp - before });
      st.addNotification('Ser Aldric\'s fire mends you completely.', d.accent, 'SYSTEM');
      break;
    }
    case 'KEETO': {   // a sparring lesson: a free Rare+ blade-arm drop at this depth
      const it = st.rollItemDrop(rarityForDepth(b * 10 + 8, 0.8, world.run.bossKills));
      if (it) spawnPickup('ITEM', p.pos.clone().setX(p.pos.x + 1.2), 0, it);
      st.addGold(80 * (b + 1) * GOLD_SCALE);
      st.addNotification('Keeto: "Not bad. You might survive this world after all."', d.accent, 'SYSTEM');
      break;
    }
    case 'LYRA':
      st.addGems(30);
      st.addNotification('Lyra\'s prophecy: +30 gems', d.accent, 'SYSTEM');
      break;
    case 'MAGS': {
      const cost = gambleCost(b);
      if (st.gold < cost) { st.addNotification('Old Mags: "No coin, no luck, friend."', 'red', 'WARNING'); return; }
      st.addGold(-cost);
      if (Math.random() < 0.55) {
        const depth = b * 10 + 5;
        const it = st.rollItemDrop(rarityForDepth(depth, 0, 0));   // (owner) lower rarity odds: no luck bonus, no boss-kill mythic chance
        if (it) spawnPickup('ITEM', p.pos.clone().setX(p.pos.x + 1.2), 0, it);
        st.addNotification('Old Mags: "Heads! Lady Luck likes you."', '#ffd24a', 'SYSTEM');
      } else st.addNotification('Old Mags: "Tails. The dark keeps it. Again?"', '#c8c0b0', 'SYSTEM');
      return;   // (gambling can be repeated: not marked used)
    }
    case 'FEN':
      bounty.on = true; bounty.got = 0; bounty.need = 30; bounty.biome = b;
      st.addNotification('Bounty: slay 30 monsters for Brother Fen.', d.accent, 'SYSTEM');
      break;
    case 'KAELEN': {
      const items = [...makeItemById('potion_hp', 1), ...makeItemById('potion_mana', 1)];
      let ok = true;
      for (const it of items) if (!st.addItemToInventory(it)) ok = false;
      st.addNotification(ok ? 'Kaelen\'s supplies: 2 Health Potions, 1 Mana Potion' : 'Bag is full!', ok ? d.accent : 'red', ok ? 'SYSTEM' : 'WARNING');
      break;
    }
  }
  wander.used = true;
}

// Brother Fen's bounty: counts kills anywhere in the run, pays out automatically
events.on('enemyDeath', (e) => {
  if (!bounty.on || e.poof || e.boss) return;
  if (++bounty.got >= bounty.need) {
    bounty.on = false;
    const st = useGameStore.getState();
    st.addGold((80 + 30 * bounty.biome) * GOLD_SCALE); st.addGems(30);
    st.addNotification(`Brother Fen's bounty complete: +${((80 + 30 * bounty.biome) * GOLD_SCALE).toLocaleString()} gold, +30 gems`, '#ffd24a', 'SYSTEM');
    events.emit('floatText', { pos: world.player.pos, text: 'BOUNTY COMPLETE', color: 0xffd24a, scale: 1.1, dy: 2.6 });
  }
});
/** HUD hint while a bounty runs. */
export function bountyText(): string { return bounty.on ? `Fen's bounty ${bounty.got}/${bounty.need}` : ''; }
