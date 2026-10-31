# Aether Survivor: status and decisions

Engine: Vite + React 19 + three r182 + @react-three/fiber 9 + Zustand 5 (web/PWA, Android via Capacitor). No Godot / Unity / Unreal, so engine-specific game-dev skill packs and engine MCPs do not apply here.
Concept: 3D action roguelite. Town hub, Hades-style room runs through 7 biomes, tower / daily / waves / boss-trial modes, 5 classes, 2-player co-op.
Read first: `CLAUDE.md`, `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/RUN_DESIGN.md`.

## Owner preferences (short)
- Cute Zelda (Echoes of Wisdom) / casual Nintendo look for everything new. No dark-metal, no gold-line MMO look, no "lollipop" flowers: use the Quaternius flower models (`nature_qt*.glb`, `flowerClump()` in `render/natureLayout.ts`).
- Plain, non-technical replies. Cost sensitive: few helpers, Sonnet writes, Opus plans.
- Potions are permanent. Push `main` first, then the claude/* branch; `tsc` + `vite build` before pushing.

## Decisions (2026-10)
- Ascension: one step per clear.
- Boss forms: Ignar and the Void Herald die in form 1 and respawn as a bigger recoloured form 2 (`engine/systems/bossForms.ts`).
- Bosses never get knocked down; skills down normal monsters and dark heroes (`combat.downEnemy`).
- Pet Collection: register a pet to count it; milestones auto-claim.
- Wishing fountain: one luck wish per day (`wishing.ts`).
- Boss Trials portal moves to the shore headland, facing inland (in progress).

## Open
- Eggs: owner's "eggs without a container" request is unclear (farm egg nests vs pet icons).
- Tower milestone prizes still include gear/pets while the UI says crystals only.
- Co-op guest sees no void veil; walls aren't mirrored; real-network co-op is unverified.
