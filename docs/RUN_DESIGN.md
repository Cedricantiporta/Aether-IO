# Run structure (current design, updated 2026-10-17) — Town hub + Hades-style rooms

The town is the safe hub; an adventure is a chain of procedurally generated rooms grouped into 7 biomes, each ending in a
boss, followed by a final fight. History: this replaced the original "village siege / endless waves" loop (2026-10-13). The
first room design had 6 biomes (Meadow, Old Grove, Mire, Frostpeak, Ember, Void) with ~7 rooms each; that is superseded by
what is below. Source of truth: `engine/roomDefs.ts`, `engine/systems/director.ts`, `engine/roomgen.ts`.

## Town (hub, no combat)
* A walled town plus large outskirts (see `engine/townData.ts`, HANDOFF 3.2): castle, chapel, tavern, shops, quest board,
  skill trainer, fishing beach, farm, horses, Crystal Cave, hero house. NPCs patrol, talk (dialogue with accept offers) and
  pop speech bubbles; interact via the pill ([E]) or by clicking the NPC / shopkeeper (click-to-walk).
* Shops / smith / quest board / summon / trainer are always open. Skills and the class dash work in town.
* A run starts at the **Adventure Portal** (deep forest south of the town; E on its platform opens Set Out) or at the
  Endless Tower building for the tower modes. Death or "abandon run" brings you back; loot and xp are kept.

## Adventure = 7 biomes x 15 depths
* Biome order (`BIOMES`): **Greenwood -> Marble Halls -> Sunscorch Desert -> Coral Isles -> Frostpeak -> Ember Wastes -> The Void**.
  Each biome has three depth tiers (1-5 / 6-10 / 11-15) with their own ground, props, hazard and light. The cycle loops
  with ever higher depth after the Void if the run continues.
* Per biome: `ROOMS_PER_BIOME` = 14 rooms then the boss (depth 15). Depth 1 of every biome after Greenwood is a **CAMP**
  (a hand-authored transition path with a waystation: Storage + Training Post; `engine/campPaths.ts`), depth 10 is the
  forced **pre-boss** (Greenwood: the Slime King; other biomes: a champion or humanoid mini boss), depth 14 is always the
  **Merchant**, depth 15 the boss. A Boss Key (found depth 10-13) adds a boss door earlier; once a biome has been completed
  a red-gold "Shortcut to <boss>" door appears at depth 5 or 7 of it.
* Bosses: Greenwood **Elderroot** (Treant), Marble Halls **Gorath** (Golem), Desert **The Dune Colossus** (war machine),
  Coral Isles **The Tide Hydra**, Frostpeak **Glacius** (Wyrm), Ember **Ignar** (Warlord), Void **Void Herald**.
  **Malakar** (the Lich) is a mini-boss in crypt biomes (Marble Halls, Void) and the final boss. Boss arenas grow per biome
  (radius 34 -> 50) and have their own pillar plan.
* **Ending**: the Void's last room is the Gatekeeper courtyard (five trial gates -> five Gate Keys open the Dark Castle),
  then the two-stage Malakar fight on "The Undying Throne", a finale, an epilogue clearing with Aelia and the ending slides.
  The first ending unlocks Hard mode, Ascension 1-10 and the Endless Tower story step; the "true ending" needs 10 clears
  and the Font dreams (HANDOFF 3.4).
* After a boss: boss loot + cards, then ONE big portal to the next biome. There is no return-to-town choice; the run ends on
  death (or "abandon run" from the pause menu / teleport offers).
* Difficulty depth: `depthWave(biome, index)` feeds `waveHpMult` / `waveDmgMult` / `waveBudget` (boss room of biome b = wave 10*(b+1)); monsters
  also scale with the hero's level (`enemies.monsterLevel`). Ascension 1-10 stacks hardships, and each first clear pays a one-time reward. HANDOFF 3.10.

## Room types
| Type | Content | Clear condition |
|---|---|---|
| Combat | 2-3 spawn bursts with telegraphed spawn points, max 36 alive; may carry an objective and/or a twist | ALL enemies dead (counter, no timer) |
| Elite | fewer, elite-affix enemies with a big telegraphed attack | all dead |
| Mini-boss | champion / humanoid mini boss (Varn, Sable, Rook) / Lich + adds; pre-boss at depth 10 | all dead |
| Duel | dark copy of a hero class in a ring arena (rare in the first realms) | dead |
| Fountain | heal 40% hp/mp, no enemies | immediate |
| Merchant | travelling merchant (potions, gear at town price +50%); also appears mid-biome once | immediate |
| Treasure | chest(s) guarded by a small pack (1-2 picks + maybe gear) | all dead |
| Shrine | optional harder challenge, at most once per biome | all dead |
| Crystal Cavern | harvest-only room, Aether Crystal nodes | none |
| Camp | quiet path with Storage + Training Post | immediate |
| Gatekeeper | five gates; only in the Void | gates |
| Boss | biome boss arena | boss dead |

* Objectives rolled on combat rooms (`systems/roomEvents.ts`): Defend the Totem, Rescue (caged captive), Treasure Goblin, Hunt.
  Twists: Traps, Dark (Shadowcaster), Cursed, Golden. Biome hazards (spikes, quicksand, tide, lava rifts, brambles / spores,
  ice / icicles, void black holes) are layered on top (`systems/biomeHazards.ts`). Wanderers, an ally fighter
  and the rare Riruru slime appear occasionally.
* When cleared, 1-3 exit portals (ruined stone arches) appear, each labelled with its reward: upgrade card, gold, Aether
  Crystals, gear, heal, gems, or the room-type icon. Entering a portal (E, or click to walk to it) fades to the next room.
  Harvest nodes may be mined at any time; other interactions wait for a cleared room.
* Max alive enemies ~36 (10 for champion escorts). Only the current room exists; the scenery is rebuilt from the room seed.

## Other run modes (tower family, `runInfo.mode === 'TOWER'`)
Endless Tower (floors, boss every 10th), Daily Trial (seeded 5 floors, Lv 15), Endless Waves (arena survival, Lv 30). They
use round arenas, give no item drops / potions / Ankh / EXP and pay gold + Aether Crystals. Details: HANDOFF 3.4.

## Removed / changed history
* Removed (2026-10-13): siege cutscene, respite timer, shops closing, 45 s wave timer, "X/Y" quota, calling waves early.
* Superseded since: 6 biomes -> 7 (Coral Isles added), ~7 rooms -> 15 depths, "return to town or descend" after a boss -> one
  big portal only, Golem/Lich boss alternation -> a fixed boss per biome, procedural camp discs -> hand-authored paths.

## Not built (ideas the owner liked; the first batch of the old proposal was built as objectives + twists)
* **Run events between rooms**: wandering NPC choices (pay HP for a relic, gamble, free a spirit), a cursed portal (harder
  next room, guaranteed epic), a rival adventurer duel once per biome (partly covered by wanderers and dark hero duels).
* **Path choice with a map**: show the next 2-3 rooms as a small node map (Slay the Spire style) instead of picking
  portals blind.
* **Biome set pieces**: one per biome, e.g. Meadow stampede, Grove living maze, Mire rising water, Frost avalanche escape,
  Cinders lava-bridge run, Void gravity flips (hazards exist; scripted set pieces do not).
* **Rescued villagers move into town** (new stock, tech discount, side quest) — only the rescue objective exists.
