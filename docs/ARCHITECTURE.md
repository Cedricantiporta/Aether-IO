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
* Start: 10 000 gold, 10 000 gems, 10 HP + 10 MP potions, 1 Ankh, 30 cores.
* Waves: 5 s countdown → 30 s spawn window → cleanup (kill the rest, max 15 s)
  → reward cards (3 picks, keys 1/2/3) → next wave. Every 10th wave is a boss
  wave (Golem on odd tens, Lich on even tens) with a top-centre boss bar. Elite
  squads from wave 5 every 3 waves; elites get affixes.
* Max alive: 50 (waves 1-10), +20 per 10 waves.
* Difficulty select: Easy / Normal / Hard / Nightmare multiplies hp, damage,
  spawn budget and loot luck.
* Loot: rarity colours white/blue/purple/yellow/red; rarity level reqs
  10/20/30/40; bosses drop Epic+, Legendary from wave 30, Mythic from wave 60.

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
