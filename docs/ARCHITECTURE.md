# Aether Survivor — Architecture (v2 rebuild)

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

## Gameplay design (designer spec preserved + improved)
* 3 heroes (Archer / Wizard / Barbarian), class-locked weapons, R weapon ability,
  Q class active, E class special (5 SP), Space dash with charges, passives.
* Persistent profile (`localStorage 'aether-survivor-profile-v1'`, versioned, debounced writes, flushed on
  pagehide): gold, gems, inventory, equipment (7 slots: weapon/helmet/armor/gloves/boots/accessory/pet), materials
  (crafting shards), maxInventorySlots, heroRank/rankXp, quests, gameStats, settings, welcomeGiftClaimed.
  Fresh profile = 0 gold + ONE welcome gift (1000 gold, 100 gems, 5 HP + 5 MP potions, 1 Ankh, 5 cores).
  Runs keep all loot even on death; wave gold bonus is paid in full at run end. In-run only: level/xp, skill
  points/levels, wave cards, baseStats. `resetProfile` (Settings) wipes it.
* Hero Rank (persistent): rankXp += run xp * 0.5 at run end (also on death); `rankXpNeeded(r)=round(400*r^1.35)`.
  Gear needs rank (`RANK_REQ` 1/3/8/15/25); +1% gold find per rank (cap 50%).
* Village (status MENU after the title): `engine/systems/village.ts` runs walking only (no enemies/director). Shops
  and the quest board are open; E / click interacts, F harvests crystal + ore nodes. `world.village.shopsClosed`
  gates shops (`openSpecificShop`). `enterVillage()` / `startRun()` in engine/game.ts.
* Siege flow (director): SIEGE cutscene (2.5 s, skippable, bell) -> COUNTDOWN -> FIGHT -> REWARD -> RESPITE (20 s,
  shops reopen + random per-item sales re-rolled, 35% villager gift; none before boss waves). Waves: fixed enemy quota, field
  topped up while alive < threshold; kill-all = FAST CLEAR (bonus gold, 35% 4th card); 45 s timer = survived,
  leftovers poof. Boss waves end on boss death.
* Quests (`quests.ts`): 3 persistent villager quests, progress from engine events, claim draws a replacement.
* Loot (`loot.ts`): stackable (99) sellable trade goods per source with COMMON..MYTHIC tables; coin drops are rare,
  income = selling loot ("Sell all loot" in Supplies) + wave bonus. Crystals/ore drop SHARD pickups (materials).
* Waves: 5 s countdown → 30 s spawn window → cleanup (kill the rest, max 15 s)
  → reward cards (3 picks, keys 1/2/3) → next wave. Every 10th wave is a boss
  wave (Golem on odd tens, Lich on even tens) with a top-centre boss bar. Elite
  squads from wave 5 every 3 waves; elites get affixes.
* Max alive: 50 (waves 1-10), +20 per 10 waves.
* Difficulty select: Easy / Normal / Hard / Nightmare multiplies hp, damage,
  spawn budget and loot luck.
* Loot: rarity colours white/blue/purple/yellow/red; rank reqs 1/3/8/15/25; bosses drop Epic+, Legendary from wave 30, Mythic from wave 60.

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
* Kit: keys 1/2/3 = class actives (`abilityDefs.ACTIVE_ORDER`), Space = class dash (`tryDash` -> Shadow Roll / Blink Nova / Shoulder Charge), R = ult (1 s wind-up while the sim is frozen,
  `abilities.tickUltWindup` called from `game.updateGame`), potions on Z / X. `engine/systems/combo.ts` = hit combo (every direct player hit +1, 3 s window; +2.5% dmg per 10 hits, cap +25%; ult at 50+ hits = finisher).
* Aimed casting: `engine/systems/aim.ts` (`aimState`, `updateSkillInput`) + `render/AimIndicator.tsx`; skills read `combat.aimOverride` through `getAimDir` / `aimPoint`.
  XP is granted instantly on kill (`combat.grantKillXp`, no XP orbs); coins only from `enemyDefs.GOLD_DROPPERS` + the Lich.
