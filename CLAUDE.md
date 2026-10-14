# Aether Survivor — agent guide

3D action roguelite (town hub + Hades-style room runs). Vite + React 19 + three r182 + @react-three/fiber 9 +
drei + Zustand 5 + Tailwind (CDN) + framer-motion. Android APK via Capacitor 7; PWA too.

**Read first:** `docs/HANDOFF.md` (status, open tasks, user preferences), `docs/ARCHITECTURE.md` (layers,
performance rules), `docs/RUN_DESIGN.md` (run/town design spec).

## Commands
- `npm run dev` — dev server (Vite). `npx tsc --noEmit` — typecheck. `npx vite build` — production build.
- `npm run build:android` — build + `cap sync android`. CI (`.github/workflows/android.yml`) builds a debug APK on
  every push (artifact `aether-survivor-debug-apk`) and a release on `v*` tags.
- There is no unit-test suite; verify with `tsc` + `vite build` + headless Playwright (see HANDOFF "QA").

## Hard rules (performance + architecture)
- Per-frame state lives in the mutable `engine/world.ts` singleton, NEVER in the Zustand store. The store
  (`store.ts`, contract `storeTypes.ts`) holds meta/RPG state only.
- UI subscribes with selectors only (`useGameStore(s => s.x)` / `useShallow`); per-frame UI values are written to
  DOM refs from the shared rAF hook `ui/hooks/useRaf`. No per-frame `setState`.
- No allocations in per-entity/per-frame loops (module scratch vectors, preallocated pools). Enemy queries via
  `world.enemyGrid.query`. Instanced meshes for repeated things; `inView()` culling.
- Engine (`engine/**`) is pure TS (no React). Render (`render/**`) reads `world` in `useFrame`. Discrete moments go
  through the typed event bus `engine/events.ts`.
- KayKit GLTF bone names have dots stripped (`handslotr`, not `handslot.r`).

## Git
- Work on the branch you were given; commit finished files only (`git commit -- <paths>`), run `tsc` + `vite build`
  before pushing. Never commit `node_modules` / `dist` / `.claude/worktrees`.
