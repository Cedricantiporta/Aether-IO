# Aether Survivor — Architecture (v2 rebuild; layers still valid, gameplay section updated 2026-10-17)

Stack: Vite + React 19 + three r182 + @react-three/fiber 9 + drei 10 + postprocessing + Zustand 5 + framer-motion + Tailwind (CDN).

## Why the rebuild
The v1 code subscribed almost every component to the *whole* Zustand store while
the store was written every frame (`tickCooldowns`, `setPlayerPosition`,
`updatePassiveCooldowns`). That re-rendered the entire React tree (HUD + 3D) at
60 fps — the main source of lag. Gameplay also allocated `new Vector3()` in hot
loops, scanned all 400 enemies per bullet/skill, and used string-keyed grids.

## Layers

```
engine/            pure TypeScript simulation — no React
  types.ts         CONTRACT: runtime entity types           (planner)
  world.ts         CONTRACT: mutable world + pools          (planner)
  events.ts        CONTRACT: typed event bus                (planner)
  grid.ts          CONTRACT: integer spatial hash           (planner)
  game.ts          startRun / updateGame(dt) / stopRun       (Engine-A)
  input.ts         keyboard + pointer -> world.input         (Engine-A)
  mapgen.ts        obstacles + crates per run                (Engine-A)
  systems/player.ts, abilities.ts, projectiles.ts, combat.ts,
          skills.ts, pickups.ts, pets.ts, zones.ts, crates.ts (Engine-A)
  enemyDefs.ts     archetype stats table                     (Engine-B)
  systems/enemies.ts, bosses.ts, director.ts                 (Engine-B)
  audio.ts         procedural WebAudio SFX + ambient music   (Engine-B)
render/            R3F components; read `world` in useFrame  (Render-C)
ui/                DOM HUD + menus; read store + world (rAF)  (UI-D)
store.ts           Zustand meta/RPG state, implements storeTypes.ts (Engine-A)
storeTypes.ts      CONTRACT: store interface                 (planner)
types.ts, constants.ts  meta types + balance tables          (Engine-A)
```

### Data flow
* **Engine** owns all per-frame state in `world` (hp, mana, cooldowns, positions,
  timers, boss hp, director). It reads `useGameStore.getState()` (cheap, no
  subscription) for stats/skill levels/equipment and calls store actions only on
  discrete moments (gold, xp, item pickup, wave reward, game over).
* **Render** components read `world` inside `useFrame` and write instanced
  matrices / uniforms. They never call `setState` per frame.
* **UI** uses selector subscriptions for store data, and a `requestAnimationFrame`
  hook that writes DOM styles through refs for per-frame values (hp/mana orbs,
  cooldown sweeps, boss bar, minimap). No per-frame React renders.
* **Events** (`engine/events.ts`) carry discrete moments to VFX, audio and UI.

### Frame order
`render/Scene.tsx` mounts `useFrame((_, dt) => updateGame(dt), -1)` (negative
priority = runs before other frame callbacks, keeps R3F auto-render). `updateGame`
early-outs unless `status === PLAYING`; it clamps dt to 1/20 s.

`render/CameraRig.tsx` writes `world.player.aim` (ground-plane intersection of the
pointer) every frame — the engine never touches the camera.

## Gameplay design (current; see HANDOFF "Current game" for the full list)
* 5 classes (Archer / Wizard / Barbarian / Knight / Necromancer), one per character slot (`characters.ts`, up to 6 slots, each its
  own save key). Kit: F hold = manual attack, 1/2/3 class actives, Space class dash (Lv 6), R ultimate (Lv 10), Z / X potions.
* Persistent profile (`localStorage 'aether-survivor-profile-v1'` for slot c0, `...:<id>` for others; versioned, debounced writes,
  flushed on pagehide): gold, gems, Aether Crystals, inventory, equipment (8 slots: weapon/helmet/armor/gloves/boots/accessory/pet/tool),
  materials, quests, story + NPC quest state, per-class levels (`classProg`), talents, attributes, progress (endings, ascension, tower
  best, cave lantern), goals/achievements `meta`, settings. Fresh profile = 5,000 gold + 500 gems + starter potions/Ankh/cores
  (`store.WELCOME_GIFT`). `resetProfile` (Settings) wipes it. The warehouse is shared by all characters
  (`aether-survivor-shared-warehouse-v1`). Death keeps loot and xp.
* Progression is **per-class permanent levels** (`classLevels.ts`, max Lv 50, XP `250*lv^1.5`, 2 SP per level). `heroRank` is only a
  legacy alias for the current class level. Gear needs level (`constants.RANK_REQ`: Common 1 / Uncommon 6 / Rare 12 / Epic 18 /
  Legendary 24 / Mythic 30). In-run only: wave cards (`engine/runCards.ts`) and the run copy of skill levels.
* Town (status MENU): `engine/systems/village.ts` runs walking only (no director). Shops, quest board, trainer are always open;
  E interacts; click-to-walk with A* (`systems/townPath.ts`). Areas: TOWN, CASTLE, CHURCH, TAVERN, CAVE, HOME
  (`world.village.area`). Layout data in `engine/townData.ts`; the Adventure Portal / Endless Tower are buildings in the outskirts and
  open the Set Out window (`ui/screens/SetOut.tsx`). `startRun()` (engine/game.ts) leaves for the first room.
* Runs follow `docs/RUN_DESIGN.md` (7 biomes x 15 depths of rooms, final fight, tower modes). Files: `engine/roomDefs.ts`
  (pure data: biomes, rosters, plans, `depthWave`, portal choices), `engine/roomgen.ts` + `roomShape.ts` (one room = a shaped arena around
  0,0 installed through `mapgen.installRoom`; `mapgen.bounds`/`roomShape` give `edgeLimit`), `engine/campPaths.ts` (camp rooms are
  hand-authored transition paths with continuous collider chains, a polar envelope for `edgeLimit` and fixed arrival / waystation /
  exit spots), `engine/systems/director.ts` (flow: `enterRoom` -> FIGHT with pre-rolled pack bursts announced by telegraph markers in
  `world.room.markers`, max 36 alive -> CLEARED (reward after 0.7 s, 1-3 portals from `nextChoices`) -> walk into a portal via E / click
  -> LEAVING fade -> next room; BOSS -> BIOME_DONE -> `BiomeChoice`/big portal), `systems/roomEvents.ts` (objectives + twists),
  `systems/biomeHazards.ts`, `systems/merchant.ts`. `world.director.wave` = depth wave so enemy / boss / loot scaling is shared by
  every mode. Render: `render/Room.tsx` (+ `Props`, `CampPath`, `RoomWater`, `biomeLook.tsx` for fog / sky / light and the
  town day-night cycle). Scene shows Room during a run and Terrain/Town only in town.
* Room navigation (`engine/roomNav.ts`, river / lake / lava rooms only; zero cost elsewhere): `roomgen` calls `buildRoomNav(shape.maxR)` once per room, rasterising the installed colliders + outline into a 1 m
  blocked grid (liquids are colliders with gaps at the bridge decks, so bridges are the only way over water). Hero AUTO-chase (`player.autoPathDir`) follows an A* path (`navFindPath`, string-pulled, replanned every 0.4 s) when `navClear` says the straight line to
  its target is blocked. Ground monsters (`enemies.ts`, not bats / wraiths / bosses / stationary / aquatic) sample one shared Dijkstra flow field from the hero's cell (`navTick` ~3x per second, `navFlow`) when water forces a detour (walking distance > 1.2x straight + 2.5);
  `roomFeatures.routeAround` remains the fallback. `roomFeatures.onBridge(x, z, pad)` keeps decoration / hazards / traps off bridge decks (roomgen keep discs, Props bushes, biomeHazards, roomTraps / roomEvents). The grid is valid only while `nav.featVer`/`obsVer` match (`navActive()`).
* Tower family (`runInfo.mode === 'TOWER'`): Endless Tower, Daily Trial (`dailyChallenge.ts`), Endless Waves (`endlessWaves.ts`) use
  round arenas, no item drops / potions / Ankh / EXP (see HANDOFF 3.4).
* Quests: Quest Board bounties (`quests.ts`), NPC side quests (`npcQuests.ts`), main story (`story.ts`); all share 3 active slots;
  navigation through `systems/questNav.ts`.
* Loot (`loot.ts`, `store.rollItemDrop`): stackable sellable trade goods per source; coin drops are rare, income = selling loot + room
  rewards. Crystals / ore drop shard or Aether Crystal pickups. Tiers white / green / blue / purple / orange / red.
* Difficulty: no selector; Normal, plus the Hard toggle (unlocked by the first ending) and Ascension 1-10 (`engine/runMods.ts`).
  Enemies scale with depth and with hero level.

## Performance rules (all agents)
1. No `new Vector3()` / closures / array allocs in per-entity per-frame loops —
   use module-level scratch vectors.
2. Collision via `world.enemyGrid.query(x, z, r, out?)`; pass your own `out`
   array when nesting queries.
3. Distances: compare squared distances in xz.
4. Instanced meshes for anything with more than ~5 copies; set
   `instanceMatrix.setUsage(DynamicDrawUsage)` and only flag `needsUpdate` when
   something changed; set `mesh.count` to the number of live instances.
5. No per-frame `setState`. No `useGameStore()` without a selector.
6. Shadows: only the hero, bosses, trees and buildings cast; enemies use cheap
   blob-shadow decals.

## Combat-depth layer (monster tricks, statuses, aimed casting)
* `engine/systems/tricks.ts` — monster signature tricks. A cast freezes the enemy (`e.trickT`) while a hostile telegraph zone
  (`Zone.trick`) fills; `resolveTrick()` applies the effect on expiry (player debuffs, hostile ground patches `GOO/CALTROPS/FIREPATCH/ACID/PLAGUE/SMOKE`,
  crystal wall colliders via `mapgen.addTempCollider`). `engine/systems/bossSpecials.ts` does the same for bosses / mini-bosses (scripted timelines on `e.spT`).
* Player debuffs live on `world.player` (`stunT rootT silenceT defDownT blindT burnT/poisonT/bleedT`); `combat.applyPlayerDebuff()` ignores dash i-frames
  (`dashIframes`; the Barbarian shoulder charge has none). Enemy statuses: stun/freeze (bosses + minis fill `stagger` instead), stacking burn (<=3), chill, ARMOR BREAK,
  `armor` (100/(100+armor)), backstab (+30%), launch + wall-slam (`DamageOpts.launch/slam`).
* Kit: keys 1/2/3 = class actives (`abilityDefs.ACTIVE_ORDER`), Space = class dash (`tryDash`: Shadow Roll / Blink Nova / Bloodrage Leap / Holy Charge / Soul Step), R = ult (1 s wind-up while the sim is frozen,
  `abilities.tickUltWindup` called from `game.updateGame`), potions on Z / X. `engine/systems/combo.ts` = hit combo (every direct player hit +1, 3 s window; +0.5% dmg per 10 hits, cap +5%; an ult cast at 50+ hits is a finisher).
* Aimed casting: `engine/systems/aim.ts` (`aimState`, `updateSkillInput`) + `render/AimIndicator.tsx`; skills read `combat.aimOverride` through `getAimDir` / `aimPoint`.
  XP is granted instantly on kill (`combat.grantKillXp`, no XP orbs); coins only from `enemyDefs.GOLD_DROPPERS` + the Lich.

## Biome bosses beyond the Golem (bosses2 / bossFx / bossMech)
* `engine/systems/bosses2.ts` — AIs for Elderroot, the Tide Hydra, the Dune Colossus (war machine, `render/WarMachine.tsx`), Glacius, Ignar, Void Herald (dispatched from `bosses.updateBoss`). Each boss is a table of
  attacks (`Atk`: windup / act / recover + begin / fire / tick / end) run by one shared WINDUP -> ATTACK -> RECOVER runner; `e.pattern` = attack id.
  Extra per-boss memory (bark armor, hydra heads, dive state...) is the single module object `S` (`bossView`, read by `render/Bosses2.tsx`).
  `hooks.onStagger` interrupts the running attack (and breaks bark armor); `hooks.damageMul` applies bark armor / hydra-head shielding in `damageEnemy`.
* `engine/systems/bossFx.ts` — preallocated hazard pools (expanding rings, eruption props, portals, void echoes, frost breath, chill meter, arena shrink / blizzard).
  Telegraphs are ordinary hostile zones with `Zone.trick >= 30` (`BT.*`); `zones.expire` routes them to `resolveBossZone`. `TELEGRAPH_CONE` = apex at `pos`,
  `radius` = range, `aux` = half-angle (drawn by `render/Zones.tsx`). `render/BossFx.tsx` draws the pools (one InstancedMesh per prop type).
* Boss adds (`enemyDefs.isBossAdd`: sapling, hydra head, imp) are normal enemies with tiny AIs: no xp / loot / gold, poofed when their boss dies.
  Hydra heads are positioned by their own AI around the body (3 targetable heads; the body takes 0.5x/0.75x/1x/1.4x damage with 0..3 heads dead).
