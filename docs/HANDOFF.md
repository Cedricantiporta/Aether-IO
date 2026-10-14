# Handoff — Aether Survivor (status as of 2026-10-14)

Branch: `claude/charming-shannon-nq5wcd` (contains all of `claude/festive-shannon-tspv5k` + the work below; `main` is
the old version — the Vercel production deploy builds `main`, so preview deployments of this branch or a merge/PR are
needed to see the new game).

## The owner (how to work with them)
- Not a coder. Gives short, informal feedback, often several requests in one message, frequently with screenshots.
  Reply in plain language: what changed, what to try, what's still pending. No code jargon.
- **Very cost-sensitive** (complained twice about usage): keep at most 1–2 sub-agents running, prefer small direct
  edits, few screenshots, don't re-verify things needlessly.
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


- NOTE: the user asked to remove HP/MP potions, then reversed it ("dont remove potions"). Potions (Z/X, auto-potions
  setting, shop/loot) STAY. Don't remove them.

## Open tasks (do next, in order)
1. Balance/tuning still unverified: boss damage/cadence, town performance on real phones (12 skinned NPCs + wall),
   camera framing in long corridor rooms, boss rooms with new shapes, fountain heal (40%).
2. Remaining wood-style screens to convert to the dark metal look if the user asks: character sheet avatar ring / CP
   box, pause/settings menus, codex, game-over screen (they inherit the v5 overrides but still use some old pieces).
3. Character select shows the low-poly KayKit hero; the user's reference uses painted key art. Free CC0 art only.
4. Ideas the user liked earlier but not built: village upgrades, daily challenge; item sets/affixes are partly in.

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
