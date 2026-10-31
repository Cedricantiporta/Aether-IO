# Recipe: add or change a boss attack
1. Skills live in `engine/systems/bosses.ts` / `bosses2.ts` (cycle lists) with shared mechanics in `bossMech.ts`, projectiles/hazards in `bossFx.ts`.
2. Telegraph first: `spawnTelegraphCircle` / `spawnTelegraphLine` (enemies.ts), damage after the wind-up. Form 2 recolours telegraphs through `bossForms.ts`.
3. Close-range skills go through the proximity gate (`closeDue`, `proxBegin` in bossMech): they only fire when the hero, partner or a summon is near.
4. Invulnerable phases use the single owner `bp` (bossPhaseState); never start a second one; rate limit the INVULNERABLE label.
5. Hero CC: `knockHero` / `applyPlayerDebuff` / `slowHero` in combat.ts; keep the anti-chain rules (KNOCK_IMMUNE, no down while stunned/frozen/rooted, `resCC`). Bosses down the hero but are never downed.
6. No allocations per frame: pooled objects, module scratch vectors.
7. Test headless (HANDOFF "QA (headless)"): hero god mode near / far, count skill starts.
