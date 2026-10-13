// ============================================================================
// Town layout + NPC cast (pure data, no three / no React). Read by:
//  * engine/mapgen.ts          -> TOWN_CLEAR (keep random scenery out of the town)
//  * engine/systems/village.ts -> colliders, gate position, NPC pills
//  * engine/systems/npcs.ts    -> NPC / animal behaviour
//  * render/TownScenery.tsx + render/Npcs.tsx -> drawing
// Coordinates are world x / z. A building's door faces +z at rot = 0 (facing vector = (sin rot, cos rot)).
// ============================================================================

export interface HouseSpec { x: number; z: number; rot: number; w: number; d: number; floors: 1 | 2; wall: string; roof: string; trim: string; chimney: boolean; door: string }
export interface StallSpec { x: number; z: number; rot: number; c1: string; c2: string; goods: 0 | 1 | 2 | 3 }
export interface RoadSpec { x1: number; z1: number; x2: number; z2: number; w: number }

export const GATE = { x: 0, z: 44 };
export const PLAZA = { x: 0, z: 2, r: 9.5 };
export const WELL_POS = { x: 6.5, z: -4.5 };
export const PEN = { x: -24, z: 28.5, hw: 5, hd: 3 };

const WALLS = ['#efe2c0', '#e8cfa3', '#d9d2c4', '#c9d8c0', '#e6bfa6', '#cbd5e8', '#f1e6d0'];
const ROOFS = ['#b8483a', '#3f74d0', '#5a8f4a', '#8a5a3a', '#d6b052', '#7a5aa8', '#cf7b2e', '#b8483a'];
const DOORS = ['#5a3a1e', '#7a3a2a', '#2f5a7a', '#3e5a2e'];

const H = (x: number, z: number, rot: number, w: number, d: number, floors: 1 | 2 = 1): HouseSpec => {
  const n = HOUSE_COUNT++;
  return { x, z, rot, w, d, floors, wall: WALLS[(n * 3 + 1) % WALLS.length], roof: ROOFS[(n * 5 + 2) % ROOFS.length], trim: n % 3 === 0 ? '#6e4b2b' : '#f4ead2', chimney: n % 2 === 0, door: DOORS[n % DOORS.length] };
};
let HOUSE_COUNT = 0;

export const HOUSES: HouseSpec[] = [
  // north of the east-west street
  H(-38, 8.5, 0, 5.4, 4.6, 2), H(-29, 8.5, 0, 4.4, 4.0), H(29, 8.5, 0, 4.8, 4.2), H(38, 8.5, 0, 5.6, 4.6, 2),
  // south of the east-west street
  H(-35, 19.5, Math.PI, 5.0, 4.2), H(-26, 19.5, Math.PI, 4.6, 4.0, 2), H(-17, 19.5, Math.PI, 4.4, 3.8), H(17, 19.5, Math.PI, 4.4, 3.8, 2), H(26, 19.5, Math.PI, 5.0, 4.2), H(35, 19.5, Math.PI, 4.6, 4.0),
  // along the road to the gate
  H(-11, 28, Math.PI / 2, 4.6, 4.2), H(11, 31, -Math.PI / 2, 5.0, 4.4, 2), H(-11, 37, Math.PI / 2, 4.2, 3.8),
  // outskirts
  H(-40, -26, 0.4, 5.2, 4.4), H(-48, -14, 0.9, 4.6, 4.0, 2), H(32, -26, -0.3, 5.0, 4.4), H(46, -14, -1.1, 4.8, 4.2),
  H(-47, -3, Math.PI / 2, 4.6, 4.0), H(47, 3, -Math.PI / 2, 5.0, 4.4, 2),
];

export const STALLS: StallSpec[] = [
  { x: -11, z: 3, rot: Math.PI / 2, c1: '#d94a3a', c2: '#f4f4f4', goods: 0 },
  { x: 11, z: 3, rot: -Math.PI / 2, c1: '#3f74d0', c2: '#f4f4f4', goods: 1 },
  { x: -7, z: 9.5, rot: 0.25, c1: '#3f9a4a', c2: '#f4ead2', goods: 2 },
  { x: 7, z: 9.5, rot: -0.25, c1: '#cf7b2e', c2: '#f4f4f4', goods: 3 },
];

export const ROADS: RoadSpec[] = [
  { x1: 0, z1: -15, x2: 0, z2: 50, w: 5 },
  { x1: -46, z1: 14, x2: 46, z2: 14, w: 4 },
  { x1: -26, z1: -15, x2: 10, z2: -15, w: 3.5 },
  { x1: -46, z1: 14, x2: -46, z2: -3, w: 3 },
  { x1: 46, z1: 14, x2: 46, z2: 2, w: 3 },
  { x1: -24, z1: -15, x2: -24, z2: -17, w: 3 },
];

/** Fence runs [x1, z1, x2, z2]. */
export const FENCES: [number, number, number, number][] = [
  // road to the gate
  [-3.9, 21, -3.9, 40], [3.9, 21, 3.9, 40],
  // chicken pen
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z - PEN.hd], [PEN.x - PEN.hw, PEN.z + PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x - PEN.hw, PEN.z + PEN.hd], [PEN.x + PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  // front gardens
  [-41, 12, -35, 12], [35, 12, 41, 12], [-12, 22.5, -22, 22.5], [12, 22.5, 22, 22.5],
];

/** Lamp posts (emissive bulb only, no real lights). */
export const LAMPS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let z = -8, i = 0; z <= 42; z += 8, i++) { out.push([i % 2 ? -3.3 : 3.3, z]); }
  for (let x = -40; x <= 40; x += 10) { if (Math.abs(x) < 6) continue; out.push([x, x % 20 ? 11.6 : 16.4]); }
  out.push([-8, -12.8], [-20, -12.8], [8, -12.8], [-6, 6.2], [6, 6.2], [-4, 46.5], [4, 46.5]);
  return out;
})();

/** Movement colliders [x, z, r] registered with mapgen.addTempCollider after the island is generated. */
export const TOWN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) c.push([h.x, h.z, Math.hypot(h.w, h.d) * 0.38 + 0.4]);
  for (const s of STALLS) c.push([s.x, s.z, 1.5]);
  c.push([WELL_POS.x, WELL_POS.z, 1.4]);
  // gate towers + wall stubs
  for (const sx of [-1, 1]) {
    c.push([GATE.x + sx * 6.6, GATE.z, 2.1]);
    for (let i = 0; i < 6; i++) c.push([GATE.x + sx * (9.6 + i * 1.8), GATE.z, 0.95]);
  }
  return c;
})();

/** Circles kept free of random trees / rocks / crates by mapgen. */
export const TOWN_CLEAR: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) c.push([h.x, h.z, 6.5]);
  for (const s of STALLS) c.push([s.x, s.z, 4]);
  c.push([WELL_POS.x, WELL_POS.z, 3], [PLAZA.x, PLAZA.z, PLAZA.r + 1], [PEN.x, PEN.z, 8], [GATE.x, GATE.z, 11]);
  for (const r of ROADS) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1), n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i <= n; i++) c.push([r.x1 + ((r.x2 - r.x1) * i) / n, r.z1 + ((r.z2 - r.z1) * i) / n, r.w / 2 + 2.5]);
  }
  return c;
})();

// -------------------------------------------------------------------- NPCs ---
export type NpcModel = 'ARCHER' | 'WIZARD' | 'BARBARIAN' | 'KNIGHT' | 'ROGUE';
export type NpcProp = 'none' | 'staff' | 'hammer' | 'basket' | 'lantern' | 'spear';
export interface NpcGift { gold?: number; item?: 'potion_hp' | 'potion_mana'; qty?: number; text: string }
export interface NpcDef {
  name: string; role: string; model: NpcModel; tint: string; scale: number; prop: NpcProp; accent: string;
  home: [number, number]; patrol?: [number, number][]; speed?: number;
  /** pool of short conversations (2-4 lines each); `ordered` cycles them in sequence instead of picking at random */
  talk: string[][]; ordered?: boolean;
  bubbles: string[];
  gift?: NpcGift;
  /** replaces the last line with a nudge when a quest is ready to claim */
  quest?: boolean;
}

export const NPCS: NpcDef[] = [
  {
    name: 'Mira', role: 'Guide', model: 'WIZARD', tint: '#ffe3b0', scale: 1, prop: 'none', accent: '#ffd36a', home: [3.8, 5.6], ordered: true,
    talk: [
      ['Welcome to Aether Village, traveller! I am Mira. Let me show you the ropes.', 'Move with WASD or the left stick. Dash with Space (or the dash button) to slip through danger with a burst of speed.'],
      ['Your skills live on the keys 1, 2 and 3, or on the round skill buttons. R unleashes your ultimate once its gauge is full.', 'Potions are on Z and X. Mana refills over time, so do not hoard it.'],
      ['Combos are hit counts. Every hit you land adds one, and the chain breaks after about three seconds without a hit.', 'Every 10 hits adds a little bonus damage, up to a big chunk at the top. An ultimate at 50+ hits becomes a finisher!'],
      ['Tired of tapping? Open the pause menu and switch on "Auto skills": skills 1/2/3 and your ultimate cast themselves at nearby enemies.', 'Dashing always stays manual, so stay sharp. When you are ready, the gate in the south awaits.'],
    ],
    bubbles: ['Press E near anything glowing!', 'Ask me again for more tips.', 'Skills 1, 2, 3 and R. Never forget R!'],
  },
  {
    name: 'Elder Tobin', role: 'Village Elder', model: 'BARBARIAN', tint: '#d9d3c6', scale: 1.04, prop: 'none', accent: '#e6d3a0', home: [4.2, -2.4],
    talk: [
      ['Ah, a young adventurer. This well has fed our village for three hundred years.', 'The old tales say the Mire swallows the careless. Walk with care.'],
      ['My knees ache, but my memory is sharp. I remember when this valley had no gate at all.', 'Keep your potions stocked and your wits about you.'],
      ['Every hero starts as a stranger here. Take this, a little something from an old man.'],
    ],
    bubbles: ['Lovely day!', 'Back in my day the Mire was a meadow.', 'Mind the well, children.'],
    gift: { gold: 150, text: 'Elder Tobin presses a pouch into your hand. (+150 gold)' },
  },
  {
    name: 'Pip', role: 'Village Kid', model: 'ROGUE', tint: '#ffd0e0', scale: 0.66, prop: 'none', accent: '#ff9ac0', home: [-5, 6], speed: 2.6,
    patrol: [[-5, 6], [4, 7], [5.5, -1], [-4, -1], [-6, 2]],
    talk: [
      ['Have you seen my cat? She is orange, and very rude.', 'Last time I saw her she ran off towards the plaza...'],
      ['When I grow up I will be a hero like you! Do you have a sword? Can I hold it?', 'No? Aww.'],
      ['Shh! The guard says monsters live beyond the gate. I want to see one. Just a little one.'],
    ],
    bubbles: ['Have you seen my cat?', 'Race you to the well!', 'Here kitty kitty...', 'I am NOT scared of the Mire.'],
  },
  {
    name: 'Brenna', role: 'Farmer', model: 'ARCHER', tint: '#cfe8a0', scale: 1, prop: 'basket', accent: '#9bd26a', home: [-12, 24], speed: 1.5,
    patrol: [[-12, 24.5], [-19, 25.5], [-27.5, 31.5], [-20, 33.5], [-12, 31.5]],
    talk: [
      ['Mind the chickens, they have opinions. Good eggs though!', 'Here, take a potion. Fresh brewed, or so I am told.'],
      ['The harvest has been strange lately. The crops glow at night near the Grove.', 'Odd, but the carrots taste fine.'],
    ],
    bubbles: ['Cluck cluck, my darlings.', 'Fine weather for the harvest.', 'Strange lights near the Grove lately...'],
    gift: { item: 'potion_hp', qty: 1, text: 'Brenna hands you a healing potion. (+1 Health Potion)' },
  },
  {
    name: 'Garrick', role: 'Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1.05, prop: 'spear', accent: '#bcd0ff', home: [5.4, 41.8],
    talk: [
      ['Halt! ...Oh. It is you. Carry on.', 'The gate to the south leads out into the wilds. Step up to it and set out when you are ready.'],
      ['Nothing gets past me. Well, nothing except hens. And the Elder\'s cat.', 'Bring back something shiny, will you?'],
      ['Stock up at the potion shop before you set out. Heroes who forget potions tend to come back without their dignity.'],
    ],
    bubbles: ['Move along, citizens.', 'All quiet at the gate.', 'Beware the Mire...'],
  },
  {
    name: 'Lysa', role: 'Herbalist', model: 'WIZARD', tint: '#bff0c0', scale: 0.96, prop: 'basket', accent: '#7ee0a0', home: [-18, -13], speed: 1.4,
    patrol: [[-22, -13.2], [-14, -13.2], [-6, -13.2], [-14, -13.2]],
    talk: [
      ['Moonpetal, ember root, a pinch of swamp moss... the Potion Shop pays well for the good stuff.', 'Do not forget to sell what you do not need.'],
      ['Mana potions taste like mint, health potions like regret. Drink them anyway.', 'Take this one, on the house.'],
    ],
    bubbles: ['Moonpetal, ember root...', 'Mana potions: now with mint!', 'Have you seen my cat? Ah, no, Pip\'s.'],
    gift: { item: 'potion_mana', qty: 1, text: 'Lysa slips a vial into your pack. (+1 Mana Potion)' },
  },
  {
    name: 'Dorn', role: 'Miner', model: 'BARBARIAN', tint: '#c9a27a', scale: 1, prop: 'hammer', accent: '#ffb86a', home: [14, -1], speed: 1.5,
    patrol: [[14, -1.5], [19, -1], [21, 4], [17, 5.5]],
    talk: [
      ['See those crystals and ore veins nearby? Stand close and hold F to hit them.', 'They grow back after a while, and the shards are worth good coin.'],
      ['The blacksmith will turn what you dig into something sharp. Tell her Dorn sent you!'],
    ],
    bubbles: ['Hold F near an ore vein!', 'Rocks do not mine themselves.', 'My pickaxe is my best friend.'],
  },
  {
    name: 'Sera', role: 'Merchant', model: 'ROGUE', tint: '#caa0ff', scale: 0.98, prop: 'none', accent: '#d9b0ff', home: [13.1, 3],
    talk: [
      ['Fine wares, rare finds! Alas, today I am only here for the fresh air.', 'The real shops are up north: potions, smithing and the pet stable.'],
      ['Coins make the world go round, friend. Spend them well, save a few for the altar.'],
    ],
    bubbles: ['Fine wares! Fine wares!', 'Everything has a price.', 'Best prices in the valley!'],
  },
  {
    name: 'Fenn', role: 'Bard', model: 'ARCHER', tint: '#9fc8ff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [-30, 15.6], speed: 1.7,
    patrol: [[-30, 15.8], [-15, 15.8], [0, 15.8], [15, 15.8], [30, 15.8], [15, 12.3], [0, 12.3], [-15, 12.3], [-30, 12.3]],
    talk: [
      ['La la laaa... oh, an audience! I am working on a ballad about the Mire Hydra.', 'So far it goes: "Run." Needs work.'],
      ['They say the Frostpeak winds sing at midnight. I shall go listen, once I find a braver bard.'],
    ],
    bubbles: ['La la laaa~', 'Beware the Mire... it rhymes with nothing!', 'Anyone have a lute string?'],
  },
  {
    name: 'Wren', role: 'Scholar', model: 'WIZARD', tint: '#9ab4ff', scale: 0.95, prop: 'staff', accent: '#a9b8ff', home: [-9.5, -7.5],
    talk: [
      ['The Aether Altar to the west answers wishes with fortune. Offer it gems and see who answers.', 'The Skill Trainer to the east will sharpen what you already know.'],
      ['Knowledge is the sharpest weapon. And a very good staff, if I may say.'],
    ],
    bubbles: ['Fascinating...', 'The Altar hums tonight.', 'Spend your skill points!'],
  },
  {
    name: 'Hodge', role: 'Bounty Clerk', model: 'KNIGHT', tint: '#ffd9a0', scale: 0.98, prop: 'none', accent: '#ffcf70', home: [-33, 12], speed: 1.5, quest: true,
    patrol: [[-33, 12.4], [-41, 12.4], [-43, 4], [-33, 3.5]],
    talk: [
      ['Bounties, bounties... the Quest Board by the plaza is full of them. Slay monsters, earn gold.', 'Come back and claim the reward when you are done.'],
      ['I keep the ledgers straight, and the heroes honest. Check the Quest Board every day for new work.'],
    ],
    bubbles: ['Fresh bounties on the board!', 'Hero wanted: apply within.', 'So much paperwork...'],
  },
  {
    name: 'Maeve', role: 'Gossip', model: 'WIZARD', tint: '#e0d4ee', scale: 0.92, prop: 'staff', accent: '#e8d0ff', home: [30, 12.2], speed: 1.2,
    patrol: [[30, 12.2], [40, 12.2], [42, 5], [33, 4.5]],
    talk: [
      ['I heard the Ember Wastes are so hot the goblins carry parasols. True story.', 'Do not tell Tobin I told you.'],
      ['Hodge fancies the herbalist. Everyone knows. Except Hodge. And Lysa.'],
    ],
    bubbles: ['Did you hear?', 'Lovely day!', 'Beware the Mire... or so they say.'],
  },
];

export const GENERIC_BUBBLES = ['Lovely day!', 'Beware the Mire...', 'Good luck out there!', 'Stay safe, hero.', 'Is that the hero?'];

export interface AnimalDef { kind: 'CHICKEN' | 'CAT'; x: number; z: number; rx: number; rz: number; speed: number; tint: string }
export const ANIMALS: AnimalDef[] = [
  { kind: 'CHICKEN', x: PEN.x - 2.5, z: PEN.z, rx: PEN.hw - 1.2, rz: PEN.hd - 1, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: PEN.x + 1, z: PEN.z + 1, rx: PEN.hw - 1.2, rz: PEN.hd - 1, speed: 1.0, tint: '#f1d7a0' },
  { kind: 'CHICKEN', x: PEN.x + 3, z: PEN.z - 0.6, rx: PEN.hw - 1.2, rz: PEN.hd - 1, speed: 1.2, tint: '#e0a070' },
  { kind: 'CHICKEN', x: PEN.x, z: PEN.z - 1.5, rx: PEN.hw - 1.2, rz: PEN.hd - 1, speed: 1.0, tint: '#ffffff' },
  { kind: 'CAT', x: -6, z: 12, rx: 7, rz: 3, speed: 1.9, tint: '#ff9a4a' },
  { kind: 'CAT', x: 15, z: 24, rx: 5, rz: 4, speed: 1.7, tint: '#8a8a96' },
];
