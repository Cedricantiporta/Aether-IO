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
- **Town look**: stone wall ring with towers + gatehouse (`WALL*` in `engine/townData.ts`, colliders included),
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
