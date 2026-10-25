# Handoff — Aether Survivor (status as of 2026-10-17, commit 73c68cc)

3D action roguelite: a living town hub plus Hades-style room runs (7 biomes x 15 depths), endless tower / daily trial /
endless waves modes, 5 classes, a long story with an ending and a true ending. Vite + React 19 + three r182 + R3F 9 +
Zustand 5. Android APK (Capacitor 7) and PWA. Read `CLAUDE.md` (hard rules) first, then this file; `docs/ARCHITECTURE.md`
has the layers + performance rules, `docs/RUN_DESIGN.md` the run structure.

**Where facts live:** this file is a map, not the source of truth. Numbers (balance, coordinates, prices) change almost
daily, so the code wins: `constants.ts`, `classLevels.ts`, `engine/roomDefs.ts`, `engine/townData.ts`, `engine/runMods.ts`,
`unlocks.ts`. Where this file quotes a constant it names the file.

## 1. The owner and how to work with them

- Not a coder. Short, informal feedback, often several requests in one message, often screenshots. Reply in plain
  language: what changed, what to try, what is still pending. No code jargon.
- **Very cost-sensitive** (complained twice about usage): at most 1-2 sub-agents at a time, prefer small direct edits,
  few screenshots, do not re-verify things needlessly.
- **No screenshot / visual QA unless asked** (owner 2026-10-24): "I'll check the updates myself unless I tell you so." Verify with tsc + vite build
  (and logic checks where needed), push, and let the owner look; only take headless screenshots when the owner asks for them (mockups / plans still OK).
- **Model split** (owner, 2026-10-20): **Opus = planning + review** (the main session: break the request down, write
  the brief, review the diff, commit). **Sonnet = execution** (all code writing: Agent tool `model: "sonnet"`).
  **Haiku = verification + navigation** (finding files/symbols, headless screenshot/QA runs, checking a change landed:
  `model: "haiku"`). Do not write large code changes in the main session.
- **Push to `main` first** (owner, 2026-10-17): `git push origin HEAD:main`, then the claude/* branch. Vercel's production
  deploy builds `main`; a branch push FIRST makes Vercel build that commit as a Preview only and skip Production. Every push
  is a Vercel deployment (there is a daily quota; `vercel.json` only has the SPA rewrite, no branch filter: an attempt to
  skip claude/* branches was reverted on the owner's request). Do not commit or push unless asked; run `npx tsc --noEmit`
  and `npx vite build` before pushing.
- **Potions STAY.** The owner once asked to remove them, then reversed it ("dont remove potions"). Z/X potions, the
  auto-potions setting, shop and loot potions are permanent features. Do not remove or hide them.
- Wants "a real development studio" result: game-like polish, good performance on phones (the Android APK is the target).
- **No cubes** (owner 2026-10-24, firm): "don't cubify the game, this is not Minecraft". No box-shaped scenery: walls, pillars, rocks, ledges and borders are rounded / organic (round columns, rocks, trees, curved edges).
- Free / lightweight assets only (KayKit + Kenney CC0 in `public/models`, meshopt-compressed; the owner's own recorded
  music + SFX in `public/audio`). Only registry.npmjs.org is reachable from the cloud container (no other downloads).
- Tell them when a new APK is downloadable: GitHub -> Actions -> latest "Android APK" run -> Artifacts ->
  `aether-survivor-debug-apk` (zip with `app-debug.apk`). CI (`.github/workflows/android.yml`) builds on pushes to `main`,
  `claude/festive-shannon-tspv5k`, `claude/charming-shannon-nq5wcd` and on `v*` tags (a tag publishes a GitHub Release
  with the APK; pushes to `claude/charming-shannon-nq5wcd` also publish an `apk-build-N` release).
- Many requests are marked "(owner: ...)" in code comments: those values were chosen by the owner. Do not silently
  revert them (drop nerfs, class HP / move speed, mana regen, potion cooldown, Barbarian kit, Necro summon rules, boss HP
  and cadence, unlock levels, EXP multipliers, gold scale).
- **ART + UI DIRECTION (owner, 2026-10-20, non-negotiable): everything must look like The Legend of Zelda (Echoes of
  Wisdom / Link's Awakening remake) or a similar cute, casual Nintendo-style game.** Soft, rounded, chunky, toy-like,
  bright and friendly: rounded UI pills with no line containers, cute cream icons (`ui/components/CuteIcons.tsx`),
  blue-roof fairy-tale town, close three-quarter diorama camera with tilt-shift. NOT the old Korean-MMO / dark-metal /
  gold-hairline look, not gritty or realistic. New art prompts use STYLE v2 in `docs/ART_PROMPTS.md`; new UI follows
  section 3.9. When in doubt, ask "would this fit in Echoes of Wisdom?".

## 2. Map of the code

```
engine/            pure TS simulation (no React); world.ts = mutable singleton for per-frame state
  game.ts input.ts camera.ts events.ts mapgen.ts audio.ts debug.ts runMods.ts runCards.ts
  roomDefs.ts roomgen.ts roomShape.ts roomHalls.ts roomFeatures.ts campPaths.ts   run structure, biomes, room building
  townData.ts townHills.ts castleData.ts churchData.ts tavernData.ts homeData.ts caveData.ts beachData.ts   town + interiors
  gates.ts (Void trial gates) townGates.ts (story gates: blocked outskirts) arenaRooms.ts wanderers.ts npcLines.ts enemyDefs.ts lootExtra.ts
  systems/  player abilities skills combat enemies bosses bosses2 bossMech bossFx bossSpecials humanBosses darkHero eliteBig
            tricks director roomEvents biomeHazards projectiles zones pickups crates minions pets ally riruru
            village npcs dialogue storyLogic townGatesLogic npcQuestLogic questNav townPath cave fishing tutorial target aim combo heroTrail dailyRun ...
render/            R3F components (Scene, Room, Town*, Hero, Enemies, Bosses*, ...); read `world` in useFrame
ui/                DOM HUD (hud/), windows (panels/, panels/shop/), screens/, components/, lib/ (dnd, padNav, inputMode, alerts, cursors)
store.ts storeTypes.ts   Zustand meta/RPG state (profile in localStorage 'aether-survivor-profile-v1', one key per character slot)
data modules (root): constants.ts types.ts classLevels.ts talents.ts attributes.ts itemCatalog.ts itemClass.ts itemSets.ts affixes.ts
  crafting.ts reforge.ts weaponPerks.ts accessoryCharms.ts shards.ts crystals.ts loot.ts summonPool.ts gemShop.ts tech.ts elixirs.ts
  petsCatalog.ts petGrowth.ts petActions.ts petFusion.ts quests.ts npcQuests.ts story.ts lore.ts dreams.ts goals.ts goalsTracker.ts
  achievements.ts dailyChallenge.ts endlessWaves.ts towerRewards.ts ascension.ts unlocks.ts characters.ts rewardFeed.ts codexData.ts
```

## 3. Current game (what exists today)

### 3.1 Flow and screens
Title (`ui/components/TitleLogo.tsx`) -> **character select** (`ui/screens/CharacterSelect.tsx`): MMO-style slots, up to 6
characters (`characters.ts`, `MAX_CHARS`), each its own save; a character's class is fixed (Archer / Wizard / Barbarian /
Knight / Necromancer); name popup on Create -> town. First launch shows the prologue slides (`ui/screens/Story.tsx`).
Death returns to town, loot kept (GameOver screen -> "To do in town" popup on arrival). Esc: pause menu in a run, Settings in
town (and closes the open panel first).

### 3.2 Town hub (`status MENU`; `engine/townData.ts`, `engine/systems/village.ts`, `render/Town*.tsx`)
- **Hidden treasure chests (owner 2026-10-25)**: 8 toy chests in out-of-the-way nooks (`engine/townChests.ts` = ids, spots, rewards; NW corner tower by the lake, tower lawn, west of the pumpkin field, beach north end, tavern-row side stairs by the east tower, bridge SW end, graveyard NW corner, farm grove). Colliders come from `townData TOWN_COLLIDERS`, `townFill` reserves a 2.6 m ring (no trees on them). E "Open Treasure Chest" (village act `chest`, reach 2.7 m, hidden while riding like every pill) -> `systems/townChestLogic.openChest`: pays gold / gems / crystals / shards / a potion once, feed + "Received" lines + fanfare; a full bag keeps the chest shut. Opened ids = `store.chestsOpened` (profile, per hero, reset with the profile); `world.village.chestT[i]` mirrors it (-1 closed, 0.. opening seconds, 99 opened before). `render/TownChests` draws 3 instanced meshes (bodies, swinging lids, a few twinkles over unopened chests within 38 m). Not on the minimap. To add a chest: append to `TOWN_CHESTS` (check with a findPath script: path from the gate, no water, gap to colliders >= 1.5 m).
- **Village houses (owner 2026-10-24, current state of every decorative house).** The old kit cottages / round tower houses are gone. Houses are the Quaternius medieval-village pieces `House_1`, `House_2`, `Inn` in `public/models/village_qt.glb` (made by `node art/blender/quaternius_village.mjs` from `art/*.obj`: no Blender needed, one vertex-coloured material, scale baked, door on +z; also holds the dungeon-pack props `Barrel`, `Barrel2`, `Crate`, `Bucket`, `Pedestal`, `Statue_Horse`). Data: `engine/qtVillage.ts` (sizes, `HORSE_STATUES`), `HOUSE_KIT.vh_*`, the `V` / `VF` helpers + `HOUSES` in `engine/townData.ts`; drawn by `render/qtVillage.tsx` (one instanced draw per piece type, plus the barrel/crate/bucket clusters at `CLUTTER_SPOTS`). Layout rule: **doors face the street/lane, rows share one front line, backs face the wall or a back garden**: North Street south side (doors north, front line z -3.4, west + east rows), the lane z 23.2 (rises' north rows doors south at front line 20.8; south rows + Market Row doors north at front line 25.6, backs to the south wall), Tavern Row (doors south onto the new `Tavern Row lane` z -29.2, backs to the north wall), hamlet on the forest road (doors toward x 0). The hero's house now faces NORTH onto the lane (`HERO_HOUSE` rot PI; `HOME_DOOR` / `HOME_OUT` derive from it). Colliders = `houseRing` rectangle of circles. Add a house = one `VF(...)` line. **Plant boxes**: the stone planter / flower-bed kit pieces keep only their stone (their cube flowers + ball bushes are filtered out in `render/townKit.tsx` / `render/kitV3.tsx`); `bedPlants` in `render/natureLayout.ts` plants Quaternius `Flower_*` / `Bush_Common_Flowers` in them. Two `Statue_Horse` on `Pedestal` flank the avenue mouth of the plaza (`HORSE_STATUES`, collider each).
- **Kingdom v5 (2026-10-21): shop ring round an open plaza** (on top of v4; any building yaw is fine now, the camera rotates). Four shops stand 2x2 facing each other across the plaza (0, 2, r 9): Fortune (-16.4, -1.5) + Pets (-16.4, 5.5) west (rot pi/2), Blacksmith (16.4, -1.5) + Warehouse (16.4, 5.5) east (rot -pi/2); Armory (-12.6, 19.8) south of the south street, Tech House (24.8, 2) and Potions (32, 2.6) on the east band (`SHOP_POSITIONS`, rot = any yaw, keep every prop out of the street corridors and keep plaza-shop dressing within local x +-3.1 and behind the counter: `SHOP_LOOK` is in
  shop-local coordinates, `shopLocal` / `shopFront` turn it by the yaw; see TOWN_PLAN). Each shop has its kit v3 signature props, potted
  plants, an awning. **The plaza is open** (owner 2026-10-24: the Adventure Portal left it): bare paving with the two `Statue_Horse` flanking the avenue mouth, four rim lamps and two benches. **The Adventure Portal stands in the forest clearing at the end of the bending forest road, where the Endless Tower used to be** (`PORTAL` {5, 155.4}, `ry` PI = front faces NORTH down the road, kit v3 `adventure_portal` x `PORTAL_S` 0.9, `front` {5, 151} = the E / guide-arrow / minimap spot, `out` {5, 148.6} = where the hero reappears after an Adventure run and after a refresh mid-run; solid = a row of circles in TOWN_COLLIDERS; flat ground via the townHills clearing circle; townFill: `put('adventure_portal', ..., PORTAL.ry)`, reservations, a thick double arc of `TOWN_TREES` + groves behind it). The very first arrival of a session (new game / boot, `cameFromRun` false in engine/game.ts) still stands on the plaza (`PLAZA_ARRIVAL` {0, 4.6}). **The Endless Tower moved deeper and east** (`TOWER` {31, 168}, `ry` PI, door {31, 161.3}, out {31, 158.7}, its `TOWER_KNOLL` follows; island box `[0, 0, 52, 186]` added to ISLAND_BOXES, townHills grid / townPath BOX / mapgen collider grid HALF extended to z ~190): its own dirt path (4 `dirt` ROADS, w 2.8) branches off the forest road to the RIGHT at (4.4, 143.5) and winds east-south-east to the door; a horseshoe of `TOWN_TREES` + groves wrap its back and sides, no fences. The Brewer's lane (`TOWER_PATH_Z`) is unchanged. The 'tower' story gate (fallen tree across the door) now spans x 27.2..34.8 at z 162.8. The gate arch is a real open passage (`buildGateArch`, `GATE_TOWER`). **Fewer cottages, each on a landscaped lot** (owner 2026-10-21): 15 houses inside the walls
  (was 31). `LOTS` (engine/townData, derived from `HOUSES`; lot frame = the house's, turned by `rot`) give each one a rounded-rectangle lawn (`LOT_PATCHES`, the paving has a hole + stone kerb),
  a low picket fence with a 3.4 m gate opening at the door (`LOT_FENCES`, colliders in TOWN_COLLIDERS, drawn in render/natureLayout), stepping-stone pavers gate -> door + a mailbox
  (`addLot` in TownScenery) and kit dressing placed in house-local space by engine/townFill (corner bushes, flower beds, potted plants, tree, bench / herb box, laundry line / barrels).
  Lamps inside a lot or its gate are dropped. The south-wall garden strip (z 33..36) and the West Rise stair foot stay open (lots stop at z 32.5). **Hero's house** (`HERO_HOUSE`, the
  lot with `hero: true`): wider lot, blue-and-gold gate arch, flag pole, red rug, doghouse, "Your Home" name plate (`HeroHomeSign`). **Enterable-later houses**: `ENTERABLE_HOUSES` (yaw 0, door spots, listed in
  TOWN_PLAN). **Shops stand out**: the hanging icon signs are 1.5x. Cottages carry gentle yaws (`HOUSES[].rot`). **Dense town (2026-10-23)**: terraced house rows fill the paving on both sides of the streets (the 'dense medieval town' block in `HOUSES`, placed clear of streets, stairs, wall-tower doors, shop fronts, the park and plaza), two market stalls by the castle path (`STALLS`), small dressing in `townFill.ts`, a bigger fountain park with 4 diagonal benches and free N / E / S entrances. Plaza floor: one plain cobble disc (no rings); the plaza statues stand on bigger plinths with no flower beds; raised districts + the castle terrace are topped with the same flagstone paving (`buildTierTops`); streets have a warm kerb. Floors: soft cream flagstones + cobbles (`pavingTexture` / `cobbleTexture`),
  calm grass colour drifts (Terrain `groundColor`). Old quest-board road stub removed.
- **Open town (owner 2026-10-23)**: no plant boxes / hedges / house-front collider chains line the streets (a house is one collider circle; `townBarriers.ts` is gone), you can walk between houses and streets. Loose barrels / crates hug walls, lamps sit on the kerb line, the plaza has a thin inlay ring + flush walkable flower beds round the statue plinths (`addPlaza`), the chicken pen is the only closed pen. Do not add blockers in the open areas.
- **Story gates (2026-10-22): the map unfolds with the MAIN story** (`engine/townGates.ts` data + pure rules, `engine/systems/townGatesLogic.ts` runtime, `render/TownGates.tsx` meshes, Minimap marks).
  Four outlying corners start blocked by a cute physical blocker and open when the story REACHES a step (`GateDef.opens` = step id, so the open state is derived from the saved `story.step`:
  no extra save, refresh / new sessions / old saves past the step start fully open): **beach** (flooded-road barricade across the dirt road at x -37, z 49.6..55.2, opens at step `wolves` = after the Meadow trial; hides
  the Fishmonger, fishing, Ned, Marlo, Capt. Rhea), **cave** (cave-in rubble in front of the mine mouth, a DOOR gate: the camp + Mining Supplies stay open, the Enter pill is replaced; opens at hero level 27 (`minLv`, not a story step)),
  **tower** (a fallen tree across the Endless Tower's door, a DOOR gate: the forest is open ground, and the Daily / Waves / Tower windows open from the HUD corner icons anywhere, so nothing is cut off; opens at `wren`),
  **hermit** (thorny brambles across the narrow NE back trail at z -27; hides Old Wend; opens at `lysa2` = Marble Halls boss down). Road gates have colliders along `span` + invisible `plugs` (tiny gaps found by the QA
  flood fill); door gates have `cols`. Prompt: ONE "E Look <name>" pill (village `act 'blocked'`, reach `GATE_PROMPT_R` 3 m from the span) that toasts the speech `line`; the zone never overlaps a shop / NPC / door prompt zone
  (checked). Opening: `townGatesLogic.onStore` (store subscription, deferred) removes the colliders, bumps `obstaclesVersion` (path grid + minimap rebake), notifies `done`, emits `gateOpen` (bell + rumble in audio;
  the quest fanfare already played with the step) and queues `gatePlay` so `render/TownGates` plays the 1.1 s removal (shake, sink, shrink, dust / leaves / chips) when the hero is within 70 m; otherwise it just vanishes.
  Closed gates are static merged meshes (4 draw calls, no per-frame work). Side quests behind a gate carry `gate: '<id>'` in npcQuests (hidden until open): Pip's hermit secret (hermit), Erin's boulder (cave).
  Step thresholds live in ONE table (`TOWN_GATES`), change them there. Debug: set the story step in the Debug tab and the gates close / open live. **QA:** `(await import('/engine/systems/townGatesLogic.ts')).gateSelfCheck()` in a
  town page: per story step, the closed gates must not hide the step's targets or any core place; every gate must hide something; no Look zone may overlap another prompt zone; side quests without a `gate` must be doable with
  every gate closed. A fresh save's path test (pw pathtest.js) now has 15 extra EXPECTED fails (194 pass / 19 fail with the 4 chicken-pen ones; fishing spots, Fishmonger, Ned, Marlo, Rhea, pier, Old Wend, the beach path; the tower door stays reachable, only its pill is swapped); a late-story save is the old 209 / 4.
- **Kingdom v4 (2026-10-20): dense districts, seven separate shops** (full map + coordinates: `docs/TOWN_PLAN.md`). Inside the walls: castle terrace N, plaza + statue, market street
  (the avenue, 4 stalls a side), residential lanes (lane z 23.2 each side, houses 6 m apart at z 16.2 / 29.6, auto yards = lawn + planters from `HOUSES`), chapel quarter + graveyard (NW),
  tavern square (NE), park + fountain (SW), cottages on both rises, the old shop-row line (z 1.2) is cottages now. **The seven town shops are NOT a row any more**: each has its own spot
  (`constants SHOP_POSITIONS`, yaw <= 17 deg) and look (`townData SHOP_LOOK`: v2 `shop_stall_house` counter + extra pieces / props / nature props / barrel clusters, table of piece names).
  Roads: main 5.2, streets 3.4, lanes 3. Everything else is dressing in `engine/townFill.ts` (`PIECES` role -> piece names, hedge / grove / carpet tables, `FILL` + `FILL_COLLIDERS`,
  `CLUTTER_SPOTS`; drawn by `natureLayout` / `townKit`, solid via village.placeVillageNodes). Kit v3 = rename pieces in those tables. Small v2 pieces are baked per 32 m chunk in `TownKit`
  (draw calls); tier stairs are >= 4 m wide because the A* grid keeps 0.78 m clearance. Check layout changes in node (esbuild-bundle townPath + mapgen + data, no browser): see TOWN_PLAN.md
  (176 targets passed incl. all 10 shops, doors, NPC homes / patrols, fishing, nests, benches, nodes, animals).
- **Town kit v2 layout (2026-10-20, north-up camera; the shop row described here was replaced by the bullet above)**: every building front faces south (+z, rot 0) toward the fixed camera.
  The seven town shops (Pets -39.5, Fortune -31, Potions -22.5 | plaza | Armory 14, Warehouse 22.5, Blacksmith 31, Tech 39.5; all
  at z 1.5, `constants.ts SHOP_POSITIONS`, `townData SHOP_ROW_X / SHOP_GAPS`) are `shop_stall_house` pieces in one row on the north side
  of the south street; keepers stand in front of the awning (right of the door), signs in the gaps, a market stall holds the free
  west slot. Houses (`HOUSES[i].kit/.s`, all rot 0) go behind the row (north), on the rises, along the gate road and in the
  hamlets, never south of a shop front (the camera sits ~19 m south of the hero, 50 deg pitch: a roof H high hides ~H/1.2 m behind it).
  Keep, chapel (bell tower on its WEST side, side door added procedurally in TownScenery `addChapelSideDoor`), tavern (piece drawn at
  `TAVERN.z + TAVERN_DZ`), gatehouse (x1.15, `WALL.gateHalf` 5), wall segments, lamps, planters, stalls, (the park fountain at `WELL_POS` was removed),
  banners and barrel/crate clusters are all kit v2 instances (`render/townKit.tsx`, one place for every placement list). Door /
  entry triggers (`castleData CASTLE_DOOR`, `churchData`, `tavernData`, `homeData`, `townData CHAPEL_SIDE`) derive from CASTLE /
  CHURCH / TAVERN / HERO_HOUSE (the hero's house now faces south, on the West Rise). Gate towers are colliders at x +-3.8.
- **The kingdom is an island in the sea (owner 2026-10-25).** Everything outside the walkable edge (`edgeR(a)` = `islandRadius` + 2) is open sea, like the full map. `render/terrainFn.ts` `groundYLand` dips the bank from the hills to just under the water line at ~edgeR, then the sea floor falls to -3 (`SEA_Y` = -0.15 is the water level; a small dry headland is kept under the Crystal Cave cliff, `CAVE_CLEAR`). The ground mesh (`render/Terrain.tsx`) now covers only `GROUND_BOX` (island bounding box + 22 m, rectangular grid) with a sandy shore band (`shoreSandK`, also fed into `aSand`). The sea itself is a 360-segment ring (inner edge edgeR - 3, outer radius 700, fog hides it) in `<Lake />` (`render/TownScenery.tsx`) sharing the lake/river material and ONE baked shore field (`bakeShoreField` over `GROUND_BOX` + 8 m, water = `groundY < SEA_Y`), so the west lake simply is part of the sea. No forest ring, no trees/rocks/decor past `edgeR + 2` (`inSea()` in `render/natureLayout.ts`; rim boulders now sit in the shallows at edgeR +-1). Island content (river, bridge, beach + dock + ship, portal, tower, mine camp) is untouched; the walkable edge did not move.
- **Outskirts = nature kit v1 (2026-10-20, north-up camera)**: every building outside the walls is a `nature_kit_v1.glb` piece with its front
  on +z (rot 0). Layout (all in `townData.ts` / `caveData.ts` / `beachData.ts`, footprints in `townData.NK`, colliders from `kitRing()`): the
  **stable** (14, 43; open front onto the fenced paddock x 8.8-21.5, z 46.3-51; gap in its west fence), the **east park** (gazebo 28, 48.8,
  park fountain 36.4, 49.4, benches `TOWN_SEATS` along the river, stepping stones `STEP_PATHS`; keep the lane z 52-59 free), the **farm** across the
  bridge (windmill 31, 83.6 with spinning blades; farmhouse 31, 96.2 = west column and barn 41.5, 96.8 = east column; the dog + a well in the yard
  z 102-107, entered through the gap x 33-38 of the farm track's north fence; across the track, through the facing gap in its south fence, the fenced
  **animal pen** `ANIMAL_PEN` x 29-46, z 113-127: chicken coop 32.4, 117 with the egg nests + Dalla in front and seven hens, the two pigs in the east
  half; townFill keeps it clear of decor); the cows graze in the yard in front of the barn, the sheep in the pasture behind it (x 38-46, z 82-88), the **Elixir Brewer's hut** (-10.2, 106.2, door onto the tower path), the **Endless Tower**
  (31, 168 on its knoll, east of the portal clearing, door = `TOWER.door`, reached by its own east branch of the forest road), the **mine entrance** (72.4, 4.8), two tents and a siding in the
  camp, the **pier** (dock segments + posts + `fence_wood` rails, kit boats), market carts, haystacks, crops, wells, signposts. The Fishmonger and
  Mining Supplies stalls are town_kit_v2 `shop_stall_house` pieces (same keeper offsets as the town shops); the Brewer's `NPC/DOOR/CAULDRON`
  offsets in `render/Town.tsx` are for the kit hut. The portal is kit v3 and stands in the forest clearing at the end of the forest road (see Kingdom v5).
  Animals: `townData.ANIMALS` (cows, sheep, pigs, chickens, cats, dogs, ducks, horses; AI + petting + milking + riding unchanged in
  `systems/npcs.ts`) are drawn by `render/KitAnimals.tsx` (see task 9). Re-check the layout with the A* test in "QA (headless)".
- A walled town (stone wall + gate, castle on a raised terrace, plaza with the founder's statue / fountain, chapel + graveyard,
  Golden Tankard tavern, windmill) with a large outskirts: meadow before the gate, a river with a great arched bridge,
  lake + west beach with pier and fishing, farm + barns + fields, hamlets, hills (`townHills.ts`), the Endless Tower at the end of the forest road
  **Water (one stylised look everywhere, `render/waterFx.ts`):** `makeWaterMaterial` = fog-aware unlit ShaderMaterial (turquoise-to-deep tint by shore distance, caustic web, cross glints, white foam line + lapping line, swell warp, night tint). Time/night are shared uniforms `WATER_T`/`WATER_NIGHT`, written once per frame in `LookDriver`. Shore distance comes from: a baked R8 distance field (`bakeShoreField`; town lake+river = one merged mesh in `TownScenery` Lake, sea of Coral Isles rooms/camps via `bakeGridShore` from the ground mesh -> `setSeaShore`), a vertex attribute `aS` (pond in `Terrain.tsx`, dream stream in `DreamGarden.tsx`) or the analytic edge distance (`RoomWater` lakes/rivers/ice). Lava/chasm keep their own branches in `RoomWater`. New water = call `makeWaterMaterial`, never a new material.
  south of the farms, the **Adventure Portal** and, deeper in the forest, the Endless Tower (E at the portal front opens Set Out), a
  horse stable by the gate, Crystal Cave + mining camp east of the wall, the hermit trail. **Rocks (owner)**: every scenery rock of the TOWN map (grove / rim / river / trail / beach headland / lake shore) is a formation of 3-7 overlapping textured Quaternius `Rock_Medium_1-3` (`natureLayout.ts rockPut`, bigger than the old footprint; colliders unchanged); the Crystal Cave mouth is a big cliff of the same rocks (`caveData CAVE_ROCKS` / `CAVE_FORMATIONS`, opening on the right of the cliff) and the cave floors' wall ring is stacked Rock_Medium (`CaveInterior caveRockSets`). Gorath's body uses the faceted dodecahedron chunks of `render/facetRock.ts`. Run-room rocks are unchanged. Always read coordinates from
  `townData.ts` / `constants.ts SHOP_POSITIONS`; they moved many times.
- **Day/night**: `world.townTime` (480 s per day, jumps on return from a run), dawn/noon/dusk/night lighting in
  `render/biomeLook.tsx` (`TOWN_*`), stars, fireflies, glowing windows, `ui/hud/TownClock.tsx`. Runs in Greenwood
  (depth 1-10), Desert, Coral Isles and Frostpeak take their time of day from the town clock at run start.
- **Shops** (shopkeepers are the click targets; each has a name): Supplies (potions), Armory, Blacksmith (Upgrade / Craft /
  Reforge / Fuse / Shards), Pet Stable, Fortune Teller (Summon window), Warehouse (shared storage), Tech House (permanent
  gem upgrades), Elixir Brewer, Fishmonger, Mining Supplies, Skill Trainer (Master Varek). Panels:
  `ui/panels/shop/*`, `ui/panels/SummonWindow.tsx`. Prices: gear x4 at the Armory, pets x1.4; gear/pets sell for 90%,
  loot for 2x (`constants.ts`).
- **Areas** (`world.village.area`): TOWN, CASTLE (King Aldric, throne dais), CHURCH (Sister Elowen), TAVERN, CAVE
  (Crystal Cave: persistent Floor 1 with Grit + per-trip deeper floors, lantern-oil timer, `engine/systems/cave.ts`),
  **every floor has only 2-5 veins** (`rollVeinCount`: 2 35% / 3 35% / 4 20% / 5 10%; Floor 1 shows the first n of its 8 hand-placed slots, n saved in the cave save and re-rolled at each regrow, only when entering the cave), **cave gold prices** (`constants.caveGoldPrice`: the base is the price at Lv 27, the level the cave opens, then +4% per hero level above 27; flask 6,000, Miner's Kit 15,000, lantern refill 6,000 + 4,000 x lantern level). **Mining Pickaxe = a WEAPON** (`tool_pickaxe`, `itemClass.PICKAXE_ID`; retired from shops / drops, damage 3, projectileType SWORD = plain slash for every class, no class / level limit): given once by Grit's Lv 27 quest `grit_pick` (npcQuests.ts, LISTEN type; `rewardItems` skips it if already owned). While it is the equipped weapon `crates.hitCrate(.., byHand)` hits 2x. Old saves: a TOOL pickaxe (tool slot / bag / warehouse) becomes this weapon in the bag (`store.ts` oldPickaxeFix); the `tool` equipment slot is retired (kept in the type, always null, no UI). Equipping works anywhere, cave included (Bag, `I`). The boot `LoadingScreen` has no title: just 'Loading…' + bar at the bottom centre.
  HOME (the adventurer's house: bed = sleep to dream). Same plumbing for each (`pending` area, `switchArea`, exit pill).
- **Activities**: fishing (`systems/fishing.ts`, Lv 3), mining (hold E on nodes; Mining Pickaxe equipped as the weapon halves effort),
  harvest nodes, farm chores (milk/eggs, held E), pet the animals, sit on benches, **ride horses** (from the start, no unlock gate; **auto horse** (owner 2026-10-24, `village.ts autoHorse`, `world.village.ride.moveT`): OUTSIDE the town walls (`WALL` rect) ~3 s (`AUTO_HORSE_S`) of continuous walking / click-walk / guide auto-path summons the nearest free stable horse to the hero with a dust puff and the hero rides; crossing the wall line (+1.3 m, gates included) dismounts and the horse trots back to its paddock; any dismount (manual E, combat knock-down, interiors, a dialogue / shop window, arriving within 5.5 m of the portal front / tower door / cave door) restarts the 3 s timer; no timer while attacking, fishing, mining, sitting, hurt, within 9 m of those three doors or inside the walls; manual E 'Ride' / 'Dismount' unchanged;
  2x speed, horse dash), Crystal Cave (Lv 5), Gull Queen ship ticket (60 Aether Crystals -> starts a run in the Coral Isles).
- **Navigation**: click-to-walk on the ground with A* (`systems/townPath.ts`, Settings clickMove). Quest targets are area-aware
  (`systems/questNav.ts`) and feed the guide arrow, the beacon, the minimap's tracked-quest ring (`uiStore.trackedQuest`: set by Track /
  Destination, '' = automatic) and the auto-path. **Track** in the quest window and a click on a tracker row both call
  `QuestTracker.trackAndGo(key)` (auto-path in town; in a run a town target offers the teleport home first, field targets stay
  indicator-only). Tracking an offered (not yet accepted) side quest walks to its giver and the tracker shows an "OfferRow" ("Talk to
  <giver>"). NPC patrols with stuck handling.
- **New-quest dots** (`questSeen.ts`, `store.questSeen`, saved in the profile; null = seed with everything available on first load):
  ids `main:<step>` / `side:<quest>`. Red dot on the Quest menu button + Main/Side tabs (`ui/lib/alerts.ts useQuestAlert`), "NEW" pill on
  the row; cleared by `markQuestsSeen` when the quest window shows that main step / selects that offered side quest. Main steps are
  never "offered": `liveStep` puts an unlocked step straight into the log and tracker (a main talk step's dialogue has one "Okay" button (E / F / Space) that completes it; side quests are NOT auto-accepted (owner 2026-10-25): an AVAILABLE one shows in the tracker as "Talk to <giver>" (`OfferRow`, tap = auto-path) and its offer dialogue has the same single "Okay" button; no Later, no Abandon button). The travelling merchant's gear is always +2..+4. NPC and shopkeeper name tags are the hero name's size (0.78). Town guide (render/GuideArrow): a scrolling chevron trail along the walkable route (townPath `routeHintPath`) + a ring and bobbing arrow at the goal; gold = main quest, green = side quest hand-in, sky blue = the Adventure Portal (in the forest clearing south of the farms). The first card choice of every run is 3 specials, one Offense / Defense / Speed, each Rare (65%) or Epic (runCards `opener`); specials roll Rare..Mythic like stat cards (Rare 50% / Epic 75% of the Legendary value). No terracotta street kerbs / orange plaza rings any more.
- Town shows a few ambient cameo NPCs (Erin, Cabbage Man, Tilda, Corin, Nell ...) and speech bubbles; dialogue box has
  hero "reply" lines on the Next/Close button (`dialogue.replyAt`).

### 3.3 Runs (`status PLAYING`) — structure: `engine/roomDefs.ts`, `systems/director.ts`, `roomgen.ts`
- **7 biomes in this order** (`BIOMES`): Greenwood -> Marble Halls -> Sunscorch Desert -> Coral Isles -> Frostpeak ->
  Ember Wastes -> The Void. Each biome has 3 depth tiers (depths 1-5 / 6-10 / 11-15) with their own look.
  `ROOMS_PER_BIOME` 14 + boss = **15 depths**: depth 1 of every biome after Greenwood is a **CAMP**, depth 10 is a forced
  pre-boss champion (Greenwood: **the Slime King**; others a biome champion / humanoid mini boss), depth 14 is always the
  Merchant, depth 15 the biome boss. After the Void's boss comes the **Gatekeeper courtyard** (5 trial gates: Shadows,
  Horde, Thorns, Dark hunt, Herald; 5 Gate Keys open the Dark Castle) then the final fight with **Malakar** (two stages) ->
  finale -> epilogue clearing with Aelia -> ending slides (credits). The ending unlocks Hard mode (Settings), Ascension and
  the Endless Tower story step. Beating the biome boss opens ONE big portal to the next biome (no return to town; death
  ends the run). Once a biome has been completed, a 4th red-gold "Shortcut to <boss>" door appears in room 5 or 7 of it.
- **Room types** (`RoomType`): COMBAT, ELITE, MINIBOSS, FOUNTAIN, MERCHANT, TREASURE (chest, sometimes 2-3), SHRINE
  (optional challenge, once per biome), CRYSTAL (harvest-only cavern), CAMP, DUEL (dark hero), GATEKEEPER, BOSS.
  Clear all enemies -> 1-3 exit portals (ruined stone arches, E or click to walk in; reward icon on each). Rewards: upgrade
  card, gold, Aether Crystals (the "Crystals" door), gear, heal, gems, chest picks. Boss Key door appears from depth 10-13.
- **Room objectives / twists** (`systems/roomEvents.ts`): Defend the Totem, Rescue, Treasure Goblin, Hunt; twists Traps, Dark
  (Shadowcaster), Cursed, Golden. **Biome hazards** (`systems/biomeHazards.ts` + biome-specific features in `roomgen`):
  spikes, quicksand, tide puddles, lava rifts, brambles/spores, ice sheets/icicles, void rifts + gravity flips.
  **Stationary hazards / war machines** (`systems/roomTraps.ts` + `render/RoomTraps.tsx`, set up in `director.enterRoom`
  after the biome hazards, only in COMBAT / ELITE rooms; kinds, count and strength scale with depth, Greenwood d1-3 only
  gets bomb barrels / vines): ballista (locks a lane, fast bolt), catapult (lobs a boulder at where you were: floor circle +
  short stun), magic tower (charge ring, then a 360 degree ring of slow orbs, rotated half a step each volley), fire bars
  (rotating cross), fire jet (warn / blast / rest), rooting vines (root 1 s, a dash breaks free), freezing pools (slip via
  `trapMods.grip` + `bossFx.addChill`, 4 stacks freeze) and clusters of bomb barrels (`crates.ts` EXPLOSIVE_BARREL, chain
  reaction, now also hurts the hero through a short red ring). Burn ticks are x`HERO_DOT_MUL` like every ticking hazard (jets use
  `env: true`, bars / jets apply BURN). Fair placement: clear of arrival / exits / station / props / each other, turrets hug the
  rim. QA: `roomTraps.dbgTraps` forces kinds. Fire bars, jets also burn monsters.
  A room with stationaries has ONE kind, max 3 pieces. **Destructible** (siege weapons, magic towers, breath statues; `TrapObj`: hp from
  `trapHp`, `hitRoomTraps` from `damageEnemiesInRadius`, projectiles (once each, hit radius ~ projectile radius), meteor / charge / smite /
  blades / consecrate): hit flash + sparks, a small HP bar (instanced, enemy bar shader) once damaged or aimed at, break burst + `DESTROYED!`,
  rubble heap, 4 gold + xp pickups. **Targeting**: `player.ts` picks the nearest live piece when no monster is clearly closer (1.5 u
  hysteresis, range 22) into `trapAim.obj` (autoAim.id = -1 then); `getAimDir` / `aimPoint` / `autoTarget` / axe throw length follow it;
  a click on a piece sets `trapLock` (`target.selectAt`, cleared by `clearTarget`); the AUTO bot walks to and swings at it during FIGHT.
  **Fire / frost statue** (`TRAP.STATUE`, dbg `dbgTraps.statue` 0 fire / 1 frost): stone dragon head on the rim, telegraph 1.4 s (glowing
  mouth + two lane strips + wedge, tracks you for 60% then locks), breath 2 s sweeping 0.5 rad, cone 11.5 m (0.55 -> 1.5 m half width),
  tick 0.4 s: fire = 0.9% maxHP env damage + BURN, frost = 0.6% + SLOW + chill stack every 0.8 s; cooldown ~7 s. Weights: Ember 38, Desert 26,
  Frostpeak 26 (frost), Void 22 (half frost), Swamp 12, Marble 8, Greenwood 5 (room 5+).
  Harvest nodes appear in ~half the rooms (hand-harvest only). Wanderers (story characters, max one per biome), ally
  fighter once per biome, Riruru (rare harmless blue slime, Greenwood). River/lake stages, rolling hills beyond the props.
- **Camps are hand-authored transition paths** (`engine/campPaths.ts` `CAMP_LAYOUTS`, 7 layouts, waystation mid-path with
  Storage + Training Post; `render/CampPath.tsx`). Camp -> Greenwood has no camp (the first biome starts in a combat room).
- **Cards** (`engine/runCards.ts`): after clearing a card room pick 1 of 2 (25% three) cards of COMMON..MYTHIC rarity; Death
  Defiance, special cards; skill cards are no longer offered; picks are viewable in the Run Upgrades panel (Tab).
  **Picker extras (`ui/screens/WaveReward.tsx`, store `refreshCards` / `polishCard`)**: *Refresh* rerolls all offered cards (R key / pill under the cards): every hero has 1 free per run (`tech.FREE_REFRESHES`) + 1 per Tech "Card Refresh" tier (4 tiers); *Rarity Up* ("Upgrade rarity (n)" pill under each card, Shift+1-4) raises ONE card one tier (COMMON>RARE>EPIC>LEGENDARY>MYTHIC; there is no Uncommon card tier), numbers and frame follow (`runCards.rarityUpCard`); every card can rise except the Dash Charm (Quickdraw Flask max Legendary); the formerly fixed cards roll a rarity too (owner 2026-10-24): Shadow Step -6/8/10/13/16% dash CD, Second Breath restores 20/25/30/40/55% HP+MP, Surge of Fury (Rare+) +60% / full Ultimate, Legendary and Mythic also +8 / +15% ult charge speed for the run, Aegis (Rare+) 60/80/110/150 HP shield, Death Defiance (Epic+) revives at 40/50/70% HP (`runCards.dashCut` / `defianceHp`); charges = Tech "Card Polish" tiers (3), 0 without. Per-run counters `store.cardRefresh` / `cardPolish` are reset where `runPicks` resets (run start). *Lucky Start* (Tech, 1 tier): while `runPicks` is empty in an ADVENTURE run in biome 0 the offer always holds an Epic+ card (also after a Refresh). *Build trend* (always on): `runCards.cardCat` sorts cards into OFFENSE / DEFENSE / UTILITY ("Speed") / MAGIC; `trendCounts(runPicks)` (derived from the store, no extra state) multiplies a category's offer weight by 1 + 0.25 per pick (cap x2.5), at most 2 cards of the leading category per offer; the picker shows "Build: Offense" when one category leads.
- Death = GAME_OVER (loot, xp and room gold kept); the Game Over screen's "Return to town" runs `engine/deathFlow.leaveRun` (see **Death flow** under Dreams). Ankh of Life is a choice on death (15 min real-time cooldown).
- `depthWave` feeds the old wave scaling; enemies also scale with hero level (`enemies.ts LEVEL_HP/LEVEL_DMG/LEVEL_REWARD`).

### 3.4 Other modes (Endless Tower building deep in the south forest, east of the portal clearing = hub window `ui/screens/SetOut.tsx`)
`runInfo.mode` is `'ADVENTURE'` or `'TOWER'`; the tower family shares the TOWER rules (no item drops, no potions/Ankh,
healing -40%, no EXP; gold + Aether Crystals instead; `combat.towerMode()`):
- **Run-room floors (Zelda look, 2026-10-22)**: `render/Room.tsx` `RoomGround` = per-vertex colour zones (soft fringes round dirt / frost / ice patches; Greenwood paths are clean dirt trails, Sunscorch big sandstone flags, others flagstones; light paved rim band) x a baked 512px detail texture per `GroundStyle` (`groundDetail`: grass tuft marks + clover + emissive flower dots, bevelled cream marble tiles, sand ripples, bluish snow drifts + emissive glints, basalt Voronoi slabs with glowing amber seams, violet void tiles with star speckle). `groundMaterial()` is shared with `CampPath.tsx`. A low merged kerb (`buildKerb`, one draw call, skipped for Coral Isles whose rim is foam + turquoise shallows) rings every arena; the tower floor has a cobbled cream platform + torus kerb. Marble `ground` colours in `roomDefs.ts` are light (the warm lighting tints them).
- **Endless Tower**: round arena floors, elite every 3rd, champion every 5th, boss every 10th; milestone rewards every 10th
  floor (`towerRewards.ts`); best floor per class in `progress.towerBest`.
- **Daily Trial** (`dailyChallenge.ts`, Lv 15): seeded daily 5-floor climb with 2-3 modifiers, score, streak. First clear of the day pays `dailyReward`: 8,000 gold (+10% per streak day, max +60%), 40+ gems, 60 Aether Crystals; every 7th day +60 gems + 1 Epic shard.
- **Endless Waves** (`endlessWaves.ts`, Lv 30): survival in one arena, boss every 5th wave, minis on 5n+3, stacked bosses
  from wave 20; milestone rewards 10/20/30/50.
- **Ascension 1-10** (`ascension.ts`, tab appears after the first ending): stackable hardships on adventure runs.
- **Hard mode** (Settings toggle, unlocked by the first ending): x1.5 gold/XP, better epic+ and card odds (`runMods.ts HARD_*`).
- **Dreams** (`dreams.ts`, 17 Font dreams): one per return from a run, Hades-style; Aelia dreams are a walkable
  Greenwood clearing (`runInfo.dream`), class MEMORY dreams are a haze overlay; sleeping in the hero's house plays the
  next due one; an adventure death plays the due Aelia dream straight away (Death flow below). The "true ending" needs 10 clears + the dreams seen (`dreams.trueEndingReady`).

- **Death flow (owner, Hades-style, `engine/deathFlow.ts`)**: an ADVENTURE death never lands in the town square. Game Over "Return to town" -> `leaveRun(victory)`: (1) rolls a quest unlock (`store.rollDeathUnlock`), (2) if an Aelia Font dream is due (`dreams.nextDream`) the hero goes
  straight from the death screen into the dream clearing (`runInfo.dream` + `dreamView.pending`, `startMode('ADVENTURE')`, no town load) and `wanderers.talkWanderer` wakes them in bed (`bedWake`), else (3) `bedWake.on` + `resetGame` = awake in bed at home (`village.wakeInBed`);
  a class MEMORY dream (`DreamOverlay`) plays over the bed. After waking, `announceUnlock` shows the "Someone knocked while you slept..." notification + a short dialogue (waits while a dream dialogue is open; the dream wake-ups call it again). Endings (victory): plain return to the plaza + a guaranteed unlock. Tower / Daily / Waves / showcase keep their old return (`leaveRun` returns false) and the "To do in town" popup. Sleeping in the bed still plays any due dream (`dreamHooks.sleep`); abandoning a run from the pause menu still returns to the plaza.
- **Deploys (owner 2026-10-25)**: Vercel stopped building after many small pushes in one day (likely its daily build limit); batch changes into fewer pushes.
- **Free-range hens (owner 2026-10-25)**: 7 hens wander the open grass south of the animal pen (2 more stay in the pen by the coop) (`townData.FREE_RANGE` x 39 z 134, no colliders there), and the egg nests are 6 spread over it (`NESTS`); Dalla stands in the pen beside the coop. The coop stays in the pen.
- **Cave veins + cave chests (owner 2026-10-25)**: `caveData.rollVeinCount` gives 3 (42%) / 4 (40%) / 5 (12%) / 6 (6%) veins per floor (Floor 1 has 6 slots). Deep floors hide a treasure chest 30% of the time (`CAVE_CHEST_CHANCE`; cave.ts `DeepFloor.chest`, a 1-hp `CHEST` crate in the slot after the veins, E pill 'Open Treasure Chest'; it does not count toward unlocking the stairs). Every CHEST crate (runs and cave) now also has 40% gems / 30% 1-3 Aether Crystals on top of its item + gold.
- **Town chests refill daily (owner 2026-10-25)**: `townChestLogic` saves an opened hidden chest as `<id>@<local day>` in `chestsOpened` (older days are dropped on the next opening; `tickChests` re-syncs the lids when the day changes), so every chest can be opened once per day.
- **The beggar (owner 2026-10-25)**: Old Tobin (townData NPC, beside the plaza fountain). `engine/beggar.ts`: one 1,000 gold donation per local calendar day (dialogue.ts `beggarDialogue`, custom offer button); ten days in a row pays 60,000 gold and he leaves town for good (`npcs.inArea` hides him); a missed day resets the streak. Saved per character in localStorage (`aether.beggar.<charId>`).
- **Plaza fountain + horse statues (owner 2026-10-25)**: the plaza's middle holds a big fountain (`townData.PLAZA_FOUNTAIN` x 0 z 2, `render/PlazaFountain.tsx`: a two-tier storybook fountain built from lathe shapes, cream stone, blue water, falling water sheets, a sparkling droplet jet, ripples, lily pads; collider r 4.1; arrival spot moved to z 7.6); the two horse statues (`qtVillage.HORSE_STATUES`) now flank the road in front of the Adventure Portal (x -0.6 / 10.6, z 150.2, facing town; townFill keeps 2.4 m clear). The small SW park fountain (WELL_POS) was removed (owner 2026-10-25); its lawn and benches stay.
- **Pocket chests + chest loot (owner 2026-10-25)**: HALLS side pockets hold a treasure chest 75% of the time (one per room, `roomgen` pocket loop; the archer towers still stand there, 3.5 m+ off the chest). `director.chestLoot`: gold always, 50% an item, 40% gems, 30% 1-3 Aether Crystals. The full map card is landscape (16:10 canvas, fitted to both sides).
- **Hero trial (showcase) keeps achievements (owner 2026-10-25)**: `endShowcase` restores the snapshot except `meta` (achievements, titles, goal counters earned in the fight stay; the borrowed Mythic set does not count for the Mythic achievement, goalsTracker). The trial bag is 99 health + 99 mana potions, and `player.usePotion` allows them although the trial runs on tower rules (`towerMode() && !showcase.on`); the usual 70% HP / MP rule still applies. Small buttons (`.rpg-btn-sm`, e.g. Equip / Unequip title) are a visible light pill again (a later rule had made them transparent).
- **Difficulty curve rebalance (owner 2026-10-25: "biome 1-2 one-hit, biome 3 hard, Coral Isles wrecks a Lv 46 Legendary hero")**: monsters no longer grow with the full hero level: `enemies.monsterLevel()` = the hero level up to the biome's level (`biomeLevel(b)` 8 + 7 per biome: 8 / 15 / 22 / 29 / 36 / 43 / 50), then only 40% of every level above it; per level +6% HP / +4% damage (was +10% / +6.5% on the raw level). Depth HP curve `enemyDefs.waveHpMult` 1 + 0.22w + 0.005w² (was 1 + 0.16w + 0.01w²), biome HP bonus +12% per biome (was +15%). Conquered biomes (`runMods.VET`) softened: HP x1.2, damage x1.15, spawns x1.2, speed x1.05, shield chance 12%, attack cooldown x0.85, tricks x0.8. Net: a Lv 46 hero meets ~45% of the old monster HP everywhere (Coral Isles now ~ the old biome 3); a hero at the biome's level meets 84% (biome 1) down to 42% (biome 7).
- **Ship catch-up cards (owner 2026-10-25)**: a run that starts past biome 1 (the Coral Isles ship, `runInfo.startBiome`) gets `runInfo.catchUp` = 4 card picks per skipped biome; they chain right after the first card reward (`store.selectUpgrade`: 3 normal cards per pick, after any Guardian's Spoils picks), so a skipping hero is not card-less against biome-4 monsters.
- **Run cards balance (owner 2026-10-25)**: every stat card steps up by about the same ratios as Sharpness (weak ones raised: speed, crit, cooldown, mana, Shadow Step); % cards (Sharpness, Haste, Wind Step, Impact) ADD up on the run's starting value (`runCards.pctDmg` etc.) instead of compounding; Max HP / Defense cards are lifted at offer time to 6 / 10 / 15 / 22 / 35% of the hero's current total (`store.withCardText`); Impact is offered half as often; damage reduction from all sources is capped at 60% (combat.ts, was 80%). The Dash Charm card shows no glyph.
- **Necro scaling (owner 2026-10-25)**: Summons farther than `TELE_R` (22 m) from the hero teleport back beside it (a purple puff at both ends). summons start stronger and grow less: `minions.BASE_MUL` 1.35 on every summon's damage and HP, `UPG_K` 0.6 on talent / gear minion damage, haste, life and the HORDE perk; Raise Dead skill level counts as sqrt(lvMul) for skeleton damage, +5% HP and +2% armour per level (max 20%). Necro ranges: basic reach 15 (was 17), Plague Ground cast 20 m / radius 6.5 +0.3 per level, Soul Step 9.5 + 0.4 per level. The full map stays open after a click (white ring + gold dot at the walk target) and is see-through (card 55% / canvas 82%).
- **Summon status effects + barrel targeting (owner 2026-10-25)**: minions carry `burnT/burnDps, poisonT/poisonDps, stunT, slowT` (world.ts); `minions.minionDebuff(i, type, dur, dps)` applies one (float text on a fresh one, golems stunned half as long, the ally is skipped) and `minionTraitHit(i, traits)` maps monster traits (POISON / STUN 30% / SLOW). Monster melee on a summon and enemy shots that hit a summon (FIRE_BOLT / debuff 2 burn, POISON_ARROW poison, BOLT / debuff 1 stun, ICE_SHARD slow) apply them; updateMinions ticks the DoTs (a DoT kill goes through damageMinion), stun skips the summon's turn, slow = 60% speed. Clicking a barrel / crate / pot (`target.selectAt` -> `crateLock` + a proxy `TrapObj` with `proxy: true` in `trapLock`) makes it the attack target like a clicked stationary; the lock drops when the crate breaks.
- **Optional tower archers, lost trail, right-click dash (owner 2026-10-25)**: `enemyDefs.OPTIONAL_KINDS` (GOBLIN_ARCHER, LAKE_HYDRA, GARGOYLE) are not counted in `director.aliveCount` (enemies.ts), so they never hold up a room clear (trap stationaries never did); `onCleared` poofs the leftovers (`enemies.poofKind`). Clicking the full map walks there (town: `village.walkTo`; run: `target.clickMoveTo` with room nav). `render/EnemyGuide.tsx`: in a FIGHT, after 5 s without any `enemyHit` (its goal is published as `target.lostGuide`; a hint only, the hero never walks it by itself), a red chevron trail follows the roomNav A* route to the nearest non-archer monster. A right CLICK (no camera drag) on the scene = dash (`input.rclickDash` holds a virtual Space for 2 frames, read by aim.ts). The full-map popup is portalled to `document.body` (the minimap box is zoomed / offset).
- **HUD toggles + range ring (owner 2026-10-25)**: the desktop corner pill AUTO (world.autoBattle) draws a `SpinRing` svg (two gold arcs spinning) round their icon while on; state is React state (the old classList toggle got wiped by re-renders). Touch AUTO uses the same ring. The minimap has an expand button (`.mm-expand`) for the full map (card up to 920 px). `render/RangeRing.tsx`: in runs, a soft dashed circle at the basic-attack reach (`player.heroRange`) fades in while any monster is within 30 m.
- **Guide trail follows the auto-walk (owner 2026-10-25)**: while the hero auto-walks (`world.village.go.on`), `render/GuideArrow pickTarget` uses `village.autoWalkGoal()` (the walk's real target) instead of the quest pick: gold for a main-quest walk, green for a side-quest walk, sky blue for anything else (a clicked shop / NPC / door).
- **Full map + AUTO (owner 2026-10-25)**: clicking the minimap or pressing M opens a centred full-map popup (`Minimap.tsx FullMap`: the same baked terrain fitted to the card, every enemy (red / violet elite / boss), station, exits (grey while inactive), NPCs in town, the hero arrow; Esc / click outside closes). Minimap enemy dots have a dark rim. AUTO buttons (desktop `CornerButtons`, touch `TouchControls`) show a spinning two-arc gold ring (`.auto-ring`) while on. Setting `autoChase` (off by default): AUTO only walks to enemies when it is on (player.ts auto-chase block). Zoom + pan (owner 2026-10-25): mouse wheel, two-finger pinch or the +/−/fit buttons zoom (1x–5x, about the cursor); dragging pans (`fmV` in Minimap.tsx; a drag of 6 px+ is not a walk click). The horse has no dash any more (player.ts).
- **Shop rarity cap (owner 2026-10-25)**: no shop sells Mythic gear; the Armory / Pet shop stop at Rare / Epic, and the travelling merchant's gear rolls turn Mythic into Epic and keep Legendary only 5% of the time (`merchant.ts GOLD_KEEP`); its rare Legendary shard offer is 2%. (The Gem shop's Legendary / Mythic shards are unchanged.)
- **Welcome gift (owner 2026-10-25)**: the first character gets `store.WELCOME_GIFT` (15,000 gold + 1,000 gems + potions / Ankh / cores); a second or later character (`characters().length > 1` when its fresh profile is made, also on Reset) gets the gold and items but no gems.
- **Setting out (owner 2026-10-25, `village.ts readyForAdventure`)**: E at the Adventure Portal first checks the bag: full (`inventory.length >= maxInventorySlots`) -> centred prompt "Your bag is full" + Open Shop (Supplies, where items can be sold); 2 or fewer health OR mana potions -> "Low on potions" + Open Shop; if the hero cannot afford one of the low kind, the prompt gives 3 of each low kind free and its button sets out. **Royal treasury** (`townChestLogic.treasuryUnguarded`): on ~1 in 4 local calendar days Guard Odo is off duty (hidden in `npcs.inArea`), and the closed treasury chest (`TREASURY_CHESTS[0]`) offers E "Royal Treasure" once that day: 50,000 gold (`chestsOpened` keeps one `treasury:<day>` id). Tower goblin archers (`GOBLIN_ARCHER`): normal HP, half damage taken (2x defense, combat.ts).
- **Quest unlocks (owner, Hades-style, `questUnlocks.ts`)**: a new hero starts on the King's talk step (`king`; the portal stays sealed until he has spoken), which hands over `slimes` ("Trial of the Meadow", 10 slimes). **No quests by telepathy (owner 2026-10-25):** a beat opened by a death / level-up goes into `unlocks.wait` (beat ids); its main stretch / side quests stay locked (`storyCap(n, wait)`, `sideUnlocked(.., wait)`, `unlockMirror.wait`) until the hero talks to `beat.who` (`dialogue.meetBeats`: removes it from `wait`; a field main step is handed over with two short lines, a side quest is then offered normally). The tracker shows a `MeetRow` "Talk to <who>" (gold for main beats) and `questNav.mainNav` points there; tapping walks there (in a run: offer to teleport home first). Everything else is locked until a death opens it. `BEATS` = fixed order (main-story stretches, `story: '<last step id>'`, mixed with side quests, `side: [ids]`); `store.unlocks {n, miss}` (persisted in the profile) = how many beats are open. Each death/ending rolls: ~75% opens `BEATS[n]` (the first death, the 3rd death in a row after two misses, and "nothing left to do" always open one); the beat's dialogue + gift (beat 1: the King's potions) is `announceUnlock`. Locked main steps are hidden by `liveStep(state)` (used by storyLogic, tracker, markers, nav, quest log via `storyCap`; kills / hub events don't count); locked side quests report `LOCKED` from `npcQuestStatus` (reads `unlockMirror.n`, kept in sync by store.ts) so no marker / dialogue / log row. Old saves (no `unlocks`): `sanitizeUnlocks` opens every beat up to the last one already reached (story step past it, or one of its side quests accepted / done). To add a quest to the order: append a Beat (never reorder: `n` is a prefix count). **Level-up unlocks**: every hero level-up (town or run; `deathFlow.ts` listens to the `levelUp` event, not in Tower) rolls `LEVEL_UNLOCK_CHANCE` (70%) in `store.rollLevelUnlock`: it opens the next not-yet-opened SIDE beat at or after `n` (main-story beats are skipped), recorded as beat ids in `unlocks.early` (optional, old saves valid; `sideUnlocked(id, n, early)`, mirrored in `unlockMirror.early`). `n` and the main order are untouched; a death roll skips beats already in `early` (`nextBeatIndex`) and drops the ones `n` passed. Announce: notification "Someone has a new request for you..." and, in town with no dialogue open, the beat's dialogue; in a run only the notification. The red dots follow `npcQuestStatus` automatically.
- **First quest guarantee**: `director.slimeQuestLeft()` -> while `slimes` is the live step, Greenwood (biome 0) COMBAT / TREASURE packs get a guaranteed slime group (at least 6, up to the kills still needed) in `rollPack`.

- **Showcase fight (new characters)**: `characters.createChar` marks the character in localStorage (`engine/showcase.ts`); the first time they stand in town (after title / prologue) `ui/screens/Showcase.tsx ShowcaseLauncher` calls `store.startShowcase`: a snapshot of the whole store is kept, `showcaseLoadout.ts` lays a temporary overlay (class level 50, every skill 5, 6-piece Mythic +9 Aether Sovereign set with perfect lines, max Mythic pet, all talents, auto-attributes), the run starts in a one-off Marble Halls boss arena (`director` hooks: pack + 2 champions + Gorath, `SHOWCASE_DEPTH`), ult starts full and charges x8 (`combat.ts`, `abilities.ts`). `endShowcase` (victory after the outro line, death, or the Skip button / Esc) restores the snapshot and returns to town; `writeProfile` is blocked while `showcase.on`, tutorial hints / spot saving / Ankh are skipped. Intro / outro lines in `Showcase.tsx`.
- **Daily Trial popup + mode icons**: `ui/screens/DailyPopup.tsx` offers today's trial once per game start (Lv 15+, reward unclaimed); `TopBars.tsx ModeIcons` adds Daily / Endless Tower / Endless Waves icons next to the Run Upgrades / trophy / codex row (locked = dimmed + lock, they emit `openSetOut {tab, remote}`).
- **Sleep at home**: E at the bed (`village.sleepAtHome`): short fade (`dreamFx.SLEEP_FADE`), `townTime += 8/24`, HP + MP full, then the next due dream plays. **Mana Bloom** (`MANA_BLOOM` crate kind, hold E in run rooms, +45% MP, ~18% of harvest nodes). Non-calm rooms add one extra bloom 55% of the time (`roomgen.ts`). Monster heart drops are a **MANA orb** 40% of the time (PickupKind 'MANA', restores max(25, 20% max MP), blue shard in `render/Pickups.tsx`). Slimes / splitters (Slime King too) take 40% poison damage. The Slime King's 30% shield has no BossWard bubble (shown on the boss bar only). **Summon cutscenes**: the Gem altar plays `public/video/summon_gem.mp4` (6 s), the Crystal altar `summon_crystal.mp4` (8 s), tap to skip, falls back to the card deal if one fails (`Dialogs.tsx SUMMON_VIDEO`, phase 'video'). **Preload**: `npm run build` runs `scripts/gen_preload.mjs` first, which lists every image/video in `public/` into `public/preload.json`; `LoadingScreen` fetches those (max 9 s) and counts them in the bar. Red dots on craftable Workshop rows / categories / the CRAFT tab and on brewable elixirs (`ui/lib/alerts.ts canCraftRecipe / canCraftSlot / canBrewElixir`).

### 3.5 Combat and classes
- Controls (`engine/input.ts`, listed in Settings > Controls = `KEYS_KB` in `ui/screens/PauseMenu.tsx`; keep in sync):
  WASD move · **F hold = basic attack** (no auto-attack any more; every class attacks while walking at ~88% speed right after a swing; the AUTO-battle toggle is an opt-in bot, default off) · 1/2/3 class actives (hold to aim,
  release to cast; tap = auto-target) · Space class dash · R ultimate (needs full bar) · Z / X health / mana potion · E
  interact / loot (hold = harvest, chores) · G auto-path to the tracked quest · V reset camera · I bag · C hero sheet ·
  J quests · O achievements · Tab Run Upgrades (runs) · Esc pause / close. There is no K / skills hotkey: skills are learned
  at the Skill Trainer or a camp Training Post. Mouse: click an enemy = lock target (`systems/target.ts`); Settings
  `clickMove` (default on) = left-click ground to walk; `aimAtCursor`, `autoSkills`, auto-battle toggle on touch.
  Controller: full gamepad support + menu navigation (`engine/input.ts pollPad`, `ui/lib/padNav.ts`), input-aware hints
  (`ui/lib/inputMode.ts`, `ui/components/PadBtn.tsx`). Touch: joystick + ATTACK hub + skill arc (`ui/hud/TouchControls.tsx`).
- **Camera**: free MMORPG orbit (left or right drag on the scene / one-finger drag = orbit, wheel / pinch = zoom, max
  zoom-out 1.15 in `input.ts DIST_MAX`; `zoomUnlocked` default on). Movement is camera-relative (`engine/camera.ts camRel`).
- **Unlock levels** (class level, max **50**, `classLevels.ts`): skill 2 Lv 4, skill 3 Lv 8, ultimate Lv 10, dash Lv 1
  (`DASH_UNLOCK_LV`), regen Lv 2, class passives Lv 2/4/6/8. 3 SP at start + **2 SP per level up to Lv 9, then 4 / 5 / 6 / 7 per level in the 10s / 20s / 30s / 40s** (`classLevels.spGainAt` / `spTotalAt`, owner 2026-10-25): a whole class (239 SP) is trainable right at Lv 50 (246 SP); old saves got the difference once (`sp3` flag).
  Dash: one use per 5.5 s (`player.ts DASH_CD`, -0.3 s per dash level), no charges. Potions: 30 s cooldown
  (`constants.POTION_COOLDOWN`), only drink at <= 70% of the bar, restore a flat 100 (Big 200), cap 50 each. Auto-potions setting.
- **Dash Charms + projectile resist**: `dashMods.ts` (data: `DASH_MODS`, numbers, `PROJ_RESIST`) + `engine/systems/dashMods.ts` (runtime). **A once-per-run card** (owner): the `DASH_CHARM` run card (a random charm, Epic plaque, weight 0.55) is offered until one is taken; it sets `runCards.dashMod` (reset each run) and `chosenDashMod()` reads it. The Skill Trainer only lists the charms (`store.dashMods` / `setDashMod` are legacy, unused). Charms: Mirror Step (enemy shots touched mid-dash become player shots, x1.5 dmg), Guard Step (aegis shield 12% max HP for 2.5 s after the dash), Blade Step (hits enemies passed through for 80% weapon dmg + small knockback, once each; dash's own damage x1.25), Swift Step (dash CD -20%, +25% move speed 1.5 s). Tinted trails via the `dashFx` event (`render/VFX.tsx`); the dash tooltip names the charm. Enemy projectile hits pass `proj: true` to `combat.damagePlayer`, which applies `PROJ_RESIST` (Knight 25%, Barbarian 15%, Necromancer 10%, Archer / Wizard 0); shown as "Projectile resist" on the Stats tab.
- HP and incoming damage are both doubled (`store.HP_INFLATE` / `DMG_INFLATE`); stat caps in `store.STAT_CAPS`.
- **Classes** (all have 3 actives, a dash, an ultimate, passives; kits in `abilityDefs.ts`, `systems/abilities.ts`, `skills.ts`):
  Archer (ranged, Lightpiercer charge), Wizard (Arcane Shield passive replaces Storm, Fireballs),
  Barbarian (boomerang axe, Cross Slash, Whirlwind, Bloodrage Leap), Knight (sword arcs, Shield Wall, Judgment, Divine Avatar,
  Consecration/Smite/Radiant Burst), Necromancer (minions in `systems/minions.ts`, Raise Dead, Bone Ward, Plague Ground, Army of the Dead golem).
  Gear is class-gated by wear group (`itemClass.ts`: Heavy = Knight+Barbarian, Light = Archer+Necromancer, Arcane = Wizard;
  Wizard and Necromancer share weapons).
- **Hero knockback / knockdown**: `combat.knockHero(fromX, fromZ, force, downSec)`, fed by `damagePlayer(..., { ...KB.SLAM })` (`KB` presets in combat.ts: FLINCH 0.5 u, PUSH 3.2, HEAVY 4.5, SLAM 5 u + 0.75 s down, CRUSH 6 u + 0.9 s). Eased slide over 0.2 s through `resolveObstacles` (player.ts), DOWN pose in `render/Hero.tsx`, 0.6 s invuln after the get-up, ~1.6 s no-chain window; Shield Wall / Divine Avatar / giant form / ult / Radiant shield / heavy Bone Armor resist the knockdown.
- **Enemy traits + smarter monsters (2026-10-21)**: `engine/enemyTraits.ts` (`TR` bitmask on `Enemy.traits`, rolled in `spawnEnemy`: chance grows with biome + depth, elites ~3x; Heavy = knockback resist, Steadfast = CC wears off sooner, Warded = half elemental damage, Venomous / Corroding / Dazzling / Chilling / Concussive / Shover (knockback that cancels the cast + pauses basic attacks, `hooks.cancelCast`) / Crusher (knockdown), Flurry = 2-3 melee strikes, Quickdraw = faster shots + shorter wind-ups). On-hit effects: `combat.applyTraitHit` (via `damagePlayer` `src` / `tr`; telegraph zones carry the bits in `zone.aux`, projectiles in `p.traits`). Shown as a colour wash (`render/Enemies.tsx`) and chips in the target frame. Hidden innate bits `HIND_SLOW` / `HIND_ROOT` (kinds, some elites, all bosses) go through `combat.hinder` (diminishing returns: no perma-root). Ordinary monsters move +11% (`MOVE_MUL`); (owner: dodging is OFF, `ENEMY_DODGE = false` in enemies.ts; the code stays) agile kinds + elites could dodge incoming hero shots / ground skills (`tickDodge`: a short eased sidestep, ~2x speed fading to a walk over 0.32 s, never a blink; chance by depth, never while casting), melee packs fan out (`packAndFlank`), nearly dead ones fall back once while the rest push in, ranged kiters strafe while reloading and back off when closed in (`kiteMove`).
- **Elemental enemy shots (2026-10-21)**: `enemies.ts` `elemShot` / `elemHit`: mages / archers sometimes loose `FIRE_BOLT` (burn),
  `BOLT` (fast lightning, 0.35 s stun with a 3.5 s grace), `ICE_SHARD` (`bossFx.addChill`, 4 stacks freeze; frost wisps / wyrmlings
  always), `POISON_ARROW` (poison); never in Greenwood d1-3, chance grows with biome + depth. Casters shoot faster (Cultist orb 8 u/s,
  Void Eye 8.5). Render: `render/Projectiles.tsx` (fire = orange core + flame trail, lightning = white-blue streak with sparks,
  ice = pale crystal, poison = green-tipped arrow with drips).
- **Giant rooted bosses (2026-10-21)**: Elderroot, the Tide Hydra and Glacius never walk (`isRootedBoss`, `rootedHome` in
  `enemyDefs.ts`; `Enemy.rooted / rootX / rootZ`, pinned in `updateEnemy`, no bounds clamp so the Hydra's body can lie beyond the
  rim). **Elderroot**: radius 4.6, rooted a little behind the arena centre, solid trunk (the hero is pushed out round it); arena-wide
  root lanes (38 u), Branch Sweep (5 lanes one after another, `BT.LASH`), Crushing Roots (slam ring round the trunk + thorn ring),
  vines cone 24 u, seed pods, brood, Ironbark. **Glacius**: only head / neck / claws / wing bones show (`render/GiantBosses.tsx`),
  the head sits 3.4 u inside the far rim (radius 4.4); frost breath 40 u, ice lanes 56 u, Hailstorm (replaces the dive bomb),
  Glacial Ring (`WAVE_FROST`), blizzard, brood. **Tide Hydra**: body beyond the rim, FIVE heads (`NH`, `headAnchor`; ward spare heads
  sit in a second row) with necks drawn by `GiantBosses`; Acid Barrage, Sweeping Heads (3 staggered cones), Head Slam (heads whip to
  marked circles and rest there = free hits), Tidal Surge (`WAVE_TIDE`). Boss bar, interrupt meter, wards, stagger, winded windows
  are unchanged (they live on the boss enemy). QA: `scratchpad` scenario `gp2_giant.mjs` style: `debugJump(biome, 14, 'BOSS')`.
- **Camera** (owner 2026-10-23): drag up / down always tilts (PITCH 0.55..1.3, no longer locked to the diorama angle); mouse wheel / two-finger pinch zooms IN only (`world.camera.uz` 1 .. `input.USER_ZOOM_MIN` 0.62, used by CameraRig); V resets yaw, tilt and zoom.
- **Minimap**: 1.2x the design size, the hero is a white-rimmed gold arrow (no smiley face), and the map darkens from 17:00 (full by 20:00, light again 04:00-07:00; town clock, a run keeps its start time).
- **Title logo**: the owner's painted logo `public/art/ui/logo.webp` (source `art/Aether Survivor_ Golden Fantasy Emblem.png`); `TitleLogo` falls back to the drawn SVG wordmark if the image fails.
- **Daily Trial card / tower hub**: wide two-column card (details | big reward tiles with painted gold / gem / crystal icons, `.dcr`); the tower hub window is wide with its tabs as a left column (`.so-split`).
- **Side gates** (owner 2026-10-23, `townData.SIDE_GATES` / `SIDE_GATE`): open passages through the east and west walls at z 9.6 (where the z 11.7 towers stood; the wall runs are split, two small towers flank each passage, townFill keeps the passages clear). Walk straight through, no prompt. The East Gate is held by the guard Brannoc (NPCS, standing beside its doors; a guarded gate has no Look pill, his Talk pill explains it) + townGates 'east' (kind 'guard', invisible collider, `minLv: 40` read from heroRank) until level 40. The beach gate is always open. Each side gate has a small copy of the main gate arch (`TownScenery.gateArch` with `SIDE_ARCH`, same top design); while the East Gate is closed, two shut oak doors stand in its arch (`TownGates` kind 'guard').
- **Toy trees** (owner 2026-10-23): `render/toyTrees.ts` builds the round oak, layered pine, palm and pink blossom as vertex-coloured clay-toy geometry; `natureKit.TOY_TREES` swaps them in for the kit_v3 pieces at load (same names and footprints, so colliders and layouts are unchanged).
- **Ember lava floors** (owner 2026-10-24): `engine/lavaFloor.ts` (pure TS, deterministic per room seed) generates lava as discs for Ember (biome 5) COMBAT / ELITE rooms (incl. HALLS): winding branching streams + blobby pools (normal), or in ~30% of non-HALLS, non-river COMBAT rooms a "heavy" inverse (discs = ROCK: central island + islands + narrow bridges + rock rim, everything else lava). Centre (0.34 baseR), start / station / exits / traps / lakes / colliders stay lava-free. `lavaAt(x,z)` = O(1) lookup in a 0.5 m Uint8Array grid (built once in `setupLavaFloor`, called from `director.enterRoom` after `setupRoomTraps`); `zones.ts lavaUpdate` slows (0.7) + BURNs the hero unless dashing and burns monsters a little. Render: `Room.tsx RoomGround` rasterises `lava.discs` with `pathMask` and `groundPath.applyLavaShader` (dark crust rim, flowing molten core, emissive via `totalEmissiveRadiance`, time = `lavaTime` uniform). Crystal Cave floors with the LAVA hazard use the same generator (`caveLava(layout)`, cached; `caveData` no longer makes lava pools; `cave.ts` burns via `gridAt`, `CaveInterior` applies the shader to the floor, minimap draws the discs). `lavaDbg.heavy` forces / forbids heavy mode for screenshots.
- **Frostpeak ice floors** (owner 2026-10-25): `engine/iceFloor.ts` (pure TS, deterministic per room seed, modelled on lavaFloor) paints 2-5 BIG irregular ice sheets (core disc + lobes + tongues; HALLS: smaller chamber-sized sheets) on Frostpeak (biome 4) COMBAT / ELITE / TREASURE rooms; ~15-45% of a normal room, no small patches. Start (9.5 m), station (6.5), exits (5.5), centre (0.22 baseR), traps / pools / chest / liquids stay ice-free. `iceAt(x,z)` = O(1) 0.5 m Uint8Array grid, built once by `setupIceFloor` (director.enterRoom, after `setupRoomTraps`). Hero: `player.ts` velocity lerp rate = 12 x 0.18 while steering, x 0.07 while letting go (long glide; dash speed bleeds off slowly = slides further; click-walk still works). Walking monsters: `biomeHazards.ts iceMobs` (slide velocity lerps to the AI's at 3/s; not bosses / minis / swarms / stationaries). The old small `hz.ice` sheets are gone (icicles stay). Render: `Room.tsx` rasterises `ice.discs` with `pathMask` + `groundPath.applyIceShader` (pale cyan glossy sheet, noise-contour cracks, frosty rim, low roughness).
- **Ice-laser stationaries** (Frostpeak only, `TRAP.LASER` in `roomTraps.ts`, drawn in `render/RoomTraps.tsx`): crystal turret on the rim; idle (faces you) -> 1.0 s telegraph (thin floor line, tracks you 0.45 s then locks the lane) -> 1.0 s beam (34 m long, 0.4 m half-width, one hit per shot: 9% max HP ICE damage x depth scale, `freezePlayer(1.0)` + SLOW 4 s total; dash / i-frames pass through) -> rest 2.5-3.5 s; start staggered. 2-3 per room (+35% one frost breath statue), HALLS mix uses it as the main kind; HP via `trapHp(9 hits)` (+60% hp / half damage like all stationaries), collider, in `trapAt` so heroes / pets / skills damage it. Frostpeak has no fire bars / fire jets. Ice traps (pools, lasers, floors) are Frostpeak-only.
- **Quaternius nature kit** (owner 2026-10-24, CC0, credit "Nature models: Quaternius (CC0)" in MainMenu / Ending / README / public/models/CREDITS.md): `public/models/nature_qt.glb` (~2.7 MB, 12 WebP textures at 512 px, 66 named pieces: CommonTree / Pine / TwistedTree / DeadTree 1-5 at <=2.5k tris, `CommonTree_n_lo` / `Pine_n_lo` ~700-tri LODs, Bush_Common(_Flowers), Fern, Flower_3/4 Group+Single, Grass x4, Clover x2, Mushroom x2, Plant x4, Pebble x6, Rock_Medium x3), built from the raw OBJ/MTL/PNG in `art/` by `python3 art/blender/quaternius_nature.py [--no-render]` (preview grid in `$QT_SHOTS`). `engine/qtData.ts` = piece lists + heights (pieces are named `qt_<node>` in placement tables); `render/qtNature.tsx` bakes it per GLB material (texture x tint x height gradient, alphaTest cards, radial leaf normals, leaf batches do not receive shadows) and draws ONE `BatchedMesh` per material (chunked `<Inst>` fallback without multi-draw). Used in: (1) town outskirts: `natureLayout.qtForest` swaps the generic oak / birch / layered-pine trees OUTSIDE the walls for CommonTree / Pine variants sized like the toy tree they replace (full models on the island, `_lo` LODs up to 30 m past the edge, toy trees beyond; blossom / fruit / willow / palm and everything inside the walls stay toy; colliders untouched); (2) walk-through decor `townFill.QT_DECOR` (bush + flowers, flower groups, ferns, grass, clover, pebbles, mushrooms; clumps in the parks, round flower beds, wall feet, house front corners, meadow verges, river banks; placed only where `blocked()` is false, thinned on LOW / MEDIUM by `natureLayout.qtDecor`); (3) run rooms: `Props` takes `qt={{biome, v}}` from `Room.tsx` and `qtPlan` picks per biome: Greenwood TREE -> CommonTree (variants 0-1) / TwistedTree (Darkwood), PINE -> Pine, DEAD_TREE -> DeadTree, ROCK -> Rock_Medium + pebbles, bushes / mushrooms / Laetiporus conks at tree feet; Marble Halls twisted + dead trees; Desert / Ember dead trees + rocks; Frostpeak pines + rocks. Obstacle positions / colliders are the room's own. (2026-10-24 owner) Greenwood rooms (and the biome camp): bushes always Bush_Common(_Flowers) (the procedural spiky bush is only for biomes with no qt plan), walk-through ground dressing in `Props` (`plan.ground`: grass / clover / ferns / flower groups / pebbles + edge hedge bushes, density x `q.forest`, kept off obstacles / station / chests / portals / traps / liquid; the camp only dresses the feet of its scenery) and `RockPath_*` stepping stones (10 flat pieces added to the GLB, `QT_PATH`) along the same winding trail the ground shader paints (`Room.tsx` path formula, replaced the grey blob slabs for GRASS). Greenwood has NO stone kerb / pale rim band (`RoomGround`: `style === 'GRASS'` skips `buildKerb` + the rim tint; other biomes keep it). Trees everywhere (town incl. inside the walls, outskirts, run rooms, camp) are Quaternius except beach palms + pink blossom; sized 4.8-7.6 m (~1.4x the old toy size, crowns widened), `_lo` LODs past the island edge (`natureLayout.qtForest`, `Props.tree`).
- **Painted icons** (owner sheet `art/image.png`): Tech House cards use `public/art/tech/<techId>.webp`; every gold / gem glyph (`CoinGlyph` / `GemGlyph`) is `public/art/ui/hud_gold|hud_gem.webp`; the Mana Cost / Ult Charge / Dash Charm run cards use `public/art/cards/emblem_<TYPE>.webp`; the Leviathan pet has `items/pet_leviathan.webp`.
- **South-of-plaza row**: Madame Zora (FORTUNE, the summon shop) and the Tech House now stand at (9.6, 19.8) / (17.2, 19.8) facing the south street, in line with the Armory, each with flower boxes on its path (owner: no lamp posts in front of these two shops); houses took their old East Rise spots. The avenue to the gate has mirrored lamp pairs (z 13.5 / 20 / 26.5 / 33), mirrored flower boxes and three benches (backs to the road) at z 16.8 (west only) / 29.8.
- **Quest tracker look** (owner 2026-10-23): cream parchment cards (last `.qt-row` block in index.css): round coloured badge (gold main / blue side / green done), dark brown title, count bubble, distance chip.
- **Card Rarity Up cost** (owner): charges rise with the tier, `runCards.polishCost` = Common to Rare 1, Rare to Epic 2, Epic to Legendary 3, Legendary to Mythic 4 (no per-card / per-biome limit; `store.polishCard`). Reward card titles are an SVG text arc (a smile) over the ribbon (`WaveReward.tsx` `svg.tc-name`). The reward screen's Refresh button sits at the last card's right edge on the title row, or right of the title when that would cover it (few cards), or under the title on narrow screens.
- **Boss HP bar** (`ui/hud/BossBar.tsx`, owner 2026-10-23): the real boss's bar is docked top-centre under the gold / gems row (`.bb-top`, min(26rem, 72vw) wide); Malakar's illusion bars still float over the decoys.
- **Boss interrupt meter** (`systems/interrupt.ts`, bar in `ui/hud/BossBar.tsx`): hero hits fill it during a heal channel or a boss / champion special; full = cast cancelled + stagger; drains when idle. **Ticking damage** (poison / burn / bleed, rifts, hazard zones, brambles, lava) on the hero is x`HERO_DOT_MUL` (4, `combat.ts`; boss auras opt out with `noDotMul`; discrete trap / icicle hits are not multiplied).
- Combat layer: monster tricks (`tricks.ts`), statuses, backstab/shield blocking, elite big attacks (`eliteBig.ts`), winded
  free-hit windows on bosses, follow delay (`heroTrail.ts`), combo meter, aimed casting (`aim.ts`), no contact damage
  (monsters wind up a strike).
- **Bosses** (`bosses.ts`, `bosses2.ts`, `bossMech.ts` = shared ward/barrier/rain layer, `bossFx.ts`, `bossSpecials.ts`,
  `humanBosses.ts`; `render/Bosses2.tsx`, `WarMachine.tsx`, `HumanBosses.tsx`): Greenwood **Elderroot** (Treant), Marble
  Halls **Gorath** (Golem), Desert **The Dune Colossus** (war machine: 5x model scale 20, radius 10, very slow walker, 2x attack areas, fought in a 56 m rounded-square arena with a pulled-back camera), Coral Isles **The Tide Hydra**, Frostpeak
  **Glacius** (Wyrm), Ember **Ignar** (Warlord, a fire version of the Knight: Flame Crescent / Radiant Burst / Blazing Guard / dash+slash, giant fireballs, 360 pillar rings, up to 3 dark knights `BOSS_DKNIGHT`, burn + capped fire trails via `bossFx.firePatch`; Burning Form at 50% hp grows devil wings), Void **Void Herald**; the Greenwood depth-10
  **Slime King**; **Malakar** (Lich, mini-boss in crypt biomes and the final two-stage fight); humanoid mini bosses Varn /
  Sable / Rook; dark hero duels (`darkHero.ts`). Each boss has a ward once per fight at 50% hp, periodic absorb barrier,
  spread-out impact salvos, an arena per biome (`roomgen.BOSS_ARENA_R`, radius 27-39 (Sunscorch square 44), kept small so the hero cannot just run to the edge).

### 3.6 Progression and economy
- **Per-class permanent levels** (`classProg` in the profile; `heroRank` is a legacy alias = current class level that
  gear/crafting/quests read), XP curve `250 * lv^1.5`, kill EXP x0.85 and quest EXP shares in `classLevels.ts`.
- **Talents** (`talents.ts`): radial tree per class (4 branches, ring-level gates `RING_LEVEL` 1 / 8 / 18 / 30 / 42, **3.3 points per level** = 165 at Lv 50 vs a full tree of 158-164, owner 2026-10-25; a save with more spent than its level allows gets a free talent reset on load), full-screen pan window.
- **Attributes** (`attributes.ts`): STR/DEX/INT/VIT/LUK, 3 + 2 per level points, hex tree + allocate window. The tree's footer has Reset + **Auto** (spends every free point by the class split and saves at once); the allocate window keeps its own Auto (stages for review).
- **Gear**: six tiers Common/Uncommon/Rare/Epic/Legendary(orange)/Mythic with level gates **1/6/12/18/24/30**
  (`constants.RANK_REQ`); drops may be one tier above the equippable cap. Catalog = one item per class per slot per rarity
  (`itemCatalog.ts`, ids `c_<class>_<slot>_<n>`, older items `retired`), rings/amulets with special effects, weapon perks
  (`weaponPerks.ts`), item sets, bonus lines (`affixes.ts`: slots per rarity, perfect rolls), Mining Pickaxe weapon. +N upgrades
  (2026-10-25: upgrade gold = price x level x 0.36, cores = ceil(L^2/6); upgrade-core drops halved in combat / shrine / room events; Upgrade tab has a gear picker grid (worn first, "E") and clicking a worn piece in the bag paper doll selects it while the Upgrade tab is open; Bulk Sell has a Materials mode (craft mats by rarity, never potions); town day = 960 s.)
  at the Blacksmith (cores: Upgrade/Refined/Radiant, fail/shatter at +8/+9), +7 and above glow. Crafting (`crafting.ts`,
  Workshop window), Reforge (`reforge.ts`: Reforge Stone = reroll all / one line, **Tempering Oil = swaps each line's stat TYPE but
  keeps its quality** (same % of the tier value, perfect stays perfect), **Binding Seal** locks a line (`ItemAffix.locked`: Stone + Oil
  skip it, persists on the item, max lines-1 locks, unlocking is free; Gem Shop 28 gems, chests / bosses / merchant / summon supplies),
  Augment Rune fills empty slots),
  Fusion (5 of a tier -> next tier, gear/shards/pets), Recycle in the bag (gear -> shards + cores).
- **Gear stat ladder + grade** (owner 2026-10-25): base stats are low and every rarity is a big jump (`itemCatalog.ts` `TIER_LADDER`
  Common 1 / Uncommon 1.7 / Rare 3.06 / Epic 6.12 / Legendary 12.85 / Mythic 29.55, i.e. x1.7 / 1.8 / 2.0 / 2.1 / 2.3 per step;
  `EPIC_ANCHOR` 0.70 puts Common 30% under the previous ladder, Legendary -14%, Mythic +3%, so the endgame matches the monster
  curve as before: `waveHpMult` ~14x at depth 30, ~45x at depth 60, plus hero-level scaling). The catalog values are the **MID**
  grade. EVERY gear piece (all six tiers, except the fixed-stat Mining Pickaxe) has a **grade** (`grade.ts`, `Item.grade`):
  LOW x0.85 / MID x1.0 / HIGH x1.15 (price x0.9 / 1 / 1.1). Odds: drops, summons, fusion, quest rewards 30% / 52% / 18%
  (`GRADE_DROP_ODDS`); crafting 12% / 58% / 30% (`GRADE_CRAFT_ODDS`); starter gear and shop (Armory) copies are MID; a High
  Epic+ still needs +6 levels (`constants.itemReq`). Shown as a "High Epic" / "Mid Rare" / "Low Common" pill in the tooltip
  (`ItemTip`, `.tt-grade`) and a soft rarity-tinted glow behind HIGH icons (`ItemSlot`). Saves: stored item stats are never
  rescaled by the 3-grade change; gear stamped LOW by the old 2-grade system (plain tier value) is relabelled MID once per
  save (profile / shared warehouse flag `grade3`, `legacyLowToMid`), old HIGH stays HIGH; gear with no grade at all (pre
  2026-10-21) is still rescaled once by new/old ladder and becomes MID (`migrateGear`). Bonus-line values in `affixes.ts` are unchanged.
- **Currencies**: gold (`GOLD_SCALE` 10), gems, **Aether Crystals** (real bag item `crystals.ts`; daily/weekly goals and
  achievements pay crystals only), shards (bag stacks, `shards.ts`). **Summon** (Fortune Teller window): Gem Altar, Crystal
  Altar (crystals), Gem Shop tab (gear/supplies, no pets), pity at 60 / 240 (`store.summonPity`). Tech House = permanent gem
  upgrades (bag slots, warehouse, potion power, gold/xp/hp, bigger lantern, and the run-card tiers Card Refresh x4 (30 gems x2^tier), Card Polish x3 (40 x2^tier), Lucky Start x1 (150)). Elixirs at the Brewer (`elixirs.ts`).
- **Pets**: six tiers, growth Lv 1-20 + 3 evolution stages (`petGrowth.ts`, `petActions.ts`: feed loot/shards, evolve),
  fusion (`petFusion.ts`), elemental attacks, follow the hero in town and runs.
- **Quests** ("less quest, more roguelite": there is NO Quest Board / bounty board and no daily offers any more). Main story
  `story.ts` (`STORY_V` 7, fast-paced: NO town tutorial any more (the Mira tour, potion / pet / summon / gear / forge / skill / warehouse / brew steps are gone, so `questFree` freebies never trigger; the first pet is still free); chain = Garrick -> the King (gives 3 HP + 2 MP potions) -> per biome a briefing talk, one hunt, the depth-10 champion and the guardian -> Malakar -> Endless Tower -> true-heir arc. Old saves: `sanitizeStory` maps every older version by step id through the id lists (`V1`..`V6`); a removed step continues at the next surviving one). Side quests `npcQuests.ts`: only 7
  (LISTEN / DELIVER / INTERACT / TALK / KILL types, logic `systems/npcQuestLogic.ts` + `storyLogic.ts`, no slot cap):
  Hollis "Milk Run" (milk cows x3), Dalla "Egg Hunt" (5 eggs), Pip "Where Is Biscuit?" (find the cat), Pip "A Secret for the
  Hermit" (talk to Old Wend; also gates his sunstone gold gift), Sister Elowen "Restless Graves" (12 zombies in runs), Rodric
  "The Lost Tankards" (2 Silver Goblets from run crates / barrels), Erin Lv 30 "Beyond the Rocks" -> "Frost That Splits Stone"
  (Grit tip, 3 Wyrm Frostscales; shatters the rockfall = mine shortcut, `rockfallCleared`). NPCs whose quests were cut (Hodge,
  Garth, Fenn, Maren, Brenna, Tilda, Nell, Marlo, Hilda ...) stay as flavour. Stable horses are rideable from the start (Hilda's
  quest was cut). Run-side "bounties" that remain are roguelite things: the HUNT room objective and Brother Fen's wanderer
  bounty. Old saves: unknown `npcQuests` ids are dropped by `sanitizeNpcQuests`, the old `quests` / board state is ignored.
  Lore in `lore.ts`; Codex + Story book in `ui/screens/Codex.tsx`.
  **Pet quests + Pet Collection (2026-10-23):** Hollis gives 4 free pets by level (`hollis_pet1..4` in npcQuests.ts, chained, not BEAT side quests so they open on level alone and auto-accept): Lv 3 Green Blob (10 slimes), Lv 12 Vampire Bat (20 bats), Lv 22 Shield Turtle (3 elites), Lv 32 Spirit Wolf (6 elites). `store.petSeen` = template ids of every pet species ever owned (per character; synced from bag / equipment / shared warehouse by `syncPetSeen` in store.ts, old saves seeded on load). `petCollection.ts` holds the milestones (thresholds scale with the PETS_POOL total: 3/5/8/11/14/all of 17: +30 HP, +2% dmg, +3% move, +5% gold, +3 def, +3% dmg +50 HP), applied in `calculateStats` via `petMirror.n`; Codex has a COLLECTION tab showing tiles + milestones; reaching one shows a toast. **No item-fetch pet skills** (owner): Vampire Bat = `LEECH` (every 5s bites the nearest enemy, heals the hero 60% of it, max 6% max HP), Mimic Chest = `CHOMP` (every 8s leaps + 1.6x bite + 1s stun; goldFind stat swapped for crit damage). `COLLECT` / `LOOT_BURP` stay in the type for old data only. Summon odds: Crystal altar Legendary 0.15% / Mythic 0.01%, Gem altar Legendary 0.9% / Mythic 0.08% (`store.ts SUMMON_WEIGHTS / GEM_SUMMON_WEIGHTS`). Potion carry cap 50 health / 50 mana (`store.POTION_CAP`): pickups and shop buys stop at the cap, but Gem-altar summoned potions stack past it (`summon` inserts them directly).
- **Goals / achievements** (`goals.ts`, `goalsTracker.ts`, `achievements.ts`, `ui/screens/Goals.tsx`): daily/weekly goals with
  chests, ~30 achievements with titles (shown under the name).
- **Hero Rank wording is gone**: UI says Lv / Level everywhere.

### 3.7 Audio
The owner's recorded music (`public/audio`: town, biome1-7, boss, final_boss) plus SFX samples (click, level-up, stage-clear,
hit, epic drop, buy, summon) in `engine/audio.ts`; procedural SFX/themes are the fallback. Town music holds until the hero is
in town.

### 3.8 Performance features
Frustum-culled instanced chunks + distance cull to the fog end (`render/distCull.ts`), camera far plane follows fog, adaptive
DPR (`PerfGovernor`), NPC view culling + animation LOD, merged NPC meshes, range-limited per-frame uploads, hidden empty
effect pools; the town's nature kit (trees, forest, fences, buildings ... ) is ONE `BatchedMesh` (+ one for window glow) and every animal species is one instanced, shader-posed mesh (see task 9). Judge perf by draw calls / triangles / sim ms, not SwiftShader FPS.
**Download size (owner 2026-10-25: Vercel storage).** Big kit GLBs (nature_qt / qt2, village_qt, kit_v3, town_kit_v2, nature_kit_v1, creature_kit_v1) are meshopt-compressed in FILTER mode (`art/tools/squeeze_glb.mjs`: no quantization, attributes decode to their original types; re-run it after a Blender script rebuilds a kit). Art WebPs are re-encoded at quality 74, music at 96 kbps, the summon videos at CRF 31. `vercel.json` turns off preview deployments for `claude/*` branches (only `main` deploys).

### 3.9 UI style direction (owner-driven)
**Minimal (owner, v12 block at the end of `index.css`):** as few containers as possible; content floats; group by spacing, not boxes.
**v11 (owner, 2026-10-20; font + window sweep, the LAST block of `index.css`):** the UI font is **"M PLUS Rounded 1c"** (Rodin-like rounded humanist
sans; "Zen Maru Gothic" is the fallback, both loaded in `index.html` at weights 500 + 700, Nunito removed). Titles = 700, upright, normal case (no
Cinzel caps, no letter-spacing); body = 500; dialogue = 500 upright (no italics anywhere in the UI). **Cinzel is only for the 3D town labels
(`render/label.ts`).** v11 also re-skins every window (bag, hero sheet, talents, trainer, quest log, goals, codex, settings, all shops, character select,
title, game over, level up, rewards, run upgrades, set out, tooltips, dialogs) to the same rules: 22 px panels, 14 px tiles, pill buttons, segmented pill
tabs, flat translucent charcoal, no frames / gradients / dividers, selection = lighter fill + soft glow. Prefer adding selectors to v11 over inline styles.

**v9 rules (owner, 2026-10-20, override anything below that says otherwise; the LAST block of `index.css`):**
- **No line borders anywhere**: no border, outline, `0 0 0 Npx` ring, hairline, `::before/::after` frame. v9 makes every border/outline colour
  transparent and the ring / hard-edge box-shadows were neutralised. Only exception: the touch joystick (`.tc-base`, `.tc-ring`).
- **No line or underline designs**: no tab underlines, side bars, dividers, hr, gold EXP line. The EXP bar is a soft thin rounded bar.
- **Selection = lighter fill + soft glow** (`--z-accent-glow` is a blurred glow, `--z-sel` a lighter fill), never a stroke. Tabs are a
  segmented control (selected = lighter rounded pill, others plain text).
- **Icons = flat solid white glyphs** (`ui/components/CuteIcons.tsx`, #ffffff, soft drop shadow, no circle/background), small white captions,
  soft red notification dots, hover = slight scale + brightness only.
- **Bottom bar**: ultimate (round, soft fill-meter glow) + active skills (14 px rounded tiles, art clipped, radial cooldown sweep with a big
  white number, white key chip) + dash (Space) + two round potion bubbles. No passive slots (passives with timers show as tiny bubbles under the
  HP bar, `ui/hud/BuffTray.tsx`), no corner horse/dash buttons (E interacts/mounts); AUTO is a small pill. The bar hides during dialogue.
- **Dialogue**: flat translucent charcoal, ~30 px radius, no lattice, no close X; Later / Accept / Next and the hero reply (same pill size) sit bottom-right of the box. A quest offer shows a separate rounded charcoal card mid-screen ("New Quest" / "Side Quest", goal line, reward chips: EXP, coin, gems, item icons) while the offer line is up.

**Nintendo Switch / Zelda: Echoes of Wisdom ("v8 Zelda" override layer, the LAST block of `index.css`; it replaces the earlier
Korean-MMORPG v5/v6/v7 look but keeps the v7 HUD layout)**: simple and roundy. No line containers (no gold hairlines, double frames
or corner ornaments; ornament pseudo-elements are switched off in the v8 block), soft translucent charcoal pills and rounded panels
(`rgba(30,30,34,.72)` surfaces, 14-22 px radius, soft drop shadow, no borders), Nunito (loaded in `index.html`; fallback
"M PLUS Rounded 1c", "Varela Round", ui-rounded) with bold sentence/Title Case titles (no Cinzel caps in the UI), white/cream text.
One gentle accent: cyan `#5fd3e6` (CSS var `--z-accent`) for selected/focus states as a small dot, underline or glow. Gold only on
currency icons; red only for HP and warnings. Buttons are pills: primary = cream/white fill with dark text, secondary = translucent
dark with white text. Item slots stay rarity-tinted but are soft rounded tiles. Avoid backdrop-filter on big layers.
- **Dialogue** (`ui/hud/Dialogue.tsx`): wide (62%) rounded box (28 px) at the bottom, very dark charcoal with a faint CSS diamond
  lattice, no border; speaker name is plain italic white text above the box's top-left edge; large italic body typed out
  character by character (DOM writes, a tap completes the line first); bouncing ▼ bottom-right; reply / Later / Accept buttons are
  small pills in the box's bottom-right (v10).
- **Quest banner** (`ui/hud/QuestBanner.tsx`, mounted in `GameUI`): wide soft band with an italic type line ("Side Quest accepted",
  "New Main Quest"), a big bold title and hint pills "Destination" (cyan dot; only marks the quest as tracked, no walking) and "Open Log" (quest log). Fades in, holds ~3 s, fades out. Fired when a quest is offered on the last
  dialogue line, when a side quest is accepted (the `Quest accepted:` system toast is intercepted in `Overlays.tsx`) and on main quest accept.
- **Toasts** (`Overlays.tsx`): plain rounded `.toast-pill`s with white text; only the small dot carries the colour.
- **HUD**: rounded pills, quest tracker rows as rounded cards, minimap = a round ~200 px painted map (feathered alpha-mask edge, soft shadow, terrain baked once per area/room offscreen, cream hero badge with a face, cream NPC dots with a yellow "!", red enemy dots, gate glyphs, glowing tracked-quest ring clamped to the edge), captions in Nunito.
Phones (`.compact`): bigger type, fullscreen panels, tap-to-inspect in the bag.

## 4. Open tasks and known issues

Verified against the code on 2026-10-17. Done items from older notes (Gatekeeper + gates + dark heroes, Beach ship +
captain, decor before the gate, wanderers, "skills don't work after town" fix, Korean-UI conversion of remaining wood
screens, max-level question: class level cap is 50) have been removed.

1. **Balance is unverified on real devices**: boss damage/cadence, late-biome difficulty after the HP/damage x2 and +80%
   boss HP changes, town performance on real phones (12+ skinned NPCs + wall + horses), camera framing in long corridor
   / camp-path rooms, boss rooms with new shapes. No headless balance pass has been run since 2026-10-15.
2. **Wizard is the weakest boss fighter** (last measured in balance pass 2); Malakar's final fight is long for auto-aim.
3. Character select shows the low-poly KayKit hero; the owner's reference uses painted key art (free CC0 art only).
4. Saved `bossBiomes` indices from saves made before the Coral Isles were added are not remapped (minor).
5. Ideas the owner liked but not built: village upgrades (rescued people moving into town), run events between rooms,
   a node map for picking routes (see RUN_DESIGN "Not built").
6. `README.md` is stale (describes the early siege loop); the docs in `docs/` and this file are current.
8. **Art + 3D pipeline (2026-10-20, read `docs/REFERENCES.md` and `docs/ART_PROMPTS.md`)**: painted art comes from
   owner-made ChatGPT sheets in `art/raw/`, sliced by `scripts/slice_sheet.py` (`--cutout` for magenta sheets) into
   `public/art/{skills,cards,items,ui}`; wired via `PAINTED_ART` (SkillIcons), `CARD_ART` (UpgradeIcons), `ITEM_PAINT`
   (ItemArt; drawn at scale 1.22 in slots on rarity-gradient backgrounds). Images sent while Claude works are NOT
   saved: ask for a re-send. Waiting for re-sends: weapons, armor, rings/amulets, cards 2, gear, drops, ores, fish,
   enemy/boss portraits, status icons, summon banners + card back (list in REFERENCES).
9. **Town 3D (Blender kit v2 + nature kit v1, wired 2026-10-20)**: `public/models/town/town_kit_v2.glb` (17 pieces, built by `art/blender/town_kit_v2.py`,
   weld + meshopt medium, quantized: `townKit.tsx` bakes every mesh with its world matrix) now draws all town houses, the 7 shops,
   keep, chapel, tavern, gatehouse, wall segments, lamps, planters, stalls, fountain, banners and barrel/crate clusters (instanced per
   piece: body + glow draw, chunked + culled; clutter = one merged geometry). Material colours: `townPalette.KIT_RECOLOR` (v2 names
   + the old k_* names). Town draw calls vs the old procedural town: gate 175 -> ~186, plaza 185 -> ~186, castle 140 -> ~140 (+6%
   at most), triangles 440-525 k -> 360-400 k. Rebuild the GLB: `python3 art/blender/town_kit_v2.py` then
   `npx @gltf-transform/cli weld raw.glb w.glb && npx @gltf-transform/cli meshopt w.glb town_kit_v2.glb --level medium` (never
   overlap coplanar faces: Cycles renders them black; use `B.arch` for arches). Open: round wall towers are still the old kit
   (v2 has none); hedges on the raised districts; chimney smoke uses `townData.HOUSE_KIT[kit].chimney` (nature kit: `NK_CHIMNEY`); shop FX use
   `townKit.SHOP_CHIMNEY`.
   **Nature kit v1 (wired 2026-10-20, see 3.2 "Outskirts")**: `public/models/town/nature_kit_v1.glb` (765 KB, weld + meshopt medium), built
   by `art/blender/nature_kit_v1.py` (same builder/material approach as v2, organic parts smooth-shaded, buildings flat with
   chamfered boxes). 48 root nodes: trees `tree_round_a/b/c`, `tree_pine_a/b`, `palm_a/b`; plants `bush_round`, `bush_flower`,
   `hedge_block` (2 m), `flower_patch`, `grass_tuft`, `mushroom_cluster`, `rock_round_a/b`; park `park_bench`, `park_fountain`
   (water = `awning_blue`), `stone_path_tile`, `fence_wood` (2 m), `gazebo`, `well`, `signpost`; animals `cow`, `sheep`, `pig`,
   `chicken`, `horse`, `cat`, `dog`, `duck`; outskirts `barn`, `farmhouse`, `windmill`, `stable`, `chicken_coop`,
   `mining_camp_tent`, `mine_entrance`, `brewer_hut`, `endless_tower` (~27 m with the flag), `dock_segment` (4 m, deck top y 0.55,
   posts go below y 0), `dock_post`, `small_boat`, `market_cart`, `haystack`, `crop_wheat`, `crop_cabbage`, `crop_pumpkin`,
   `crop_row`. 14 flat materials, no textures: the 12 v2 names/colours + `leaf_light` #86cc5a and `barn_red` #a8452f (add both to
   `townPalette.kitColor` when wiring; `window_glow` is the emissive one). Fronts face +Z, origin = ground centre. Triangles:
   trees 240-860, animals 520-1160, buildings 0.6-3.1k.
   **Animal rig**: each animal is an Empty root (`cow`) whose children are JOINT nodes named `<animal>_body`, `_head`, `_tail`,
   `_legFL/_legFR/_legBL/_legBR` (chicken + duck: `_legL/_legR`, `_wingL/_wingR`, `_tail`; horse also `horse_saddle`, whose origin
   equals the body's, so copy the body bob onto it). A joint node is an Empty whose origin IS the pivot (hip, neck base, rump,
   shoulder) and holds one child mesh node `<name>_mesh`: rotate/translate the joint node (leg swing = rotation.x, head turn =
   rotation.y, bob = body.position.y). Do not rotate the `_mesh` node. The joint wrapper is deliberate: `meshopt` quantization moves
   the origin of any node that directly holds a mesh to its bbox centre (that is also why static piece nodes carry a
   translation/scale, same as v2; it is visually identical), but a node with children stays exact. `windmill_blades` is the same
   (joint at the hub, local z axis = spin axis, child of `windmill`). Rebuild: `python3 art/blender/nature_kit_v1.py [--no-render]`
   (`--only=nature,animals,outskirts,scene`, `--closeup=name+name2[,yaw,pitch,ortho,y]`, renders to `$NATUREKIT_SHOTS` = `art/renders/naturekit/`:
   `sheet_nature/animals/outskirts.png` + `scene.png` farm-and-park vignette at the game camera, pitch 50, yaw 0), then
   `npx @gltf-transform/cli weld nature_kit_v1.raw.glb w.glb && npx @gltf-transform/cli meshopt w.glb nature_kit_v1.glb --level medium`
   (delete the raw/weld files). Lathe helper `B.lathe(profile, ...)` revolves closed (r, y) profiles (basins, roofs, bottles).
   **How the nature kit is wired**: `render/natureKit.tsx` loads + bakes it like `townKit` (de-quantize, bake world matrices, material colour ->
   vertex colour, `window_glow` -> separate emissive geometry; `townPalette.kitColor` has the two new colours `leaf_light` + `barn_red`;
   `natureLit()` is a smooth-shaded lit material). `render/natureLayout.ts` is pure data: every placement (piece -> instances) of the town +
   outskirts from the engine data (trees = `TOWN_TREES`, fences = every `FENCES` run, benches = `TOWN_SEATS`, buildings, dock, crops, rocks ...) plus
   the quality-scaled dressing (forest ring of 5 species, rim boulders, edge bushes, flower patches, grass tufts, mushrooms; old counts kept or lower).
   `render/NatureBatch.tsx` (mounted by `Terrain.tsx`) draws ALL of it with ONE `three.BatchedMesh` (one geometry per piece, one instance per
   placement, culled per instance, one multi-draw call) + one more for the window glow (`nightGlow` material); without `WEBGL_multi_draw` it
   falls back to chunked `Inst` sets (+ one merged mesh per 48 m chunk for pieces placed <= 4 times). Build the batches in an effect:
   `BatchedMesh.dispose()` empties it for good and React strict mode double-mounts. The windmill blades are a separate spinning mesh.
   **Animals** (`render/KitAnimals.tsx`): each species is ONE
   merged geometry (all `<animal>_*` joint meshes baked in animal space, with per-vertex pivot / part id / leg phase / coat flag) drawn by one
   `InstancedMesh`; a vertex shader (`natureKit.animalMats`: one program for all species + a custom depth material for shadows) rotates the
   joints about their pivots from per-instance values (gait phase + amplitude, head yaw / pitch, tail wag, wing flap, gallop): idle breath +
   occasional head turns + grazing, walk = leg swing + bob, tail wag, chicken / duck peck, duck waddle, horse gallop while ridden (saddle
   height `kitSeatY()` read by `render/Hero.tsx`), coat colour = `ANIMALS[i].tint`. Pose maths runs on the CPU only for animals in view, no
   allocation. Biscuit (Pip's hidden cat) is an extra cat instance. Main-camera draw calls vs the old procedural outskirts (headless probe,
   hero at the old probe spots, default quality): farm 100 -> 76, beach/dock 88 -> 80, tower clearing 83 -> 54, mining camp 141 -> 103;
   triangles 254 k -> 270 k, 264 k -> 281 k, 252 k -> 234 k, 283 k -> 270 k.
   Gotchas: `ANIMALS` indices matter (milking uses `milkCd[16]`, quest nodes 200 + index); the pier deck is walkable in the A* grid
   (`townPath` marks `DECK_RECTS`, grid box now starts at x -100); never put a building / fountain across the lanes of the east park or the
   farm track (the park behind the paddock was cut off once: run the A* test).
   **Kit v3 (built 2026-10-20, NOT wired yet)**: `public/models/town/kit_v3.glb` (~1.9 MB, weld + meshopt medium), built by
   `art/blender/kit_v3.py` (`--no-render`, `--only=trees,town,props,shops,interiors,scene,throne`, `--closeup=name+name2[,yaw,pitch,ortho,y,spacing]`;
   previews in `$KITV3_SHOTS` = `art/renders/kitv3/`; compress: `npx @gltf-transform/cli weld raw.glb w.glb && ... meshopt w.glb kit_v3.glb --level medium`).
   104 root Empties, each with one child mesh `<piece>_mesh` (joint wrapper like nature kit v1; fronts +Z, origin = ground centre; for wall-mount pieces
   `window_flowerbox`, `awning_*`, `window_curtained`, `painting_frame`, `banner_wall_red`, `shop_sign_hanging` the back is the z=0 plane and the
   sign hangs at y 0.2-1.0). 18 flat materials = the 14 nature-kit ones + `cream_white`, `rune_glow` (emissive, cyan), `awning_green`, `awning_red`.
   **NEW: every mesh has a vertex colour layer (glTF `COLOR_0`, RGBA) that MULTIPLIES the material colour** (material = lightest tone; canopies get a
   dark teal underside -> sun-kissed top, walls/roofs a darker base, `fortune_tent` is tinted purple through it). The loader (`townKit`/`natureKit`
   bake) must multiply COLOR_0 into its material->vertex colour step instead of overwriting it; `light_shaft` also uses COLOR_0 alpha (soft beam,
   `window_glow` material, needs a transparent/additive material). Trees (all 500-1600 tris): `tree_oak_big/oak_small/birch/fruit/blossom/willow`,
   `tree_pine_layered_a/b`, `palm_v3`, `bush_cluster`. Town: houses `house_corner_L` (4.9k), `house_row_3`, `house_bakery`, `house_flowerbox` (3.9-4.9k),
   `wall_tower_round`, `adventure_portal`, `ship_big` (14 m, bow +Z, waterline y 0), `bridge_stone_arch` (10 m along X), `bridge_wood_small`, `stairs_stone`,
   `statue_hero`, `hedge_arch`; props `beach_umbrella/crates`, `fishing_net_rack`, `campfire`, `flower_bed_round/long`, `laundry_line`, `notice_board`,
   `lamp_post_double`, `banner_pole(_red)`, `market_tent_red/green`, `fruit_crate`, `flower_cart`, `cliff_rock_large`, `rock_cluster_small`, `reed_cluster`,
   `lily_pads`; shop flavour (blacksmith/pets/fortune/potions/armory/warehouse/tech) + generic `potted_plant_a/b`, `awning_red/green`, `shop_sign_hanging`,
   `window_flowerbox`; interiors (castle throne room / chapel / tavern / house / cave: floors 4x4, walls 4 m with +Z = room side, throne, dais, carpet,
   `light_shaft`, pews, bar, fireplace/hearth with glow, bed, bookshelf, crystals, mine cart ...). Small props 130-900 tris, houses 3.9-4.9k.
   Authoring helpers worth reusing: `B.blob` (noise-displaced soft sphere), `B.tube` (swept tube), `B.surf`/`B.cloth` (parametric sheets/cloth), `B.lathe`
   with `lobes`, per-piece `b.grads[material] = fn(co, normal)` vertex-colour gradients, `b.jit` / `j=` hand-made irregularity. Never overlap coplanar
   faces (Cycles renders them black). Rebuild preview takes ~1 min per sheet (Cycles CPU, 20 samples).
   **Creature kit v1 (built 2026-10-21; WIRED for monsters, pets, bosses and boss adds)**: `public/models/creatures/creature_kit_v1.glb` (~1.9 MB), built by `art/blender/creature_kit_v1.py`
   (reuses kit_v3 helpers; `--no-render`, `--no-compress`, `--only=`, `--closeup=`; previews in `$CREATURE_SHOTS` = `art/renders/creatures/`). 63 root Empties:
   33 monsters, 8 bosses + 5 boss adds, 17 pets (every ENEMY_DEFS kind and pet id except the humanoid `HUMAN_BOSS` / `DARK_HERO`, which keep the KayKit rigs).
   Each root has joint Empties `<name>_body/_head/_legL/_wingR/_tail/...` wrapping one `<joint>_mesh` (pivot at the joint, front +Z, ground-centre origin, metres,
   in-game size with def.scale applied; some nested, e.g. hydra necks). Roster, joints, sizes and animation hints: `docs/CREATURE_PLAN.md`.
   Wiring: `render/creatureKit.tsx` (non-suspending loader `useCreatureKit()`, bake, `jointPose`, `getEnemyModels`, pet `makeRig`/`animateRig`) + the per-kind table
   `render/creatureMap.ts` (`MONSTER_KIT`, `PET_KIT`). All 33 non-boss kinds (also elites / mini-bosses, which are the same kinds), the 5 boss adds (`BOSS_SAPLING/WYRMLING/IMP/CRYSTAL/HYDRA_HEAD`) and all 17 pets use it. The big
   non-instanced bosses use `render/bossKit.tsx` (`useBossRig(piece, mats)` = joint tree of a kit piece): Golem + Lich (`Bosses.tsx`), Elderroot / Hydra body / Ignar / Void Herald
   (`Bosses2.tsx`), Dune Colossus (`WarMachine.tsx`), Glacius' head + wings (`GiantBosses.tsx`; neck and claws stay procedural). Each keeps its old rig + state-machine targets and
   **Angular boss pass (owner 2026-10-25, "bosses look like cute baby toys")**: Elderroot, the Hydra body, Ignar (+ devil wings) and the Void Herald no longer use their kit GLB pieces (`KIT_PIECE` in `Bosses2.tsx` is empty: add a kind to switch back), and Glacius' head / jaw / wings in `GiantBosses.tsx` are procedural again (no `useBossRig`). All are rebuilt with `render/bossShapes.ts` (`limb` tapered 5-6 sided prism, `spike`, `lump` = detail-0 icosahedron, `blade` = flat octahedron) under flatShading: long wedge snouts, swept horns, slanted slit eyes, spiked plates, jagged finger-bone wings. Golem (rock), War Machine, Slime King and the hydra HEADS (`boss_hydra_head`, still kit GLB; Blender is not installed here) are unchanged. Keep new boss parts angular: no spheres as body parts, no plain cubes.
   only drives the kit joints from them (old meshes hide once the kit is in). `HUMAN_BOSS` / `DARK_HERO` and anything without a kit piece keep their old models (also the fallback until the GLB has loaded).
   **Interiors on kit v3 (done 2026-10-20)**: `render/kitV3.tsx` is the general kit-v3 loader: `useKitV3()` bakes the GLB once (de-quantize, world matrix, material
   colour x glTF `COLOR_0` -> vertex colour; `*_glow` materials -> emissive geometry; `light_shaft` -> additive no-depth-write beam geometry using COLOR_0 alpha),
   `kitV3Box(piece)` gives a piece's local bounding box (colliders), `buildKitV3Static(kit, items)` / `<KitV3Static items />` merge `{piece,x,y,z,rotY,scale,tint,glow}`
   items (`glow` recolours the emissive parts, e.g. cave crystals) into ONE lit + ONE glow + ONE beam mesh (shared materials `kitV3Lit/Glow/Shaft`). `render/interiorKit.ts`
   = placement helpers (`floorGrid` squeezed 4 m tiles, `floorCells` free outline, `wallRun` / `onWall` by room side N/S/W/E, +Z of wall pieces = room side). The five
   interiors (`CastleInterior`, `ChurchInterior`, `TavernInterior`, `HomeInterior`, `CaveInterior`) are item lists on it (3-5 kit draw calls each; castle hall ~100k tris + wings, chapel
   ~45k, tavern ~35k). Every south wall is cut low (camera looks in from the south) around a gate arch / timber door frame. Room sizes, NPC homes, exits, sit points
   unchanged; furniture positions + colliders live together in `castleData / churchData / tavernData / homeData / caveData` (TABLES + TABLE_STOOLS, ARMORS,
   HALL_PLANTS, CHURCH_PLANTS, TAP_BARRELS / TAP_PLANTS / TAP_CRATES, HOME_WARDROBE / SHELF / DESK / BARREL, cave `colliders()`): move a piece there AND in the colliders.
   Cave: kept on its ORIGINAL procedural look (owner preferred it; floor rings, rocks, crystals, cart, bench all from `buildFloor` / `buildProps`), not kit v3. Cave HUD sits below the gold / gem counters. QA: grid-BFS over the collider circles reached every NPC home / exit / sit point / vein.
   **Castle wings (owner 2026-10-25, layout "Castle inside")**: the throne room (x +-14.5, unchanged: King, dais, straight carpet, exit pill at z 19) now has a WEST wing (Dining Hall north with a 12 m banquet table + chairs + food, Kitchen south-west, Library south-east) and an EAST wing (King's Bedroom north with the big bed, Study south-west, Treasury south-east with chests, gold heaps and the crown). The whole interior is x +-35, z +-20 (`castleData CASTLE_EXT`, `CASTLE_ROOMS`). Doorways are 4 m (`GAP_W`, `doorway_arch`): hall -> dining / bedroom at z -10, hall -> library / study at z 11, dining / bedroom -> the two south rooms through the low wall at z 2 (x +-30 and +-20), and the two south rooms of a wing through a gap at z 11 (x +-25). `castleData WALLS` (wall runs) + `DOORS` drive BOTH the two-sided kit wall pieces (`CastleInterior segPieces`, low walls `LOW_WALL_SY` where the camera looks over them) and the collider circles (`wallCircles`); all wing furniture lists (`DINING_*`, `KITCHEN_*`, `LIBRARY_*`, `BEDROOM_*`, `STUDY_*`, `TREASURY_*`) sit in the same file next to `CASTLE_COLLIDERS`. Props the kit lacks (chairs, long table, food, kitchen counters, desks, armchairs, chests, gold, crown pedestal, globes, oval rugs) are rounded primitives merged once in `render/castleProps.ts buildWingProps` (~54k tris, 2 draw calls, vertex colours, shared kit materials); 4 more flickering point lights (one per wing quarter). The interior camera has no bounds (it follows the hero), the minimap `bakeInterior` draws one tile per room + door bridges + room names. QA: grid-BFS (0.2 m cells, hero pad 0.5) reaches every free cell of all 7 rooms from the spawn, every doorway clears >= 3.0 m and the carpet line to the King stays clear. Weapon racks moved to z +-4.6 (off the new doorways); the old window / shaft at z +-10 are gone. Wing NPCs (`townData NPCS`, area CASTLE): Cook Bramble (kitchen, walks cauldron <-> south of the prep island), Guard Pell (patrols the dining hall's north side), Guard Odo (treasury).
    **NPC wear kit v1 + look table (done 2026-10-21)**: town NPCs no longer use code-primitive overlays. `art/blender/npc_wear_v1.py` (kit_v3 helpers, imports KayKit
    heads to fit) builds `public/models/characters/npc_wear_v1.glb` (~0.6 MB): hair (tousled, side part, spiky, long, ponytail, buns, braid, curly, bob, bald+fringe, swept elder),
    beards / moustaches, hats (straw, toque, feather cap, bonnet, hood, witch, tricorn, kettle helm, nun veil, mitre, crown, tiara, bandana, beanie, flat cap), clothes (dress, apron,
    smock, robe, capes, vest, sash, scarf, tabard, pauldrons, pouch belt). Root Empty per piece, origin = attach point in its bone frame (head / chest / hips), +Z front, materials
    main / second / hair / skin = per-NPC tint roles, others fixed colour x COLOR_0. `render/npcWear.ts` bakes it once; `render/npcBuild.ts` merges the recoloured KayKit body parts
    (atlas cell -> role: skin / shirt / pants / armour), the head with its baked hair dropped (head may come from another KayKit rig = face variety) and the worn pieces into ONE
    SkinnedMesh per NPC (vertex colours, one shared material; ~1 draw call instead of 7-9 and no per-NPC overlay meshes). `engine/npcLooks.ts` `NPC_LOOKS[name]` is the look table
    (base rig, face rig, colours, wear list; `defaultLook` fallback). KayKit helmets / hats / capes are never shown; guards / knights keep armour + tabard + kettle helm.
    Previews: `art/renders/` style sheets via `--closeup`; edit a look = edit the table only.
    Head fix (2026-10-21): the KayKit ARCHER / KNIGHT / WIZARD heads have no skull under their baked hair (all of it uses the hair atlas cell), so dropping it left a hollow face mask seen from behind / above
    (hats + hair looked detached). npcBuild now KEEPS those triangles as the skull (squashed into the kit's skull box, hair colour, skin for `hair_bald_fringe`); BARBARIAN still drops its fringe. Only bones that carry vertices
    enter the merged skeleton (21 instead of 138).
10. **Camera (Link's Awakening / Echoes look, done 2026-10-20)**: `render/CameraRig.tsx` starts north-up (yaw 0) and forces pitch
   CAM_PITCH0 unless Settings "Free camera" (`settings.freeCamera`) is on; the player can always turn the camera (drag / right stick, V resets), and uses a long lens (FOV 26, pushed back
   by TELE so the framing matches FOV 40; lobby / class select keep FOV 40). TiltShift2 in `GameCanvas` (setting
   `tiltShift`, only on tiers with the composer). Next: interiors in that style (REFERENCES "Interiors").
11. Desktop only now (owner: no phone play) — phone-specific tuning is no longer a priority.
7. Process hazards: stopped sub-agents leave work in `.claude/worktrees/*` — check `git status` and `git worktree list`
   before assuming something is merged; never commit that folder.

## 5. Detailed notes (still true; condensed)

### Systems quick reference
- **Smooth walkers (2026-10-21)**: town NPC patrols (`npcs.ts updateNpcs`) walk straight to the waypoint (snap only within one step), a
  collider push-out is eased over a few frames (`pushOut(maxMove)`), and a blocked NPC stops 0.9 s then takes the next leg (no veer /
  circling). The Treasure Goblin (`roomEvents.ts` objective) is steered by `enemies.goblinFlee`: constant ~6.6 u/s, velocity eased,
  slides tangentially along the keep-in ring, excluded from dodge / flank / retreat.
- **Store vs world**: per-frame state in `engine/world.ts`; meta in `store.ts`. Profile saved debounced to localStorage,
  flushed on pagehide; separate keys for the shared warehouse (`aether-survivor-shared-warehouse-v1`), characters index,
  harvest/cave/fishing/tutorial/dream/ankh flags (`aether-survivor-*`). Old saves migrate through flags (`gold10`, `sp2`, `al1`, `mus1`...).
- **Events**: `engine/events.ts` typed bus; `hub` event (buy/summon/upgrade/craft/brew/...) feeds quests and goals.
- **Town vs run rendering**: `render/Scene.tsx` shows `Room` in a run, `Terrain/Town` in town; `render/lift.ts liftAt()`
  adds terrace/hill height on top of the engine's flat y = 0. Inside the walls the town has raised districts
  (`townData.TIERS`: Chapel Hill 1.6, Tavern Row 0.9, West Rise 1.2, East Rise 0.8; castle terrace 2.2) with stairs;
  `townLift` gives their height, TOWN_COLLIDERS fence their edges, TownScenery `addTier` draws them and lifts
  everything placed on them (put/lifted, roads in 1 m pieces). Houses, shops, keep, chapel, tavern, gatehouse, wall segments and
  street props are Blender kit v2 (`render/townKit.tsx`, `public/models/town/town_kit_v2.glb`); only the four round wall towers
  still come from the old `town_kit.glb`.
- **Rooms**: one disc/shape around 0,0 built from a seed (`roomgen.buildRoom`, `roomShape` polar table, `mapgen.installRoom`),
  only the current room exists; camp rooms use `roomShape.fixed` spots.
- **HALLS v4 additions**: (1) HallsBorder has an edge-wall pass: every stretch of the edge (1.5-2.6 m behind the floor) with no tree within 3.4 m gets a big
  8-11 m tree (cap 900), so the trees form a continuous wall. (2) **Pockets**: `roomHalls.findPockets` (BFS + EDT) finds spots >= 17 m from the shortest
  start->exit route (`halls.pockets`, max 2). `roomgen` puts stationary archer towers there (count for room clear via `feat.tx/tz`, director `fixedKind`)
  or, 15%, an optional chest (`feat.pChest` -> `world.room.chests[1].pocket`, opens any time). (3) Monsters in HALLS rooms idle until the hero is within
  `HALLS_AGGRO` (10 m) or hurts one (enemies.ts `awake[]`; wakes packmates within 7 m; bosses / mini-bosses unchanged). (4) Marble Halls: darker look
  (biomeLook), `HallsMarble` preloads its OBJ kit on the first biome-1 room (`preloadHallsMarble`), torches have emissive flames + floor light pools +
  3 real point lights near the hero (quality tier: shadows on), jars / barrels are breakable crates (`roomgen`; POT now solid in run rooms).
- **HALLS v5 additions**: (1) `isHallsRoom`: 92% of combat / treasure stages in every biome (100% Marble); `hallsType` no longer includes ELITE (elite, mini-boss, boss, shrine,
  fountain, merchant, camp, duel keep their own stages). (2) Marble Halls (`castleDesign()` in roomHalls.ts, generated per room): 4 rectangular halls (~4500-6000 m2, 2x before) in a
  chain start -> passage 1 -> middle hall (hub) -> passage 2 -> exit hall, + a side hall off passage 3; passages are straight, 18-48 m (1.5x-4x the old 12 m, capped so the chain
  stays within ~100 m of the hub = ARENA_RADIUS), arch doorways every ~14 m. `MAX_W` 480 cells, nav grid `MAX_DIM` 176. `halls.passPts` (points along corridors) -> `director.pickAnchor`
  puts 30% of the monster groups in passages. (3) Spike traps (`roomEvents.placeTraps`) sample the halls mask (never near portals / station / pocket chest); halls COMBAT rooms get
  the TRAPS twist 50% more often and twice the groups. `roomTraps`: halls rooms add 0-3 extra fire JETS and 0-2 rotating flame BEAMS (`rt.beam`, 2-4 arms of 8-12 m (x0.85 with 4) on a pillar:
  rest -> 1.5 s floor-line telegraph -> slow sweep (0.42-0.62 rad/s) that stays on for the fight; rests for good once the room is clear. The arms are solid
  (`armShove`): the hero and non-boss monsters are pushed along by an arm instead of walking / dashing through it, unless the push would leave the room). (4) `PortalGuides` (Room.tsx): chevrons follow `roomNav.navGuide`
  (flow-field descent + string pulling, cached per portal, rebuilt only when `navFlowGoal()` = the hero's nav cell changes); straight when the way is open. (5) Pocket chests
  show no light beam until `director.phase !== 'FIGHT'`. (6) Fountain room: `arenaRoom` radius 23, a moat ring (`feat.moat` + ~34 lake pools, liquid colliders gapped at 4 decks N/E/S/W,
  `onBridge` knows the decks, `RoomWater` draws them), marble island + outer paving ring (`SpecialRooms.FountainPlaza`), columns on the outer bank. `MAX_LAKES` 48.
  (7) Pets: `PetProfile.aoe` = splash radius of every basic for Spirit Wolf, Gold Dragon, Iron Golem, Phoenix, Crystal Golemling, Leviathan at any rarity (melee splash = 50% of the hit).
  (8) Coral Isles HALLS: `HALLS_BORDER['Coral Isles']` = pack-2 palms (`shore` kit: palms + beach rocks only on the sand rim), the ground sinks under passages / outside the chambers,
  the Coral sea plane shows, `render/HallsBridges.tsx` draws plank bridges over `halls.bridgeSegs` (`halls.bridge` = corridor cells outside every chamber). No TwistedTree outside deep Greenwood.
- **Marble Halls traps (v6)**: no goblin ARCHER_TOWERs in Marble (roomgen skips the pocket towers; pockets keep the 15% chest). `roomTraps.setupRoomTraps` (`marbleH`) places 1-2 siege
  weapons per pocket + 2-3 along the walls (alternating ballista / catapult, `rt.siege` max 6), long range (`siegeLong`: fire up to 95 m, bolt life 3.4 s, 90 m lane); they fire while the
  fight lasts, are destructible, and do NOT gate room clear. Marble COMBAT / ELITE halls always get the TRAPS twist (spikes, roomEvents), 1-3 breath statues, 1-2 jets, 1-2 rotating beams
  (rest after clear). Fire breath statues + jets everywhere: 1.5x length (statue 17.25 m, jets 15-22 m) and continuous direct hits every 0.25 s (`FIRE_TICK`; statue 1.6%, jet 2% max HP) plus burn.
- **Desert**: Sunscorch Desert has no spike traps (roomDefs never rolls the TRAPS twist there, roomEvents drops it, `placeTraps` returns empty). Cactus colliders (`Collider.thorn`, set in roomgen `add`) hurt on contact: `player.resolveStep` deals 3.5% max HP (scaled by depth) + 1.4 u knockback, 0.6 s apart.
- **HALLS random layouts** (owner 2026-10-25, `engine/roomHallsGen.ts`, called from `roomHalls.buildHallsLayout`): EVERY HALLS room uses a PROCEDURAL plan seeded per room (deterministic); the fixed templates below are only a QA `dbg` force / last-resort fallback (`fellBack`). **LINEAR (owner 2026-10-25):** the plan is ONE chain start -> ... -> exit (chamber i attached to i-1 with a turn of <= 1.5 rad, no loop passages), plus at most one small dead-end pocket chamber hanging off a middle chamber; `halls.order` = chamber indexes in visiting order (start chamber first, exit chamber last, the pocket right after its parent); director `sacPick` wakes sacs strictly in that order. **Exit arches:** in HALLS adventure rooms `world.room.portals[0..1]` have `pre = true` and stand (stone + dim runes, no vortex / ring / label / interaction) at the n=2 exit slots from room start; `openPortals` activates them (1 door = left arch, the right one stays dormant; boss-key 3rd door sits a bit further back); `render/Room.tsx Portals` skips the rise animation for `pre` arches. **No auto-walk in adventures (owner 2026-10-25):** the PATH pill / 'Auto: walk to next area' setting was removed (it pushed the hero into trees); `director.sacWalkGoal` stays but nothing walks to it. `roomNav` now builds its grid in EVERY run room (the monster flow field still only with water / halls, `nav.water`), so click-to-walk, the full-map walk and AUTO chase route round trees and rocks. (The older text below about spanning trees / loops / template mix is superseded.) Chamber count 2-6 (COMBAT bias 3-4, ELITE / TREASURE lean smaller), each chamber a SIZE CLASS (0 small r 8-12, 1 medium 14-18, 2 big 20-26 m; maps are never all one class, 4+ chambers often small AND big; a minimum floor area per room type; `halls.classes` parallel to `halls.chambers`), random rotation / squish (<= 1.3) / kidney bend. Connection graph = random spanning tree (every new chamber attached to an earlier one at a random angle / 9-26 m gap, 7 m of rock to all others), 0-2 extra loop passages, passages are bezier curves 6.6-10 m wide with random sideways pull that must clear every other chamber / unrelated passage; ~40% of 4+ chamber maps get a small dead-end pocket chamber (never start / exit). Start + exit = the farthest pair (distance + 8 per hop) and sit at the far end of their chamber; the hub (origin, station) is the middle chamber nearest the centroid (2 chambers: the exit one). Islands are placed per chamber (more / bigger in big ones) away from mouths, start, exit and hub. Marble Halls: same graph on axis-aligned rounded RECTANGLE halls (small 10-13 x 8-10, medium 18-23 x 11.5-14, big 24-29 x 15-18) joined by STRAIGHT lanes (7-10 m wide, 14-34 m long) with arch doorways, column rows along long walls, <= 2 statue spots at free hall ends. Every plan is rasterised and checked (`genOk`: grid fits, extent <= 102, start / exit sdf >= 4.5, station >= 3.4, exit + every chamber reachable over open cells); a failed plan is regenerated (tighter gaps, from attempt 16 / 28 one / two fewer chambers) up to 40 times, then the fixed template is used (`halls.fellBack`). `halls.variant` = 'RANDOM' for generated plans. QA: `roomShape.dbg.force = 'HALLS'` + `dbg.variant = 'RANDOM'` (always generate) or a template name. Validated headless over 200 seeds x 6 biome styles with an esbuild node script: 0 failures, 0 fallbacks (re-run for the linear chain: 1200 plans, 0 failures, 0 fallbacks, start-exit >= 42 m, `halls.order` complete).
- **HALLS rooms** (owner-approved organic floor plans, mockup `shots/halls_design/proposal.png`): ~1 in 4 combat / elite / treasure rooms
  (`roomgen.isHallsRoom`; never boss / mini-boss / camp / merchant / fountain / shrine / tower modes / the very first room). Six designs in
  `engine/roomHalls.ts` DESIGNS (soft blobs + bezier passages + islands, jittered, rotated, mirrored, scaled to ~1500-2000 m2): TWIN
  (Twin Glades), CROSS (Crossroads), CRESCENT (Crescent Walk), FROZEN (Frozen Hollows), DUNES (Dune Canyons), COLUMNS (Hall of Columns);
  `pickVariant`: Marble -> COLUMNS, Frostpeak -> FROZEN / CRESCENT, Desert + Ember -> DUNES / CRESCENT, others -> TWIN / CROSS / CRESCENT.
  The layout is a 0.5 m walkable mask + signed distance field (`hallsSdf`, `hallsPush` slides along the edge, `hallsSegClear`,
  `hallsRayStop` for blink / aim). Passages are >= ~5 m (a hard core is stamped, so noise never pinches one shut). Origin = hub; arrival /
  station / exit / shortcut spots come from `halls.*` via `roomShape.startPoint / stationPoint / portalPoint / shortcutPoint`.
  `shape.kind === 'HALLS'` (`mapgen.roomHalls()`) switches every consumer from the radial `edgeLimit` clamp to the mask: player `resolveStep`,
  enemy clamp + `isSpawnable`, pickups, projectiles (both pools), ability aim, `insideShape` (props / traps / anchors only in the open,
  >= 3.2 m from the edge). `shape.table` is only the star-convex kernel seen from the hub (fallback for unpatched radial callers; bosses
  are unpatched and never host halls). `roomNav` builds its 1 m grid for halls (monsters flow through passages whenever the straight
  line is blocked; hero click-move / auto-chase use A*); `navActive` no longer depends on `obstaclesVersion` (camp / arena builds call
  `disableRoomNav`). Looks: `render/HallsBorder.tsx` dresses the edge and the unwalkable ground between chambers with the biome's
  Quaternius pieces from ONE table, `engine/hallsBorder.ts` HALLS_BORDER (tall trees far side + on islands, `_lo` away from the edge,
  bushes / rocks on the camera side so monsters stay visible; caps 700 trees / 420 low); swap node names there when the second pack is
  baked into nature_qt.glb. Marble Halls (COLUMNS) is an indoor castle: `castle` design = rounded RECTANGLE halls (blob 7th value = corner radius), straight
  passages, quarter-turn rotation, no wobble; `render/HallsMarble.tsx` loads the Quaternius dungeon kit (`public/models/dungeon/*.obj`, copied from
  `art/`; a stray `l` line is stripped from Statue_Horse before parsing), recolours it from the PAL table (bright cream / blue / gold, red banners; the
  MTL colours are near black) and draws ONE InstancedMesh per piece: Wall_Modular along the mask edge (walls ARE the collider; low balustrade on the
  camera side), Arch in the doorways (`halls.arches`), Column / Column2 for islands r < 1.2 (3.8 m), Pedestal + Statue_Horse for islands r >= 1.2
  (`halls.statues`, each design spot kept with 30%, max 2 -> many rooms have none), banners / torches / cobwebs on tall walls, vase clusters. Outside the
  walls the ground fades to black; the floor is bright clean marble (no moss / dirt / rubble). Other outdoor biomes keep the tree / rock border.
  `CameraRig` snaps (no glide) when the hero jumps > 22 m in one frame (halls start spots are far from the hub; the glide crossed the black void).
  Headless note: SwiftShader shows a black canvas for ~5-9 s after a halls room is built (700-tree batch + shader compile); wait before screenshots. Halls skip the lava / sea ground drop. The minimap draws the mask.
  QA: `roomShape.dbg.force = 'HALLS'` (+ `dbg.variant = 'RANDOM' | 'TWIN' | 'FROZEN' | 'DUNES' | 'COLUMNS' | 'CROSS' | 'CRESCENT'`); after editing
  engine files restart vite before dynamic-import QA scripts (HMR makes duplicate module instances). Minions / pets still ignore the edge.
- **Dialogue**: speaker lines `Name:: text` (`You::` = the hero); short hero replies ride on the button.
- **Boss wards / barriers**: `bossMech.ts` (`WARD_AT` 0.5, `BARRIER_CD`), per-boss ward kinds (crystals, sporecaps,
  hellhounds, spare hydra heads, frost shell, power cores, void phase, cultists).
- **Necromancer summons**: per-source caps in `minions.ts`; when the last summon falls (in a room, hero alive) one skeleton warrior rises beside the hero for 5 s (`SRC_LAST` = 7; 6 is the run ally, once per wipe: it does not count as a summon, so it does not re-trigger or hold Raise Dead's cooldown); Raise Dead army of up to 5 (3 warriors + 2 random archer/mage),
  Bone Ward shields summons, golem ult.
  **Bone Golem ult (owner 2026-10-25)**: 50% bigger (render scale 2.85, body `mr` 1.95, reach 4.8), 20% faster attacks, its slam hits an area (`GOLEM_HIT_R` 3.4 around the target + shockwave), lasts 26 s (`GOLEM_LIFE` in abilities.ts). Every 4-6 s, if an enemy is 6-16 m away, it lobs a boulder (`golemRockAI` / `updateRocks` in minions.ts: METEOR_SHADOW telegraph 0.9 s, then 1.5x m.dmg area + short stun). When its timer ends or it is slain it explodes (`golemExplode`: 2.5x m.dmg in 6 m + BURN) and leaves a FIRE zone (aux 1 = real burn) for 5 s.
- **Debug mode** (Settings > Debug, `ui/screens/DebugTab.tsx`, `engine/debug.ts`): collapsible sections (open state saved in
  localStorage). Hero (class level set/+/max, talents max/reset, max skills, +SP, heal), Items & currency (N of EVERY crafting
  material = `CRAFT_MAT_NAMES`, bag first then warehouse overflow; gold / gems / crystals / shards / cores by amount; random gear by
  rarity + grade + slot), Run / rooms (kill all, jump to biome/room/boss, special fights, dark hero, ally), Story & world (complete
  story step, town time, reset town chests, biome shortcuts, rockfall, dreams), Toggles (god, one-hit, max skills). Styles `.dbg-*` in index.css.
- **Gear tint**: `render/gear.ts tintGear` recolours the KayKit model parts by rarity; weapons in `render/weapons.ts`.
  KayKit bone names have the dots stripped (`handslotr`).
- **Hero HP/damage tuning knobs** most often touched: `store.CLASS_MANA_MUL`, `enemies.ts` (`LEVEL_*`, `ELITE_HP`,
  `MONSTER_XP_MUL`, `bossPace`), `director.ts` (`CHAMPION_HP`), `enemyDefs.waveDmgMult`.

### Balance history (what the headless passes taught us)
Method: a Playwright harness (not in the repo) drives `updateGame(1/30)` with a bot that dodges most telegraphs, plays
"shop" progressions (equip better loot, spend points) and boss-room tests per class/level. Findings that still hold:
- Barbarian and Knight are the strongest runners; Wizard weakest at bosses; Archer was boosted (+20% base damage).
- Boss adds were capped (Hydra regrowth max 4, Lich summons only under 9 monsters, Ignar dark knights max 3, champion escort
  `MINI_MAX_ALIVE` 10) because fights ran 500 s+ or flooded the room.
- Endless Waves: late waves are slow (hp grows with depth^2); if it feels like a slog lower `waveDepth`.
- Economy: XP Lv 1 -> 10 takes ~40 min; Lv 50 estimated 15-20 h.
Absolute numbers in those passes predate the HP/damage doubling, the item-tier changes and the card rework; treat only
relative findings as valid. QA gotcha: restart Vite after every engine edit or the page imports a second module copy.

### QA (headless)
- Tailwind CDN is blocked in the container: route it to the npm package `tailwindcss-cdn@3.4.10` (`3.4.3/tailwindcss.js`).
- Pattern: launch Chromium from `/opt/pw-browsers` (never `playwright install`) with `--use-angle=swiftshader`, `npx vite
  --port <p>`, then import modules in-page via `performance.getEntriesByType('resource')` to reach `engine/world.ts` /
  `store.ts` / `engine/game.ts` and drive `updateGame(dt)` deterministically. Kill Vite with `pkill -f "[v]ite --port <p>"`
  in a SEPARATE shell call. Kill stale servers before each run.
- Gotchas (town probes): SwiftShader renders ~0.5 fps, so after teleporting `world.player.pos` wait ~14 frames before measuring or
  taking a screenshot (the camera damps toward the hero); restart Vite after editing a module the probe imports (Vite then serves
  the app a `?t=` URL, a probe's `import('/engine/world.ts')` becomes a SECOND module copy and writes to a dead `world`); a
  `pkill -f` whose pattern also appears in your own command line kills your shell.
- Outskirts layout test (kit placements, 2026-10-20): in-page `import('/engine/systems/townPath.ts')`, `findPath(0, 40.8, tx, tz, reach, buf)` from the
  gate to every outskirts shop front, door, NPC home, fishing spot (the pier is walkable in the grid), nest, well, animal home, harvest node, bench
  must return > 0 (70 targets passed) and `walkableAt(standing spot)` must hold; dump `TOWN_COLLIDERS` + `NK` footprints to a PNG to eyeball overlaps.
  Perf: hook `onAfterRender` of every mesh (town_views.mjs style) and count main-camera calls / triangles; `world.village.spawnFx = 0` hides the arrival
  beam; wait ~25 s after a teleport (SwiftShader ~0.5 fps, the camera damps).
- There is no unit-test suite: verify with `npx tsc --noEmit`, `npx vite build` and scripted headless runs.

### History (big milestones, oldest first)
v2 rebuild (engine/world split, instancing) -> KayKit heroes -> combat depth (tricks, statuses, aimed casting, combos) ->
Capacitor APK + PWA -> bosses for waves 30-70 -> Hades rooms + living town -> target lock, room shapes, tarot cards ->
F attack, facing-cast, town skills -> Oct 15: castle/chapel/tavern/cave/beach/fishing/hills, Coral Isles biome (7 biomes),
Endless Tower + Daily Trial + Endless Waves + Ascension, Necromancer + Knight, talents, class levels, crafting/reforge,
gates/dark heroes, Malakar two-stage finale -> Oct 16: gear catalog rework (6 tiers, class wear groups), quest/EXP rework,
story rewrite + true-heir arc, controller + recorded audio, bounty board v2, Slime King / Ignar rework -> Oct 17: run
cards with rarities, HP/damage x2, dreams + hero house, horses, humanoid mini bosses, biome hazards, day/night cycle,
hand-authored camp paths. For anything older than this, `git log` subjects are descriptive.

- **UI roundness (owner: crisp, not bubbly)**: corner radii live in the `v13 roundness` block at the end of `index.css`: `--r-title` 3px, `--r-btn` 6px, `--r-slot` 6px, `--r-panel` 10px (older `--z-r*` vars point at them). Change those four to tune the whole UI; inherently round things (minimap, ult orb, potion bubbles, close X, mobile skill wheel) stay circular.
