# Handoff — Aether Survivor (status as of 2026-10-14)

Branch: `claude/festive-shannon-tspv5k` (all work lands here; `main` is the old version — the Vercel
production deploy builds `main`, so preview deployments of this branch or a merge/PR are needed to see the new game).

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
- **UI**: OLD style (wood/stone/gold frames, Cinzel + Rubik) restored — the user rejected the flat modern reskin.
  Exception: reward cards are **tarot style** (`ui/screens/WaveReward.tsx`, `.rw-*` CSS) — keep them. Combo meter
  sits top-centre under the room plaque. Interact = Genshin-style pills (`ui/hud/InteractPrompt.tsx`); skill buttons
  are never replaced by interact/harvest. Touch: joystick + big ATTACK hub + skill arc (`ui/hud/TouchControls.tsx`),
  touch controls only on touch devices.
- **Progression**: persistent profile in localStorage `aether-survivor-profile-v1` (gold, gems, items, equipment,
  hero rank, talents, quests, codex discoveries, settings). Runs start with 0 SP.

## In flight when this was written (may already be merged — check `git log`)
1. **Town rework** (sub-agent): town ~60% size but functional buildings spread out (each in its own spot), houses +
   decorative stalls in the OLD house style (as before commit 50fbed7), well moved off the plaza onto grass, fences
   (and posts) get colliders, NPC avatars fixed (hero scale, upright, proper idle/walk anims, light tints), harvest
   nodes moved to the outskirts, gate easy to find (signpost/banner).
If that branch never landed, redo it from this description.
- NOTE: the user asked to remove HP/MP potions, then reversed it ("dont remove potions"). Potions (Z/X, auto-potions
  setting, shop/loot) STAY. Don't remove them.

## Open tasks (do next, in order)
1. **MMORPG free camera**: right-mouse drag / one-finger drag on empty screen = orbit (yaw + limited pitch), wheel /
   pinch = zoom, movement + joystick relative to camera yaw (W = away from camera), skills "facing" unaffected.
   Files: `render/CameraRig.tsx`, `engine/input.ts`, `engine/systems/player.ts` (movement in `updatePlayer` and
   `updatePlayerVillage`), `ui/hud/TouchControls.tsx` (a rotate zone). Ground aim already raycasts.
2. **Quest board**: board lists many offered quests (e.g. 6–8, refreshes daily / on claim); a quest only progresses
   after **Accept**; max **3 active**; abandon frees a slot. Files: `quests.ts`, `store.ts` (`quests`,
   `addQuestProgress`, `claimQuest`), `storeTypes.ts`, the QUESTS shop tab UI (`ui/panels/shop/Quests.tsx`).
3. Balance/tuning still unverified: new boss damage/cadence, town performance on real phones (12 skinned NPCs),
   camera framing in long corridor rooms, boss rooms with new shapes, fountain heal (40%).
4. Leftovers to clean: siege/shutter code in `render/Town.tsx` + `world.village.shopsClosed` (always false),
   siege music theme in `engine/audio.ts`, unused `ui/hooks/useMedia.ts` / `ui/components/Sheet.tsx`.
5. Ideas the user liked earlier but not built: village upgrades, daily challenge, item sets/affixes are partly in.

## QA (headless)
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
