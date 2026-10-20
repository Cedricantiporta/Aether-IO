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
  roomDefs.ts roomgen.ts roomShape.ts roomFeatures.ts campPaths.ts   run structure, biomes, room building
  townData.ts townHills.ts castleData.ts churchData.ts tavernData.ts homeData.ts caveData.ts beachData.ts   town + interiors
  gates.ts arenaRooms.ts wanderers.ts npcLines.ts enemyDefs.ts lootExtra.ts
  systems/  player abilities skills combat enemies bosses bosses2 bossMech bossFx bossSpecials humanBosses darkHero eliteBig
            tricks director roomEvents biomeHazards projectiles zones pickups crates minions pets ally riruru
            village npcs dialogue storyLogic npcQuestLogic questNav townPath cave fishing tutorial target aim combo heroTrail dailyRun ...
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
- A walled town (stone wall + gate, castle on a raised terrace, plaza with the founder's statue/well, chapel + graveyard,
  Golden Tankard tavern, windmill) with a large outskirts: meadow before the gate, a river with a great arched bridge,
  lake + west beach with pier and fishing, farm + barns + fields, hamlets, hills (`townHills.ts`), the Endless Tower far
  to the south-west, the **Adventure Portal** deep in the south forest (platform is walkable, E on it opens Set Out), a
  horse stable by the gate, Crystal Cave + mining camp east of the wall, the hermit trail. Always read coordinates from
  `townData.ts` / `constants.ts SHOP_POSITIONS`; they moved many times.
- **Day/night**: `world.townTime` (480 s per day, jumps on return from a run), dawn/noon/dusk/night lighting in
  `render/biomeLook.tsx` (`TOWN_*`), stars, fireflies, glowing windows, `ui/hud/TownClock.tsx`. Runs in Greenwood
  (depth 1-10), Desert, Coral Isles and Frostpeak take their time of day from the town clock at run start.
- **Shops** (shopkeepers are the click targets; each has a name): Supplies (potions), Armory, Blacksmith (Upgrade / Craft /
  Reforge / Fuse / Shards), Pet Stable, Fortune Teller (Summon window), Warehouse (shared storage), Tech House (permanent
  gem upgrades), Elixir Brewer, Fishmonger, Mining Supplies, Skill Trainer (Master Varek), Quest Board (Bounties). Panels:
  `ui/panels/shop/*`, `ui/panels/SummonWindow.tsx`. Prices: gear x4 at the Armory, pets x1.4; gear/pets sell for 90%,
  loot for 2x (`constants.ts`).
- **Areas** (`world.village.area`): TOWN, CASTLE (King Aldric, throne dais), CHURCH (Sister Elowen), TAVERN, CAVE
  (Crystal Cave: persistent Floor 1 with Grit + per-trip deeper floors, lantern-oil timer, `engine/systems/cave.ts`),
  HOME (the adventurer's house: bed = sleep to dream). Same plumbing for each (`pending` area, `switchArea`, exit pill).
- **Activities**: fishing (`systems/fishing.ts`, Lv 3), mining (hold E on nodes; Mining Pickaxe tool slot halves effort),
  harvest nodes, farm chores (milk/eggs, held E), pet the animals, sit on benches, **ride horses** (needs Lv 15 quest
  `hilda_shoes`; 2x speed, horse dash), Crystal Cave (Lv 5), Gull Queen ship ticket (60 gems -> starts a run in the Coral Isles).
- **Navigation**: click-to-walk with A* (`systems/townPath.ts`), area-aware quest navigation (`systems/questNav.ts`; one
  source of truth for guide arrow, tracker click, beacon, G key), NPC patrols with stuck handling.
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
  Harvest nodes appear in ~half the rooms (hand-harvest only). Wanderers (story characters, max one per biome), ally
  fighter once per biome, Riruru (rare harmless blue slime, Greenwood). River/lake stages, rolling hills beyond the props.
- **Camps are hand-authored transition paths** (`engine/campPaths.ts` `CAMP_LAYOUTS`, 7 layouts, waystation mid-path with
  Storage + Training Post; `render/CampPath.tsx`). Camp -> Greenwood has no camp (the first biome starts in a combat room).
- **Cards** (`engine/runCards.ts`): after clearing a card room pick 1 of 2 (25% three) cards of COMMON..MYTHIC rarity; Death
  Defiance, special cards; skill cards are no longer offered; picks are viewable in the Run Upgrades panel (Tab).
- Death = GAME_OVER (loot, xp and room gold kept). Ankh of Life is a choice on death (15 min real-time cooldown).
- `depthWave` feeds the old wave scaling; enemies also scale with hero level (`enemies.ts LEVEL_HP/LEVEL_DMG/LEVEL_REWARD`).

### 3.4 Other modes (Endless Tower building south-west of the gate = hub window `ui/screens/SetOut.tsx`)
`runInfo.mode` is `'ADVENTURE'` or `'TOWER'`; the tower family shares the TOWER rules (no item drops, no potions/Ankh,
healing -40%, no EXP; gold + Aether Crystals instead; `combat.towerMode()`):
- **Endless Tower**: round arena floors, elite every 3rd, champion every 5th, boss every 10th; milestone rewards every 10th
  floor (`towerRewards.ts`); best floor per class in `progress.towerBest`.
- **Daily Trial** (`dailyChallenge.ts`, Lv 15): seeded daily 5-floor climb with 2-3 modifiers, score, streak.
- **Endless Waves** (`endlessWaves.ts`, Lv 30): survival in one arena, boss every 5th wave, minis on 5n+3, stacked bosses
  from wave 20; milestone rewards 10/20/30/50.
- **Ascension 1-10** (`ascension.ts`, tab appears after the first ending): stackable hardships on adventure runs.
- **Hard mode** (Settings toggle, unlocked by the first ending): x1.5 gold/XP, better epic+ and card odds (`runMods.ts HARD_*`).
- **Dreams** (`dreams.ts`, 17 Font dreams): one per return from a run, Hades-style; Aelia dreams are a walkable
  Greenwood clearing (`runInfo.dream`), class MEMORY dreams are a haze overlay; sleeping in the hero's house plays the
  next due one. The "true ending" needs 10 clears + the dreams seen (`dreams.trueEndingReady`).

### 3.5 Combat and classes
- Controls (`engine/input.ts`, listed in Settings > Controls = `KEYS_KB` in `ui/screens/PauseMenu.tsx`; keep in sync):
  WASD move · **F hold = manual attack** (auto-attack fires only with an enemy in range) · 1/2/3 class actives (hold to aim,
  release to cast; tap = auto-target) · Space class dash · R ultimate (needs full bar) · Z / X health / mana potion · E
  interact / loot (hold = harvest, chores) · G auto-path to the tracked quest · V reset camera · I bag · C hero sheet ·
  J quests · O achievements · Tab Run Upgrades (runs) · Esc pause / close. There is no K / skills hotkey: skills are learned
  at the Skill Trainer or a camp Training Post. Mouse: click an enemy = lock target (`systems/target.ts`); Settings
  `clickMove` (default on) = left-click ground to walk; `aimAtCursor`, `autoSkills`, auto-battle toggle on touch.
  Controller: full gamepad support + menu navigation (`engine/input.ts pollPad`, `ui/lib/padNav.ts`), input-aware hints
  (`ui/lib/inputMode.ts`, `ui/components/PadBtn.tsx`). Touch: joystick + ATTACK hub + skill arc (`ui/hud/TouchControls.tsx`).
- **Camera**: free MMORPG orbit (left or right drag on the scene / one-finger drag = orbit, wheel / pinch = zoom, max
  zoom-out 1.15 in `input.ts DIST_MAX`; `zoomUnlocked` default on). Movement is camera-relative (`engine/camera.ts camRel`).
- **Unlock levels** (class level, max **50**, `classLevels.ts`): skill 2 Lv 4, skill 3 Lv 8, ultimate Lv 10, dash Lv 6
  (`DASH_UNLOCK_LV`), regen Lv 2, class passives Lv 2/4/6/8. 3 SP at start + **2 SP per level** (`SP_PER_LEVEL`).
  Dash: one use per 5.5 s (`player.ts DASH_CD`, -0.3 s per dash level), no charges. Potions: 30 s cooldown
  (`constants.POTION_COOLDOWN`), only drink at <= 70% of the bar, restore a flat 100 (Big 200), cap 50 each. Auto-potions setting.
- HP and incoming damage are both doubled (`store.HP_INFLATE` / `DMG_INFLATE`); stat caps in `store.STAT_CAPS`.
- **Classes** (all have 3 actives, a dash, an ultimate, passives; kits in `abilityDefs.ts`, `systems/abilities.ts`, `skills.ts`):
  Archer (ranged, cannot attack while moving, Lightpiercer charge), Wizard (Arcane Shield passive replaces Storm, Fireballs),
  Barbarian (boomerang axe, Cross Slash, Whirlwind, Bloodrage Leap), Knight (sword arcs, Shield Wall, Judgment, Divine Avatar,
  Consecration/Smite/Radiant Burst), Necromancer (minions in `systems/minions.ts`, Raise Dead, Bone Ward, Plague Ground, Army of the Dead golem).
  Gear is class-gated by wear group (`itemClass.ts`: Heavy = Knight+Barbarian, Light = Archer+Necromancer, Arcane = Wizard;
  Wizard and Necromancer share weapons).
- Combat layer: monster tricks (`tricks.ts`), statuses, backstab/shield blocking, elite big attacks (`eliteBig.ts`), winded
  free-hit windows on bosses, follow delay (`heroTrail.ts`), combo meter, aimed casting (`aim.ts`), no contact damage
  (monsters wind up a strike).
- **Bosses** (`bosses.ts`, `bosses2.ts`, `bossMech.ts` = shared ward/barrier/rain layer, `bossFx.ts`, `bossSpecials.ts`,
  `humanBosses.ts`; `render/Bosses2.tsx`, `WarMachine.tsx`, `HumanBosses.tsx`): Greenwood **Elderroot** (Treant), Marble
  Halls **Gorath** (Golem), Desert **The Dune Colossus** (war machine), Coral Isles **The Tide Hydra**, Frostpeak
  **Glacius** (Wyrm), Ember **Ignar** (Warlord, Burning Form at 50% hp), Void **Void Herald**; the Greenwood depth-10
  **Slime King**; **Malakar** (Lich, mini-boss in crypt biomes and the final two-stage fight); humanoid mini bosses Varn /
  Sable / Rook; dark hero duels (`darkHero.ts`). Each boss has a ward once per fight at 50% hp, periodic absorb barrier,
  spread-out impact salvos, an arena per biome (`roomgen.BOSS_ARENA_R`).

### 3.6 Progression and economy
- **Per-class permanent levels** (`classProg` in the profile; `heroRank` is a legacy alias = current class level that
  gear/crafting/quests read), XP curve `250 * lv^1.5`, kill EXP x0.85 and quest EXP shares in `classLevels.ts`.
- **Talents** (`talents.ts`): radial tree per class (4 branches, ring-level gates, 4 points per level), full-screen pan window.
- **Attributes** (`attributes.ts`): STR/DEX/INT/VIT/LUK, 3 + 2 per level points, Auto allocate button, hex tree + allocate window.
- **Gear**: six tiers Common/Uncommon/Rare/Epic/Legendary(orange)/Mythic with level gates **1/8/16/24/32/40**
  (`constants.RANK_REQ`); drops may be one tier above the equippable cap. Catalog = one item per class per slot per rarity
  (`itemCatalog.ts`, ids `c_<class>_<slot>_<n>`, older items `retired`), rings/amulets with special effects, weapon perks
  (`weaponPerks.ts`), item sets, bonus lines (`affixes.ts`: slots per rarity, perfect rolls), Mining tool slot. +N upgrades
  at the Blacksmith (cores: Upgrade/Refined/Radiant, fail/shatter at +8/+9), +7 and above glow. Crafting (`crafting.ts`,
  Workshop window), Reforge (`reforge.ts`: per-line reroll, Augment Rune fills empty slots, Reforge Stone / Tempering Oil),
  Fusion (5 of a tier -> next tier, gear/shards/pets), Recycle in the bag (gear -> shards + cores).
- **Currencies**: gold (`GOLD_SCALE` 10), gems, **Aether Crystals** (real bag item `crystals.ts`; daily/weekly goals and
  achievements pay crystals only), shards (bag stacks, `shards.ts`). **Summon** (Fortune Teller window): Gem Altar, Crystal
  Altar (crystals), Gem Shop tab (gear/supplies, no pets), pity at 60 / 240 (`store.summonPity`). Tech House = permanent gem
  upgrades (bag slots, warehouse, potion power, gold/xp/hp, bigger lantern). Elixirs at the Brewer (`elixirs.ts`).
- **Pets**: six tiers, growth Lv 1-20 + 3 evolution stages (`petGrowth.ts`, `petActions.ts`: feed loot/shards, evolve),
  fusion (`petFusion.ts`), elemental attacks, follow the hero in town and runs.
- **Quests**: Quest Board = 6 daily offers, level-gated bounty types (`quests.ts`); main + side + bounties share
  `QUEST_MAX_ACTIVE` (3) slots. Main story `story.ts` (`STORY_V` 5; townsfolk tutorial chain -> biome errands -> Malakar
  -> Endless Tower -> true-heir arc), NPC side quests `npcQuests.ts` (level-gated, LISTEN / DELIVER / INTERACT / ACTION
  types), logic `systems/npcQuestLogic.ts` + `storyLogic.ts`. Lore in `lore.ts`; Codex + Story book in `ui/screens/Codex.tsx`.
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
effect pools. Judge perf by draw calls / triangles / sim ms, not SwiftShader FPS.

### 3.9 UI style direction (owner-driven)
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
  small pills above the box's right side.
- **Quest banner** (`ui/hud/QuestBanner.tsx`, mounted in `GameUI`): wide soft band with an italic type line ("Side Quest accepted",
  "New Main Quest"), a big bold title and hint pills "Destination" (cyan dot; track + auto-path via `walkToMain` / `walkToNpcObjective`,
  teleport offer in a run) and "Open Log" (quest log). Fades in, holds ~3 s, fades out. Fired when a quest is offered on the last
  dialogue line, when a side quest is accepted (the `Quest accepted:` system toast is intercepted in `Overlays.tsx`) and on main quest accept.
- **Toasts** (`Overlays.tsx`): plain rounded `.toast-pill`s with white text; only the small dot carries the colour.
- **HUD**: rounded pills, quest tracker rows as rounded cards, minimap with a soft rounded corner + shadow (no gold edge), captions in Nunito.
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
9. **Town 3D (Blender kit, Higgsfield project "Aether Town Kit", revision 10)**: houses, wall runs, towers, gate are kit
   pieces (`render/townKit.tsx`; GLB is meshopt + quantized, so meshes are de-quantized before baking). Update flow:
   edit in Blender -> `scene_builder_3d_get_glb` -> `gltf-transform weld` + `meshopt --level medium` ->
   `public/models/town/town_kit.glb`. Walls + towers were rebuilt plain (big cream blocks, revision 10). Open: kit shops / castle / chapel /
   tavern (still procedural, dark roofs), place kit fountain/well/stall/lamps, hedges + stepping-stone paths on the
   raised districts (Link's Awakening exterior reference), chimney smoke positions vs kit chimneys.
   **Kit v2 (assets only, NOT wired in yet)**: `public/models/town/town_kit_v2.glb` (578 KB, weld + meshopt medium), built by
   `art/blender/town_kit_v2.py` (bpy module; geometry authored in game space, flat shaded, one mesh root node per piece,
   origin = ground centre, front = +Z). Pieces: house_small, house_two_storey, house_gabled_narrow, house_tower,
   shop_stall_house, tavern, chapel, castle_keep, castle_wall_segment, castle_gatehouse, lamp_post, banner,
   flower_planter, market_stall, barrel, crate, fountain_small. 12 shared flat materials (stone, stone_dark, wood,
   timber, roof_blue #3c56a8, gold, window_glow [emissive, name contains "glow" so `townKit.tsx` puts it in the glow
   geometry], flower_red, flower_pink, leaf, awning_blue, iron) and NO textures: add the new names to
   `townPalette.kitColor` when wiring. Rebuild: `python3 art/blender/town_kit_v2.py [--no-render]` (writes
   `town_kit_v2.raw.glb`, renders to `$KITV2_SHOTS` = `art/renders/kitv2/`; `--only=sheet,castle,props,town`,
   `--closeup=<piece>[,yaw,pitch,ortho,y,x,z]` for single-piece debug shots), then
   `npx @gltf-transform/cli weld raw.glb w.glb && npx @gltf-transform/cli meshopt w.glb town_kit_v2.glb --level medium`
   (delete the raw file). The node names are final, so no KIT_LOC offset table is needed (every piece sits at the origin).
   Gotcha: never overlap coplanar faces in the script (Cycles renders them black); use `B.arch` (half-disc prism) for arches.
10. **Camera (Link's Awakening / Echoes look, done 2026-10-20)**: `render/CameraRig.tsx` forces yaw 0 / pitch
   CAM_PITCH0 unless Settings "Free camera" (`settings.freeCamera`) is on, and uses a long lens (FOV 26, pushed back
   by TELE so the framing matches FOV 40; lobby / class select keep FOV 40). TiltShift2 in `GameCanvas` (setting
   `tiltShift`, only on tiers with the composer). Next: interiors in that style (REFERENCES "Interiors").
11. Desktop only now (owner: no phone play) — phone-specific tuning is no longer a priority.
7. Process hazards: stopped sub-agents leave work in `.claude/worktrees/*` — check `git status` and `git worktree list`
   before assuming something is merged; never commit that folder.

## 5. Detailed notes (still true; condensed)

### Systems quick reference
- **Store vs world**: per-frame state in `engine/world.ts`; meta in `store.ts`. Profile saved debounced to localStorage,
  flushed on pagehide; separate keys for the shared warehouse (`aether-survivor-shared-warehouse-v1`), characters index,
  harvest/cave/fishing/tutorial/dream/ankh flags (`aether-survivor-*`). Old saves migrate through flags (`gold10`, `sp2`, `al1`, `mus1`...).
- **Events**: `engine/events.ts` typed bus; `hub` event (buy/summon/upgrade/craft/brew/...) feeds quests and goals.
- **Town vs run rendering**: `render/Scene.tsx` shows `Room` in a run, `Terrain/Town` in town; `render/lift.ts liftAt()`
  adds terrace/hill height on top of the engine's flat y = 0. Inside the walls the town has raised districts
  (`townData.TIERS`: Chapel Hill 1.6, Tavern Row 0.9, West Rise 1.2, East Rise 0.8; castle terrace 2.2) with stairs;
  `townLift` gives their height, TOWN_COLLIDERS fence their edges, TownScenery `addTier` draws them and lifts
  everything placed on them (put/lifted, roads in 1 m pieces). Houses, wall runs, towers and gate are the Blender kit
  (`render/townKit.tsx`, `public/models/town/town_kit.glb`, Higgsfield project "Aether Town Kit").
- **Rooms**: one disc/shape around 0,0 built from a seed (`roomgen.buildRoom`, `roomShape` polar table, `mapgen.installRoom`),
  only the current room exists; camp rooms use `roomShape.fixed` spots.
- **Dialogue**: speaker lines `Name:: text` (`You::` = the hero); short hero replies ride on the button.
- **Boss wards / barriers**: `bossMech.ts` (`WARD_AT` 0.5, `BARRIER_CD`), per-boss ward kinds (crystals, sporecaps,
  hellhounds, spare hydra heads, frost shell, power cores, void phase, cultists).
- **Necromancer summons**: per-source caps in `minions.ts`; Raise Dead army of up to 5 (3 warriors + 2 random archer/mage),
  Bone Ward shields summons, golem ult.
- **Debug mode** (Settings > Debug, `ui/screens/DebugTab.tsx`, `engine/debug.ts`): god mode, one-hit kills, max stats/skills,
  jump to any biome/room/gate, special fights (Malakar, Riruru, dark hero per class, humanoid mini boss), dreams, town
  time, rockfall, "mark all biomes completed", unlock adventure, set level up to 50.
- **Gear tint**: `render/gear.ts tintGear` recolours the KayKit model parts by rarity; weapons in `render/weapons.ts`.
  KayKit bone names have the dots stripped (`handslotr`).
- **Hero HP/damage tuning knobs** most often touched: `store.CLASS_MANA_MUL`, `enemies.ts` (`LEVEL_*`, `ELITE_HP`,
  `MONSTER_XP_MUL`, `bossPace`), `director.ts` (`CHAMPION_HP`), `enemyDefs.waveDmgMult`.

### Balance history (what the headless passes taught us)
Method: a Playwright harness (not in the repo) drives `updateGame(1/30)` with a bot that dodges most telegraphs, plays
"shop" progressions (equip better loot, spend points) and boss-room tests per class/level. Findings that still hold:
- Barbarian and Knight are the strongest runners; Wizard weakest at bosses; Archer was boosted (+20% base damage).
- Boss adds were capped (Hydra regrowth max 4, Lich summons only under 9 monsters, Ignar imps max 6, champion escort
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
