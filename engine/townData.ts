// ============================================================================
// Town layout + NPC cast (pure data, no three / no React). Read by:
//  * engine/mapgen.ts          -> TOWN_CLEAR (keep random scenery out of the town)
//  * engine/systems/village.ts -> colliders, gate position, harvest nodes, NPC pills
//  * engine/systems/npcs.ts    -> NPC / animal behaviour
//  * render/TownScenery.tsx + render/Npcs.tsx -> drawing
// Coordinates are world x / z. A building's door faces +z at rot = 0 (facing vector = (sin rot, cos rot)).
//
// Layout (compact ~60% footprint, functional buildings spread out on their own spots):
//   spawn / plaza (0, 2) -> north: Quest Board (0,-17), Altar (-17,-13), Skill Trainer (17,-13)
//   west Potion Shop (-27, 2), east Blacksmith (27, 2), south-east Pet Stable (24, 22), gate (0, 38) at the end of the
//   main road. Houses / stalls are decoration. Harvest nodes sit on the outskirts.
// ============================================================================
import { QUEST_POS, SHRINE_POS, TRAINER_POS } from './world';

export interface HouseSpec { x: number; z: number; rot: number; w: number; d: number; floors: 1 | 2; wall: string; roof: string; trim: string; chimney: boolean; door: string }
export interface StallSpec { x: number; z: number; rot: number; c1: string; c2: string; goods: 0 | 1 | 2 | 3 }
export interface RoadSpec { x1: number; z1: number; x2: number; z2: number; w: number }
export interface SignSpec { x: number; z: number }

export const GATE = { x: 0, z: 38 };
export const PLAZA = { x: 0, z: 2, r: 6.5 };
/** Well on a grass patch (not on the plaza or a road). */
export const WELL_POS = { x: -21, z: 18 };
export const PEN = { x: -22, z: 27, hw: 5, hd: 3 };

const WALLS = ['#f3e6c6', '#efe2c0', '#e8cfa3', '#d9d2c4', '#c9d8c0', '#e6bfa6', '#cbd5e8'];
const ROOFS = ['#3f74d0', '#b8483a', '#5a8f4a', '#8a5a3a', '#d6b052', '#7a5aa8', '#cf7b2e', '#b8483a'];
const DOORS = ['#5a3a1e', '#7a3a2a', '#2f5a7a', '#3e5a2e'];

let HOUSE_COUNT = 0;
const H = (x: number, z: number, rot: number, w: number, d: number, floors: 1 | 2 = 1): HouseSpec => {
  const n = HOUSE_COUNT++;
  return { x, z, rot, w, d, floors, wall: WALLS[(n * 3 + 1) % WALLS.length], roof: ROOFS[(n * 5 + 2) % ROOFS.length], trim: n % 3 === 0 ? '#6e4b2b' : '#f4ead2', chimney: n % 2 === 0, door: DOORS[n % DOORS.length] };
};

/** Decorative houses (old shop-style: stone footing, timber frame, big gabled roof, striped awning). */
export const HOUSES: HouseSpec[] = [
  // south of the east-west street, doors facing the street
  H(-13, 17.5, Math.PI, 4.6, 4.0), H(13, 17.5, Math.PI, 4.8, 4.2, 2),
  // along the road to the gate
  H(-9, 30, Math.PI / 2, 4.6, 4.2), H(9, 31.5, -Math.PI / 2, 5.0, 4.4, 2),
  // outskirts
  H(-34, 19, Math.PI / 2, 4.6, 4.0), H(34, 19, -Math.PI / 2, 5.0, 4.4, 2),
  H(-33, -9, 0.5, 5.0, 4.4, 2), H(33, -10, -0.5, 4.8, 4.2),
  H(-31, -24, 0.3, 4.8, 4.2), H(31, -24, -0.3, 5.2, 4.4, 2),
];

/** Decorative market stalls (the useful shops are Supplies / Blacksmith / Pets). */
export const STALLS: StallSpec[] = [
  { x: -10, z: -1, rot: Math.PI / 2, c1: '#d94a3a', c2: '#f4f4f4', goods: 0 },
  { x: 10, z: -1, rot: -Math.PI / 2, c1: '#3f74d0', c2: '#f4f4f4', goods: 1 },
  { x: -7, z: 12.8, rot: Math.PI, c1: '#3f9a4a', c2: '#f4ead2', goods: 2 },
  { x: 7, z: 12.8, rot: Math.PI, c1: '#cf7b2e', c2: '#f4f4f4', goods: 3 },
];

export const ROADS: RoadSpec[] = [
  { x1: 0, z1: -10, x2: 0, z2: 46, w: 5 },        // main road, plaza -> gate
  { x1: -33, z1: 9, x2: 33, z2: 9, w: 4 },        // east-west street
  { x1: -18, z1: -8.5, x2: 18, z2: -8.5, w: 3.5 }, // north street (altar / board / trainer)
  { x1: -27, z1: 9, x2: -27, z2: 5, w: 3 },       // potion shop
  { x1: 27, z1: 9, x2: 27, z2: 5, w: 3 },         // blacksmith
  { x1: 0, z1: 28, x2: 26, z2: 28, w: 3.5 },      // south lane -> pet stable
  // narrow paths to each functional building's front door / interaction point
  { x1: 24, z1: 28, x2: 24, z2: 25, w: 2.8 },     // pet stable
  { x1: 0, z1: -8.5, x2: 0, z2: -14.5, w: 3 },    // quest board
  { x1: -17, z1: -8.5, x2: -17, z2: -11, w: 2.8 }, // summoning altar
  { x1: 17, z1: -8.5, x2: 17, z2: -11, w: 2.8 },  // skill trainer
];

// --------------------------------------------------------------- town wall ---
/** Stone town wall ring. Centre line of the wall; the south side is cut by the gatehouse (GATE towers at x = +-6.6). */
export const WALL = { x0: -45, x1: 45, z0: -41, z1: 38, thick: 2.6, gateHalf: 8.4 };
export interface TowerSpec { x: number; z: number; r: number; corner: boolean }
export const WALL_TOWERS: TowerSpec[] = [
  { x: WALL.x0, z: WALL.z0, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z0, r: 3.6, corner: true },
  { x: WALL.x0, z: WALL.z1, r: 3.6, corner: true }, { x: WALL.x1, z: WALL.z1, r: 3.6, corner: true },
  { x: -22.5, z: WALL.z0, r: 3.1, corner: false }, { x: 0, z: WALL.z0, r: 3.1, corner: false }, { x: 22.5, z: WALL.z0, r: 3.1, corner: false },
  { x: WALL.x0, z: -14.7, r: 3.1, corner: false }, { x: WALL.x0, z: 11.7, r: 3.1, corner: false },
  { x: WALL.x1, z: -14.7, r: 3.1, corner: false }, { x: WALL.x1, z: 11.7, r: 3.1, corner: false },
  { x: -27, z: WALL.z1, r: 3.1, corner: false }, { x: 27, z: WALL.z1, r: 3.1, corner: false },
];
/** Straight wall runs [x1, z1, x2, z2, outwardX, outwardZ] (outward normal is where the merlons stand). */
export const WALL_RUNS: [number, number, number, number, number, number][] = [
  [WALL.x0, WALL.z0, WALL.x1, WALL.z0, 0, -1],              // north
  [WALL.x1, WALL.z0, WALL.x1, WALL.z1, 1, 0],               // east
  [WALL.x0, WALL.z0, WALL.x0, WALL.z1, -1, 0],              // west
  [WALL.x1, WALL.z1, WALL.gateHalf, WALL.z1, 0, 1],         // south-east, up to the gatehouse
  [-WALL.gateHalf, WALL.z1, WALL.x0, WALL.z1, 0, 1],        // south-west
];

/** Fence runs [x1, z1, x2, z2]. Every run gets colliders (see TOWN_COLLIDERS). */
export const FENCES: [number, number, number, number][] = [
  // road to the gate (east side has a gap for the pet-stable lane)
  [-3.9, 20, -3.9, 33], [3.9, 20, 3.9, 25.5], [3.9, 30.5, 3.9, 33],
  // chicken pen
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z - PEN.hd], [PEN.x - PEN.hw, PEN.z + PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  [PEN.x - PEN.hw, PEN.z - PEN.hd, PEN.x - PEN.hw, PEN.z + PEN.hd], [PEN.x + PEN.hw, PEN.z - PEN.hd, PEN.x + PEN.hw, PEN.z + PEN.hd],
  // front gardens
  [-18, 15, -18, 20], [18, 14.5, 18, 20],
];

/** Signposts pointing at the gate (south): one beside the spawn plaza, one half way down the road. */
export const SIGNS: SignSpec[] = [{ x: 4.6, z: 9.2 }, { x: -5.2, z: 16 }];

/** Lamp posts (emissive bulb only, no real lights). */
export const LAMPS: [number, number][] = [
  [3, 14], [-3, 20], [3, 24], [-3, 34], [3, 36.5], [-3, 40], [3, 42.5],
  [-30, 6.8], [-22, 6.8], [-14, 6.8], [14, 6.8], [22, 6.8], [30, 6.8],
  [-6, 6.2], [6, 6.2], [-8, -10.3], [8, -10.3],
];

/** Movement colliders [x, z, r] registered with mapgen.addTempCollider after the island is generated. */
export const TOWN_COLLIDERS: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  for (const h of HOUSES) c.push([h.x, h.z, Math.hypot(h.w, h.d) * 0.38 + 0.4]);
  // stalls are ~3.9 wide: two circles along their local x axis
  for (const s of STALLS) for (const k of [-1.1, 1.1]) c.push([s.x + Math.cos(s.rot) * k, s.z - Math.sin(s.rot) * k, 1.25]);
  c.push([WELL_POS.x, WELL_POS.z, 1.5]);
  c.push([QUEST_POS[0], QUEST_POS[2], 1.6]); // notice board
  for (const s of SIGNS) c.push([s.x, s.z, 0.5]);
  for (const [x, z] of LAMPS) c.push([x, z, 0.3]);
  // fences + fence posts: a continuous chain of small circles along every run
  for (const [x1, z1, x2, z2] of FENCES) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 0.8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 0.45]);
  }
  // gatehouse towers (the 8.8-wide opening between them stays walkable)
  for (const sx of [-1, 1]) c.push([GATE.x + sx * 6.6, GATE.z, 2.1]);
  // town wall: towers + a continuous chain of overlapping circles along every run
  for (const t of WALL_TOWERS) c.push([t.x, t.z, t.r]);
  for (const [x1, z1, x2, z2] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 1.8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 1.5]);
  }
  return c;
})();

/** Resource nodes (crystal / ore) in the outer ring of the village, inside the wall, away from the shops. */
export const VILLAGE_NODES: { kind: 'CRYSTAL' | 'ORE'; x: number; z: number }[] = [
  { kind: 'ORE', x: -39, z: -4 }, { kind: 'CRYSTAL', x: 39, z: -4 }, { kind: 'ORE', x: -26, z: -34 }, { kind: 'CRYSTAL', x: 24, z: -35 },
];

/** Circles kept free of random trees / rocks / crates by mapgen. */
export const TOWN_CLEAR: [number, number, number][] = (() => {
  const c: [number, number, number][] = [];
  // the whole walled yard stays free of random trees / rocks (grid of circles covering the wall rectangle)
  for (let x = WALL.x0 + 7; x < WALL.x1; x += 14) for (let z = WALL.z0 + 7; z < WALL.z1 + 6; z += 14) c.push([x, z, 11]);
  c.push([0, 8, 40]);
  for (const h of HOUSES) c.push([h.x, h.z, 6.5]);
  for (const s of STALLS) c.push([s.x, s.z, 4]);
  for (const n of VILLAGE_NODES) c.push([n.x, n.z, 4]);
  c.push([WELL_POS.x, WELL_POS.z, 3], [PLAZA.x, PLAZA.z, PLAZA.r + 1], [PEN.x, PEN.z, 8], [GATE.x, GATE.z, 11]);
  c.push([QUEST_POS[0], QUEST_POS[2], 6], [SHRINE_POS[0], SHRINE_POS[2], 6.5], [TRAINER_POS[0], TRAINER_POS[2], 6.5]);
  // keep the wall line (and a margin either side) free of random trees / rocks
  for (const [x1, z1, x2, z2] of WALL_RUNS) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / 8));
    for (let i = 0; i <= n; i++) c.push([x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n, 8]);
  }
  for (const t of WALL_TOWERS) c.push([t.x, t.z, 9]);
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
    name: 'Mira', role: 'Guide', model: 'WIZARD', tint: '#fff1d6', scale: 1, prop: 'none', accent: '#ffd36a', home: [3.6, 5.4], ordered: true,
    talk: [
      ['Welcome to Aether Village, traveller! I am Mira. Let me show you the ropes.', 'Move with WASD or the left stick. Dash with Space (or the dash button) to slip through danger with a burst of speed.'],
      ['Your skills live on the keys 1, 2 and 3, or on the round skill buttons. R unleashes your ultimate once its gauge is full.', 'Potions are on Z and X. Mana refills over time, so do not hoard it.'],
      ['Combos are hit counts. Every hit you land adds one, and the chain breaks after about three seconds without a hit.', 'Every 10 hits adds a little bonus damage, up to a big chunk at the top. An ultimate at 50+ hits becomes a finisher!'],
      ['Tired of tapping? Open the pause menu and switch on "Auto skills": skills 1/2/3 and your ultimate cast themselves at nearby enemies.', 'Dashing always stays manual, so stay sharp. When you are ready, the gate in the south awaits.'],
    ],
    bubbles: ['Press E near anything glowing!', 'Ask me again for more tips. The gate is down the main road!', 'Skills 1, 2, 3 and R. Never forget R!'],
  },
  {
    name: 'Elder Tobin', role: 'Village Elder', model: 'BARBARIAN', tint: '#f1ece2', scale: 1, prop: 'none', accent: '#e6d3a0', home: [4.8, -2.2],
    talk: [
      ['Ah, a young adventurer. This well has fed our village for three hundred years.', 'The old tales say the Mire swallows the careless. Walk with care.'],
      ['My knees ache, but my memory is sharp. I remember when this valley had no gate at all.', 'Keep your potions stocked and your wits about you.'],
      ['Every hero starts as a stranger here. Take this, a little something from an old man.'],
    ],
    bubbles: ['Lovely day!', 'Back in my day the Mire was a meadow.', 'Mind the well, children.'],
    gift: { gold: 150, text: 'Elder Tobin presses a pouch into your hand. (+150 gold)' },
  },
  {
    name: 'Pip', role: 'Village Kid', model: 'ROGUE', tint: '#ffe0ea', scale: 1, prop: 'none', accent: '#ff9ac0', home: [-4, 6.2], speed: 2.6,
    patrol: [[-4, 6.2], [3, 7], [4.5, -3], [-4, -3.2], [-5, 2]],
    talk: [
      ['Have you seen my cat? She is orange, and very rude.', 'Last time I saw her she ran off towards the plaza...'],
      ['When I grow up I will be a hero like you! Do you have a sword? Can I hold it?', 'No? Aww.'],
      ['Shh! The guard says monsters live beyond the gate. I want to see one. Just a little one.'],
    ],
    bubbles: ['Have you seen my cat?', 'Race you to the well!', 'Here kitty kitty...', 'I am NOT scared of the Mire.'],
  },
  {
    name: 'Brenna', role: 'Farmer', model: 'ARCHER', tint: '#e6f5cc', scale: 1, prop: 'basket', accent: '#9bd26a', home: [-14, 21.5], speed: 1.5,
    patrol: [[-14, 21.5], [-14, 26], [-14, 32], [-11, 26]],
    talk: [
      ['Mind the chickens, they have opinions. Good eggs though!', 'Here, take a potion. Fresh brewed, or so I am told.'],
      ['The harvest has been strange lately. The crops glow at night near the Grove.', 'Odd, but the carrots taste fine.'],
    ],
    bubbles: ['Cluck cluck, my darlings.', 'Fine weather for the harvest.', 'Strange lights near the Grove lately...'],
    gift: { item: 'potion_hp', qty: 1, text: 'Brenna hands you a healing potion. (+1 Health Potion)' },
  },
  {
    name: 'Garrick', role: 'Gate Guard', model: 'KNIGHT', tint: '#ffffff', scale: 1, prop: 'spear', accent: '#bcd0ff', home: [5, 34.8],
    talk: [
      ['Halt! ...Oh. It is you. Carry on.', 'The gate to the south leads out into the wilds. Step up to it and set out when you are ready.'],
      ['Nothing gets past me. Well, nothing except hens. And the Elder\'s cat.', 'Bring back something shiny, will you?'],
      ['Stock up at the potion shop before you set out. Heroes who forget potions tend to come back without their dignity.'],
    ],
    bubbles: ['Move along, citizens.', 'All quiet at the gate.', 'Beware the Mire...'],
  },
  {
    name: 'Lysa', role: 'Herbalist', model: 'WIZARD', tint: '#d9f7da', scale: 1, prop: 'basket', accent: '#7ee0a0', home: [-21, 5.5], speed: 1.4,
    patrol: [[-21, 5.5], [-21, -4], [-14, -4], [-14, 5.5]],
    talk: [
      ['Moonpetal, ember root, a pinch of swamp moss... the Potion Shop pays well for the good stuff.', 'Do not forget to sell what you do not need.'],
      ['Mana potions taste like mint, health potions like regret. Drink them anyway.', 'Take this one, on the house.'],
    ],
    bubbles: ['Moonpetal, ember root...', 'Mana potions: now with mint!', 'Have you seen my cat? Ah, no, Pip\'s.'],
    gift: { item: 'potion_mana', qty: 1, text: 'Lysa slips a vial into your pack. (+1 Mana Potion)' },
  },
  {
    name: 'Dorn', role: 'Miner', model: 'BARBARIAN', tint: '#ecd2b4', scale: 1, prop: 'hammer', accent: '#ffb86a', home: [21, 5.5], speed: 1.5,
    patrol: [[21, 5.5], [21, -4], [15, -4], [15, 5.5]],
    talk: [
      ['Out on the edges of the village you will find crystals and ore veins. Stand close and hold E to hit them.', 'They grow back after a while, and the shards are worth good coin.'],
      ['The blacksmith will turn what you dig into something sharp. Tell her Dorn sent you!'],
    ],
    bubbles: ['Hold E near an ore vein!', 'Rocks do not mine themselves.', 'My pickaxe is my best friend.'],
  },
  {
    name: 'Sera', role: 'Merchant', model: 'ROGUE', tint: '#e6d3ff', scale: 1, prop: 'none', accent: '#d9b0ff', home: [13.5, 1.8],
    talk: [
      ['Fine wares, rare finds! Alas, today I am only here for the fresh air.', 'The real shops are spread around: potions to the west, smithing to the east, the pet stable down south.'],
      ['Coins make the world go round, friend. Spend them well, save a few for the altar.'],
    ],
    bubbles: ['Fine wares! Fine wares!', 'Everything has a price.', 'Best prices in the valley!'],
  },
  {
    name: 'Fenn', role: 'Bard', model: 'ARCHER', tint: '#d3e5ff', scale: 1, prop: 'lantern', accent: '#8fd0ff', home: [-28, 10.4], speed: 1.7,
    patrol: [[-28, 10.4], [-14, 10.4], [0, 10.4], [14, 10.4], [28, 10.4], [14, 8.1], [0, 8.1], [-14, 8.1], [-28, 8.1]],
    talk: [
      ['La la laaa... oh, an audience! I am working on a ballad about the Mire Hydra.', 'So far it goes: "Run." Needs work.'],
      ['They say the Frostpeak winds sing at midnight. I shall go listen, once I find a braver bard.'],
    ],
    bubbles: ['La la laaa~', 'Beware the Mire... it rhymes with nothing!', 'Anyone have a lute string?'],
  },
  {
    name: 'Wren', role: 'Scholar', model: 'WIZARD', tint: '#d7e0ff', scale: 1, prop: 'staff', accent: '#a9b8ff', home: [-11.5, -10.2],
    talk: [
      ['The Aether Altar in the north-west answers wishes with fortune. Offer it gems and see who answers.', 'The Skill Trainer in the north-east will sharpen what you already know.'],
      ['Knowledge is the sharpest weapon. And a very good staff, if I may say.'],
    ],
    bubbles: ['Fascinating...', 'The Altar hums tonight.', 'Spend your skill points!'],
  },
  {
    name: 'Hodge', role: 'Bounty Clerk', model: 'KNIGHT', tint: '#ffe8c7', scale: 1, prop: 'none', accent: '#ffcf70', home: [4.5, -12], speed: 1.5, quest: true,
    patrol: [[4.5, -12], [8, -6.4], [-8, -6.4], [-4.5, -12]],
    talk: [
      ['Bounties, bounties... the Quest Board north of the plaza is full of them. Slay monsters, earn gold.', 'Come back and claim the reward when you are done.'],
      ['I keep the ledgers straight, and the heroes honest. Check the Quest Board every day for new work.'],
    ],
    bubbles: ['Fresh bounties on the board!', 'Hero wanted: apply within.', 'So much paperwork...'],
  },
  {
    name: 'Maeve', role: 'Gossip', model: 'WIZARD', tint: '#f0e8f7', scale: 1, prop: 'staff', accent: '#e8d0ff', home: [19, 7.2], speed: 1.2,
    patrol: [[19, 7.2], [30, 12.6], [24, 12.6], [17, 12.6]],
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
  // wander ellipses stay well inside the fenced pen
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.1, tint: '#ffffff' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#f1d7a0' },
  { kind: 'CHICKEN', x: PEN.x + 1.5, z: PEN.z - 0.6, rx: 1.6, rz: 0.9, speed: 1.2, tint: '#e0a070' },
  { kind: 'CHICKEN', x: PEN.x - 1.5, z: PEN.z + 0.6, rx: 1.6, rz: 0.9, speed: 1.0, tint: '#ffffff' },
  { kind: 'CAT', x: -22, z: 12.3, rx: 4, rz: 1.2, speed: 1.9, tint: '#ff9a4a' },
  { kind: 'CAT', x: 17.5, z: 4.5, rx: 2.5, rz: 1.2, speed: 1.7, tint: '#8a8a96' },
];
