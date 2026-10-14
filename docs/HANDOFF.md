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
- Items on the ground are looted by hand: an E / tap "Loot <name>" pill (rooms: node 1000+i, town: act 'loot') ->
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
  SOUL_BOLT: single target, no pierce, no splash. Starter weapon `wand_n1` Bone Wand; item catalog / starter set /
  item-set names / talents (Gravelord, Plague, Lich) / perks (HORDE: minion damage + lifetime, BIG) all filled in.
- Minions: `engine/systems/minions.ts` (pool `world.minions`, 16): warrior (melee), mage (PET_BOLT, tint 9), golem.
  They hunt the nearest enemy (enemyGrid), otherwise trail the hero; timed (crumble), not killable; max 8 warriors
  (+talents). Render: render/Minions.tsx. Stats `minionDmg / minionLife / minionCount / minionHaste` (talents).
- Kit: 1 Raise Dead (2-4 warriors), 2 Bone Spear (piercing slow), 3 Plague Ground (zone kind CURSE: rot + slow,
  the fallen rise: `abilityState.curseRaise`), Space Soul Step (blink + bone burst). Ult Army of the Dead (wail stun,
  5 warriors + 2 mages + golem, 12 s). Passives: Grave Call (every Nth bolt raises a warrior), Soul Harvest (kills heal
  + mana), Bone Armor (3%+ damage reduction per living minion, max 30%, in damagePlayer).
