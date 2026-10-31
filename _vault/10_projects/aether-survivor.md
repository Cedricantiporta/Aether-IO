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
- Boss balance (2026-10-31): total boss HP = 2x (was 5x); the x5 / x10 bars are cosmetic (5, or 10 in trials / Ascension >= 5); boss armour gains `300*((L-1)/49)^1.3` from hero level; flat boss hits scale toward 10% (trial 14%) of hero max HP, trial `pct` hits x1.5. All constants in `engine/bossBalance.ts`.
- Boss Trials portal moves to the shore headland, facing inland (in progress).

- Town Plan v6 (2026-10-31): 3-tier kingdom (L1 lower town, L2 Middle Town h 1.8, L3 Castle Hill h 3.8), walls grew 51 m north, grand castle (keep + wings + towers + ring road + gardens). Data: `engine/townData.ts` (TIERS/CASTLE*), `engine/castleGrounds.ts`; render `render/castleExterior.ts`. Map: `docs/TOWN_PLAN.md`.

- 2026-10-31 Extended hero kit: 10 new skills (2 per class, keys 4/5, class Lv 12/18) in engine/systems/heroExtra.ts; details in docs/HANDOFF.md 3.5. spGainAt raised in the 20s/30s/40s (sp4 migration).

## Open
- Eggs: owner's "eggs without a container" request is unclear (farm egg nests vs pet icons).
- Tower milestone prizes still include gear/pets while the UI says crystals only.
- Co-op guest sees no void veil; walls aren't mirrored; real-network co-op is unverified.
- 2026-10-31 boss rework (owner feedback from a fight): Ignar's lava starts at ~10% on the rim and grows with fight time + HP lost (ignarLava.ts). The Void Herald kit was rebuilt (bosses2.ts): Void Rot (stacking poison + slow), knockdown cones / collapses, silence finisher, seeker orbs (7 -> 16 u/s, 4 then 8 in Event Horizon), two continuous ramp zones (Collapsing Void pools, Void Beam: bossFx.spawnRamp), Event Horizon phase replaces the universal pull (sigils + collapsing void floor), burning void rim at 72% of the old arena radius, Herald hit sizes normalised through bossBalance (min 0.05, exp 1). See HANDOFF 'Void Herald'.
