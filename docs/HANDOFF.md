# Handoff — Aether Survivor (status as of 2026-10-14)

Branch: `claude/charming-shannon-nq5wcd` (contains all of `claude/festive-shannon-tspv5k` + the work below). The Vercel
production deploy builds `main`; the owner asked to fast-forward `main` to this branch after each push so Vercel deploys it.

## The owner (how to work with them)
- Not a coder. Gives short, informal feedback, often several requests in one message, frequently with screenshots.
  Reply in plain language: what changed, what to try, what's still pending. No code jargon.
- **Very cost-sensitive** (complained twice about usage): keep at most 1–2 sub-agents running, prefer small direct
  edits, few screenshots, don't re-verify things needlessly.
- **Use cheaper sub-agents** (owner, 2026-10-17): delegate searches, headless QA runs and well-scoped edits to Sonnet / Haiku
  sub-agents (Agent tool `model: "sonnet"` / `"haiku"`); keep the main model for planning, review and tricky code.
- **Push to `main` first** (owner, 2026-10-17): `git push origin HEAD:main`, then the claude/* branch (a branch push FIRST makes Vercel build the commit as a Preview only and skip Production; each push
  is a Vercel deployment).
- Wants "a real development studio" result: game-like polish, performance on phones (Android APK is the target).
- Free/lightweight assets only (KayKit + Kenney CC0 already in `public/models`, meshopt-compressed). Only
  registry.npmjs.org is reachable from the cloud container (no other downloads).
- Tell them when a new APK is downloadable: GitHub → Actions → latest "Android APK" run → Artifacts →
  `aether-survivor-debug-apk` (zip with `app-debug.apk`).

## Current game (what exists)
- **Town hub** (status `MENU`): living village, 12 NPCs with talk dialogue + speech bubbles, shops (Supplies, Pets,
  Blacksmith, Skills trainer, Summon altar, Quest board), harvest nodes (hold E), town gate "[E] Set out" is the ONLY
  way to start a run. Skills + class dash work in town (free).
- **Runs** (status `PLAYING`): Hades-style rooms (`engine/systems/director.ts`, `engine/roomgen.ts`,
  `engine/roomDefs.ts`, `engine/roomShape.ts`, `render/Room.tsx`). 6 biomes × ~7 rooms + boss; room types combat,
  elite, mini-boss, fountain, merchant, treasure, shrine, boss. Clear ALL enemies → 1–3 reward portals. After a boss:
  descend or return to town. 8 room outline shapes (polar r(θ) table → `edgeLimit`). Stone paths, colour zones.
- **Bosses** (`engine/systems/bosses.ts`, `bosses2.ts`, `bossFx.ts`, `bossSpecials.ts`, `render/Bosses2.tsx`):
  Golem, Treant, Hydra (3 heads), Wyrm, Warlord, Void Herald; Lich = mini-boss. Boss HP currently ×0.5.
- **Combat**: heroes Archer / Wizard / Barbarian. Keys: WASD move, **F = attack (hold; manual, works while
  moving)**, 1/2/3 actives, Space class dash, R ult (needs full bar AND 90 s cooldown), E interact. Auto-attack fires
  only with an enemy in range. Skills/dash cast toward the hero's **facing** (setting `aimAtCursor` restores mouse
  aim). Setting `autoSkills` auto-casts 1/2/3 + ult. Click/tap an enemy to lock target (`engine/systems/target.ts`,
  `render/TargetRing.tsx`, `ui/hud/TargetFrame.tsx`). Combo = hit counter (`engine/systems/combo.ts`, +2.5% dmg
  per 10 hits, ult finisher at 50). Monster tricks (`tricks.ts`): weak monsters cast at most once, slowly.
- **UI direction (current, user-driven)**: **Korean MMORPG** look (Night Crows / Lineage W style): dark smoked-glass
  panels, gunmetal surfaces, thin brushed-gold hairlines, sharp corners, NO wood/parchment, and **as few containers as
  possible** (HUD text/icons float on the scene with soft shadows). Implemented as the "v5" override layers at the end
  of `index.css` (old wood rules above are overridden, not deleted). Menu icons are filled gold glyphs
  (`ui/components/MenuGlyphs.tsx`). Announcer / biome titles = thin gold serif with hairlines (`.k-title`).
  HUD: top-left level + big HP/MP bars with numbers (`VitalBars` in `ui/hud/Vitals.tsx`), no orbs; bottom = individual
  skill slots, ult first and bigger (`SkillRow` + `ActionBar`), thin full-width EXP strip at the screen bottom
  (`ExpStrip`); same bar in town. Reward cards keep the tarot layout but sharp-edged gold frames (`.rw-*`).
  Interact = pills (`ui/hud/InteractPrompt.tsx`); touch: joystick + ATTACK hub + skill arc (`ui/hud/TouchControls.tsx`).
- **Screens**: title -> full-screen **class selection** (`ui/screens/CharacterSelect.tsx`, uiStore `charSelect`;
  CameraRig frames the hero close-up) -> town. Town top-left "change class" opens it again. Summon = centred
  event-style window (`ui/panels/SummonWindow.tsx`, replaces the side panel for the SUMMON tab). Blacksmith upgrade
  plays a full-screen cinematic (`ui/components/ForgeCinematic.tsx`: swirl -> burst -> result card).
- **Camera**: free MMORPG orbit (`engine/input.ts`: left/right drag or one-finger drag on empty screen = orbit,
  wheel/pinch = zoom; `world.camera.yaw/pitch/dist`; movement + touch aim are camera-relative via `engine/camera.ts`
  `camRel`). Spawn = plaza centre, camera looking at the gate (yaw PI); runs reset yaw to 0.
- **Quest board**: 6 daily offers + up to 3 accepted; only accepted quests progress; abandon frees a slot
  (`quests.ts` `fillQuests`, store `acceptQuest/abandonQuest/refreshQuestBoard`).
- **Town look (latest owner direction)**: muted Korean-MMO town — pale flagstone/cement paving over almost the whole
  walled yard (few small grass patches), pale low-contrast cobbles, stone planters + a few trees, dark brown/black roofs,
  plain beige/white stall cloth (no stripes), building/NPC names on dark gold-hairline plates (`render/label.ts`
  `plate` option). Lobby island = walled town + thin margin; in front of the gate a small farm (wheat field,
  scarecrow, haystack), flowerbed, trees (`ISLAND_BOXES` in `engine/townData.ts`). Clean road network: avenue gate ->
  plaza, two streets tangent to the plaza, straight branch paths to each building door.
- **Combat changes (latest)**: Barbarian Space = Bloodrage Leap (aimable), skill 1 = Cross Slash (X projectile
  `X_SLASH`), Whirlwind = flat orbiting axes + keep-out push. Wizard skill 3 = Fireballs (3-ball fan; Chain Frost code
  kept unused), Storm passive = drifting tornado, Blizzard 12%+ freeze chance, Singularity pull weaker + size-based
  (bosses/minis never pulled), Storm Orbs zap every 0.8 s. After a boss ONE big portal to the next biome (no return to
  town; runs end on death). Summon = Gem Altar (gold, better odds) + Shard Altar (purple, 100/900 Common shards).
  Start with 1000 gems. Ultimate slot: gold rising energy fill, golden glow + rays when full.
- **Castle + economy + town services (latest)**: enterable castle (`world.village.area` TOWN/CASTLE, `render/CastleInterior.tsx`,
  `engine/castleData.ts`, `mapgen.installInterior`) with King Aldric + court NPCs; King quests (AUDIENCE, KING_BOUNTY with
  `needsKing`/`reported`, store `reportToKing`). Hermit Old Wend behind the north wall gives 10,000 gold once
  (localStorage `aether-survivor-hermit-v1`). Economy x10 (`GOLD_SCALE` in constants.ts; template prices scaled once at
  load, gold pickups / NPC gifts scaled at payout, old saves migrated via profile flag `gold10`). Armor Shop (basic gear) +
  Fortune Teller (summons) houses; harvest nodes outside the gate regrow 24 h after all are harvested
  (localStorage `aether-survivor-harvest-v1`). Merchant once per biome. Quick menu: Skills (K) + red dots (`ui/lib/alerts.ts`).
  Town trees = procedural park tree (tall trunk + round crown, `makeParkTree`).
- **Town look (earlier pass)**: stone wall ring with towers + gatehouse (`WALL*` in `engine/townData.ts`, colliders included),
  cobblestone roads/plaza (canvas texture + planar UVs in `render/TownScenery.tsx`), paths to every building, no
  glowing rings around shops. Trees are procedural rounded broadleafs / conifers (`render/models.ts`
  `makeLeafyTree` / `makeConifer`, fitted to the old Kenney bounds). Hero armour is rounded + smooth-shaded
  (`render/gear.ts`).
- **Progression**: persistent profile in localStorage `aether-survivor-profile-v1` (gold, gems, items, equipment,
  hero rank, talents, quests, codex discoveries, settings). Runs start with 0 SP.

## Done after handoff
1. **Town rework** (compact ~60% town, spread-out functional buildings, old shop-style houses/stalls, well on grass, fence/post/lamp colliders, hero-scale NPCs, outskirts harvest nodes, gate signposts + banner + beacon): layout lives in `engine/townData.ts`. Verified by a collider/spawn/NPC-path check across seeds.

- **Meadow layout (latest):** the Elixir Brewer hut sits top-left by the town wall (townData `BREWER_HUT` (-14, 45), west of
  the road; must match constants SHOP_POSITIONS 'BREWER'); the wheat field `FARM` (18, 60) is east of the road next to the
  barn (fence gap faces the road, cows graze just east of it).
- **Drop nerf:** normal-kill trade-goods chance 0.1 -> 0.07; boss 2nd trade roll only 40%; mini/champion one MINI roll
  (was 2); elite gear drop 0.25 -> 0.15, plain 0.015 -> 0.01; boss Legendary/Mythic gear odds ~halved, `rarityForDepth`
  Legendary/Mythic halved, mini at wave 25+ only 35% Legendary (else Epic); trade-goods Legendary/Mythic weights halved.
- **Barbarian:** Earthsplitter (s3) is now a short close-range cleave (length 9 + 0.6/lv, 6 spikes; was 34+); all
  Barbarian skills cost 60% less mana (store `getManaCost`). **Changed by the owner later:** now -30% (store
  `CLASS_MANA_MUL`, see "Balance pass 2").
- **Barbarian basic axe:** boomerang pierces up to 6 enemies on the way out and 6 more on the way back (a brief
  non-piercing version was reverted on request).
- **Mana regen:** every class has a base 1.0-1.5/s (Archer 1.2, Wizard 1.5, Necro 1.4, Knight/Barbarian 1.0), and the old
  hidden x0.5 in player.ts is gone, so the Character sheet's "Mana regen /s" is now the real rate.
- **Town labels:** shop names are small tags over the shopkeeper (Town.tsx, follow the NPC to the door when the shop
  closes, depthTest off so roofs don't hide them); the Town Gate has no floating label/sign labels anymore.
- **Minimap:** rectangular 284x208 css px (Minimap.tsx W/H; content drawn in a centred square frame, so the sides show
  extra map), shop icons = sharp square badge in the shop colour with a thin line icon (`SHOP_ICON` polylines).
- **Camera zoom** is unlocked by default (base 1.0; `zoom2` one-time migration flips old saves).
- **Meadow in front of the south wall:** extra trees, four flower boxes along the wall, three parked carts (townData
  `CARTS`, drawn by TownScenery `addCart`: goods / hay / barrels, colliders in TOWN_COLLIDERS) and three NPCs appended to
  NPCS: Tilda (travelling merchant by her cart), Corin (carter, patrols), Nell (wanderer on the portal road)., then reversed it ("dont remove potions"). Potions (Z/X, auto-potions
  setting, shop/loot) STAY. Don't remove them.

## Phone UI pass (2026-10-15)
- **Where:** the "v6" block at the end of `index.css` (all rules scoped to `.compact` = touch + short side < 620 css px,
  so desktop is unchanged) + small hooks in TSX. Before/after shots were taken at 800x360, 844x390, 915x412, 1024x600
  (touch) and 1440x900 (desktop).
- **Type size:** phone root font is now `clamp(11, vh / 29.5, 13.5)` px (`ui/layout.ts`; was vh/34 capped at 12), and
  inside panels/dialogs/tooltips the tiny Tailwind sizes (`text-[.5x-.6x rem]`, `.rpg-label`) are floored to .8rem,
  `.7x`/`text-xs` to .86rem, `.8x`/`text-sm` to .92rem (~10-12 css px). Tap targets (tabs, small buttons, X buttons,
  steppers, settings toggles) are >= 40px on phones.
- **Fullscreen on phones:** bag / shops / character sheet (`.side-panel` + `bag-side` / `shop-side` / `char-side`) fill
  the safe area; two open together split the screen in halves (GameUI puts `ph-bag` / `ph-shop` / `ph-chr` on
  `.hud-root`). Bag alone = paper doll column left + grid right; beside a shop the doll starts folded. Character sheet
  alone = attribute tree left, detail right; stats in two columns. Summon / Tech House / Workshop windows fullscreen.
  `Modal` got a `full` prop (codex, goals, quest log, settings, story fill the screen); small dialogs (pause, set out,
  sell/buy, confirm) stay centred, max 36rem, with the X outside the right edge. No backdrop blur on fullscreen layers on
  phones (performance).
- **Touch fixes:** scroll traps fixed generically in `ui/layout.ts` (a touch may pan when it starts inside any
  overflowing auto/scroll box, not only `.rpg-scroll`; e.g. the Tech House list and workshop columns could not scroll).
  Bag on touch: first tap shows the item tooltip, second tap equips / drinks (shop actions stay one tap: they open a
  dialog). Touch potion buttons moved up (they were half off the bottom edge). Keyboard hints (`.kbd-hint`) hidden on
  touch.
- **Dark metal (all sizes):** ribbons (`.rpg-ribbon`: modal titles, game-over depth banner, countdown) are sharp gunmetal
  plates with a gold hairline frame and tone-coloured diamonds; the red rounded touch X is a gunmetal square; pills,
  badges, toggles and bevel sub-tabs are sharp; character sheet Stats tab uses a square class plate (`.cs-avatar`) and a
  dark CP box (`.cs-cp`) instead of the round medallion + parchment; game over shows header and results side by side on
  phones (`.go-wrap` / `.go-head` / `.go-rows`, no more zoom .65).

## Session batch (2026-10-15, later)
- **Boss wards** (`engine/systems/bossMech.ts`): once per fight at 50% hp (`WARD_AT`), max 18 s, barriers every 32/28/24 s.
  Each boss has its own: Golem CRYSTALS (arena crystals), Elderroot GUARD (sporecaps), Hydra GUARD with spare
  `BOSS_HYDRA_HEAD`s (`HEAD_SLOTS` angles so they don't stack on the 3 real heads), Glacius SHELL (no immunity: a 14%
  max-hp absorb shield, stagger + "SHELL SHATTERED" when broken), Ignar GUARD (hellhounds), War Machine CORES (crystals
  right beside it), Void Herald PHASE (immune 5 s, nothing to kill), Lich GUARD (cultists).
- **Town** (`engine/townData.ts`, `render/TownScenery.tsx`): raised castle `TERRACE` (h 1.2) with central stairs; the keep
  stands on it. Ground height = `townLift(x, z)`; the engine keeps y = 0 and renderers add `render/lift.ts liftAt()`
  (hero, bars, wings, NPCs, pet, camera target, facing / guide arrows, status tags). Landmarks: `CHURCH` (enterable),
  `TAVERN` (Golden Tankard), `WINDMILL` (turning sails), `STATUE` (plaza centre; spawn at (0,0) is pushed out by its
  collider). Five crowded houses + ~10 town trees removed; Skill Trainer moved to (-16, -17).
- **Chapel interior**: village area `'CHURCH'` (`engine/churchData.ts`, `render/ChurchInterior.tsx`), same plumbing as
  the castle hall (pending `'CHURCH'`, `switchArea`, exit pill, questNav hop, minimap, tracker). Sister Elowen inside
  (one-time gift: 2 HP potions).
- **Stopped agents finished + merged**: town/cave paths + mining camp + Mine shop + tutorial quests; phone UI pass;
  perf (range-limited uploads, hidden empty pools with shader warm-up, merged NPC skinned meshes).
- Craft / fusion cinematic: lighter backdrop, no blur layer (phones showed black); fusion (gear, shards, pets) uses it.
- Skills in facing mode always aim at the target (`aim.ts fire`); attribute gains ~60%; Common gear drops cut (70% of
  Common rolls give nothing, `store.rollItemDrop`); no "unlocks at Lv" toasts.

## Session batch 2 (2026-10-15, latest)
- **Outskirts (Mondstadt-like)**: `RIVER` south of the gate into the lake, the great arched `BRIDGE` (walkable deck via
  `townLift`), the mainland beyond (z 78..132): farm + `FIELDS` (wheat / cabbages / pumpkins), windmill, Endless Tower,
  Adventure Portal (platform walkable, Set Out only on top). Brewer's hut on the green. Fenced mainland road.
- **Hills**: `engine/townHills.ts` (grid + chamfer distance fade around roads / fields / colliders / river);
  `render/lift.ts liftAt = townLift + hillAt`; `terrainFn.groundY` adds it. Run rooms: hills rise beyond the outer prop
  ring (Room.tsx RoomGround).
- **Coral Isles** (biome index 3, after the Desert): sand islands in a turquoise sea (`waterSea`, OCEAN shader in
  RoomWater `LavaSea water`), palms / totems / huts, crabs, pirates, drowned. Boss: the Hydra, renamed "The Tide Hydra".
  The Desert's boss is now `BOSS_WARMACH` shown as "The Dune Colossus" (`BiomeDef.bossName`, `roomDefs.bossNameIn`).
  Story goals / lines shifted (+1 for Frostpeak, Ember, Void), wanderer biome lists shifted, WAVES_BIOMES 7,
  achievement "every biome" = 7. Saved `bossBiomes` indices from older saves are not remapped (minor).
- **Graveyard + chapel side door**, **benches / pews you can sit on** (legs posed on the idle; no sit clip in the
  packs), Esc closes panels, Set Out portal bug fixed (it checked the old gate distance).

1. Balance/tuning still unverified: boss damage/cadence, town performance on real phones (12 skinned NPCs + wall),
   camera framing in long corridor rooms, boss rooms with new shapes, fountain heal (40%).
2. (done, see "Phone UI pass") Remaining wood-style screens converted to the dark metal look.
3. Character select shows the low-poly KayKit hero; the user's reference uses painted key art. Free CC0 art only.
4. Ideas the user liked earlier but not built: village upgrades, daily challenge; item sets/affixes are partly in.

## Session batch 3 (2026-10-15, newest)
Town / world
- Villagers (townData `noHat/noCape/tunic/hair/longHair`, Npcs `hairGeo` / `tunicGeo`); tavern exit door; walkable throne
  dais (`castleData.daisLift`, `render/lift.ts`), quest walk goes straight up the carpet.
- Brewer hut by the portal (`BREWER_HUT` -10.5,107.6 facing the road, fence gap), west hamlet left of the portal, coop
  faces west like the barn (nests / Dalla / hens moved), farm track fenced, `riverBank(x, side)` wavy banks + round
  east end (terrain, colliders, rocks), `towerKnollAt` in the ground mesh, sandy cove south of the river mouth.
- **No walking on water**: `townData.isTownWater` (lake past the shore/beach line, river; bridge + pier decks allowed);
  `player.resolveStep` slides along the shore. Needed because the polar island edge widened over the lake.
Modes / economy
- Portal: E sets out at once. Endless Tower window = hub (Tower / Daily Trial / Endless Waves / Ascension tabs).
  Tower modes (`runInfo.mode === 'TOWER'`, `combat.towerMode()`): no item/loot drops (gold + Aether Crystals,
  `towerCrystals`), no potions, no Ankh, healing -40%, no EXP; return spawns at the tower door (`runInfo.back`).
- Endless Waves: boss every 5th wave, minis on 5n+3, stacked bosses from 20 (`waveExtraBosses`), minis join boss waves
  from 15, up to 4 minis; boss bar has one owner (`enemies.barOwner`) and hands off (`director.handOffBoss`).
  `director.debugJumpWave(n)` for QA. Wave milestones stay gems.
- Aether Crystals from achievements (`goals.achCrystals`), daily / weekly goals + bonus chests. Field items vanish
  after 3 min (`pickups.ITEM_DESPAWN`).
Items
- Crafting (`crafting.recipeLoot`): every tier needs loot families + ores; Legendary needs late relics (Hydra / Glacius /
  Ignar); Mythic needs Void Herald shards + new `void_heart` + abyssal diamonds; Mythic weapons also Malakar's
  `soul_ember` (5% when he falls for good). Weapons 1.5x counts / gold.
- Upgrades: chance 90% -10%/+, cores level^2/3, gold x1.8, +8/+9 failures can shatter (25% / 40%). Tiered cores:
  Upgrade (+0..+3) / Refined (+3..+6) / Radiant (+6..+9), fuse 5 -> 1 (Blacksmith > Shards), late bosses drop them.
- Tooltip shows the equipped item side by side. Absorb-shield bars on enemies + boss bar (ward = shield 1 excluded).
Talents
- 4 branches x 10 nodes (two lanes + capstone), landscape strips dragged with the mouse, costs 1..5 by column,
  values x0.45, ★ special nodes (mechanics: dash charges, pierce, skeletons, axes, chains, orbs...), 4 points per
  level (200 at Lv 50 >= the fullest tree, 196). Ids `<h>2_<branch><i>`: older ranks were refunded.
Open
- Beach ship + captain (60-gem ticket to Coral Isles depth 1), decor on the green before the gate.
- Owner asked "max levels maybe 50?" (item upgrade cap is +9 / level 10; hero max level is already 50): unanswered.

## Balance pass (Oct 2026, headless sim)
Owner asks: "improve gameplay overall, balance the game", "decrease monster spawns on some bosses if there are too many".
None of the owner's explicit values were touched (drop nerfs, class HP / move speed, mana regen 1.0-1.5, potion 30 s,
Barbarian kit, Necro summon rules, stagger meter, pre-boss -25% HP, boss HP x0.5).

**How it was measured.** A Playwright harness (session scratchpad, not in the repo) loads the engine modules on a blank
page, drives `updateGame(1/30)` and plays with auto-battle plus a bot that dodges ~70% of telegraphs and ~55% of enemy
shots, kites with ranged classes, takes the first reward card and walks through portals. "Shop" runs keep the profile
between runs: equip better loot, spend attribute points (half VIT), keep 5 HP potions and buy Armory upgrades. Boss
tests jump into the boss room with a typical level and gear per biome (Lv 5-6 Rare, 12-18 Epic, 24-40 Legendary).
"God" = the hero can't die (to measure adds and fight length). The bot is a weak player, so absolute death rates are
pessimistic; compare before/after and class against class. QA gotcha: restart Vite after every engine edit, or the
page imports a second copy of edited modules and nothing happens.

### Boss adds and fight length (god mode, 5 classes each)
| Fight | Before: time / peak adds alive / adds per fight | After |
|---|---|---|
| Slime King (pre-boss, Lv 5) | 15 s / max 17 (avg 10.6) / 21 | 14 s / max 9 (avg 7.8) / 18 |
| Elderroot (Lv 6) | 39 s / 4 / 7 sporecaps | 28 s / 4 / 7 |
| Gorath (Lv 12) | 83 s / 0 | 69 s / 0 |
| Lich mini-boss (Lv 12) | 19 s median, **Knight 543 s**, max 19 adds, 45 cultists per fight | 40 s median, worst 46 s, max 10, 10 per fight |
| Mire Hydra (Lv 18) | **3 of 5 never finished (10 min)**, heads regrew 35-45 times | all finish, 73 s median (38-110) |
| Glacius (Lv 24) | 84 s / wyrmlings max 4 | 67 s / max 4 (unchanged) |
| Ignar + Colossus (Lv 30) | 192 s / max 7 (imps + hellhound guards) | 153 s / max 8 |
| Void Herald (Lv 36) | 114 s, 1 of 5 unfinished | 86 s, all finish |
| Malakar, both stages (Lv 40) | 4 of 8 finish within 500 s, max 8-15 adds | 5 of 8, max 6-11 |
| Desert pre-boss champion (Lv 16) | **max 36 adds alive** (scarab swarms), 66 per fight | max 10, 34 per fight |

### Runs (biome 1, 15 rooms + boss)
| | Before | After |
|---|---|---|
| Fresh Lv 1 run, rooms survived (Archer / Wizard / Barbarian / Knight / Necro) | 6.1 / 6.0 / 9.0 / 9.5 / 10.8 | 8.0 / 7.2 / 11.0 / 9.8 / 11.0 |
| Elderroot, Lv 8 in shop gear, boss room only | 0 of 15 won, boss at 59% when the hero fell | 1 of 15 won, boss at 39% |
| Elderroot reached in 6-run shop progressions (Lv 1 -> 9-10) | 7 won / 18 lost (28%) | 31 won / 38 lost over three batches (45%); the last batch, on the final code, 6 / 18 |
| Average Lv after 6 runs | 9-10 | 9-10 |
| Gold / gems per run, Lv 1-10 | 7-17k fresh, 14-31k later / 4-31 gems | about the same |
Per class (6-run progressions): Barbarian is clearly the strongest (1-2 deaths in 6 runs, 29-31k gold per run, wins
Elderroot 4-5/5); Wizard is the weakest (0 of 10 Elderroot fights won after the pass, 132 HP at Lv 8 with shop gear);
Archer next weakest. Necro and Knight sit in between and vary a lot between batches.

### Changes (every value)
- **Champion / pre-boss rooms** (`director.ts`): escort pack 0.3 -> 0.22 of a skirmish budget; at most
  `MINI_MAX_ALIVE` = 10 room-pack monsters alive at once (`d.maxAlive`, was the room cap 36); escort groups at most
  4 (scarabs used to come in 7-11). Boss rooms use the same cap for their extra packs (Endless Waves from wave 20).
  `nextWave` resets `d.maxAlive` to 36 for normal waves.
- **Lich / Malakar** (`bosses.ts`): summons only while fewer than 9 monsters are alive (was 14); one fewer cultist
  per summon outside Malakar's first fight (2+phase, stage 2 +1); the anti-hug blink has a 4 s cooldown (was every
  time a hero came within 6 u, which locked melee heroes out).
- **Malakar's illusions** (`combat.ts`): take x3 damage (bar still mirrors his HP; auto-aim kept feeding them).
- **Mire Hydra** (`bosses2.ts`): at most 4 head regrowths per fight (was unlimited), +2.5% hp per regrown head (was
  4%), no regrowth while warded.
- **Ignar**: Summon Imps 2+phase per cast (was 3+phase), max 6 imps alive (was 10).
- **Elderroot**: Thorn Ring damage x0.9 power (was x1.3): the class dash only unlocks at Lv 20, so the rings were
  almost unavoidable in biome 1.
- **Shared boss layer** (`bossMech.ts`): Cataclysm impacts x0.8 power (was 1.1), Quake x1.0 (1.3), Crush x1.25
  (1.6); ward lasts at most 25 s (35); ward crystals 3.5% of boss hp each (4.5%), summoned guards x1.2 hp (x1.5);
  Mend never starts while warded or in Malakar's final fight (he has his own shield) and a ward cancels a running
  Mend; periodic barrier every 22 / 20 / 18 s for 5 / 6 / 7% hp (was 20 / 17 / 14 s, 6 / 8 / 10%).
- **Boss damage** (`enemies.ts` `BOSS_DMG`): biome bosses deal x0.85 damage.
- **Onboarding** (`enemyDefs.ts` `waveDmgMult`): waves 1-5 hit for 75 / 80 / 85 / 90 / 95% (like `waveBudget`).
- Tried and reverted: Knight skills -25% mana (once measured correctly every non-Barbarian class is mana-bound,
  so the Knight is not an outlier).

### Endless Waves / Daily Trial / economy (checked, not changed)
- Endless Waves: Lv 20 Epic reaches wave ~20-22 (the wave-20 Gorath boss is where it ends); Lv 35 Legendary reaches
  21-26 in 25 min. Waves 1-15 take 15-20 s each, waves 20+ take 70-200 s (hp grows with depth^2, depth = 2 + 1.6 x
  wave). Boss waves are about 2-2.4x the hp of the same boss in Adventure. Peak alive stays at the 36 cap. Fine as an
  endless mode; if late waves feel like a slog, lower `waveDepth` to 2 + 1.4 x wave.
- Daily Trial (depth 5-13, x1.5 monsters, 2-3 modifiers): Lv 20 Epic clears all 5 floors in 1.5-3.5 min with any
  modifiers; Lv 10 in shop gear dies on floor 2-4 when the day has Dry Flasks + Bloodthirst. The Lv 8 unlock (merged
  after this pass) is on the edge for those days.
- Economy: Armory Common ~1.2k / Rare ~6k gold, potion 1.5k, so a full Rare set takes 2-3 early runs. 1-3 gem summons
  per run (10-30 gems). XP: Lv 1 -> 10 in about 6 runs (~40 min); estimated 15-20 h to Lv 50 (~2-4k XP per minute at
  Lv 20-35 vs `xpNeed(lv) = 250 lv^1.5`).

### Open owner decisions (answered - see Balance pass 2)
The owner answered: Wizard gets a purple shield passive (replacing Storm), Barbarian -60% mana is too much (re-tune every
class), the dash unlocks at Lv 8 with a slightly shorter cooldown, bosses adjusted to match.

## Balance pass 2 (Oct 2026, owner answers)
**Harness correction:** the first pass's bot could learn OTHER classes' passives (the trainer filters by class, the bot
did not; `skills.ts` never checked the class either), so e.g. an Archer bot got the Wizard tornado. Absolute numbers of
pass 1 were inflated; the relative findings stand. Pass 2 numbers are honest. The engine now also checks the class
before running the Wizard passive.

### Changes (every value)
- **Wizard: Arcane Shield replaces Storm** (same skill key `storm`, so saves keep their levels; Lv 6 unlock as before).
  Every 12 s (-1 s per level, min 7 s, full speed while moving) in battle a purple shield absorbs 20% (+5% per level)
  of max HP for 6 s or until broken. Player fields `arcane / arcaneMax / arcaneT` (engine/types.ts), cast in
  `skills.ts`, soaked first in `combat.damagePlayer` ("SHIELD SHATTERED" + purple burst when broken), drawn as a
  purple bubble by `AegisSphere` in render/Hero.tsx and on the shield strip above the HP bar; "ARCANE SHIELD" float
  text on cast. Talents: Storm Surge = +0.5 s duration per rank, Tempest / Archmage 6-set = shield +25%. New icons
  (SkillIcons / UpgradeIcons / ItemIcon). The tornado no longer spawns (the `TORNADO` zone is still used by Gale Arrow).
  Measured with the bot at Elderroot (Lv 8-10, shop gear): 0 of 6 won without the shield; 2 of 12 with it (it casts
  4-6 times per fight).
- **Mana cost per class** (store `CLASS_MANA_MUL`; regen unchanged 1.0-1.5/s): Barbarian x0.7 (was x0.4), Wizard x1.0
  (was x1.3), Knight x0.85, Archer x0.75, Necromancer x1. Average mana left during fights in 6-run progressions:
  before Barbarian 77% (never empty) / Wizard 29% / Knight 25% / Archer ~40% / Necro 48%; after Barbarian 35%, Wizard
  31%, Archer 37%, Necro 36%, Knight 18-46% (noisy between batches).
- **Dash** unlocks at Lv 8 (was 20), recharge 5.5 s (was 6), every class incl. Barbarian Leap / Knight Holy Charge
  (all share `tryDash`). Mira's tutorial line updated.
- **Bosses, now that the dash comes at Lv 8:** Elderroot Thorn Ring x1.1 power (pass 1: x0.9, originally x1.3).
  Elderroot (the Adventure Greenwood guardian only) has -15% HP. Auto-aim skips a warded (immune) boss while its
  guards / crystals are alive (`player.ts`). Ranged heroes used to pour damage into the shield and die at the 33% ward.
  Malakar's own shield is now 5% every 20 s / 7% every 16 s in stage 2 (was 7% / 17 s and 10% / 13 s).
- **Archer** base damage 12.2 -> 14.6 (+20%). It was the clear outlier once the bot stopped borrowing passives: 8.5
  rooms per run vs 12-18 for the others. After the change: 10.9-12.3.

### Results (final code, honest bot)
| Elderroot, Lv 8-10, shop gear, boss room only | Won |
|---|---|
| Barbarian | 6 / 6 |
| Knight | 5 / 6 |
| Necromancer | 4-5 / 6 |
| Archer | 3 / 6 (after the auto-aim fix; 0-2 / 6 before) |
| Wizard | 1-2 / 6 (0 / 15 in pass 1) |

6-run shop progressions (Lv 1 -> 9-10): rooms per run Archer 12.3 / Wizard 12.2 / Barbarian 14.8 / Knight 18 / Necro
14.7. Barbarian and Knight beat Elderroot in runs (10 / 10); the other three mostly still fall to it on their first
6 runs. God-mode boss suite unchanged apart from the Lich mini (peak 4 adds, 15 s). Malakar at Lv 40: 3 of 6 bot fights
finish within 500 s (was 1 of 5 within 900 s).

### Still open
1. **Wizard is still the weakest boss fighter.** Next steps if the owner wants: shield +5% per level more, or let the
   Lv 6 unlock come at Lv 2.
2. **Malakar's final fight** stays long for auto-aim (illusions + cultists): half the Lv 40 bot fights exceed 8 min.
3. **Knight runs lowest on mana** but is the strongest runner (0 deaths in 6 runs). Leave it, or drop its mana cut to x1.

## QA (headless)
- Tailwind CDN is blocked in the container: route it to the npm package `tailwindcss-cdn@3.4.10`
  (`3.4.3/tailwindcss.js`). Restart Vite before each scripted run: after HMR, `import('/store.ts')` from the page
  gets a SECOND module instance and state changes don't reach the app.
- Playwright helpers live outside the repo (session scratchpad, gone with the container). Pattern: launch Chromium
  at `/opt/pw-browsers` (never `playwright install`) with `--use-angle=swiftshader`, route the Tailwind CDN to a
  local copy if offline, `npx vite --port <p>`, then in-page import modules via
  `performance.getEntriesByType('resource')` to reach `engine/world.ts` / `store.ts` / `engine/game.ts` and drive
  `updateGame(dt)` deterministically. Kill Vite with `pkill -f "[v]ite --port <p>"` in a SEPARATE shell call (the
  bracket trick stops pkill matching its own shell).
- SwiftShader FPS is meaningless; judge perf by draw calls / triangles / sim ms.

## History (big milestones)
v2 rebuild (engine/world split, instancing) → KayKit heroes + Kenney trees → combat depth (tricks, statuses, aimed
casting, combos) → Capacitor APK + PWA → 5 new bosses → modern UI (later reverted) → Hades rooms + living town →
target lock → room shapes → tarot cards → old UI restored → F attack, facing-cast, town skills, 0 SP start.

## NPC story quests
- Data `npcQuests.ts` (11 hand-written quests, chains via `after`, hidden via `cond`), logic + event hooks `engine/systems/npcQuestLogic.ts`
  (accept / progress / turn-in / marker cache), state `npcQuests` in the store (saved in the profile, incl. `bossKills` counters).
  Dialogue: `dialogue.ts` offers (Accept F / Later E), reminds, or turns in; markers in `render/Npcs.tsx`; tracker rows (blue book) in `QuestTracker.tsx`; guide arrow points at a ready NPC.

## Session additions (Oct 2026, cont.)
- **Elderroot (biome 2 boss)** now walks into melee range (`keepRange` near 2.5 / far radius+3.5) and has a lumbering stride animation (`render/Bosses2.tsx`).
- **Town arrival pillar**: `world.village.spawnFx` (1 -> 0 over ~3 s) set by `enterVillage` and when the class select closes; drawn in `render/Hero.tsx`.
- **Warehouse** (`WAREHOUSE` shop, beside the blacksmith at (19.5, 2)): 100-slot storage `warehouse: Item[]` saved in the profile; `depositItem` / `withdrawItem`; UI `ui/panels/shop/Warehouse.tsx` (storage only; the Bag opens on the left, clicking a bag item stores it).
- **Item drag & drop** (`ui/lib/dnd.ts`, HTML5 DnD; `ItemSlot drag={...}`, `useDrop`): bag -> paper-doll slot equips, equipped -> bag unequips, bag <-> warehouse, bag -> shop window sells (Blacksmith: selects for upgrade). Clicks still work (touch).
- **Red dots**: Skills button lights for unspent run skill points OR free talent points; the Skill Trainer tabs carry their own dots (`useRunSkillAlert`, `useTalentAlert`).
- **Drop rarity**: `rarityForDepth(depth, bonus, bossesBeaten)` - MYTHIC never before a boss is beaten (never from the first boss), <= 1.5% after; LEGENDARY is a trickle until the first boss, then +3% per boss. Boss gear drops and boss trade goods follow the same rule (`combat.ts`, `rollLoot(..., mythic)`).
- **Zoom lock**: `settings.zoomUnlocked` (default off) - camera dist forced to 1.0 unless unlocked in Settings > Gameplay.
- **West shop row**: Potion Shop (-20.5, 2) / Pet Stable (-29.5, 2) / Fortune Teller (-36.5, 2); a house fills the old stable spot. Pet shop preview panel removed.
- **Debug mode** (Settings > Debug, `ui/screens/DebugTab.tsx`, flags in `engine/debug.ts`, saved in localStorage `aether-survivor-debug-v1`): god mode (`damagePlayer` early-out), one-hit kills (`damageEnemy`), max skills each run (`debugMaxSkills`), max gold/gems/shards, rank 40 + all talents, +99 SP / +10 levels, jump to any biome / room type / room (`debugJump` in director) with an optional boss override.
- **Manual item order**: bag and warehouse keep their array order; drag an item onto another to swap, onto an empty slot to move it last (`reorderItems`, `reorder()` in `ui/lib/dnd.ts`); Sort orders the list once (rarity -> type -> power).
- **Warehouse gold**: `warehouseGold` (saved), `moveGold(+deposit / -withdraw)`; bag footer shows gold; CP pill has no coin icon.
- **Town additions**: houses at (-24,-6) and (23,-6) facing the north street ends; Skill Trainer is now a striped training pavilion (dummies, weapon rack, archery target) with extra colliders in `mapgen`.
- **NPCs never clip buildings**: Lysa / Dorn / Hodge / a cat rerouted; `npcs.ts pushOut()` pushes walkers out of colliders each step (headless check: every patrol + animal ellipse vs `queryColliders`).
- **Click-to-walk**: clicking a shop / quest board / trainer in town sets `world.village.go`; the hero walks to the counter (`updatePlayerVillage`) and the panel opens on arrival (`walkAndOpen` in village.ts). Manual movement cancels; 10 s timeout.
- **Portals need E**: next-room portals and the big next-biome portal are entered only via E / the interact pill (`interactRoom`, node 20 = big portal); touching does nothing.
- **Crystal Cavern** room type `CRYSTAL`: no enemies, 13-17 CRYSTAL/ORE nodes (`roomgen`), no reward; 50% of biomes get one door to it (director `crystalAt`, injected by `nextChoices(..., crystal)`).
- **Shrine (optional challenge) at most once per biome** (`shrineBiome`, `nextChoices(..., shrineOk)`).
- **Cross Slash**: slow (speed 12, life 1.75 s) piercing X; width 2.3 + 0.4 per level (render scales with `p.radius`).
- **Boss intro banner** smaller (band 5.4rem, title 1.9rem).
- **Bag delete mode**: footer Delete -> tap items (red X) -> Delete (N) -> confirm (`deleteItems`).
- **Street routing for click-to-walk**: `walkTo(x, z, act, tab, r, npc)` in village.ts builds waypoints along the "+" street network (south street z10, north street z-6, x0 axis) and does `act` on arrival (shop / castle / leave / npc / none). Quest tracker rows are clickable (`walkToQuest`): claim -> board, King -> castle / King, sell loot -> potion shop, else -> town gate.
- Castle approach flower beds (PLANTERS).
- WIP foundations: `ascension.ts`, `engine/runMods.ts` (difficulty x Ascension mods used by spawn / combat / healing), profile `progress` (endings, ascension, tower best) + store actions `startMode`, `setAscension`, `completeEnding`, `recordTowerFloor`.
- **Ending**: after the Void boss (adventure mode) the big portal reads "The Undying Throne" -> `finalFight` boss room with Malakar (BOSS_LICH, x3.2 hp, bigger); his death emits `gameEnding` -> `ui/screens/Ending.tsx` (story lines, credits, "The End", Continue = `completeEnding()` + victory summary). Unlocks the next Ascension.
- **Ascension 1-10** (`ascension.ts`): chosen in the town-gate **Set Out** window (`ui/screens/SetOut.tsx`, opened by the `openSetOut` event from the gate); cumulative hardships via `runMods()`, +12% gold / loot luck / rank xp per level.
- **Endless Tower** (`runInfo.mode = 'TOWER'`): floor N = elite every 3rd, champion every 5th, boss every 10th; one portal up (E); depth 2 + 1.5 x floor; visuals cycle biomes every 5 floors; best floor per class in `progress.towerBest`; gems every 5 floors.
- **Goals & achievements**: `goals.ts` (daily/weekly pool, ISO-week/day keys, `MetaState`), `achievements.ts` (23 achievements + titles), `goalsTracker.ts` (event-bus feeds `enemyDeath/crateBreak/waveClear/biomeClear/playerHit` + new `hub` event emitted by store summon/upgrade/buy/craft/claimQuest; counts buffered, flushed on room clear / run end / hub action / every 6 s; claim + equip actions), saved as `profile.meta` (store `meta`), UI `ui/screens/Goals.tsx` (`uiStore.goalsOpen`, quick-menu button + `useGoalsAlert` dot), equipped title shown under the name in `TownProfile` and the in-run `PlayerPlate`.
- **Barbarian axe = boomerang**: straight at first, then an ever tighter curve (alternating side per axe), swings round and homes back with a limited turn rate; hits again on the way back (`projectiles.ts` case 'AXE').
- **Harvestables in any room**: 25% of non-boss rooms get 2-4 CRYSTAL / ORE nodes (`roomgen`).
- **New class passives**: Barbarian **Warcry** (`warcry`) and Archer **Inspire** (`inspire`): every 12 s (x CDR) with an enemy within 25, a 5 s (+0.5/lv) self-buff via `player.buffT/buffDmg/buffDef/buffHaste` (Warcry +10% dmg & +8 def, +5% / +4 per level; Inspire +15% attack speed & +8% dmg, +5% / +4% per level). Learned from upgrade cards / Skill Trainer (start at 0).
- **Tech House** (`TECH` shop at (23,-6), rotated to face the north street end; `SHOP_POSITIONS[].rot` + Shop `facing`): permanent gold upgrades in `tech.ts` (bag +10 slots, warehouse +25, potions +12%, gold +4%, xp +4%, max HP +3% per level), saved as profile `tech`, `buyTech`; effects in `loadoutFor` (gold/xp/hp), `usePotion`, warehouse cap, `maxInventorySlots`.
- **Hermit path**: Pip (gives the hermit quest) now stands still, hidden in the north-west corner (-40.5,-36.5). Outside the walls (east ring -> north ring) there are extra trees, `RUINS` (pillar / wall / arch, rendered in TownScenery) and `TOWN_MONSTERS` (engine/systems/townMonsters.ts): real enemies held in place (speed 0), harmless (damagePlayer is off in town), killable with auto-attacks (town auto-fire when standing still, aims at the nearest) and skills, respawn 60 s after death. Projectiles live out to r=120 in town. Click-to-walk to anything outside the north/east wall routes through the gate and round the east side.
- **Endless Tower is a building** (`TOWER` in townData, forecourt west of the road at (-16, 58), door faces the road; `TowerLandmark` in render/Town.tsx). E at the door / click -> `openSetOut { mode: 'TOWER' }`; the town gate opens the Adventure-only Set Out window.
- **Town renders enemies / projectiles / zones / ground FX** (Scene.tsx) so the hermit-path monsters, attacks and skills are visible in town.
- **Knight class** (`KNIGHT`, KayKit Knight.glb, `makeSword` in render/weapons.ts):
  - Basic attack = sword slash (`ProjectileType 'SWORD'` -> projectile `SLASH`: short (0.26 s), wide, pierces all, mirrored on alternate swings).
  - 1 Holy Wave (`HOLY_WAVE` golden crescent, pierces), 2 Shield Wall (`player.guardT/guardRed`: knockback burst, -50%+ damage taken, slow heal), 3 Judgment (delayed pillar of light at the aim point: damage + stun + armor break; `abilityState.judge*`).
  - Space Holy Charge (`shoulderCharge(true)`: invulnerable charge, damages along the path), R Divine Avatar (ultKind 4: burst + stun, 8 s (+`avatarBonus`) of x1.5 damage, -40% damage taken, every swing also fires a Holy Wave; `player.avatarT`).
  - Passive Consecration (`consecrate`, starts at 1): holy aura damage every 1 s, small heal per enemy hit.
  - Gear: starter Squire set + `sword_1`; 10 generated swords (`w_knight_*`); class set **Paladin's Oath** (EPIC; 2: +25 def/+1 regen, 4: -10% damage taken/+15% skill dmg, 6: Divine Avatar +3s/+15% dmg/+10% HP); swords in the shared sets. Talents: Crusader / Bastion / Templar.
- **Lore** (`lore.ts`): the Aether Font (the plaza well) and the guardians' oath explain why the hero returns to town on death; Malakar = the King's archmage who stole a shard of the Font. Shown as a one-time **prologue** (`ui/screens/Story.tsx`, localStorage `aether-survivor-prologue-v1`), a **Story book** (Codex -> STORY; chapters unlock per boss kind defeated via `npcQuests.bossKills`, the ending and Ascension), a line on the death screen (`FALL_LINES`) and new lines for Elder Tobin, Old Wend and King Aldric.

### Endless Tower floors (look) + debug rank
- Tower floors (`runInfo.mode === 'TOWER'`) are always a ROUND arena (`roomShape.buildShape`), radius 26 (boss 29) (`roomgen.roomRadius`).
  `buildRoom` skips biome walls, clutter and hazards. It places a fixed ring of 28 RUIN pillars, 4 STATUEs on the diagonals and 2–4 crates.
- ROUND has a fixed facing (`fx=0, fz=-1`), so the arrival spot (0, +0.55R) and the next-floor portal (0, -22) are identical on every floor.
- Render: `Room.tsx` `TowerFloor` draws a cobblestone/cement disc (canvas texture `towerCobbles`, concentric stone rings), a stone skirt below,
  a pulsing rune ring and drei `<Stars>`. `biomeLook.setLook` uses a night palette in the tower, and `Sky` fades its clouds with `look.sky`.
  Enemy rosters and bosses still follow `towerBiome(floor)`.
- The Announcer shows "Endless Tower · Floor N" on every floor (no biome banner).
- Debug tab: "Hero rank" +1 / +10 / Max rank (99) buttons (`setRank`).

### Dash, prologue slides, Knight passives
- Dash phases through props, walls and crates (`player.ts` `resolveObstacles`: while `dashT > 0` only the walkable edge clamps; never inside
  the castle interior). A dash that ends inside a collider is pushed out on the next frame. Normal moves resolve in ≤0.35-unit sub-steps.
- Prologue (`ui/screens/Story.tsx`) is now slides: one passage per screen. Next/Back, Space/Enter/arrows, progress dots, Skip.
- The town now fades `levelUpFx` / `reviveFx` and clears `avatarT` / `guardT` (the gold level-up column used to stay lit in town).
- Knight: sword arcs are white/blue. Holy Wave radius is 3.6 (+0.4/lv) and its crescent mesh is bigger; the Avatar holy wave radius is 3.2.
- New Knight passives:
  - `smite`: a hit proc on SLASH via `procFlags.smite`. A holy bolt hits the nearest enemy for 2.4× damage in an area, plus a stun.
  - `radiant` (Radiant Burst): every 10 s (timed, charges while still), it fires 7+lv HOLY_WAVE crescents in a ring.
  - Both have cards (`SKILL_SMITE` / `SKILL_RADIANT`) and painted icons (`consecrate`, `smite`, `radiant`).
- Consecration is an always-on aura, so it shows no cooldown. The "Charges faster while standing still" tooltip note only appears for
  passives that really use `chargeMul` (`STILL_CHARGE` in ActionBar).

### Divine Avatar rework, Judgment rays, slides, Knight range
- Divine Avatar (`avatarT`):
  - Keeps the light column, +50% damage and a Holy Wave on every swing.
  - Adds white feathered wings (`Hero.tsx` wingGeo, two mirrored meshes laid back so the top-down camera sees them; they unfurl and flap).
  - +50% attack speed (`player.ts` rate). The damage reduction was removed (`combat.ts`).
  - Sword arcs are 2× (radius 5) and golden: projectile `emp` flag → `SLASH_GOLD` instanced mesh in `Projectiles.tsx`. The Holy Wave skill is 2× too.
- Judgment: min(7, 3+lv) rays (`judgeRays`). It picks the nearest distinct enemies within ~9 of the aim point, or random spots if there are
  fewer enemies. Each ray lands 0.45 s + 0.09 s × i after the cast and follows its enemy until it lands: 3.4× damage in r 2.6, plus a stun.
  The VFX is `ultImpact` 'JUDGMENT' in `VFX.tsx` (stacked glow column + falling light streaks).
- Shield Wall burst radius is 8 (+0.3/lv); it used to be 6.
- Knight basic-attack range is 7 (`ATTACK_RANGE.KNIGHT`). It was missing, so the Knight swung at enemies 18 units away.
- Prologue and ending are auto-advancing slides (`slideMs(line)` = 3.2 s + 45 ms/char), one passage per screen, with no Next buttons.
  Skip stays, and click/Space jumps ahead. The ending keeps its final Continue card. On the first ending, an "Endless Tower is open" card
  shows once back in town.

### Tech House popup + Pet House grid
- The Tech House is a centred popup like Summon (`TechWindow` in `ui/panels/shop/Tech.tsx`, mounted in `GameUI` when `activeShopTab === 'TECH'`).
  It shows a grid of one-time upgrades: each level is its own card (I..V) and they unlock in order. Bought cards read "Owned".
  Costs are now **gems** (`tech.ts` `cost(lv)` = gems for the next tier; `buyTech` spends gems). Saved levels are unchanged.
- Pet House has Shop / Pet Care sub-tabs. The Shop is a 4-column bag-style grid (price under each slot, summon-only pets greyed out).
  Clicking a pet shows its details (stars, badges, skill, stats) and a Buy button below the grid.

### Summon pity, reveal screen, town pet
- Pity (`store.ts` `summonPity` {GEM, SHARD}, persisted): each altar counts its draws. Every 60th draw is a Legendary, and every 240th is
  80% Legendary / 20% Mythic (`PITY_LEGEND` / `PITY_MYTHIC`). The Summon window shows both countdowns with bars.
- Summon results (`SummonReveal` in `ui/panels/Dialogs.tsx`) stay up until Draw x1 / Draw x10 (same altar, `uiStore.summonAltar`) or Leave.
  Clicking, Enter and Esc no longer close it. Common/Rare just fade in. Epic gets a medium purple aura, Legendary a big gold aura and border
  glow, and Mythic a huge red aura plus spinning red rays and a pulsing border (`.sr-*` in index.css).
- Pets now show in town: `updatePetTown` (pets.ts) trots after the hero from the village loop, and Scene mounts `<Pet />` in TOWN. Before,
  pets were only drawn and updated during runs. Note: Legendary gear (pets too) needs Hero Rank 15 to equip.

### Harvest nodes, Ankh cooldown, APK
- Harvest nodes (`isHarvestNode` / `HARVEST_NAME` in mapgen): CRYSTAL (gems + shards), ORE (shards; silver-blue flecks), GOLD_VEIN
  (gold burst), HERB (3 health orbs in runs). Each has its own model (`render/Crates.tsx`) and glow.
  They only break by hand: `hitCrate(c, n, byHand)`, where attacks and explosions pass `byHand = false` and are ignored.
- Runs: every non-boss, non-tower, non-cavern room gets 1 node (75%) or 2 (25%). The roll is crystal 30 / ore 30 / gold 20 / herb 20.
  Crystal Caverns keep their big node field. Biome crate lists no longer contain CRYSTAL.
  Hold E next to a node: `director.scanNearby` adds node `100 + crate index`, and `interactRoom` strikes it every 0.3 s.
- Ankh of Life: 15-minute real-time cooldown between revives (`ankhCooldownLeft()` in combat.ts, localStorage `aether-survivor-ankh-cd-v1`).
  The item tooltip shows "Recharging: N min left" / "Ready".
- CI: the android workflow also builds on `claude/charming-shannon-nq5wcd`. A `v*` tag publishes a GitHub Release with the APK.

### Combat readability batch
- Knight sword arcs and Holy Wave use a real tapered crescent mesh (`crescent()` in `render/Projectiles.tsx`: 3-ring strip, edge → bright
  core, double-sided) instead of stepped boxes.
- Divine Avatar adds a soft gold-white emissive glow on the hero (`Hero.tsx` emissive tint).
- Dash direction is predictable: a tap dash (Archer roll, Barbarian/Knight charge) goes exactly along `p.facing`. Aimed (hold) dashes keep
  the aimed line. `render/FacingArrow.tsx` draws a white ground triangle ahead of the hero (runs + town) and, while a dash charge is ready
  in a run, faint chevrons out to the dash reach.
- Target ring + HP card follow `currentTarget()` (combat.ts): the click-lock, else the auto-aim enemy. Before, they only showed for a
  clicked target.
- Mobile: Dash swapped places with Skill 1, so it sits right beside the Attack button. The Knight attack button uses the HOLY_WAVE icon.

### Town fixes: monster stacking, tower spot, dash tuning, Set Out
- `spawnTownMonsters` clears every active enemy before spawning. Each town rebuild (back from a run or the castle) used to add another
  unleashed set: 10 → 60 after 5 rebuilds, which looked like "50 superfast monster shadows".
- Endless Tower moved deeper into the woods: `TOWER {x:-21,z:74}`, door (-16,74), a road branch at z 74, extra trees around it. The ORE
  node moved to (-20,58).
- Dash: `DASH_SPEED` 32 (~7 units, was 42). Cooldown is ×0.6 (min 0.5 s). FacingArrow chevrons reach 7.
- The Set Out / Endless Tower window closes by itself when the hero walks more than 7.5 units from the gate / tower door.

### Targeting + enemy melee
- The hero walks to the targeted enemy until it is in weapon range: the click-lock always (any distance up to the drop range), else the
  auto-aim pick. A clicked target always wins over closer enemies. Switching targets or arriving in range swings immediately (no
  STOP_TO_FIRE_DELAY after auto-chasing; `fireT` is clamped on a target change).
- No contact damage. A monster in reach winds up a basic strike (`meleeT`, 0.42 s, flashes in render/Enemies.tsx), lunges 0.35, and hits
  only if the hero is still within reach + 0.7. 1.1 s between strikes. Skill moves (state ATTACK: boar/brute charges, zombie grab,
  bandit dash, wraith lunge) still hit on contact (×2).

### Main story chain, tutorial hints, quest colours, gate routing, skill lock
- `story.ts` holds the chain: Garrick (gate guard) → King Aldric → kill 10 Slimes → report to the King → defeat Malakar.
  - The profile field is `story {step,p}`. A new profile starts at 0; old saves without the field jump to step 4, or past it if the ending
    was already seen.
  - The store action `setStory(step, p)` posts a "Main quest: ..." notification.
  - `engine/systems/storyLogic.ts`: `storyTalk(npc)` (dialogue.ts calls it first, so the step NPC's lines replace ambient talk and the step
    advances), kill counting on `enemyDeath`, `gameEnding` finishes the Lich step, and `storyTarget()`.
- New game: the hero spawns outside the gate (0, GATE.z+9) facing the town. The gate shows "Sealed" and refuses to open until step 2
  (`gateOpen`).
- Tracker:
  - The main quest row (`.qt-row.main`) is gold, at the top, and click → `walkToMain()`.
  - Quest-board rows (`.board`) are bluish; NPC side quests are teal.
- The guide arrow (gold) and the gate light column + ring follow `storyTarget()`: the step NPC, or the castle door when that NPC is inside.
  Field steps fall back to the old logic / the gate.
- Routing: `buildRoute` crosses the gate properly forecourt ↔ town (gate waypoints z1+5 / z1-4). Waypoint buffer is now 16 points.
- Tutorial (`engine/systems/tutorial.ts` + `ui/hud/TutorialHint.tsx`, flags in localStorage `aether-survivor-tutorial-v1`): "Hold E to harvest"
  near a node, "Press 1" on the first run, then "Ultimate charged, press R". The first trial run starts with a full ult.
- Skills: a 0.55 s global lock after any skill / ult cast (`gcdUntil` in abilities.ts gate()). Auto-aim always re-picks the closest enemy,
  with 1.5 u hysteresis.

### Farm interaction quests + dialogue position
- Outside the gate: a red barn (`BARN` 22.5,45) and a chicken coop (`COOP` 6,48.5), both in HOUSES so they get colliders. Two cows and two
  hens (ANIMALS, new kind COW with a model in render/Npcs.tsx), egg nests (`NESTS`), and farmers Hollis (barn) and Dalla (coop).
- New NPC objective type `INTERACT` (target 'milk' | 'egg' | 'cat'), counted by `interacted(id)` in npcQuestLogic. Village act 'farm':
  - Cows: node 200+i, E = milk, 20 s per cow.
  - Nests: node 300+k, an egg every 25 s (the egg mesh shows when ready).
  - Pip's cat Biscuit at `HIDDEN_CAT` (40.5,-36.5): node 400, there only while `pip_cat` needs it.
- Quests:
  - `hollis_milk`: milk 3 times.
  - `hollis_fox`: kill 20 Goblins. Unlocks after `hollis_milk` and at rank 3 (example of rank/quest gating).
  - `dalla_eggs`: collect 5 eggs.
  - `pip_cat`: find Biscuit.
- The dialogue box sits above the skill bar (`.dlg-root` bottom 7.6rem; touch: 42vh).

### Per-class permanent levels (Rank removed)
- `classLevels.ts`: `classProg: Record<HeroClass, {lv, xp, sp, skills}>`, persisted in the profile.
  - XP curve `xpNeed(lv) = 250 · lv^1.5`, max level 99. Level growth uses the same per-level stats as before (`growBase`).
  - A fresh class has 3 SP; skill 1, the dash, the ult and the utilities are learned.
  - Unlock levels (`unlockLevel`): skill 2 Lv 5, skill 3 Lv 10, regen Lv 2, class passives Lv 2/4/6/8.
  - Old saves: every class starts at the old shared rank with `3 + (rank-1)` SP.
- Store:
  - `runState` reads level / xp / sp / skills from `classProg` of the hero. `skillLevels` is a run copy: room cards boost it for the run
    only, and cards never unlock level-0 skills.
  - `addExperience` levels the class permanently: +1 SP and growth, written to `classProg`, with a LEVEL UP toast.
  - `upgradeSkill` checks the unlock level and writes the learned level to `classProg`. `endRun` banks the leftover xp.
  - `heroRank` is kept as a legacy alias = the current class level, so gear (RANK_REQ), crafting, quests, talents and NPC
    `cond.rank` all read the class level.
  - `debugSetLevel(lv)` is the debug action.
- Casting a level-0 skill is refused ("Unlocks at Lv N" / "Learn it at the Skill Trainer"). The action bar dims locked skills, and the
  Skill Trainer shows "Locked · Lv N" / "Learn".
- UI says "Lv"/"Level" everywhere instead of Rank: TownProfile, RankPlate, item tips, Blacksmith, Talents, GameOver, main menu, debug.

### 15-room biomes, Slime King, town layout pass
- Biomes have 15 depths: `ROOMS_PER_BIOME` 14 (indices 0..13), `BOSS_INDEX` 14 (depth 15), `PREBOSS_INDEX` 9 (depth 10, forced MINIBOSS
  plan with `preboss: true`), and `REST_INDEX` 13.
  - `depthWave` keeps the old difficulty curve (15 rooms span the same 10 waves). `shownDepth()` is the player-facing depth (15 per
    biome) in the plaque. The pre-boss pip is purple.
  - Meadow pre-boss = **The Slime King**: a SPLITTER spawned through the mini-boss path with a boss bar and slams. Its HP is half the
    Golem's in its own room (`waveHpMult(10·(biome+1))`, boss rule). It bursts into slimes. Other biomes use one of their champions.
- Dash collides again: walls, props and crates stop it, checked in 0.35 u sub-steps (the town wall test stops at all sides).
- Town:
  - Monsters outside town removed (`TOWN_MONSTERS = []`).
  - Harvest nodes moved outside the walls on the east side and behind the castle, with all four kinds.
  - Farm clearing east of the field (extra ISLAND box [20,44,44,80]) with the barn (35,60), 3 cows and Hollis.
  - Dalla patrols along the nests only.
  - Endless Tower is in a forest nook (box [-37,69,-20,81]) at (-31,75), reached by a narrow 1.8-wide path.
  - Roads outside the walls render as dirt (`buildDirtPaths`, clipped at `WALL.z1+2.5`); only the in-town part stays paved.
- Farm interactions (milk, eggs) only appear while a quest asks for them (`wantsInteract`).
- Auto-path from the outer north/east ring routes around the wall to the forecourt first.
- Labels: plain outlined bold sans text (no plates, `labelMaterial` plate branch retired) and no bobbing on building titles.
- Skill unlocks: skill 2 at Lv 5, skill 3 at Lv 10.

### Camps, shop intro quests, attack timing, enemy spacing
- CAMP room type: the first room of every biome after the Meadow (adventure, not the final fight) is a quiet camp.
  - No enemies, 2 crates, no harvest or hazards; it clears at once.
  - Camp Storage (node 30) opens the town WAREHOUSE panel; the Training Post (node 31) opens SKILLS.
  - Props (tent, campfire with light, storage pile, dummy + weapon rack) are drawn by `CampProps` in render/Room.tsx at `campPos`
    (director).
- The Skills menu button and the K hotkey are gone: skills are learned at the Skill Trainer (town) or a camp Training Post.
- Mira's intro chain uses the new NPC objective type `ACTION`, counted by `hub` events, which now also include
  'buy_potion' / 'store' / 'learn':
  - Stock Up: buy a potion.
  - Safe Keeping: store an item.
  - Train Hard: learn a skill.
  - Sharpen Up: upgrade gear.
- The swing timer keeps counting while walking, and auto-chase stops inside the firing range (range − 0.4 vs check range + 0.8), so the
  hero swings the moment it arrives.
- Enemies are pushed out to `radius + 0.55` from the hero (no stacking inside it); melee reach is still enough to strike.
- Quest icons: `questNpc(name)` and `questKill(kind)` (npcQuestLogic) say whether an NPC / enemy kind matters to an active main, NPC or
  board quest. NPC name tags get a gold scroll sprite (`questIconMat` in render/Npcs.tsx); the floating target plate shows a
  ScrollText icon.
- In a run, clicking a finished quest row (or a main step that waits on an NPC in town) asks "Teleport to town?" and confirms into
  `abandonRun` (loot and xp kept).

### Townsfolk questline (story v2), first pet, hold-E chores
- `story.ts` STORY is now a townsfolk chain (save `v: 2`; v1 saves are mapped by step id). Step kinds: talk (`npc` +
  `talk`), shop/town action (`act` = engine `hub` kind: buy_potion, buy_pet, summon, equip, accept...; `at` = where),
  kill (`kill`), delivery (`npc` + `deliver` loot + `wait` lines), ending. Prologue: Garrick -> Mira (potion, first pet at
  the Pet House, summon, equip the Leather Cap) -> Hodge (accept a bounty) -> King (gate opens) -> slimes -> Lysa wants 3
  Slime Gel -> King -> Golem -> Dorn wants 2 Ore -> King -> Wren / Lysa / Dorn / Captain Roan / Wren per guardian -> King -> Malakar.
- Talk steps are OFFERS: Accept advances (reward paid, shown in the notification), Later keeps the step. A delivery turn-in
  pays and rolls straight on into the NPC's next offer; NPC side quests also chain into the next offer after a turn-in.
- Quest drops: while a delivery step (or the kill step right before it) needs loot, enemies carrying it drop it 35%, and
  harvest nodes that yield it always give one. Mira's potion side quest removed; her other lessons need Lv 2.
- New profiles have NO pet (loadoutFor no longer mints pet_blob); the Green Blob is FREE while you own no pet (`firstPetFree`), and the first pet bought auto-equips. Pet was hidden in
  town by `PetActor` (status MENU) — now shown in the town area.
- Farm chores (milk / egg / cat) are held: `village.farmHold` fills a ring on the E key (`.hold-key`), 1.1 s.
- Tracker: side-quest rows auto-path to the objective (cows, nests, cat, shop for ACTION); teleporting home from a run
  queues the auto-path (`walkAfterArrive`). Main shop steps walk to the shop and open it.
- Gate: no Set Out popup until Ascension is unlocked. Room harvest nodes halved (half the rooms have none). Coop + Dalla
  moved to the forest edge of the farm clearing. Dirt paths outside the walls = rounded irregular blobs. The small enemy
  HP bar is hidden on the enemy shown by the target frame.

### Archer passives, combat interaction lock, projectile blocking
- Archer: new class passive **Piercing Shot** (`pierceShot`): 15% + 5%/lv chance per basic arrow to pierce on (+1 target
  every 2 lv), drawn with a blue glow (`Projectile.tint` 1). Inspire is a flat +25% attack speed and paints arrows white
  (tint 2) while active. Burning / Freezing arrows fire on every 6th attack (`ARCHER_PROC`, alternating when both learned).
- Runs: no interact pills (harvest, stations, camp) while any enemy is alive in the room.
- Rocks / trees / pillars now also stop axes, fireballs and pet bolts (only melee arcs, waves, storms, orbiting blades
  and the Gale Arrow pass); enemy shots were already blocked.
- Archer kit change: **Lightpiercer** (s3, icon `LIGHT_ARROW`, projectile `PIERCING_ARROW` recoloured white) replaces Fan of
  Flames: one very fast (110) arrow, 7.5x damage, pierces everything and passes obstacles, no other effect. Gale Arrow is
  slower (34, longer life) and its tornadoes pull far less (maxPull 11). Storm of a Thousand Arrows: duration x0.6 (2.7 s),
  damage x0.7. Frost Field slow x1.5 (cap 90%). Piercing Shot passive shelved (`PIERCE_SHOT_ON = false`, removed from SKILLS_INFO).
- Story v3: after the King's report the chain is Slime King (`SLIME_KING` = the Meadow's depth-10 SPLITTER mini-boss,
  `enemyDeath.mini`) -> Garrick -> Golem. v2 saves on the Golem step move to the Slime King; later v2 steps shift by 2.
- Equip / pet steps also complete from state (helmet equipped / pet owned, store subscription in storyLogic), so gear
  equipped by drag or auto-equip counts; clicking the equip step opens the bag.
- NPC head markers: side quests blue "!" / "?", the main quest's current NPC a gold "!".

### Weapon perks (Multicast card removed), boss HP, boss bar, arenas
- `weaponPerks.ts`: every class weapon above Common has ONE perk, picked from its id hash (nothing saved), level = rarity
  (Rare I .. Mythic IV). Bow: Multishot (2/3/4/6 arrows, forward fan only) or Piercing Arrows (green, chance +1 pierce).
  Sword: Twin Slash (2-3 slashes) or Great Slash (bigger + dmg); Legendary swords swing red, Mythic black (`SLASH_RED/DARK`).
  Axe: Bleeding Edge (poison-type DoT chance), Bloodthirst (life steal, applied in calculateStats) or Twin Axes (2-3).
  Staff: Arcane Swell (bigger, faster bolts) or Flame / Frost / Storm Bolts (chance to burn / slow / chain; tinted halos).
  Shown in ItemTip (`perk-line`). The Multicast upgrade card and the `proj` affix (weight 0) are retired; Gold Dragon
  pet and a set bonus lost their +1 projectile. MULTISHOT_CAP 6.
- Boss HP x0.5 again (spawnEnemy boss mul 0.25), mini-bosses x0.5 (0.625), Slime King stays half the Golem.
- Boss bar: mini-bosses now get a screen anchor (CameraRig finds the live `mini` enemy); off-screen it parks top-centre.
- MINIBOSS rooms keep a 12-radius clear arena at stationPos and the champion spawns there (no more wedged bosses).
- Combo meter moved to the left edge. Gale Arrow: damage 4.8x (-20%), range ~54 (life 1.6).

### Skills SP, manual looting, Lightpiercer charge, cast lock, potions, gear dots
- SP costs (`classLevels.skillCost`): actives / class passives / dash / shield 2 + lvl, ultimate and Ultimate Charge
  3 + lvl, Regeneration 4 + 2 x lvl. Looter passive removed (SKILLS_INFO / card / action-bar slot; pickup range = stat only).
- Common items on the ground are looted by hand (Rare+ fly in like gold): an E / tap "Loot <name>" pill (rooms: node 1000+i, town: act 'loot') ->
  `pickups.lootPickup`. Currency / xp / hearts still fly in; the room-clear vacuum and the pet skip items.
- Casting any active skill locks basic attacks for 0.4 s (`abilityState.castLockT`). Lightpiercer charges a ball of
  light for 0.5 s (rendered in Projectiles.tsx from `abilityState.lpT`), then fires a bigger, slower (75) arrow.
- Gale Arrow is smaller and green; its tornadoes tug gently and big monsters barely move (pull / scale^2, minis x0.25).
- Health Potion heals 70% of max HP (Big: 100%), Potion Brewing on top.
- Bag: red dot on every item that beats the worn one, on its category tab and ALL (`alerts.betterGearIds`).

### Room objectives + twists (engine/systems/roomEvents.ts)
- `RoomPlan.obj` / `.twist`, rolled in roomDefs.plan for COMBAT (obj 35%) and COMBAT / ELITE (twist 30%) doors from the
  3rd room on; the portal subtitle names them. State in `world.roomEvt`; started in director.enterRoom, ticked after the
  enemies (game.ts), resolved in onCleared. Render: render/RoomEvents.tsx; HUD banner + Darkness overlay: ui/hud/RoomEventHud.tsx.
- DEFEND (totem 100 hp, nearby monsters drift to it and wear it down; reward scales with hp left), RESCUE (cage 80 hp,
  then E "Free Captive" pill node 40 after the clear: gold + gems + rare shards), GOBLIN (fleeing treasure goblin, 15 s,
  5x hp, no damage: gold + gems), HUNT (farthest monster marked, 2.5x hp, 30 s: bounty).
- Twists: TRAPS (8 spike tiles, 3.2 s cycle, red telegraph then 12% max-HP hit; they hurt monsters too), DARK (vignette),
  CURSED (healing x0.35 while fighting, 4 gems on clear), GOLDEN (60% extra gold drop per kill).
- Equip-suggestion loot notifications stay 9 s.
- Boss key (`director.bossKeyState`): from the champion room (depth 10) to depth 13, a cleared room may hold the
  biome's Boss Key (chests 60%, champion 25%, others 20% + 8%/room). With it, `nextChoices(..., bossKey)` adds a BOSS
  door to every portal set; without it the boss still waits at depth 15. WaveInfo shows "Boss Key ✓".
- Shadow Roll blast radius 4.2 + 0.3/lv. Frost Field ticks have a 6% + 1%/lv chance to freeze (non-boss).
- Mana Potion 70% of max mana (Big 100%). HP regen and mana regen are halved (player.ts regen tick).
- Floating status words ("BURNED", "FROZEN", "STUNNED", "SLOWED", ...) when a status newly lands on an enemy
  (budgeted ~8/s) or on the hero (combat.ts statusWord).

### Necromancer (5th class)
- `HeroClass` 'NECROMANCER' (model: Rogue_Hooded, staff in violet). Basic attack `ProjectileType 'SOUL'` -> kind
  SOUL_BOLT: single target, no pierce, small splash (1.8 radius, half damage). Starter weapon `wand_n1` Bone Wand; item catalog / starter set /
  item-set names / talents (Gravelord, Plague, Lich) / perks (HORDE: minion damage + lifetime, BIG, MAGES 'Bone Choir'
  and BOWMEN 'Grave Archers': every Nth soul bolt raises a skeleton mage / bowman up to a cap, projectiles.ts
  `raiseCount`) all filled in. Minion kind 3 = skeleton bowman (ARROW tint 10 = minion arrow, PET damage source).
- Minions: `engine/systems/minions.ts` (pool `world.minions`, 16): warrior (melee), mage (PET_BOLT, tint 9), golem.
  They hunt the nearest enemy (enemyGrid), otherwise trail the hero; timed AND killable: HP from hero max HP
  (warrior 0.5x, mage 0.3x, golem 1.6x). Monsters (not bosses / minis) within 12 of a risen minion target it instead
  of the hero (enemies.ts `minTgt` / `curMin`: px/pz swap per monster; melee hits `damageMinion`); enemy projectiles
  are body-blocked by minions. Max 4 warriors alive (`MAX_SKELETONS`, oldest crumbles). Render: render/Minions.tsx,
  jointed rigs (hips/head/arms/legs): walk cycle from `m.walk / m.mv`, sword raise-and-slash, staff thrust, golem
  double slam, claw-out rise, hurt flinch (`hitT`), camera-facing HP bar once hurt; scale 1.3 (golem 1.5). Stats `minionDmg / minionLife / minionCount / minionHaste` (talents).
- Kit: 1 Raise Dead (2 / 3 / 4 warriors at skill lv 1 / 3 / 5, +talents, max 4), 2 Bone Spear (piercing slow), 3 Plague Ground (zone kind CURSE: rot + slow,
  the fallen rise: `abilityState.curseRaise`), Space Soul Step (blink + bone burst). Ult Army of the Dead (wail stun,
  4 warriors + 2 mages + golem, 12 s). Passives: Grave Call (every Nth bolt raises a warrior), Soul Harvest (kills heal
  + mana), Bone Armor (3%+ damage reduction per living minion, max 30%, in damagePlayer).

### Character slots (MMO style)
- `characters.ts`: index `aether-survivor-chars-v1` {list: {id, name, hero, tint}, active}. Each character is its own
  save: id 'c0' (first / pre-slot save) = 'aether-survivor-profile-v1', others `...:<id>`. store.ts loads
  `activeProfileKey()` at start; switching / creating = set active + `enterWithReload()` (sessionStorage autoplay flag
  skips the title once). A character's class is fixed (store forces `selectHero(activeChar.hero)` at boot).
- CharacterSelect: list view (characters with level, Play, Delete, New) and create view (class list, name, outfit
  tint from TINTS, Create). Fresh installs land in create view. Town profile shows the character name; its chip is
  "Characters" (no class switching). Hero.tsx multiplies the outfit tint over the model materials.

### UI pass (references from the owner)
- Character screen: 3D idling hero (ui/components/HeroPreview.tsx, own small Canvas), diamond class crests, radar stat
  chart, subtle off-centre golden backdrop; no outfit picker in create (tint stays white).
- HUD: quest tracker on the left under the hero frame (main quest pulses gold), minimap top-right. Achievements
  button + O key (Goals panel opens on the achievements tab, `uiStore.openGoals(v, tab)`). LevelUpBurst: golden
  ring "Level N" + stat gains (replaces the level banner).
- Quest window: Main / Side / Bounties tabs; chapters (`story.CHAPTERS`) expand to steps (done / current / locked);
  detail pane with banner, story text, objective, reward tiles, Track / Teleport.
- Bag: 4 top tabs (All / Equipment / Accessories / Other), rarity-tinted slot backgrounds.
- Touch: skill wheel around the attack button (`G` arc layout in TouchControls) + Auto toggle (`world.autoBattle`:
  hunts the nearest enemy anywhere in the room, `abilities.autoCast` casts ready skills / ult every 0.5 s).

### Shards as bag items, reward feed, gear recolour (latest)
- `shards.ts`: crafting shards are ItemType 'SHARD' stacks in the bag (one stack per rarity, no stack limit). `materials`
  stays the count used by crafting / summon / pets; a store.ts subscription keeps both in sync (materials change ->
  stacks; selling / deleting / storing a stack -> counts). Old saves get their stacks at load.
- `rewardFeed.ts` `feedReward()`: claimed rewards (main / NPC / board quests, goals, achievements, codex) appear in the
  bottom-left loot feed like pickups.
- Gear look (`render/gear.ts` `tintGear`): the KayKit hero keeps its own model; gear recolours its parts by rarity
  (helmet -> hat / helmet / hood, armour -> body / cape, gloves -> arms, boots -> legs). `attachGear` (added meshes) is
  no longer used.
- Town HUD = run HUD (VitalBars, PlayerPlate, MenuButtons, Minimap 176px). Difficulty selection removed (saves load as
  Normal). Settings: side tabs + sections; Character tab (change character, records, reset profile).
- Buying: every purchase goes through BuyDialog (`setBuyItem(item, { price, max, onBuy })`); pet shop: clicking a pet
  opens it (no Buy button).
- Attributes (`attributes.ts`): STR / DEX / INT / VIT / LUK per class in `attrs` (profile), 3 + 2 per level points,
  applied last in `calculateStats` (`applyAttrs`). Character sheet: Attributes tab (hex-node tree, staged points, Apply /
  Undo, Reset for gold) and Stats tab; red dot on the Hero button while points are unspent.
- Summon window tabs: Gem Altar, Shard Altar, Gem Shop (`gemShop.ts` offers, BuyDialog with `gems: true`), Tech House
  (`TechGrid`). All item grids share `.slot-grid` (one square size, `--cell`).
- Summon: the window shows a "Possible rewards" list (pool by rarity) and a Rates popup (rates + pity). Results play a
  ritual (sigil + light pillar tinted by the best rarity), then tarot cards fly out face down and turn one by one (click
  to turn early, Reveal all).
- Crafting: Blacksmith CRAFT opens the Workshop window (`ui/panels/shop/Workshop.tsx`): recipe tree, anvil preview with
  gains vs equipped, materials owned / needed, success / great success / failure (`CRAFT_SUCCESS`, failure spends gold +
  shards, keeps monster loot), quantity, forge cinematic. `craftItem` returns `{ item, outcome }`.
- Town: Potion Shop / Armor Shop moved beside the plaza (constants SHOP_POSITIONS, `shopFront()`); every arrival spawns
  at the plaza centre; runs start at the Adventure Portal (`PORTAL` in townData, PortalLandmark in render/Town.tsx) in a
  forest clearing south of the gate (island box added). Town labels use Cinzel. Minimap: thin rim, zoomed on the hero.
- Necromancer summons (latest): every summon stays until slain; Raise Dead cooldown starts on cast (13.5 s); Army of the
  Dead holds the ult cooldown until the whole army has fallen (minions.ts `ultHold`, src 2). Summons +20% HP; warriors
  gain +10% HP and +4% armour (`def`, max 40%) per Raise Dead level and Cleave (2.8 m AoE, 2x damage, every 5 s /
  haste; `skillT`, render spin). Bone Armor (`combat.boneArmorMul`) protects the hero and the minions.
- River stages (`roomgen.buildRiver`, `roomFeatures.hwAt`): wide meandering sunken channel (floor sinks `SINK` near
  liquids in Room.tsx), irregular width, 1-2 wide bridges with piers. Debug tab: "Unlock adventure". Active skills
  auto-learn at their unlock level (`classLevels.autoLearnActives`).
- Marble Halls = ruined castle interior: flagstone floor + torn crimson carpet (Room.tsx MARBLE), `CASTLEWALL` obstacle
  (3 variants by id: torch + banner / arched window / collapsed breach, Props.tsx `makeCastleWall`) rings the rooms,
  grey stone pillars. The user asked for NO water there: river/lake layout weights are 0 (a forced debug layout falls
  back when the biome's weight is 0).
- Camp: floating name tags over Storage / Training Post / Campfire (Room.tsx CampProps).
- Settings > Gameplay > Auto loot: `autoLootGear` (Off / All / Rare+ / Epic+ / Leg.+), `autoLootMaterials`,
  `autoLootRange` (NEAR grab radius / FAR magnet radius), `autoLootOnClear` (sweep the floor when the room is CLEARED);
  read in `pickups.ts` `autoLootWants`.
- Talents cost more deeper down: `TalentNode.cost` = 1 / 1 / 2 / 3 points per rank by row (`TIER_COST`);
  `talentsSpent` / `branchSpent` are weighted; nodes show a 2P / 3P badge. Tree columns narrowed so it fits the panel.
- Still open: Gatekeeper + 5 gates and dark-hero champions (WIP in the stopped agent worktree
  `.claude/worktrees/agent-a1afc4106bafe597b`, uncommitted: engine/arenaRooms.ts, engine/gates.ts,
  engine/systems/darkHero.ts, render/DarkHero.tsx, render/SpecialRooms.tsx); NPCs in adventure rooms; the
  "skills don't work after town -> adventure" report (not reproduced, waiting on class / device / input details).
- Biome-unique monsters (2 per biome, roster weights in roomDefs; AI in enemies.ts "biome-unique monsters", models in
  enemyModels.ts, loot in lootExtra.ts, codex text in codexData.ts): Greenwood Dire Wolf (circles, telegraphed pounce) +
  Sporecap (bursts into a poison spore cloud); Marble Halls Haunted Armor (greatsword cleave circle) + Gargoyle (perched
  statue until approached/struck, then dive-bombs; `phase` 0 = perched); Desert Giant Scorpion (sting + acid splash) +
  Mummy (rooting bandage throw); Frost Yeti (charge ending in a slam + slowing snow) + Frost Wisp (slowing shard fan, nova
  when close); Ember Hellhound (wolf AI + burning paw-print trail) + Cinder Shaman (fire circles on you and your heading);
  Void Stalker (blinks behind you, strikes your spot) + Void Eye (rings of orbs). Axe Storm axes ~40% smaller.
- Biome depth tiers (`roomDefs.variantOf(def, index)`: depths 1-5 / 6-10 / 11-15 -> variants 0 / 1 / 2): each variant
  sets ground, props, hazard and optional light (fog, hemi, sun, sky; `setLook(biome, snap, index)`), layout weights and
  `lakeScale`. Greenwood: Sunlit Meadow -> Deep Grove -> Darkwood. Marble Halls: Outer Ward -> Broken Hall -> Fallen Keep
  (roots, open sky). Desert: Golden Dunes -> Buried Ruins -> Bone Wastes (sunset). Frost: Snowfield -> Frostbite Pass ->
  Glacier Heart. Ember: Ashen Slopes -> Magma Fields -> Molten Core (more / bigger lava pools). Void: Rift Edge ->
  Shattered Expanse -> The Abyss.
- Ember Wastes rework: plain dark-brown rock floor (no glowing crack texture), `lavaSea` biome flag = the ground sinks
  past the wall ring under an animated lava plane (`RoomWater.LavaSea`), no outer prop ring. Lava pools are FLAT
  (`uCut` / plane at y 0.04, no bank sink); only lava rivers cut channels. Lakes are now blobs: a core circle + 2-4
  overlapping lobes (irregular outline; MAX_LAKES 16).
- Boss mechanics layer (`engine/systems/bossMech.ts`, every biome boss + the Lich; `MECH` table per boss): Cataclysm =
  arena-wide rain of impacts (12+4*phase random + aimed at you / your heading / a ring around you) carrying a debuff
  (rocks stun, thorns/acid poison, hail slow, meteors burn, void blind, soulfire slow); Quake = big ring around the boss
  with its signature CC (stun / root / slow / silence = "terrify"); Ward at 66% and 33% hp = immune (`bossWarded`,
  shield bubble via e.shield) until its `BOSS_CRYSTAL`s (Golem, Wyrm, Void) or summoned guard (Treant sporecaps, Warlord
  hellhounds, Lich archers) die, then a 2.5 s stagger; Mend = 3 s heal channel (Treant, Hydra, Void, Lich), broken by
  6% max-hp damage; Crush = heavy melee on the NEAREST unit (minions take 4x). Impacts are our own strike pool
  (`tickBossStrikes`, METEOR_SHADOW warnings) so they hit minions too. While a boss runs its AI, every telegraph it
  spawns is 30% bigger and resolves 12% sooner (`bossTel` in enemies.ts).
- Fear (Battle Cry): enemies cower in place, then 30% slow for 3 s. Cross Slash ~3x (two smooth crescents, radius 6).
- Merged the stopped gates/champions agent (engine/gates.ts, engine/arenaRooms.ts, engine/systems/darkHero.ts,
  render/DarkHero.tsx, render/SpecialRooms.tsx): DUEL rooms (35% of champion rooms, `DUEL_CHANCE`) = a dark copy of a
  hero class (5 kits with telegraphed class skills) in a hand-laid ring; the Void's last room is the GATEKEEPER
  courtyard with five trial gates (Shadows = duel your own class, Horde, Thorns traps, Hunt in the dark, the Herald boss),
  each awarding a Gate Key; 5 keys open the Dark Castle (Malakar). Fountain rooms use a marble plaza. Debug:
  `director.debugGate(g)`.
- Wanderers (`engine/wanderers.ts`, `render/Wanderer.tsx`): 20% chance in a cleared COMBAT / ELITE / TREASURE room
  (adventure, not the first room or gates; max 2 per biome, each met once per run) a story character rests there.
  E talks (custom dialogue: `dialogue.openCustomDialogue` with an offer button; E/F work in runs). Ser Aldric (last
  Oathsworn, Malakar's backstory) = full heal; Lyra the Seer = prophecy of the biome boss + 30 gems; Old Mags =
  repeatable gold gamble (55% item); Brother Fen = bounty of 30 kills (gold + gems, auto-paid); Kaelen the scout =
  potions.
- Bug fixes: skills blocked after town -> run (abilities `gcdUntil` / aim `autoState.next` kept town timestamps after
  world.time reset; now reset + clamped); bridges blocked when two decks were close (side water rows skip any deck);
  summon cards stuck face-down (no `filter` on the 3D-flipping element).
- Tuning: Wizard -25% HP / -15% move / -15% damage; Blizzard radius 6.5, tiny damage, ice-spike visual; Blink Nova radius
  5, 35% freeze; Bone Spear -50%; dashes 1 charge, levels raise damage only; Fireballs (key 1) huge slow piercing,
  Singularity (key 3) damage over time, no collapse.
- UI: Esc opens Settings (pauses a run); slots universal (4.2rem, square, 1px borders); bag footer buttons on top; Sell
  loot / Bulk sell (Epic+ confirm); Tech House per-tier listings; summon: shards below Epic, Shard Altar has a reduced
  Legendary/Mythic pool (summonPool.ts), ritual tint by best pull; hero name + title above the overhead bars; NPC bubbles
  every 4-8 s; Darkwood lighter with glowing mushrooms; loot prompt at the auto-loot distance (2.4).
- Necromancer ult (Army of the Dead) is now only a bone golem that drops like a meteor (fx GOLEM_DROP, AoE stun),
  lasts 20 s (`spawnMinion(..., dropped)`); golem damage -20%. Archer: no attack speed per level; Lightpiercer charges
  while held (`castHold` / `slotHeld` in abilities.ts, up to x2.5 dmg / x2 size, base -33%); Frost Field freeze chance
  halved. Barbarian Whirlwind: 1.2 s base, keeps spinning while held (max 4 s). Touch: hold skills fire on touch-down.
  Judgment damage -50%.
- Malakar (final fight, `world.boss.final`): stage 2 below 50% HP (faster patterns, more and bigger orbs), periodic absorb
  shield, illusions = real decoys (`spawnIllusions`, trickKind 1: same HP, half armour, fans + rings; 1 for 10 s / 2 for
  20 s). The Lich summons cultists (dark mages) instead of skeleton archers.
- Slots: one thin 1px border everywhere (bag / shop slots match the equipped slots). Camp: no Campfire label. Gorath keeps
  a step back (radius + 3.6) so melee heroes aren't inside the model.
- QA note: kill stale `vite --port 5191` servers before headless runs (`pkill -f "vite --port 5191"`); a stale server
  makes page imports hit a duplicate module copy and setups silently do nothing.
- Defend the Totem: totem x1.4 with a glowing crystal, point light and a sprite HP bar; monsters target it (even ids or
  any closer to it than to the hero; their chase step is undone in roomEvents). Death screen: only Return to town.
  Item containers: `.slot-grid.priced` is the bag-grid template (prices inside the slot, no frames). Boss arenas:
  `BOSS_ARENA_R` per biome (30..42) and a pillar plan per biome (roomgen PLANS).
- Malakar's illusions show an HP bar (render/Enemies.tsx, after the main loop). Shared warehouse: store.ts keeps
  items + gold under `aether-survivor-shared-warehouse-v1` for every character (each profile's old warehouse merges in
  once, tracked in `merged`); profiles save an empty warehouse. Pet fusion: Pet House > Fuse (ui/panels/shop/PetFuse.tsx,
  petFusion.ts, store.fusePets): 5 bag pets of one tier -> Common 60% / Rare 40% / Epic 20% / Legendary 8% for a random
  pet of the next tier (summon-only pets included), else one random pet of the same tier.
- Malakar is fought twice (director `finalStage`): stage 1 slower (cooldowns x1.35, orbs x0.85, fewer adds, 1 illusion
  for 20 s); slain, he rises again (stage 2: +25% HP, x1.15 size, faster, Soul Rain + Void Cross patterns, 2 illusions for
  40 s). Then `finale` (director.ts + render/Finale.tsx): last words dialogue -> essence collapses, 3 bursts -> portal of
  light -> epilogue room (`plan.epilogue`, Greenwood CAMP without camp props) with Aelia, Keeper of the Font (Mage model,
  hat hidden, white dress, black hair; wanderers.ts KEEPER) -> her offer emits `gameEnding` (slides, credits, town).
- Every boss: periodic absorb barrier (bossMech BARRIER_CD/HP); Hydra has crystal wards; the Lich's guard is cultists.
  Boss sizes up (Hydra r3.6, Wyrm r3.1, ...), arenas BOSS_ARENA_R 34..50. The Void tiers are lighter.
- Dashes: flat 4 s, one charge, every class / level (player.ts DASH_CD); dash-cooldown gear, talent and card give dodge.
- Potions 15 s. Instant cards: ULT_FILL / RESTORE / AEGIS (player.aegis absorbs damage first; segmented light-blue bar
  above the hero bars + see-through sphere, render/Hero.tsx AegisSphere; the sphere turns gold during Shield Wall).
  Lightpiercer renders as a laser. Settings > Hard mode (difficulty HARD from the next run). Summon: 50% one shard
  (Rare+, qty 1) / 50% gear (Epic+). Fusion: Pet House > Fuse and Blacksmith > Fuse (gear or shards): 5 of a tier ->
  60/40/20/8% for the next tier, else one of the same tier (petFusion.ts, store.fusePets / fuseItems / fuseShards).
- Lightpiercer is a big light arrow again (not a laser); the Keeper's hair is blonde. Knight carries a kite shield on
  `handL` (weapons.ts makeShield). Necro Raise Dead skeletons are random warrior / archer / mage.
- Level scaling: every enemy and boss scales with the hero level (`spawnEnemy`: LEVEL_HP / LEVEL_DMG / LEVEL_REWARD).
  Dash ranges shorter for every class. Archer: move speed 12 and cannot attack while moving.
- Hydra regrows heads (bosses2 `growHead`, every 14 s / 10 s, never below 30% HP). Glacius: spikes / dive / hail chill +
  slow, blizzard slows the whole arena (bossFx `arenaSlow`), "Brood of Ice!" spawns BOSS_WYRMLING. Elderroot (biome 2
  boss, always; Gorath always guards Greenwood): Grasping Vines (cone pull + root) and Seed Barrage.
- Ignar is a single fight again (no second form). BOSS_WARMACH is only the Sunscorch Desert boss, "The Dune Colossus"
  (render/WarMachine.tsx 6-leg rig): Artillery Barrage (sand shells, `BT.SHELL`: blast + crater + short slow, no fire
  pillars / burning ground), Molten Ray, Stomp, Missile Volley, Ram. Director `nextBossKind` is kept but unused.
- Boss bar: anchored above the head by size (CameraRig `bossTop`, uses radius for the big bosses), shows `hp / max`.
  Malakar's illusions get identical boss bars (HUD mounts `<BossBar illusion={0|1} />`, world.illusionBars) and mirror
  his max HP, so the player can't tell which is real. Tech House tiles: no inner icon box. Summon ritual tint is purple
  when the best pull is Epic.
- Biome bosses: Elderroot guards Greenwood (biome 1), Gorath the Marble Halls (biome 2); story / lore / achievements /
  quest gates follow. Warded (immune) bosses show a shield sphere (render/BossWard.tsx); the stagger meter is yellow and
  never fills while the boss is immune. Only the depth-10 pre-boss has -25% HP (director `prebossRoom`).
- Esc in a run opens the pause menu (Esc again resumes); in town it opens Settings.
- Pets attack by element (pets.ts PET_EL): ranged shots carry tint 20+el (Phoenix fireballs splash + burn, Gold Dragon
  embers, Celestial Wisp starlight pierces, Leviathan water slows); melee pets emit `petStrike` (claw / fang rakes,
  fire bite, golem pound, crystal shards, ooze poison, coin chomp) drawn by VFX.tsx `petFx`.
- Shadow Hero (darkHero.ts): each class mirrors the REAL hero kit (basic + 6th-hit proc, three skills, class dash,
  ultimate below 60% HP), named on the boss bar; duels pick your class half the time, the Gate of Shadows always.
- Necromancer summons (minions.ts): per-source caps. Raise Dead (src 1) up to 5 permanent: 3 warriors first, then 2
  random archers / mages; a full-army recast replaces the oldest of the same group (ranged pair re-rolls). Skeletons
  per cast 1/2/3/4/5 by level. Plague Ground (src 3): every enemy dying in it rises as a warrior for 8 s (max 5).
  Weapon perk raises (src 4) max 2; Grave Call (src 5) warriors last 8 s + 1 s/level (max 2). Skeleton skills:
  warriors Cleave, archers Burning Arrow (heavy, burns, leaves a fire patch), mages Chain Lightning (4 targets).
- The class dash unlocks at class level 8 (classLevels DASH_UNLOCK_LV, was 20 - owner, balance pass 2; tryDash gate,
  locked slot, hidden on mobile); dash recharge 5.5 s (was 6 s). Tutorial freebies: the Stock Up potion and the first gem summon are free (store `questFree`).
- Town: two castle guards (Sir Aldo, Sir Bram) flank the castle steps.

### Story v4: biome errands, second town tour, level-gated side quests
- `story.ts` chain is save `v: 4` (`STORY_V`); v1/v2/v3 saves map by step id (`V1` / `V3` id lists, every v3 id still
  exists). Each biome chapter = townsperson errands before the guardian: kill N of the biome's own monsters, free
  captives, slay champions, then the depth-10 pre-boss, then the boss. New step field `goal: { kind: 'RESCUE' |
  'CHAMPION' | 'PREBOSS', count, biome }` (storyLogic: `captiveFreed` event from roomEvents.freeCaptive; champions = `mini`
  kills outside the pre-boss room in that biome or deeper; PREBOSS = the `plan.preboss` room of that biome).
  `storyWantsKill(kind, mini)` drives the count and the target quest icon. While a RESCUE / CHAMPION step is active,
  `roomDefs.storyBias` makes rescue objectives / champion doors roll more often.
- Chapters: Greenwood (slimes -> Lysa gel -> Garrick: 8 Dire Wolves -> Mira's second tour -> King -> Slime King ->
  Elderroot), Marble Halls (Wren: 10 Haunted Armor -> Sir Aldo: free 2 captives -> Sir Bram: 1 champion -> depth-10 ->
  Gorath), Sunscorch (Lysa: 12 Giant Scorpions -> Maeve: free 2 -> depth-10 -> Hydra), Frostpeak (Dorn: 10 Yetis ->
  Guard Tamsin: 2 champions -> depth-10 -> Glacius), Ember (Roan: 12 Hellhounds -> Roan: free 3 -> depth-10 -> Ignar),
  Void (Wren: 12 Void Stalkers -> Elder Tobin: 1 champion -> depth-10 -> Herald), finale.
- Second town tour (after the slime + wolf hunts): `armor` (buy_armor at the ARMORY; the first armor piece is free),
  `forge` (upgrade at the Blacksmith: no gold, no cores, 100%), `train` (learn at the TRAINER: 0 SP), `stash` (Warehouse
  deposit). Freebies via `questFree(s, 'armor' | 'forge' | 'train')` (store.ts) and shown in Armory / Blacksmith /
  Skills panels. Mira's old side lessons (mira_storage / mira_training / mira_forge) were removed (now in the chain).
- Side quests: `NpcQuestDef.minLevel` (class level, `cond.rank` kept as alias). Biome-1 quests Lv 3-10, new ones for
  the deeper biomes (Sir Aldo Lv 12, Sir Bram Lv 16, Lysa Lv 22, Maeve Lv 24, Dorn Lv 30, Tamsin Lv 33, Roan Lv 38,
  Fenn Lv 40, Wren Lv 45, Tobin Lv 48). Quest window Side tab lists "Unlocks at a higher level" rows with "Lv N";
  NPCs whose only quest is level-locked say "Come back at Lv N".
- Elixir Brewer step (after the Warehouse step): Lysa introduces the brewer (`lysa_brew`), then `elixir` = act
  `brew_elixir` at `BREWER`. The brewer's brew action must emit `events.emit('hub', { kind: 'brew_elixir', n: 1 })`
  (kind added to the hub union). Until a `BREWER` entry exists in SHOP_POSITIONS the guide arrow / auto-walk aim just
  outside the town gate (storyLogic.atPos / village.walkToSpot fallbacks).
- Post-game: after Malakar (`lich`), King Aldric (`tower_king`) points to the Endless Tower; `tower` = act `tower_floor`
  count 10 at `TOWER` (walks to the tower door), counted from the `towerFloor` event (progress = best floor cleared) or
  from `progress.towerBest` when already that high. Old saves that had finished the chain land on `tower_king`.
## Town layout pass + Elixir Brewer (Oct 2026)
- **Skill Trainer** moved to the open paving WEST of the castle steps: `TRAINER_POS` (-10.5, -19) in `engine/world.ts` (was
  (17, -13)); branch road from the north street at x -10.5; the dark-roofed house behind it moved to (-19.5, -14); a house
  now fills the old trainer spot (17, -14). Wren's line updated.
- **Meadow outside the gate** is wider (`ISLAND_BOXES` forecourt [-40,-10,40,84], farm clearing [20,40,50,84]) so the
  forest edge sits further back. The **wheat field** moved to the WEST side of the road (`FARM` (-17, 58), fence gap +
  farm path face the road) = the right-hand side when looking from the gate toward the portal. Barn / coop / cows (milk,
  eggs) stay in the east clearing; Biscuit's hiding spot is unchanged.
- **Elixir Brewer** (`SHOP_POSITIONS` 'BREWER' (11, 56), door facing the road; `townData.BREWER_HUT`; hut + cauldron FX
  `buildBrewer` in `render/Town.tsx`; tab `BREWER` -> `ui/panels/shop/Brewer.tsx`). Recipes + buffs in `elixirs.ts`
  (5 elixirs, 2-3 monster parts + gold each). Store: `brewElixir(id, n)`, `drinkElixir(item)` (click an elixir in the
  bag), `elixirsNext` (drunk in town, saved, applied to run base stats in `startGame`) and `elixirsRun` (active this run,
  cleared by `resetGame`). HUD: elixir icons under the player plate (`ElixirRow` in `ui/hud/TopBars.tsx`).
- Balance (Oct 2026): base move speed Archer 9.24 / Barbarian, Knight, Necromancer 8.47 (Wizard keeps 10); base HP -40%;
  HP potion cooldown 30 s; new characters start with 3 HP / 3 MP potions; max class level 50. Raise Dead skeletons +50%
  HP, +10% defense; Bone Spear 2 spears at Lv 3, 3 at Lv 5; Storm Orbs half duration; Blizzard +50% slow, 20%+3%/lv freeze;
  Wizard orb splash 2.0. Cards: Second Breath 30%, Wind Step +2.5%, Shadow Step +4% dodge once per run; skill cards are
  run-only ("(this run)"). Treasure goblin: middle of the room, -50% HP, gilded glow. Defend / rescue: standing within 7 of
  the totem / cage pulls every monster onto you. Boss key chances halved. Wanderers: max one per biome (12%).
- Ankh of Life is a choice on death (ui/screens/AnkhPrompt.tsx, combat.ts ankhOffer / reviveWithAnkh; the death flow in
  player.ts waits on it) with a pillar-of-light revive (VFX playerRevive ANKH). The Phoenix pet stays automatic.
- New-item dot: Item.isNew (loot, rewards, summons, fusion; never monster loot), gold dot in the bag cleared on hover / tap
  (store.seeItem), the Bag button lights up. Quest payouts also list under the quest tracker (rewardFeed `quest` flag).
- Endless Tower milestones (towerRewards.ts): every 10th floor reached unlocks a reward claimed in the tower popup
  (progress.towerClaimed per class): gear / supplies / pets below 100, shards from 100 (+ a pet every 100th).
- Summons give several shards per shard pull again (Rare 2-5, Epic 1-3, Legendary 1-2, Mythic 1). Gem-shop companions:
  Ember Fox / Frost Owl (Rare, 300 gems), Storm Sprite / Shield Turtle (Epic, 500 gems).
- Merges: the quests worktree (story v4, level-gated side quests, tutorials) and the town worktree (trainer west of the
  castle, wider meadow, farm west of the road, Elixir Brewer at (11, 56), elixirs.ts) are both merged; the brew action emits
  hub `brew` and `brew_elixir` (the Chapter 1 elixir step).
- **Crystal Cave** (third village area, `world.village.area = 'CAVE'`, modeled on the castle): outside the east wall the
  island edge bulges into a rounded forest bay (`CAVE_BAY` sin^2 bulge in `mapgen.baseRadius`; forest / rim rocks / edge
  bushes follow it, `inCaveClear` keeps the mound free) with a rock mound + dark arched mine opening at its back
  (`render/CaveEntrance.tsx`; E / click "Enter Crystal Cave", `act 'cave'`, pending `'CAVE'`). The ruined wall that stood
  at the bay mouth moved from (58, 14) to (57.6, 25).
- **Cave floors / trips** (logic `engine/systems/cave.ts`, data + tables `engine/caveData.ts`, drawing
  `render/CaveInterior.tsx`, HUD `ui/hud/CaveHud.tsx`, Grit's panel `ui/panels/LanternPanel.tsx`, minimap layer
  `ui/hud/minimapCave.ts`). State lives in `world.village.cave` (floor, trip seed, veins left, oil, ladder, rare tiers,
  flasks, blackout `dark`); village.ts only hooks in (`enterCave` / `leaveCave` / `switchCaveFloor` / `scanCave` /
  `interactCave` / `updateCave`, pending `'DOWN'` / `'UP'`, acts `down` / `up` / `bench`).
  * Floor 1 = persistent hub: the old miner **Grit** (NPC area `'CAVE'`, only on Floor 1, `npcInArea`), his lantern bench,
    8 veins (24 h regrow after the last one; save `aether-survivor-cave-v2`, the v1 key is migrated + removed).
  * Stairs down on every floor are boarded up ("Harvest all veins to go deeper (n left)") until every vein is taken; a
    **lucky ladder** hides under a random vein on ~30 % of deep floors (shown + minimap marker once found).
  * **Trip** = going down from Floor 1: floors 2+ are generated fresh per trip (`caveLayout(floor, seed)`: chambers grow
    with depth, twin "hourglass" chambers from floor 6, LAVA / POISON pools from floor 4 that hurt while you stand in
    them, 6-12 veins, tints cyan -> violet -> magenta -> gold -> crimson). The arrival stairs = "Climb out" straight to
    Floor 1 (banks the haul).
  * **Lantern oil** = ONE timer for the whole trip (drains on Floor 2+, never refills between floors; oil flasks on some
    floors / 12 % from cave monsters give +20 s). Under 25 % the meter turns orange and flickers, the scene darkens and the
    hero's lantern light shrinks; under 10 % red pulse, heartbeat + tick (`audio.sfxCave`), vignette, big countdown in the
    last 10 s. At 0: ~1.3 s pitch-black blackout, then you wake up on Floor 1 and lose the trip's haul (gold, shards and
    items gathered below Floor 1, tracked by a snapshot at trip start; "At risk: ..." under the meter). Dying to cave
    monsters (from Floor 3, 2..8 per floor, `world.village.cave.combat` lets `damagePlayer` hurt in the MENU status) or
    hazards is the same cave-in, never a game over.
  * Grit's bench panel: refill (free once a day, then 1,500 + 1,000/level gold); bigger lantern 6 levels (120 s + 30 s
    per level), each payable with gems OR shards (`LANTERN_COST`). Level + personal best are profile fields
    `progress.caveLantern` / `progress.caveBest` (sanitized in `sanitizeProgress`).
  * Depth rarity (`depthWeights`, d = min(floor, 12) - 1): C/R/E/L/M = max(4, 62-7d) / 28+d / 8+3d / 2+1.5d / 0.4(d-2);
    measured: F1 62/28/8/2/0 %, F4 42/33/18/7/0.4 %, F8 14/38/32/14/2 %, F12 4/37/39/18/3 %. Bonus shards + trade goods
    (new loot ids deep_geode, mithril_ore, starfire_crystal, adamant_ore, abyssal_diamond) below Floor 1, gold veins
    x(1 + 0.35d), vein HP x(1 + 0.3d).
  * **Rare veins** (per vein, chance 6 % -> 34 % with depth, tier rolled without COMMON; Mythic ~0.6 % per vein at F8,
    ~1.2 % at F12+): dark geode + big rarity-coloured crystal cluster that shrinks as it cracks, beam for Legendary /
    Mythic, "Mythic Vein" etc. on the prompt, diamond marker on the minimap, HP x(1.5 + 0.9 tier) on top of the depth
    hardness; guaranteed shards + a trade good of their tier. They count toward "harvest all veins".
  (`render/CaveEntrance.tsx`, mounted in Scene's town branch; E / click "Enter Crystal Cave", `act 'cave'`, pending
  `'CAVE'`). Inside: `engine/caveData.ts` (outline `caveRadius`, colliders, 8 harvest nodes ORE / CRYSTAL / GOLD_VEIN,
  3 point lights) drawn by `render/CaveInterior.tsx` (merged floor / wall / props / glow meshes), dim `setLook(-2)`.
  Cave nodes reuse crate slots 0..7 with their own save key `aether-survivor-cave-harvest-v1` and own 24 h regrow
  (`HarvestSet` in village.ts). Leaving puts the hero at `CAVE_OUT` facing the bay; ground pickups are scooped up on cave
  transitions. Minimap draws the cave outline / nodes / exit (and the hall in the castle), a cyan cave icon in town.
  The ruined wall that stood at the bay mouth moved from (58, 14) to (57.6, 25).
- **Lakeside beach + fishing** (outside the WEST wall, southern half of the shore only; data `engine/beachData.ts`,
  drawn by `render/Beach.tsx`): sand strip x -65..-45, z 6..62 (`BEACH_BOX` in `ISLAND_BOXES`, lake shore pushed west
  in `terrainFn.lakeK`), headland rocks close the north end; boardwalk, palms, campfire, rowboat, driftwood, crates,
  umbrella, net rack. The **pier** (`DOCK`, T-head at x -87..-80) is walkable over the water via `DECK_RECTS` +
  `mapgen.clampToDeck` (called from `player.resolveStep` only beyond the island edge); the water itself is not.
  **Fishing** (`engine/systems/fishing.ts`, state in `world.fishing`, HUD `ui/hud/FishingHud.tsx` with one big
  E / tap button): 3 spots (`FISH_SPOTS`: pier end luck x1.25 + two shore spots) -> cast -> wait -> bite (hook window)
  -> "Reel it in!" timing bar (rarer fish: faster marker, smaller zone, 2-3 hits; 2 misses forgiven) -> fish as stackable
  LOOT (`loot.ts FISH_DEFS`, Soggy Boot .. Aetherfin Koi, Common..Mythic). Moving / opening a panel reels in. Rod level +
  catch log in localStorage `aether-survivor-fishing-v1`. **Fishmonger** = shop `FISH` (stall `buildFishStall`, at
  (-52.5, 24) mid-beach, facing the water): sell one / sell all fish, buy Oak / Aether rods, lake fish guide.
  Wall safety: beach interactions (Fishmonger pill, fishing spots, click-to-walk arrival opening the FISH shop) require
  `beachSide(x, z)` (outside the west / south wall face), so nothing is reachable through the wall. Click-to-walk
  (`village.buildRoute`) uses a fixed lane round the south-west corner tower: gate -> (-4, 51) -> (-34, 52) ->
  (-49, 47) -> (-57.5, 43.5) -> beach spine x -59.5 at the target's z -> target (and the reverse). Minimap: lake, sand,
  pier and a line fish icon (`SHOP_ICON.FISH`). The old small dock in `TownScenery.Lake` was removed.

### NPC + quest pass (Oct 2026)
- **Routing**: `engine/systems/townPath.ts` = A* on a 0.5 m walkability grid rasterised from the real colliders + island
  edge (cached per area / map version; town box now reaches x 84 for the cave bay). Click-to-walk / tracker auto-path
  (`village.walkTo`) uses it (old street route only as fallback), follows a patrolling NPC, re-plans when blocked.
  The guide arrow points along the route (`updateRouteHint`), not through walls.
- **One source of truth for "where next"**: `engine/systems/questNav.ts` (`mainNav`, `npcQuestNav`, `boardQuestNav`,
  `navNpc`, `navSpot`) is used by the tracker click, the guide arrow, the tracker distance text and the gold beacon in
  TownScenery (old `storyTarget` / `storyAim` removed). It is area-aware for TOWN / CASTLE / CAVE: from the cave it
  leads out, from town into the castle hall or the cave. A walk that ends at a door / exit carries on in the next area
  by itself (`navWalk` hop resume, max 3 hops), so one tracker click goes e.g. cave -> town -> castle -> King.
- **Bugs fixed**: merged WIP had no cave handling (tracker / arrow pointed at town targets from inside the cave, path
  grid did not cover the cave bay); TALK-quest targets (Old Wend for Pip, Hollis for Corin) had no marker (now a blue
  "?"); Wend's "Crystal Cavern" quest ignored the town Crystal Cave (cave pickups now count, town pickups no longer
  count from a stale run room type; tracker leads into the cave to the nearest vein); "Town Gate" in Garrick's tracker
  lines; the gold beacon had its own target table (board step = Hodge's home) that could disagree with the arrow.
- **Interactions** (WIP, verified): NPCs stop + face the hero while talking (and when walked to), linger ~1.6 s, then
  resume the patrol; prompt priority favours quest NPCs / the one faced (`talkBias`); per-NPC bubble cooldown 14 s,
  "call over" bubbles for NPCs with something for you, one-off news lines per story milestone (`engine/npcLines.ts`);
  dialogue hint line (next step + rewards). Tilda / Corin / Nell got more lines (cave east bay, Gerald the stone).
- **Headless audit** (fresh save, `updateVillage(0.05)` stepped manually): all 66 main steps via `walkToMain` (dialogue /
  shop / set-out opens at the target, step advances, gems paid exactly once, no off-island positions, min clearance to
  any collider >= 0.64 m, save survives reload); all 30 side quests accepted / done / turned in via auto-path from
  town, castle and cave start (rewards once, re-talk pays nothing, markers ! -> ? correct); board-quest claim + King
  report from inside the cave.
- Note: the wheat field is EAST of the road beside the barn (`FARM` (18, 60)); the Brewer hut is top-left outside the
  wall by the gate (-14, 45). The older bullet above saying "west of the road" for the field is outdated.

### Cave follow-ups (owner)
- Veins sit toward the middle of every chamber (within ~60% of the radius, 5+ apart); Floor 1 veins re-placed.
- Unlooted drops (shards, gold, items) left on a cave floor are LOST when you change floors, climb out, get caved-in or leave
  the cave (cave.ts enterFloor / cave-in, village.ts switchArea). Town drops are still scooped up when entering the cave.
- Ultimate (R) slot: bigger, and the ready glow/rays finally show (the CSS read data-ready on the wrong element); icon brightens + pulses when full.
- Beach: shoreline boulders kept off the pier (Terrain.tsx nearDock).
- Early-biome boss pace (enemies.ts `bossPace`): bosses + champions in biome 1/2/3 (first loop) run stateT and attackCd at
  x0.75 / x0.82 / x0.9 — slower wind-ups + attacks and longer gaps between skills. Later biomes unchanged.
- Travelling Merchant: real KayKit character behind the stall + "Travelling Merchant" tag (Room.tsx MerchantNpc).
- Necromancer: +10% move speed (9.32), Plague Ground cd 18 s; summons arrive beside the hero on room entry.
- Boss impact salvos spread out + less frequent (owner): the shared stage-wide rain (bossMech `rain`, every boss) now
  every 19/16/13 s (was 12/10/8.5), 9 + 3*phase impacts with >= 8.5 m between centres; Ignar Pillars of Cinder 4 + phase
  (>= 7 m apart), Elderroot Seed Barrage 4 + phase, Hydra Acid Barrage, War Machine Artillery 5 + phase — all placed with
  bosses2 `spreadSpots` (min gap 6.5-7 m).

### Session batch 4 (Oct 2026, owner feedback rounds)
- **Items / crafting:** upgrade cores are 2 tiers by item rarity (`crafting.upgradeCoreTierFor`: Common/Rare -> Upgrade Core,
  Epic+ -> Refined Core). Bonus-stat slots per rarity (`affixes.AFFIX_COUNT`), empty slots show as grey strips; Augment Rune
  (`reforge.ts` mode ADD) fills one. Blacksmith: square shard tiles + fuse cinematic, no success bar, calmer colours.
- **Shops:** every shop grid is `ui/components/ShopGrid` (bag look, 6 cols, "+" fillers); no gold pill in shop headers; Armory
  has category tabs; footer **Bulk sell** popup (`ui/panels/shop/BulkSell.tsx`, store `bulkSell` / `bulkSellPick`: gear
  tiers, loot, optional craft materials = `crafting.CRAFT_MAT_NAMES`). Buy dialog always closes after Buy.
- **Character:** attribute window = info + tree (left) and an Allocate window that opens to its left from "Points +"
  (hold-to-repeat steppers, stat preview via `attributes.attrPreview`). New stat `attackRange` (archer base range 16.5;
  DEX +0.04/pt, archer talents Long Shot / Eagle Eye, bows by rarity in constants, affix `range`).
- **Talents:** radial tree (`talents.ts` LAYOUT: rings 0..4, nodes unlock when their parents are MAXED, ring level gates
  `RING_LEVEL`, costs `RING_COST`), ids `x3_*` (older ranks refunded). Full-screen window with pan/zoom + detail pane.
- **HUD:** quest tracker left, minimap right (no border, grey, faded edges, square N inside), gold + gems top centre, menu
  icons without containers, compact player plate (no Lv/CP row, buffs only while active). In runs the room plaque is
  replaced by a top-centre target HP panel (`TargetFrame docked`); boss floating bar is slim with a skull icon; a light
  beam marks the room treasure until opened. Tooltips are near-opaque.
- **Skill Trainer:** compact Active / Passive list; long text only in hover tooltips.
- **Town:** river benches + small park, aligned gate flower beds, fences on the tower path (stop short of the clearing), no
  fences on the portal road, forest round the Endless Tower, windmill faces like the barn, 4 more villagers outside the
  walls, villagers steer round / skip blocked waypoints (`npcs.ts` stuck logic). Beach: wavy shoreline (`beachWobble`), no
  foam strips, no boardwalk (pier only), rounded mainland beach strip, bigger pier head + the **Gull Queen** ship;
  Captain Rhea sells a 60-gem ticket (`store.sailToIsles`, `runInfo.startBiome = 3`, opens at the Isles camp).
- **Cave:** Bigger Lantern only in the Tech House (100 gems a tier, `tech.ts` id `lantern`, mirrored into
  `progress.caveLantern`); Grit's bench only refills.
- **Balance:** lurking hydras only in the Coral Isles (clear firing lane kept round them), fewer / smaller blocking bushes,
  fewer interior obstacles, dark hero duels 6% / 15% in the first two realms (`roomDefs.duelChance`), heal / regen / Aegis
  cards weighted rarer (`store.cardWeight`). Totem HP bar fill anchored in screen space.
- Still open: more decor on the green in front of the gate (#167); "max levels 50?" question to the owner.
- Later in batch 4: barbarian range 7.5 (boomerang tuned to fly ~7.5 out: AXE speed x0.97), Cross Slash 40% shorter
  (life 1.05 + 0.03/lv), bigger axes during Titan's Wrath (radius 2.8, render scales with radius); knight range 8.5.
  NPC quests: level gates reviewed (npcQuests.ts minLevel, L2..L48 by realm); Pip's hermit errand now Lv 3 (the hermit
  trail has monsters; trail un-blocked: ruin + boulders moved so findPath reaches Old Wend).
- Monster pathing: `enemies.ts steerAround` (look-ahead collider avoidance + stuck -> detour, alternating sides).
- **Skill unlocks:** skill 2 Lv 4, dash Lv 6 (`DASH_UNLOCK_LV`), skill 3 Lv 8 (Judgment etc.), **ultimate Lv 10** (`classLevels.ULT_UNLOCK_LV`, auto-learned via
  `autoLearnActives`; old saves below Lv 10 get the ult re-locked + SP refunded in `sanitizeClassProg`). Locked ult: no
  charge (`combat.addUlt`), no cast, slot shows "Lv 10". On unlock the bar is pre-filled and the "Press R" hint shows only
  for that first charge, per class (`tutorial.ts`, localStorage `aether-survivor-ult-first-v1`).
- Aegis card is Legendary (gold). Potion rewards cut: bounty quests 1 + r/6 each, story/NPC quest potions 1, tower SUPPLY
  1 big potion, wanderer 1+1, chapel blessing 1, plain item drops 5% potions (was 10%).
- Gear level requirements by rarity (`constants.RANK_REQ`): Common 1, Rare 3, Epic 8, Legendary 15, Mythic 25.
- **Follow delay (owner):** `engine/systems/heroTrail.ts` keeps a 2.4 s ring buffer of hero positions. Chasing monsters
  (CHASE / KITE, not bosses / minis / stationary, farther than radius + 2.6) steer for where the hero was 0.7-1.0 s ago;
  up close they track the real hero (strikes use the real position). Pets (0.9 s) and necro summons (0.8-1.0 s) follow
  the trail too. Monsters stop at radius + 0.95 from the hero (was + 0.55); melee reach radius + 1.15 to match.
- **Six gear tiers (owner):** Common (white) Lv 1, **Uncommon (green, new)** Lv 10, Rare (blue) Lv 20, Epic (purple) Lv 30,
  Legendary (now **orange**) Lv 40, Mythic (red) Lv 50 (`constants.RANK_REQ`, `RARITY_LADDER`). Gear drops / room rewards
  are capped to the best tier the class level can equip (`constants.capRarity`, used in `store.rollItemDrop`).
  `itemCatalog.ts` builds 6-tier rows (Uncommon halfway between Common and Rare; new Uncommon weapons / armour use id
  suffix `u`, older ids unchanged). No Uncommon shards: `shards.shardTier` maps Uncommon gear to Common shards; summons
  never roll Uncommon; item fusion climbs Common -> Uncommon -> Rare (`petFusion.nextItemTier`), pets keep 5 tiers.
- Barbarian: Cross Slash no longer grows with level; Titan's Wrath makes every barbarian skill 40% bigger
  (`abilities.titanScale`: Cross Slash, Whirlwind, Earthsplitter, leap slam). Garrick moved next to the gate door.
- Melee monsters: follow delay only from afar (> radius + 7; up close they track the real hero, no more walking past);
  chasers halt at radius + 1.3 and strike from there (`enemies.ts` standoff after the AI); visible swing: rear back during
  the wind-up, lunge on the strike (`strikeT`, render/Enemies.tsx).
- Wizard Fireballs: 1 at Lv 1-2, 2 at Lv 3-4, 3 at Lv 5; the fire trail (zone aux 2) burns enemies as long as they stand
  in it (`zones.fireTick` pathBurn, 0.6 s refresh).
- Harvest nodes can be harvested mid-fight (director.scanNearby); other room interactions still wait for a clear room.
- **LISTEN quests (owner: very long funny dialogue, good reward):** objective type `LISTEN` (npcQuests.ts) is complete as
  soon as it is accepted (accept on the last of a 12-18 line intro), then talk to the giver again for the pay-off lines +
  reward. Six so far: Old Garth's goose "dragon" (Lv 2), Fenn's 99-verse ballad (Lv 5), Steward Maren's hero contract
  (Lv 8), Rodric's Ogre King tale (Lv 12), Maeve's gossip round (Lv 15), Wren's "brief" slime lecture (Lv 20).
- **Pets on six tiers** (same level gates as gear, `equipItem` RANK_REQ): Common Green Blob / Pet Rock; Uncommon Vampire
  Bat / Ember Fox / Frost Owl; Rare Light Fairy / Storm Sprite / Shield Turtle; Epic Spirit Wolf / Iron Golem / Mimic
  Chest; Legendary Gold Dragon / Shadow Cat / Crystal Golemling; Mythic Phoenix / Celestial Wisp / Aether Leviathan.
  Saved pets re-take their template tier on load (`store.petRetier`). The Pet Stable shop lists Common..Epic only.
  Pet fusion climbs all six tiers. Green Blob is a pure healer (no melee): 10 HP + 3% max HP every 5 s.
- **Shop economy (owner):** buy price = base price x `buyMul` (gear x4 at the Armory, pets x1.4; `store.shopPrice`,
  `constants.BUY_MUL_*`). Gear / pets now sell for 90% of the base price (was 30%; `constants.sellUnit`, used by every
  sell path + tooltips). Upgrade costs still read the base price, so they are unchanged.
- Loot (monster goods, fish, ore) sells for 2x its listed value (`constants.LOOT_SELL_MUL`, via `sellUnit` in every sell
  path incl. Bulk Sell, Sell all, fish / mine stalls). Surge of Fury card is Epic and much rarer (card weight 0.25).
- Monster EXP -40% (`enemies.MONSTER_XP_MUL` 0.6). Quests give no EXP (no quest reward type carries any).
- Item slots no longer show the +N upgrade badge; it shows only in tooltips / previews (ItemTip, item dialogs, Blacksmith).
- Start: 5,000 gold + 500 gems (`store.WELCOME_GIFT`). Prologue story quests (guard..board) pay 500 gold each (base 50).
- **Bounty Board** is a centred popup in the Quest-window layout (`ui/panels/shop/Quests.tsx`, ShopPanel returns it for
  the QUESTS tab): taken + today's offers on the left, banner / flavour / objective / rewards on the right, Accept /
  Abandon / Claim bottom-right. Harvest nodes give very little EXP (x0.08, `crates.breakCrate`).
- Bandits: between dashes they circle at ~4.2-5.4 from the hero (back off when closer); the dash stops just short of the hero (`patternT` = gap / dashSpeed) instead of running through to point blank.
- Elixir Brewer hut moved 2.1 west (x -12.6) so its signboard no longer covers the road.
- Lake south shore (by the mainland beach / Endless Tower) is wavy (`townData.lakeSouth` / `beachData.lakeSouthZ`, used by terrain lakeK + isTownWater; the water plane extends 10 further south), sand has a wavy south edge, plus SOUTH_ROCKS and 5 palms along it.
- Fences (owner red lines): tower path closed on the hamlet side too; farm track past the coop closed both sides (joins the road's east fence); mine path's outer fence runs to the track and both sides join the track fences.
- Bridge: the two wide arch cylinders under the deck no longer poke up through it (no humps).
- West beach: curvier water line (extra sand-only wobble term in `beachWobble`) and the wet-sand band follows it (render/Terrain.tsx; it was a straight band).
- Unlocks: Daily Trial Lv 15, Endless Waves Lv 30 (`unlocks.ts`; was 8 / 12). Monsters already scale with class level, so both modes match the new levels. Max camera zoom-out 1.3 (was 1.6). Gem icon has no round container.
- **Performance (owner: don't draw far-away things):** `render/distCull.ts` registers every static Inst chunk + town
  merged chunk (TownScenery `TownChunk`) and hides them past the fog end (tiny geometry, r < 0.7 = grass / pebbles /
  flowers, already ~40 past the fog start); checked every 6th frame in `biomeLook.LookDriver`. The camera far plane now
  follows the fog end (+25), so fully fogged geometry is never rasterised; the sky dome / clouds scale to stay inside it.
  Existing layers: frustum-culled 24-unit chunks (Inst), NPC view culling + animation LOD, adaptive DPR (PerfGovernor).
- River runs on east out past the island edge (`RIVER.x1` 125, was 50); the mine path crosses it on a plank footbridge
  (`townData.MINE_BRIDGE` at x 58.6: walkable via isTownWater / townLift, railing colliders, bank colliders skip it;
  render `addFootbridge`). Mine-path fences stop at the banks. Surge of Fury cards only once the ultimate is unlocked.
- Quest icons (owner): quest-kill monsters get a quest scroll above the head (render/Enemies, pool of 24; the target frame already shows one left of the name); loot pills a quest needs show the scroll left of their name (Pickups); harvest nodes whose drops a quest needs get one above them (Crates). `questWantsItem` now also covers COLLECT_LOOT quests and the main story's delivery step. Old Tusk's stampede: 2 lanes.
- **Exit portals (owner):** ruined stone arches (render/Room.tsx `buildRuinArch`: stacked weathered pillar blocks, 9-stone arch with a fallen stone + keystone gem, round stepped dais, moss, rubble) that rise out of the ground over 1.25 s with a tremble and dust bursts, then ignite: a swirling vortex shader in the arch opening (reward colour, white eye), glowing rune inlays, a rotating ground sigil and sparks drifting up. Label sits above the arch.
- **Title screen (owner):** `ui/components/TitleLogo.tsx` gold SVG crest (diamond frame, sword, wings, gem, animated wisps) over a big serif "Aether Survivor" wordmark with a ruled "Guardians of the Font" subtitle; soft radial dark vignette behind it (`.title-shade` / `.tlogo::before`, no straight edges); button just says Enter.
- West street lots (owner): the second house is gone; Pet Stable moved into its lot (-30, 2), Fortune Teller into the old pet lot (-21, 1.5), and the old fortune lot by the plaza holds a market stall (STALLS). Door branches follow.
- Talents (owner, a mix): plain stat talents need their parents learned (1 rank) and no class level in rings 1-2 (half the ring level further out); special-mechanic talents and the capstone keep the ring level (`RING_LEVEL` 1/4/10/20/30) and need their parents MAXED (`TalentNode.reqMax`, `talents.reqMet`). Budget: 4 pts/level = 200 at Lv 50 vs full trees 158-164.
- Character creation (owner reference): Create opens a name popup (CharacterSelect `NamePopup`, `.np-*` CSS): ornate dark panel, title + close, ray ornament, framed hexagon input, rules text (letters/numbers, 2-12, no spaces/symbols; red error line), grey Cancel / red Confirm. Enter confirms, Esc cancels.
- Shop hanging signs (render/Town `buildSign`): the cream inner panel no longer shares the frame's back plane (z-fighting 'static' on the sign backs).
- Talent tree (owner): fixed close zoom (`ZOOM` 1.1, emblem centred on open), drag to pan only - no zoom buttons / wheel; branch name labels removed from the canvas. Summon reveal: no 'Reveal all' button (click cards to turn them early).
- **Icons (owner reference): solid gold, no line icons.** `ui/components/GoldIcons.tsx` is a drop-in for every lucide-react icon the UI used (same names / props, `IconType` + `LucideIcon` types): filled silhouettes in the shared `#gi-gold` gradient (`GoldIconDefs`, mounted in index.tsx) with dark engraved detail; `color` paints a solid colour instead. All `ui/**` + `render/**` imports point at it (lucide-react is no longer imported). On gold-filled buttons/tabs the icon is darkened (`.gi` rule in index.css). Add new icons there, not from lucide.
- Necromancer (owner): Raise Dead cooldown 11 s and 2 skeletons at Lv 1 (`RAISE_N` 2/3/4/5/5); the basic soul bolt bursts on up to 4 enemies (target + 3 within 3 u at half damage: `damageEnemiesInRadius` `maxHits`), with a purple burst. Energy Shield upgrade card removed from the run card pool (constants UPGRADES).
- **Slime King specials (owner)** (bossSpecials SP.SLAM/FLOOD/RAIN, only for the king: `setSlimeKing` from director): *Belly Flop* - leaps out of sight (pos.y via `flopY`, airborne = untargetable / no contact), a 6.5 u green circle hunts the hero at 8.5 u/s for ~2.3 s, locks, then a fast 0.22 s drop: big hit, splash acid, 2+ slimes. *Acid Flood* - one huge 11 u acid pool on the hero after a 1.5 s warning. *Acid Rain* - 9-15 small 2.6 u acid pools scattered around (one on the hero), staggered. Cycle: Flop, Flood, Flop, Rain. Bat screech smaller (r 4.5, cast within 6 u).
- Shops (owner): only the shopkeeper is clickable (the invisible building hit box is gone). Keepers have names (render/Town `KEEPER`: Rosalind potion, Brakk smith, Jev pets, Hald armor, Madame Zora fortune, Otto warehouse, Quill tinkerer, Nessa brewer, Salty Pell fish, Durgan mine); tag = gold role line on top (`TITLES`, e.g. 'Pet Merchant') + the name below.
- Blacksmith Upgrade tab redesigned after the owner's enchant reference (Blacksmith `Upgrade`, `.enc-*` CSS): big '+N >>> +N+1' header, item in an ornate diamond frame between a core circle (have/need, red when short) and a success-chance circle, item name + core cost, stat rows old > new, shatter warning, big red Upgrade button with the gold cost.
- Green in front of the gate (#167): 4 more trees (west side + east), 2 flower boxes, a second meadow bench (mirrors the west one), a barrel cart west of the road.
- **Necromancer s3 = Bone Ward (owner, replaces Bone Spear)**: every active summon gets a bone shield of 30% of its max HP (+5%/level) for 8 s (+1 s/level); `damageMinion` drains the shield first; lilac bubble on shielded summons (render/Minions `ward`). The BONE_SPEAR projectile stays for the dark-hero necromancer. **Shop sales removed** (owner: no 'X% off'): `rollSales` returns {}, the run merchant has no sale entry.
- Cross Slash smaller (radius 4.5, was 6; visual scales with it) and cd 5.75 s (+15%). Exit-portal / gate tags (`.portal-tag`): dark transparent rectangle fading out at both ends with a faint wash + hairlines in the portal colour (was a pill).
- (owner) Treasures / rewards never drop Common gear: every `rollItemDrop(rarity)` call (chests, crates, treasure rooms, rewards, shrines, bosses, champions, merchant) floors at Uncommon after the level cap (so below Lv 10 such gear is Uncommon even if not yet equippable). Plain monster drops (no override) can still be Common.
- Base HP regen -50% (owner): default 0.25 (was 0.5), class bases 0.75 / 1.0 (were 1.5 / 2.0); gear / talents / cards unchanged.
- Daily / weekly goals, their bonus chests and achievements pay **Aether Crystals only** (owner): daily goal 2-4, weekly 10-20, daily chest 5, weekly chest 30, achievement `achCrystals(a.gems)` (the old gem value only sizes it). No gems / gold / shards; old saved goal rewards are stripped to crystals on load.
- Dark heroes follow the hero kit changes (owner): the Dark Necromancer's skill 2 is now **Bone Ward** (shields its skeletons for 30% of their max HP, 8 s, cast when it has unshielded skeletons; shields drop when it wears off) instead of Bone Spear; its Raise Dead cd 11 s, Bone Ward 14 s. The Dark Berserker's Cross Slash is smaller (r 1.65, was 2.2) with +15% cooldown (6.9 s).
- Quest gold -50% (owner) except tutorials: story steps from chapter 1 on, every NPC side quest except the mining / fishing tutorials (dorn_mine, grit_deeper, nell_beach, marlo_catch, marlo_sell), and board bounties (quests.ts). The prologue (town tutorial) keeps its gold.
- Barbarian boomerang axe centred on the target (owner): thrown ~27 deg against its curve (`AXE_PRE_TURN`) so the loop straddles the aim line, and the throw speed is set so the loop reaches ~1.5 u past the auto-aim target (`AXE_REACH_PER_SPEED` 0.38 u per u/s, depth 3.5..9.5): the axe hits a target straight ahead going out and coming back (headless: 2 hits at 3 / 5 / 7 u).
- Balance (owner): Belly Flop drop 0.42 s (was 0.22); Slime King HP +50%; elites HP -30% (`ELITE_HP` 2.8, was x4; mini-boss HP unchanged, it divides it back out); biome bosses HP +80% (spawnEnemy boss factor 0.25 x 1.8); ranged kiters (skeleton archers etc., `kiteMove`) back off only inside 82% of their min range and no faster than they walk; monsters spawned while a biome boss lives (its summons) get a 50%-HP shield 35% of the time (`BOSS_ADD_SHIELD_CHANCE`).
- Quest window (owner): **Bounties** tab uses the Side layout (list left, detail right: banner, quote, objective, rewards, Track / Abandon). Side quests not yet accepted have **Track** (walks to the giver, `walkToNpcQuest`); active side quests have **Abandon** (`npcQuestLogic.abandonNpcQuest`: back to the offers). Abandoning a bounty puts it back among the board offers (`abandonQuest`, progress reset) instead of deleting it.
- **Quest EXP (owner)**: every quest pays EXP = a share of the current level's need (`classLevels.questXp`: story step 12%, side 20%, bounty 10%), paid in the store story payout / npc turn-in / claimQuest, shown as a green 'EXP' square first in every Rewards row and in the dialogue reward lines. Monster EXP x0.9 (was 0.6).
- Drops may be one tier above what the hero can equip (`rollItemDrop` caps at level + 10): Uncommon gear drops from Lv 1 (equippable at Lv 10). Cross Slash knockback 0.5 (was 1.4).
- (owner) Item tier level requirements now in steps of 8 (`RANK_REQ` Common 1 / Uncommon 8 / Rare 16 / Epic 24 / Legendary 32 / Mythic 40); drops may be one tier above (`rollItemDrop` cap at level + 8).
- Area skills break barrels / crates / pots (`crates.hitCratesInRadius` from `damageEnemiesInRadius`); projectiles fly past harvest nodes (veins / crystals / ore are hand-harvested only).
- Quest icons also for Quest Board bounties: COLLECT_LOOT loot pills (`questWantsItem`) and, with a GATHER_SHARDS bounty, the shard-dropping harvest nodes CRYSTAL / ORE / GOLD_VEIN (`questWantsShards`, render/Crates).
- Calmer HUD text colours: target names cream (elites muted gold), room twist titles cream instead of lilac, objective complete / failed muted.
- Slime King: Belly Flop drop 0.62 s and circle r 5.2 (was 6.5); acid smaller (splash 3, Acid Flood 8.5, Acid Rain pools 2.1).
- Bone Ward is disabled with no summons out (owner): the cast is refused before mana / cooldown ('No summons to ward'), auto-battle skips it, and the action-bar slot greys out (`ActionSlot.blocked`, `.is-blocked`).
- Run: when only stationary monsters are left (goblin archer towers, lake hydras, crystals), a red ground arrow beside the hero points at the nearest one (render/StationaryArrow, hidden within 9 u).
- Quest tracker (owner): no progress bars, the count sits right of the title (`.qt-n`); at most 3 rows on screen (`TRACK_MAX`, main quest included; quests ready to hand in come next).
- Story rewrite (darker, Zelda-like): Princess Aelia vanished on the night of the Dimming; Malakar was SENT into the Font by King Aldric to save her and fled with her light (King confesses at report3); Ignar = Roan's old captain; Void dark heroes = what the Font leaves of you on each return; comic townsfolk lines (Mira, Hodge/Lysa, Maeve, Dorn's cheese). Text only: story.ts / lore.ts / Ending.tsx / MALAKAR_LAST_WORDS / Aelia / King line; step ids, objectives and rewards unchanged.
- Funny side quests with lore hints: graveyard gravekeeper Mortimer (NPC in the graveyard) whom Sister Elowen forgot she hired and never paid (elowen_stranger -> mortimer_wages; he buries 'what the Font leaves behind' of returned guards); Rodric's hangover cure from Lysa -> he vomits, Marta blames you, 'Why me?!' (rodric_cure), then his sober confession that every Font return takes something (rodric_oath, LISTEN). Dialogue lines may name a speaker with 'Name:: text' ('You::' = the hero, blue name); NpcQuestDef.heard may be a string[].
- Elixir Brewer hut moved 3 west (x -15.6) and the wheat/pumpkin fields 3 west (x -22) so the hut's sign no longer sits on the road.
- True-heir arc (appended after 'tower', save-safe): wren3 (blank journal pages: the King changed the Font oath so guards forget) -> remember (ending: true, finish the adventure again) -> wren4 (Aldric was an eastern-march prince refused by Princess Aelia and King Edric; the Hollow under the Font turned Edric (= Gorath) and his protectors into the biome guardians; Aelia died and Malakar caught her light) -> usurper (Aldric confesses, wanted to leash the Hollow, succumbs) -> queen (Queen Aelia on the throne; Malakar stays in the Void feeding the Hollow; Ascension echoes = the Hollow wearing his face). NpcDef.storyRange [from, until) gates NPCs (npcs.ts npcInStory; render/Npcs + questNav honour it): King Aldric until 'queen', Queen Aelia (king: true) from it. Aelia's end-of-run lines (wanderers KEEPER) vary by stage (hints + 'you will forget' / revelation / queen); Ending slides say the dream fades unless past 'remember'. Ambient hint lines: King's harsh rule (window tax, curfew, patrols facing in), dark thing in the forest, the King's nightmares (Maren, Tamsin, Elowen, Isolde, Garrick, Maeve, villagers).
- Balance/QoL batch: Slime King hp +50% again (x2.25 of the old base, director materialise); champion rooms + dark hero duels -30% hp (CHAMPION_HP 0.7, not the depth-10 pre-boss, not Endless Waves); monster EXP x1.5 (MONSTER_XP_MUL 1.35); quest EXP x1.5 (QUEST_XP_SHARE 0.18 / 0.3 / 0.15).
- Quest slots: main + accepted side quests + taken bounties share QUEST_MAX_ACTIVE (3) slots (store questSlotsUsed / questSlotsFull; board acceptQuest and acceptNpcQuest refuse when full; the prologue 'board' step is exempt). Board popup shows 'Quest slots x / 3'.
- Archer Lightpiercer (skill 2) hold: a gold charge meter under the hero's floating bars (render/Hero HeroBars, abilities LP_CHARGE).
- Stun vs freeze: StatusFx shows ice only for real freezes (combat playerFreeze / freezePlayer: chill freeze, dark hero frost); other stuns (boar knockdown etc.) show stun stars.
- Potions only drink at or below 70% of that bar (player.ts POTION_MAX_FRAC; float text 'HP ABOVE 70%').
- Rescue captive is a real KayKit villager (render/RoomEvents CaptiveActor: no hat, tunic + hair, idle / waves when the room is clear / cheers when freed, 'Captive · Help!' tag); cage roof is an open ring so it reads from above.
- Brewer sign post hangs on the hut's other side (render/Town signSide) so it no longer stands on the tower path.
- Travelling merchant gear = town shop price (buyMul) x1.5 (it was item.price x2.55, i.e. below the Armory's x4).
- Gear catalog rework (owner): the hand-written gear in constants.ts and the old generated wear lists / 'b' weapon variants are `retired` (Item.retired: still valid by id / in saves, never sold, dropped, summoned, crafted or shown in the Codex). The catalog is now per class one weapon ('a' variants) + one helmet / armor / gloves / boots of every rarity (itemCatalog classWear, ids c_<class>_<slot>_<0..5>; Defense first, class defensive secondaries: archer dodge/move, wizard mana, barbarian hp/regen/thorns, knight hp/thorns, necro hp/mana) and a ring + an amulet per rarity for everyone (acc_ring_N / acc_amulet_N: life steal, CDR, move, regen, mana regen, dodge). Wear base stats never carry attack stats (statList), weapons only attack stats (WSEC). Bonus lines are slot-gated (affixes `g` + affixAllowed: weapons atk, helmets def+atk, armor/gloves def, boots def+move, accessories util); new lines Dodge / HP Regen / Mana Regen.
- No helmet at the start (starterEquipment / class switch skip it); the 'armor' tutorial step only makes the class Common helmet free (store freeHelmetId); the summon tutorial reward is a Mana Potion and its free pull is always gear.
- Summons: blue (Rare) gear again (Common rolls become Rare); 25% of pulls are supplies (SUMMON_SUPPLIES: Upgrade Core I/II, potions, reforge items, Ankh); the reward list moved into a 'View possible rewards' popup.
- Skill Trainer Active / Passive tabs carry red dots (alerts canTrainSkill(s, kind)).
- Elixir Brewer: missing ingredients are paid with gems (store brewGemCost: 1-5 gems per missing piece by its rarity; the Brew button shows the gem cost). The tutorial 'elixir' step brews one Elixir of Might free (QuestFreebie 'elixir': no ingredients, no gold). Brewing ingredients count as crafting materials (crafting CRAFT_MAT_NAMES; kept out of 'loot only' bulk sells).
- Name + title float over the hero in town too (render/Hero HeroBars: bars only in runs).
- Settings > 'Click to move' (settings.clickMove, default off = WASD): left-click the ground to walk there. Town: CameraRig ground ray -> village walkTo (yields to building / NPC clicks via walkStamp). Runs: target.clickMoveTo steered in player.ts (any movement input cancels; clicking an enemy still selects it).
- Tutorial fix: the free tutorial summon is the class Common weapon (w_<class>_0a, Lv 1); 'Suit Up' = equip it (storyLogic stateDone 'equip': equipped weapon is not the starter). Saves stuck on 'equip' (pet / Lv 16 piece from the old pull) get that weapon once.
- Max zoom-out halved again: input DIST_MAX 1.15 (was 1.3); Settings zoom slider 0.8-1.15.
- Controller support (engine/input.ts pollPad, standard-mapping gamepads): left stick = move (world.input.joy), right stick = camera orbit; buttons dispatch synthetic key events: A dash (Space) · B interact (E) · X/Y/RB skills 1-3 · RT ultimate (R) · LB/LT HP/MP potion (Z/X) · Back bag (I) · Start menu (Esc) · D-pad up quests (J) / down character (C) / left accept offer (F) / right achievements (O). A toast lists the layout when a pad connects. Menus are not yet navigable with the pad (mouse/touch).
- Town music: the owner's recorded track public/audio/town.mp3 loops while status is MENU (town / hub), crossfaded in audio.ts townTick on its own bus (music volume x0.45); the procedural village layer is muted in town, procedural themes stay for runs.
- Controller menu navigation (ui/lib/padNav.ts, driven from engine/input.ts pollPad while a panel / overlay / pause / level-up / title is open): D-pad or left stick moves a gold focus box (.pad-focus) to the nearest clickable element in that direction (outermost pointer-cursor elements that are on top); A clicks it, B / Start = Esc (back / close), LB / RB = previous / next tab of the tab row in the same panel, right stick scrolls, left / right nudge a focused slider. Gameplay buttons are suppressed while navigating.
- Recorded music: engine/audio.ts RECORDED (town + b0..b6 biome loops + boss + final) lazily created <audio> elements on one bus (music volume x0.45), crossfaded in recTick; whichever slot has a file silences the procedural themes there (boss slot restarts per fight; final boss falls back to boss). Biome / boss loops were cut by ffmpeg from the owner's tracks: loudnorm -16 LUFS, 3 s end->start crossfade (seamless), ~57-72 s, 96 kbps (~0.7-0.85 MB each); Biome 1 skips its first 2 s.
- Recorded SFX samples (audio.ts SAMPLE_URLS, decoded buffers on the sfx bus): click.mp3 on any UI press (capture pointerdown on buttons / tabs / pointer-cursor elements; combat controls excluded; also fires on controller A), levelup.mp3 replaces the synth level-up jingle (synth until loaded); stage_clear.mp3 plays on every room clear (waveClear).
- Hero name in town sits just above the head (HeroBars y 1.95 in town vs 3.15 with bars in runs).
- Audio: recorded enemy-hit sample (`audio/enemy_hit.mp3`, random pitch, synth fallback) and an Epic+ item-drop chime (`audio/epic_drop.mp3`, new `lootDrop` event from `spawnPickup`). Town music (and the procedural menu theme) stays silent until the hero is in town: `holdTownMusic('ui'|'prologue')` from GameUI (title/character select) and the Prologue.
- Cursors + click marker: `ui/lib/cursors.ts` (inline SVG data-URI cursors: stone arrow with gold gem default, white glove hand for clickables, sword over enemies in runs via `body[data-cur=attack]` from CameraRig, blue-gem arrow for drag, grey for disabled; index.css uses `var(--cur-*, keyword)` so `getComputedStyle().cursor.endsWith('pointer')` is the clickable test). `render/ClickMarker.tsx` draws a gold ring/ripple where a click-move lands (red on an enemy) from `target.ts clickMark`.
- Audio: `audio/buy.mp3` on every gold/gem purchase (`purchase` event: shop buyItem, gem shop, Tech, bag slots, ship ticket, run merchant, fishing rod, cave lamp/oil/kit) and `audio/summon.mp3` on each pull (`summonCast`). Default music volume 0.4 (saves cut by 20% once via `mus1`).
- Summon reveal: cards land face down and stay down; click a card to turn it, `Reveal All` appears once every back has landed; Draw again / Leave only after all are turned.
- Shortcuts: G = auto-path to the top tracker quest (clicks that row: walk in town, teleport offer in a run), V = reset camera; controller L3 = G, R3 = V. Settings > Controls lists every keyboard/mouse and controller binding (`KEYS_KB` / `KEYS_PAD` in PauseMenu.tsx - keep in sync with engine/input.ts `PAD`).
- `CurrencyFloat` (TopBars.tsx): gold/gems drawn above any open panel/shop/overlay/summon (z 1000) at the HUD counter spot.
- Summon card backs: face-down Epic / Legendary / Mythic cards pulse with a purple / gold / red aura (index.css `.sm-card:not(.open).sm-<rarity> .sm-back`).
- Stat balance (owner): hard caps `STAT_CAPS` in store.ts (crit 50%, cooldown reduction 40%, dodge 35%, life steal 15%) applied last in calculateStats; pet % stats count x0.5 and grow at 1/4 of petPower (`petStatMul`, also used by ItemTip); blacksmith +N grows % stats at 1/3 the rate; Wizard / Necro skill damage per level is additive (+0.03 / +0.025, was compounding); skill mana cost +12% per skill level (was +4%); debug level max 50.
- Pet feeding is tiered (`petEats`): a pet eats shards / food of its own rarity only (Common+Uncommon one tier). Bag footer no longer has Sell loot / Bulk sell (shops keep them).
- Skill points: `SP_PER_LEVEL = 2` (classLevels.ts) - 3 + 2 per level = 101 SP at Lv 50 (~45% of a class's full tree); old saves get +1 SP per level already gained once (`spMigrate`, flag `sp2`).
- Ignar (Ember Wastes boss) Burning Form (owner): at 50% HP a 2 s untouchable transformation (telegraphed 9 m fire eruption + fire nova wave), then `bossView.enraged`: speed x1.35, attack cooldown x0.5, wind-up / telegraphs / recovery x0.7 (`fast()`), hits x1.3 (`ipwr()`), wider pillars / cleave, +1 imp, a 0.5 s scorching aura near him, title 'The Burning Form'; rendered larger, red-hot flickering body + flames. HP +40% (2300 -> 3220).
- Batch (owner): Knight Shield Wall no longer heals; Green Blob (slime pet) is a melee attacker (no heal); Light Fairy heals 10 (was 20); saved pets / potions resync skill + text from the catalog on load (`petRetier`). Bounty Board lists completed bounties first. Story v5: the town tutorial (helmet, forge, trainer, warehouse, elixir) now runs right after the first one (mira4 -> armor ... elixir -> hodge -> board -> king); 'mira5' merged into 'mira4'; v4 saves migrate by id. Click a room portal to walk to it (hand cursor over portals). Captive glows gold when the room is clear and runs off the map after being freed. Travelling merchant opens with the bag beside it. Training Post (camp) label red dot when a skill can be trained. Potions restore a flat 100 HP / MP (Big 200), still only at <= 70%.
- Room rewards (owner): Gear doors = gear only, rarity bonus +0.12 +0.12/biome; the purple 'Crystals' door (reward SHARDS) = Aether Crystals (2 + depth/8 + biome) + 30% a shard; the Treasure chest = 1-2 different picks (`chestLoot`: gold hoard, gems, a Rare+/Epic+ trinket, shard, 2 potions, a reforge item, an Upgrade Core (Tier II from biome 4), crystals) + 15% a piece of gear. The travelling merchant can also appear mid-biome (depth 5+, once per biome) besides the fixed depth-14 one.
- 'Upgrade available' (ui/hud/UpgradeNotice.tsx, town only): a thin pill in the bottom-left notification area + a 'Ways to grow stronger' popup (better gear, skills, talents, attribute points, gear the Blacksmith can upgrade now, craftable recipes, pet ready to evolve) with Go buttons. Summon window (incl. Tech House) uses a slim dark-gold scrollbar.
- Bulk Sell popup: no gear tier preselected, counts beside 'Monster loot and fish' / 'Crafting materials and ingredients', and a 'Loot only' preset (both loot boxes, no gear).
- Batch (owner): Gem Shop sells no companions. Gold / gems picked up show in the loot feed (`feedCoin`, grouped within 0.7 s). Treasure stages: 15% two chests, 5% three (`world.room.chests`, interact nodes 12/13). Captive cage gets a light beam while it can be freed. Auto loot defaults: Uncommon+ gear + every material (migrated once via `al1`, which also turns click-to-move on; new default clickMove true). Skill Trainer passives use painted skill art. Auto potions drink at <= 70% (was < 30%). 'Low on HP / MP potions' pill (walks to the potion shop; in a run offers the teleport) stacked with 'Upgrade available' (now also in runs; town-only rows offer the teleport). Skill bar slots + the ult are clickable (cast at the auto-target, `forceAutoCast`). Click a portal = walk there (no auto-enter). Loot feed moved up to bottom 12.6rem.
- Input-aware hints (ui/lib/inputMode.ts): any gamepad button / stick sets `pad` mode (a real key press or mouse move clears it); the skill bar, ult, interact prompts ('E' -> 'B'), menu hotkey tooltips and Settings > Controls (only the active layout) follow it. Ways-to-grow popup: skill / talent rows open directly at a biome camp (Training Post) instead of offering the teleport.
- Bounty board v2 (quests.ts TYPE_GATE): quest types unlock by level (kill bounties from Lv1, King's/boss bounties at Lv12/15), kill bounties dominate the weights and scale with level and deepest biome (qBiome = highestWave/15); a claimed bounty keeps its slot (claimed) until the day changes and never re-offers that day.
- Controller focus = hover (ui/lib/padNav.ts setFocus): moving focus fires mouseover/mouseout + a window mousemove at the slot, so every tip() tooltip (bag, shops, pets, skills) opens beside the focused element.
- Aether Crystals are items (crystals.ts): one 'CRYSTAL' bag stack mirrors `crystals` both ways (store.ts subscription, like shards); unsellable (sellItem/sellItems skip it), storable/deletable. Engine drops them as 'CRYSTAL' pickups (pickups.ts dropCrystals: up to 5 violet shards that magnet in like coins) from rooms, chests, bosses, tower kills and mining.
- Controller badges (ui/components/PadBtn.tsx PadBtn / PadHint): in pad mode skill slots, ult (RT), potions, menu buttons (corner), quest tracker (L3) and interact pills show coloured controller buttons (A green, B red, X blue, Y yellow, plates for bumpers/triggers, D-pad cross). Settings > Controls draws the controller with every action (ui/components/ControllerMap.tsx).
- Adventure Portal moved deep into the forest (townData PORTAL 5,152): the main road bends past the two hamlets (ROADS segments at z 128 / 137), a horseshoe of trees wraps the clearing, island box [-18,-10,28,168], townPath grid TOWN box to z 170.
- Erin's rockfall (Lv30): townData ROCKFALL (split out of TRAIL_ROCKS) blocks the old miners' road (dirt ROADS from the gate green east to the mining camp). npcQuests 'erin_boulder' (TALK Grit: wyrm frost splits heart-stone) -> 'erin_frost' (DELIVER 3 frost_scale). Turn-in: village.ts clearRockfall removes the colliders (obstaclesVersion++ rebuilds the walk grid), render/Rockfall bursts + hides, minimap drops them (rockfallCleared). Erin = Attack on Titan cameo NPC at (44.2, 47.2).
- EXP -15% (owner): classLevels KILL_XP_MUL 0.85 applied in combat.grantKillXp; QUEST_XP_SHARE story/side/bounty 0.153 / 0.255 / 0.1275.
- Cameo NPCs (owner): Erin (AoT, town, rockfall quest); Steve (Minecraft, townData `deep` cave NPC: one random floor 3-8 per mining trip, npcs.caveCameo, placed beside the arrival; once-gift 400 g); wanderers KEETO (SAO, biomes 2-6, all black + two blades via render/Wanderer dressKeeto; spar = free item + gold) and RIRURU (Slime, biome 1, render SlimeActor; gives shards + crystals). WandererDef.look.
- Recycle moved into the bag (owner): the bag's Delete became Recycle (multi-select + Com/Unc/Rare/Epic quick picks), store.recycleItems(ids) turns gear into shards of its tier + cores (non-gear is discarded); the Blacksmith's RECYCLE tab is gone.
- Riruru (owner cameo) is a monster, not a wanderer: engine/systems/riruru.ts. Biome 1, once per run, 5% when a COMBAT/ELITE room goes quiet (director, before onCleared): a lone small blue SLIME (x10 HP, no damage, scale x0.75, blue tint in render/Enemies, named in TargetFrame); the room clears after it dies; drops 3 Mana Potions (combat.killEnemy -> riruruDied).
- Debug > Special fights: Fight Malakar (director.debugMalakar: the Void throne room) and Fight Riruru (riruru.force: the next quiet Greenwood room gets the blue slime).
- Crafting shard costs inverted (owner): Common 20 / Uncommon 15 / Rare 10 / Epic 6 / Legendary 4 / Mythic 3 (crafting.ts SHARD_COST).
- Reforge: the Erasure Scroll is retired; every bonus line has a Reroll button (reforge.ts mode LINE, 1 Reforge Stone: a new stat + value for that line; uniques stay). Erase scrolls no longer drop / sell / reward (old ones are sell-only loot); Augment Rune still fills empty slots.
- Hades-style story (owner): dreams.ts DREAMS = 17 Font dreams (Aelia + 3 class-specific 'MEMORY' dreams of the hero's own past: who you were, the night of the Dimming, your grave). One per return from a run (ui/screens/DreamOverlay.tsx: haze + openCustomDialogue 'Wake up'), in order, gated by story step `after` and `clears` (progress.endings 2/3/5/7/9). Progress per character in localStorage aether.dreams.<charId>. True ending: the 'remember' step completes only on the 10th clear with every dream before m3 seen (dreams.trueEndingReady; storyLogic gameEnding + wanderers keeperStage), else 'her words slip away'. Debug > Dreams: play next / reset. Custom dialogues (npc -1) no longer auto-close in town (village.ts).
- The adventurer's house (owner): townData HERO_HOUSE in the south-west wall corner (door to town, red door). Arrivals stay at the plaza (owner).
- Fixes (owner): the class dash shows 'Lv 6' at the Skill Trainer until DASH_UNLOCK_LV (it starts at Lv 1 but can't be trained earlier: Skills.tsx, alerts.canTrainSkill, store.upgradeSkill). Timed passives (skills.updateSkills) only charge / fire while fighting: never in town (cave monster floors aside), never with no monster alive; circling orbital blades fade out.
- Riruru v2: 30x slime HP, armour max(x4, 300), blue tint (r .5 g .75 b 6.5 over the green body), drops 5 Mana Potions + 10% one of Ankh of Life / Upgrade Core I / II.
- Monster level scaling raised (owner): enemies.ts LEVEL_HP 0.10 / LEVEL_DMG 0.065 / LEVEL_REWARD 0.04 per hero level above 1 (was 0.07 / 0.045 / 0.03).
- Talent gating (owner): rings 0-1 open with 1 point in the parent, ring 2+ need the parent MAXED (talents.ts reqMax).
- Erin is a kid NPC (ARCHER model, scale 0.78, no hat/cape). Attributes: 'Auto' button in the allocation window (attributes.autoAllocate, per-class split, staged until Apply). Debug > Erin's rockfall: Break it / Restore.
- Walkable dreams (owner): Aelia's Font dreams are a dream run (runInfo.dream -> director startRunRooms enters biome 0 CAMP plan {epilogue, dream}); Aelia (KEEPER wanderer) waits on the far side of the clearing; talking plays dreams.dreamView.pending's lines, 'Wake up' marks it seen and resetGame()s home. MEMORY dreams stay the town haze overlay.
- Dialogue replies (owner): a short hero line ('You:: ...', <= 72 chars, dialogue.replyAt) right after the current line is not shown as a page: it is the label of the Next / Close button (blue italic quote) and pressing it skips past it. With no reply the button reads Next / Close (owner). Write conversations as NPC line / 'You:: reply' / NPC line.
- The adventurer's house is enterable (owner): village area 'HOME' (engine/homeData.ts layout + colliders, render/HomeInterior.tsx: bed, hearth, table, chest, wardrobe, rug). E at the door ('Your house'); E by the bed = Sleep: plays the next due Font dream (dreams.dreamHooks.sleep, set by DreamOverlay), else a nap note.
- Rockfall v2 (owner): Erin's quest breaks only the middle boulder (townData ROCKFALL_BREAK = 2), leaving a gap; the others stay. No dirt road to it. Riruru HP 21x (30x -30%).
- Cabbage Man (owner): townData NPC by the cabbage field; npcs.cabbageWatch makes him shout 'OH NO! MY CABBAGES!!' (6 s cooldown) when the hero stands in the field; npcs.npcShout forces a bubble. Dialogue no longer shows 'Main quest: / New quest:' title lines (title lives in the tracker); hero reply button uses the gold Next colour, not blue.
- Horses + animals (owner): minimap shows the stable (horseshoe badge), free horses (chestnut dots) and a ring round the arrow while riding; quest auto-walk works on horseback (2x speed, dismounts at doors). townData STABLE (against the wall east of the gate; render/Stable.tsx) + paddock FENCES (wide west gate; cart / Tilda / Oskar / meadow bench / planter moved clear) + 3 ANIMALS 'HORSE' drawn by render/Horses.tsx (smooth jointed meshes: walk + gallop leg cycles, grazing, tail swish, ear flicks, head toss on mount). E near a horse = Ride (village.mount; world.village.ride; player.ts RIDE_SPEED x2, no skills/attacks; Hero.tsx rider pose), E again / any area change = dismount (the horse grazes where left until the town reloads). E near cats/chickens/cows = Pet (npcs.petAnimal: hop + bubble over the animal; Bubble.animal). Combo bonus now +0.5% per 10 hits, max +5%. Font dream rooms get render/DreamGarden.tsx (flowers + a stream with a footbridge, decoration only). Mine-camp lantern/sign moved off the path.
- Balance + UI batch (owner, 2026-10-17): store HP_INFLATE / DMG_INFLATE = 2 (calculateStats doubles final maxHealth from every source; combat.damagePlayer doubles all incoming damage incl. hazards; % max-HP traps divide it back out; heals/regen unchanged). Radiant Burst (skills.ts) = passive at <=50% HP, 25 s CD. Run rewards: 2 cards, 25% chance of 3 (+1 bonus card still). Dash charge pips/tooltip lines removed. UpgradeNotice: pet level-up / evolve / fuse hints (uiStore petsTab). CharacterSelect: equipped-item row (characters.charEquipment) + gear tints on the preview.
- Run cards + encounters (owner, 2026-10-17): engine/runCards.ts = card catalogue (COMMON..MYTHIC rolls 55/28/12/4.5/0.5, max one mythic offered per run; stat cards scale by rarity; Shadow Step dash CD -10% x3; Death Defiance LEGENDARY x2 auto-revive; specials Afflictor / Shieldbreaker / Guardian's Spoils / Giant Slayer / Alchemist / Executioner / First Strike / Second Wind / Gold Rush / Lingering Malice; SKILL_* cards no longer offered). Regen caps at 70% max HP (Alchemist 85/90). Same card frame for all rarities; LEGENDARY/MYTHIC get an illustrated art window (WaveReward.tsx). Ally fighter once per biome (engine/systems/ally.ts + render/Ally.tsx, minion slot src 6; DebugTab 'Ally encounter'). Captive rescue = one non-gear reward (roomEvents captiveReward). Repeated WARNING toasts de-duped for 3 s (store addNotification).
- Hard mode / horses batch (owner, 2026-10-17): Hard locked until progress.endings > 0 (Settings toggle disabled; unlock note on the first Ending card); Hard runs x1.5 gold/XP, epic+ drops x1.6, card tiers shifted up (runMods HARD_*). Slime King armour x1.5 reduction + shield = 30% max HP. Card Quickdraw Flask (POTION_CD, -10..28%, 3 stacks, cap 50%). Horses need Lv15 quest hilda_shoes (Hilda the Stablemaster by the stable; townData horsesUnlocked); horse dash while riding (0.35 s burst, 6 s CD, world.village.ride.dashT/dashCd).
- Bosses batch (owner, 2026-10-17): Shieldbearer block stance locks facing (SHIELD.turn 0), hits from >100 deg off its facing = BACKSTAB x1.5 (projectiles pass fromX/fromZ). Bosses/minis get WINDED free-hit windows after attacks (enemies.ts WIND: 1.5-2 s bosses / 1.2-1.6 s minis, every 10-16 s, +10% dmg taken) and +15% / +12% HP. Humanoid mini bosses (engine/systems/humanBosses.ts + render/HumanBosses.tsx, kind HUMAN_BOSS): Captain Varn (shield wall, bash, slam, banner), Sable (arcane ward, blink, hex circles, bolts), Rook (roll, volley, snares, hound, marked shot); 35-40% of MINIBOSS rooms. Debug: humanoid mini boss buttons + Fight Dark Hero per class. Boss damage shield (e.shield) now shows the BossWard sphere (Slime King).
- Mining (owner, 2026-10-17): new equipment slot 'tool' (ItemType TOOL); Mining Pickaxe tool_pickaxe 1500 g in the Mining Supplies 'Tools' section, crates.hitCrate x2 hand-harvest damage while equipped. Crystal Cavern: half the nodes (roomgen 6.5-8.5), node renamed 'Crystal Cluster' (mapgen HARVEST_NAME), drops 2-4 Aether Crystal items (no gems); Rare/Epic/Legendary Shard Veins (13/6/1.5%) drop high-tier shards.
- Batch (owner, 2026-10-17): pickaxe shown in hand while mining (weapons.makePickaxe, Hero.tsx); Radiant Burst = shield 25% max HP (+3%/lv) for 8 s below 60% HP, 17 s CD, reflects 20% (p.radiant soaked first in damagePlayer, stacks with Arcane/Aegis); Shieldbearer/Varn block arc 75 deg each side, no turning. Maeve's gossip = the one very long dialogue (36 lines), other LISTEN quests trimmed to 6. Deep cave floors nav to the stairs up. Death screen 'To do in town' + side quests in Ways to grow stronger. 8 new fish. Side quest XP x0.8 (QUEST_XP_SHARE.SIDE). questComplete event -> audio sfxQuestComplete fanfare. Biome shortcut: progress.biomesDone; a 4th red-gold portal 'Shortcut to <Boss>' after room 4 or 6 (0-based) of a completed biome jumps to the boss (director shortcutAt; DebugTab 'Mark all biomes completed').
- Hazards / misc batch (owner, 2026-10-17): combat.inFight() gates pet abilities; POTION_CAP 50 HP / 50 MP (store potionKind/potionCount); ally holds weapons; rollEliteShield 30% chance 50-100% HP shield on elites/minis/human bosses/dark heroes. Biome hazards (index = BIOMES order): Marble Halls spikes x1.4 size, up to 10 groups, faster, hurt while up; Desert quicksand pits (zones aux 1: slow 40%, pull, core DoT); Coral Isles puddles x1.7 + aquatic monsters (enemyDefs isAquatic) fast in water; Ember Wastes irregular lava + dashable lava rift (feat.rift) in ~1/3 of rooms; engine/systems/biomeHazards.ts + render/BiomeHazards.tsx + ui/hud/BiomeHazardHud.tsx: Greenwood brambles + spore mushrooms, Frostpeak ice sheets + falling icicles, Void rifts + gravity flips. Humanoid mini bosses more common on tower floors / in Endless Waves (debugTowerHuman).
- Environmental-kill achievements: DamageOpts.env ('TRAP' spike traps, 'BARREL' explosive barrels, 'SLAM' wall slams, 'HAZARD' wildfire / gas zones) rides on enemyDeath; goals meta stats trapKills / barrelKills / slamKills / hazardKills; 7 achievements (Watch Your Step, Trap Master, Kaboom!, Demolitionist, Wall Bouncer, Pinball Wizard, Nature's Wrath) with titles.
