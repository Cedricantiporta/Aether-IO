# Aether Survivor — agent guide

3D action roguelite (town hub + Hades-style room runs through 7 biomes, tower/daily/waves modes, 5 classes). Vite + React 19 +
three r182 + @react-three/fiber 9 + drei + Zustand 5 + Tailwind (CDN) + framer-motion. Android APK via Capacitor 7; PWA too.

**Read first:** `docs/HANDOFF.md` (owner preferences + workflow rules, current game map, open tasks), `docs/ARCHITECTURE.md`
(layers, performance rules), `docs/RUN_DESIGN.md` (run structure). When code and docs disagree, the code wins: fix the doc.

## Commands
- `npm run dev` — dev server (Vite). `npx tsc --noEmit` — typecheck. `npx vite build` — production build.
- `npm run build:android` — build + `cap sync android`. CI (`.github/workflows/android.yml`) builds a debug APK on
  every push (artifact `aether-survivor-debug-apk`) and a release on `v*` tags.
- There is no unit-test suite; verify with `tsc` + `vite build` + headless Playwright (see HANDOFF "QA (headless)").

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

## Git and deploy
- Work on the branch you were given; commit finished files only (`git commit -- <paths>`), run `tsc` + `vite build`
  before pushing. Never commit `node_modules` / `dist` / `.claude/worktrees`. Only commit/push when asked.
- Owner rule: push to `main` FIRST (`git push origin HEAD:main`), then the claude/* branch. Vercel production builds `main`;
  a branch push first makes it a Preview only. Each push is a Vercel deployment.
- Owner rules to remember (details in HANDOFF section 1): potions are permanent (never remove them), the owner is cost
  sensitive (few sub-agents; model split: Opus plans/reviews, Sonnet writes code, Haiku verifies/navigates), reply in plain non-technical language.
- **Art/UI style is Zelda (Echoes of Wisdom / Link's Awakening) or casual cute Nintendo style** for everything new:
  rounded, soft, toy-like, bright; no Korean-MMO dark-metal / gold-line look (HANDOFF section 1 + 3.9).
- Update `docs/HANDOFF.md` when you change how the game works (keep it a current map, not a changelog).
- Vault: short notes in `_vault/` (project status/decisions in `_vault/10_projects/aether-survivor.md`, reusable how-tos in `_vault/20_knowledge/recipes/`). Read the matching recipe before building a boss attack, CC/knockdown, town prop or co-op field; fix it if the code disagrees.
