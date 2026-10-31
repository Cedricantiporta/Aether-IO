# Recipe: add a prop, NPC or building to the town
1. Data first in `engine/townData.ts` (HOUSES, ROADS, benches, colliders, clear lists). Positions are world x/z; check neighbours (plaza, roads, tower path, Boss Trials path, farm) so nothing blocks a path.
2. Decoration through `engine/townFill.ts` and `render/natureLayout.ts` (instanced / chunked, culled). Flowers: `flowerClump()` with the Quaternius models only.
3. Terrain flatten / clear: `engine/townHills.ts`, `TOWN_CLEAR`; minimap: `ui/hud/Minimap.tsx`.
4. NPCs: speech lines in `engine/npcLines.ts`, quests in `npcQuests.ts`.
5. Verify with the headless probe: autopath finds every new target, E prompts show, no collider on a road.
6. Mainland props (z > 52): keep them >= `ROADSIDE_CLEAR` (0.8 m) outside the visible dirt, on their own side of the road: test with `townData.dirtEdge(x, z) - footprint >= 0.8` (see HANDOFF 'Roadside clearance'); `townFill.blocked()` already does it for generated fill.
