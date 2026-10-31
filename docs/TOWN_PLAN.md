# Kingdom plan v6 (2026-10-31): the 3-tier kingdom (owner: "really make the setup of the town inside the kingdom better ... the 3-tier kingdom: DO IT")

The kingdom grew 51 m NORTH (`WALL.z0` -41 -> -92; gate, bridge, forest road, stable and everything south of z 0 did not move). Walls are now x +-45, z -92..38. Three levels climb north; ONE straight grand avenue (x 0) links them:
**gate (0, 38) -> plaza (0, 2) -> north street z -6 -> Middle Town stairs (z -14, 10.4 m wide) -> Royal Way (x 0, 5.2 m) -> Castle Hill stairs (z -52, 10.4 m) -> castle way (6.4 m, red carpet) -> keep door (0, -64.4)**.
Heights (`townData L2_H / L3_H`, `townLift`): L1 0 (paving), L2 1.8, L3 3.8. `TIERS` order matters: the higher tier is FIRST (its flights land inside the lower one's rectangle). `TierSpec.base` = the level a tier's flights come down to (L3's flights land at 1.8), `hide` = edges with no parapet / collider, `tierRun(T)` = flight length (L2 3.78 m, L3 4.2 m). Every flight is >= 4 m wide (the 0.78 m A* clearance rule); the A* ignores heights, so the horse is routed like the hero.

| Level | Where | What |
| --- | --- | --- |
| **L1 Lower Town** (h 0) | z -8..38 | unchanged: gate forecourt, avenue + market lanes, plaza (fountain, shop ring: Fortune / Pets / Supplies / Smith / Warehouse west + east, Armory, Fortune, Tech on the south street), park + pen, the two Rises (h 1.2 / 0.8), Hero house, Market Row; North Street houses, Tavern square benches |
| **L2 Middle Town** (h 1.8, `TIERS[1]`) | x +-43.7, z -52..-14 | residential + civic terrace. Flights to L1 at x -38 (graveyard), -26 (chapel), -16 (trainer yard), **0 (grand)**, 28 (tavern). **Royal Way**: four lawns (x +-3.7..11, z -26..-16 and -38..-31) with statues, benches, hedges, flower clumps, lamps. West: Chapel (-26, -26), graveyard + crypt (NW), trainer yard (-16, -17) with Master Varek, cloister garden. East: Tavern (28, -21), Tavern Row back houses (z -34.7) on the lane z -29.2, pocket park (38.6, -21.4). **Terrace Street z -41.4** (x -31..40) with the north row of 6 houses (x -36.8, -20.9, -14 | 14, 20.9, 36.8, front line -44.3, doors south). Flights to Castle Hill at x +-30 (road x +-30 from the street) |
| **L3 Castle Hill** (h 3.8, `TIERS[0]`, `TERRACE`) | x +-43.7, z -90.7..-52 | the castle terrace: keep + wings + ring road + gardens. Flights to L2 at x 0 (grand, 10.4 m) and +-30 (4.4 m) |

## Castle (`townData CASTLE / CASTLE_WING / CASTLE_PORCH / CASTLE_RING`, `render/castleExterior.ts`, `engine/castleGrounds.ts`)
- **Keep**: kit `castle_keep` x1.3 (`CASTLE_S`) at (0, -73.5), footprint 26.6 x 11.8 incl. its four round towers, height 18.4 (colliders: footprint ring + 4 tower circles, as before).
- **Wings** (code-built, west + east): x +-12..33, z -78.5..-68.5, h 9, cream stone, floor bands, two floors of lit arched windows (front, back and outer faces), crenellations + roof walk, blue banners; **corner towers** r 2.7 h 14 with blue cone roofs, gold finials and pennants on the outer corners (two per wing) + a small turret where each wing meets the keep. Total castle width 71 m (the interior is 70 m wide).
- **Gatehouse porch** in front of the door: two pillars (x +-3.6), lintel, gold trim, blue gable, two lanterns, shallow steps and a **red runner** down the castle way. Door trigger `castleData CASTLE_DOOR` (0, -64.4) r 4.6, exit spawn `CASTLE_STEPS` (0, -62.8); questNav / townGatesLogic read them (hero target z + 2).
- **Clear space** (audit): 8.3 m from the towers to the west / east wall, 9.2 m behind (north wall), 13 m from the porch to the Castle Hill edge.
- **Ring road** (`CASTLE_RING`, 3.4 m): x +-40 from z -57 to -85.6, front leg z -57, back leg z -85.6; the side flights land on the front leg (roads x +-30). Walkable 360 degrees (audit: 8 legs, 215 m, no detour).
- **Gardens** (all in `engine/castleGrounds.ts`, kit pieces via FILL, colliders in `townData TOWN_COLLIDERS`): the **Queen's Garden** (west front, lawn, fountain (-21, -63.8), gazebo (-34.2, -64.6), a ring of real Quaternius flower clumps, benches, Gardener Pim), the **Royal Yard** (east front: sand floor, weapon / shield racks, armour stands, hay targets, a well, Squire Tavi), statues + lamps along the castle way, side margins (hedge + flower clumps between the road and the wall), the back garden (statues, benches facing the keep, flower beds, a row of fruit trees, hedge under the north wall), banner poles on the retaining-wall corners. **Guards**: Sir Aldo / Sir Bram at the top of the grand flight (+-6.9, -54.7), Sentry Hale / Vero patrol the west / east ring road, all NPCs have talk + bubbles (no quests).

## Moved / changed (everything else stays where docs below say)
- Old castle terrace (x +-11, z -27.5..-19), its stairs and flower boxes, the old Chapel Hill (h 1.6) + Tavern Row (h 0.9) tiers -> one Middle Town terrace. Chapel, graveyard, tavern, trainer, tavern square benches did NOT move.
- North wall -41 -> -92 (side towers added at z -40, -66). The hermit's trail and everything north of the old wall moved 51 m north (`townData.NORTH_GROWTH`): Old Wend + camp (0, -102), trail rocks, the NW chest `nw_corner` (-43, -99.4), trail trees, the townFill trail legs, island boxes `[-48.5, -110, 56.5, 56]` + hermit clearing `[-9, -112, 9, 0]`, townHills grid Z0 -128 / NZ 393, townPath BOX z -128.
- Roads: castle path -> Royal Way + castle way; graveyard / tavern branch roads extended up to their stairs; new Terrace Street, Tavern Row lane starts at the avenue, ring road + two side-flight roads. Lamps (`CG_LAMPS`), planters (`CG_PLANTERS`), benches (`CG_SEATS`), lawns (`CG_LAWNS`) feed LAMPS / PLANTERS / TOWN_SEATS / GRASS_PATCHES. `townKit` lamp filter is `z > WALL.z0`.
- Minimap: terraces as soft pale blocks, castle = keep + two wings + towers.
- Island feel: the walls keep the lake / sea on the west and north; a 6 m grass strip + the hermit trail runs between the north wall and the sea edge; the existing river / bridge / stable / cave are untouched (no moat was added).

## Layout check (node, no browser: esbuild-bundle townPath + mapgen + data; `.audit/audit.ts` style)
Before (v5): 136 targets x 2 starts, 2 unreachable (a well, by design of a fence helper), 11 pinch points, 7 in-road footprints (all shop fronts / street dressing of the plaza ring).
After (v6): 153 targets x 2, the same 2 unreachable, 11 pinches (the same ones), 7 in-road (same), every new target reachable (castle door, ring corners, gardens, yard, fountain, lawn benches, Terrace Street ends, side flights, chapel / tavern / graveyard / trainer), tier flights narrower than 4 m: 0 of 14, castle ring 8 legs walkable. NEAR-ROAD grew 24 -> 78 only because of the garden hedges that line the ring road (0.7 m off its edge).

# (older plans below: v5 / v4 text. Where it talks about the castle terrace at z -27.5, Chapel Hill / Tavern Row as separate tiers or the north wall at z -41, v6 above wins)

## Kingdom plan (town v5, 2026-10-21; v4 districts + the shop ring + portal plaza)

Owner brief: "restructure the kingdom itself so it makes sense, not much open space with nothing", then "every shop unique, not in one row".
Camera pitch ~50 deg and it rotates, so buildings may face any yaw (front = +z turned by `rot`; the cottages carry small yaws). Coordinates are world x / z. The code wins; this is the map.

## Inside the walls (x +-45, z -41..38)
| District | Where | What |
| --- | --- | --- |
| Castle | terrace x +-11, z -27.5..-19, stairs to z -14.6 | keep, two guards, banners, beds either side of the stairs |
| Plaza | (0, 2), r 9.0 | big open paved disc: the **Adventure Portal** (kit v3 x0.9, centre (0, -0.6), front south, front spot (0, 3.8)), two guardian statues beside it ((+-5.2, 3.4)), four double lamps on the rim diagonals ((+-5.7, -3.7 / 7.7)), two benches (x +-7.6, z 2), Mira / Tobin. No lawn, flower beds, planters or banners. Four shops 2x2 face each other across it (west / east, ~3 m off the rim) |
| Market street | the avenue x 0, z 8..38 (5.2 m) | four stalls a side (x +-5.8), lamps; lanes cross at z 23.2 |
| North street | z -6, x -40..40 (3.4 m) | notice board, Trainer yard (-16, -17); Armory / Supplies stand north of it (z -15.4); the old road stub to the quest board is gone |
| Residential | terraces of plain houses straight on the streets (see Houses below); lane z 23.2 each side of the avenue (3 m) |
| Old shop row | z 1.2 | three cottages left: (-40, 1.2), (-26.4, 1.2), (34.6, 1.2) |
| Chapel quarter | Chapel Hill x -43.7..-11.4, z -39.7..-19.5 (h 1.6) | chapel, graveyard (aisle from the gate x -38 to the crypt), sexton's cottage, cloister garden |
| Tavern square | z -16..-7, x 12..44, Tavern Row tier behind (h 0.9) | tavern, tables, benches, crates, trees, two cottages, back row of five houses |
| Park | x -29..-14.5, z 13..21.4 | fountain (WELL_POS), benches, trees, lawn; the Pets shop on its east side |
| Rises | West Rise (h 1.2), East Rise (h 0.8), x +-29..43.7, z 13..36.7 | cottages, the Fortune Teller's corner (W), the Tech House (E); stairs at z 23.2 and z 32.4 |
| Garden strip | z 33..36 along the south wall | walkway from the rises to the avenue; forge yard entrance at x 17..21 |

### The seven shops: a 2x2 pair either side of the plaza (engine/townData `SHOP_LOOK`, constants `SHOP_POSITIONS`)
Counter + keeper = town_kit_v2 `shop_stall_house`; dressing = kit v3 pieces in shop-local coordinates (any yaw). Each plaza shop has a short straight path (`SHOP_SPURS`, `spurPlaza`) from its front point to the plaza rim. Dressing of the four plaza shops stays inside local x +-3.1 (the pairs are 7 m apart) and goes BEHIND the shop (local z < 0 = away from the plaza) because the gap to the street kerbs is ~0.
- West pair, facing east (rot pi/2), counters x -16.4: Fortune Teller (-16.4, -1.5) north, Pets (-16.4, 5.5) south. East pair, facing west (rot -pi/2), counters x 16.4: Blacksmith (16.4, -1.5) north, Warehouse (16.4, 5.5) south. Fronts (4.3 m ahead) at x +-12.1, so the paths are ~3 m long; the pairs span z -4.5..8.5 (between the street kerbs).
- Fortune: fortune_tent behind, hanging lanterns. Pets: doghouse in a pet_pen_fence pen behind, bird_cage. Smith: forge_furnace + weapon_rack behind, anvil_big, grindstone, chimney smoke. Warehouse: crate_stack_big + cart_hay behind.
- Armory (-12.6, 19.8) rot pi (the old Pets spot south of the south street, faces north, path to the street z 10); Tech House (24.8, 2) rot 0; Potions / Supplies (32, 2.6) rot 0: both face the south street.
- The old Armory (-21.5, 2.6) and Warehouse (12.6, 19.8) spots are free again (the Warehouse one is open grass).
Moved with it: the south-street lamps at x +-18.25 and +-9.4 and the plaza planters / north banners are gone; Lysa's patrol is z 10.4, x -15..-26; the east cat roams (10.4, 2.1); the plaza floor is rebuilt for r 9 (concentric slab rings, two orange inlays at r 6 and r 8.7, kerb ring of ~60 pieces; TownScenery buildGround / buildKerbs).
Cottages fill the old shop spots. Keep every prop out of the corridors: north street z -7.5..-4.5, south street z 8.5..11.5, castle path / avenue |x| < 1.4 (check: collider scan in the chk scripts).
Outskirts: Brewer (-10.2, 106.2), Fishmonger (-52.5, 24), Mining Supplies (61.5, 3) unchanged.

## Outside the walls
Gate meadow (z 38..60: groves, stable + paddock, east park, beach path) | the tower road through a forest (x -20..30, z 128..168) ending at the **Endless Tower** (5, 155.4, door faces north, door spot (5, 148.7)) | farm district (fields, barn, windmill,
farmhouse, coop, animals, sheep + pig pasture) | river z 61..75 with the great bridge and the mine footbridge (banks lined with bushes, rocks, tufts) | lake + beach + pier + ship |
mining camp + cave (x 55..72) | the Brewer's lane (z 112, x 0..-21) | hermit trail round the north-east corner and along the north wall. Roads connect all of it; the rest is forest,
hedges, rocks and props (townFill.ts groves). Walks from the spawn (in front of the portal): castle 5 s, gate 5 s, tower 20 s, farm 21 s, pier 20 s, mines 21 s, hermit 37 s.

## Data tables (kit v3 swap = rename pieces)
- `engine/townData.ts`: HOUSES (kit piece + scale; HOUSE_KIT rows give footprint / door), STALLS, PLANTERS, LAMPS, FENCES, ROADS, TOWN_SEATS, GRASS_PATCHES, TIERS, SHOP_LOOK, YARD_* (derived).
- `engine/townFill.ts`: `PIECES` (role -> piece names: oak, pine, bush, hedge, rock, ...), the hedge / grove / carpet tables, `CLUTTER_SPOTS`, `FILL` (piece -> rows) and `FILL_COLLIDERS`.
- `render/townKit.tsx` places v2 pieces (houses, shop extras, props, clutter); `render/natureLayout.ts` places nature pieces (FILL + trees, fences, farm, pier ...).
- Checks (node, no browser): esbuild-bundle a script importing `engine/systems/townPath` + `engine/mapgen` + the data files, add TOWN_COLLIDERS + FILL_COLLIDERS with `addTempCollider`, and run `findPath` from
  `PLAZA.z - 4.4` to every shop front, door, NPC home / patrol point, fishing spot, nest, bench, harvest node and animal.

## Houses (owner 2026-10-21: no yards / lots, plain medieval terraces)
22 houses inside the walls (hero's included), all AXIS-ALIGNED (rot 0 = door south, PI = door north), standing directly on the streets with fronts ~0.6-1.4 m off the kerb and ~0.2 m between neighbours; none within 1.5 m of a stair flight or its approach. There are no lots, lawns, fences, gates, pavers or mailboxes any more (`LOTS` / `LOT_FENCES` / `LOT_PATCHES` stay exported but empty; `townFill` keeps its loose fill out of every house box).
- Old shop row (fronts z 6.9, south street): west terrace x -42.9..-21.4 (four), east pair x 28.6..38.9.
- Tavern Row tier: back terrace of six (fronts z -30), flanking cottages (fronts z -21, clear of the S stairs at x 18.5 / 40).
- South of the south street: tower house at (22.8, 15.3) facing north; West / East Rise north houses (fronts on the lane z 21); south walkway houses (fronts z 32.5): hero's house (-38.6, 29.4), Market Row (18.5, 29.46), East Rise (38.2, 29.46). Chapel Hill: the sexton's cottage (-17, -34.5).
- Rise N stairs moved to x -31.2 / 31.2 (clear of the houses; Tomas' patrol now turns at x -26).
**Hero's house**: `HERO_HOUSE` (-38.6, 29.4), faces south; door spot `HOME_DOOR` / `HOME_OUT` (engine/homeData) = 1.1 / 2.2 m in front of the door; the "Your Home" plate floats over the door (render/Town HeroHomeSign).
**Enterable later** (`ENTERABLE_HOUSES`, yaw 0, door spot = house x + door offset, 0.9 m in front of the door; walk-tested): North Street Cottage (-40.2, 3.86), Market Row House (18.5, 29.46), West Row House (-29.72, 3.75).

## 2026-10-21 owner pass
- All shops axis-aligned (rot 0 / ±90° / 180°). Armory and Potion Shop moved off the castle entrance onto the old shop row
  (Armory -21.5, 2.6; Potion Shop 30.5, 2.6, both facing the south street); Tech House faces south.
- Fewer houses: Tavern Row keeps 3 back-row houses + 1 cottage; the shop-row terraces are thinned (2 west, 1 east) with gaps.
- Market stalls and market tents removed from the avenue (they looked open / unfinished).

## Floors (owner ref 2026-10-21: cream flagstones + terracotta kerbs + green lawns)
Town paving (`render/TownScenery.tsx`): `flagTexture()` (tileable Voronoi canvas: big soft cream slabs, thin warm-grey grout, a few darker) shared by the yard paving and the street strips (world-planar UVs, tile 6 m, so they line up). `buildKerbs()` = ONE merged mesh of terracotta brick kerb along both edges of every paved street (skips street crossings, stairs, plaza/gate mouths) plus rings round the plaza and gate forecourt; grass-patch kerbs and the portal-lawn kerb are terracotta too. Plaza: concentric slab rings (boxes) round the portal lawn + an orange ring inlay; no star (portal covers the centre). Visual only; ROADS data, colliders and the minimap are unchanged. Cost: 1 extra draw call.

## Outskirts (owner 2026-10-22: "so cluttered", Greenwood look)
Outside the walls the look follows the Greenwood run rooms. Ground: `render/Terrain.tsx` uses `groundDetail('GRASS')` from `render/Room.tsx` (calm painted lawn, soft clover speckle in the texture, period 8 m). Paths: `buildDirtPaths` (`render/TownScenery.tsx`) = a dense run of round discs along every outskirts road, one even width (road w x 0.8, min 1.8), darker packed rim + tan trodden path + lighter centre; no blotches, no loose discs. Removed: all flower mounds (`deco()` in `engine/townFill.ts` refuses flower / tuft / mushroom pieces; the `natureLayout` scatter no longer adds them; `bush_flower` is now `bush_cluster`), the `stone_path_tile` discs (STEP_PATHS loop disabled), palms off the beach (`treeFor` + forest ring). Groves outside the walls and the river-bank props are thinned (about 40% / 22%). Trees: kit v3 oak / birch / fruit / blossom / layered pines are replaced in `render/natureKit.tsx` (`CUTE_TREES`, `cuteTree`) by procedural soft shapes (ball, tall capsule, rounded cube, 3-tier cone) on a trunk, same bbox so colliders and V3_K are unchanged.
Gateways: the beach road and the mines road never cross the town wall (they start in the south gate meadow), so `GATEWAYS` (`engine/townData.ts`) are free-standing stone arches ON those roads (beach x -27, mines z 47; colliders = two pillar circles, opening 4 m); built by `buildWayGate`. The beach barricade (x -37) lies beyond the arch, the cave gate (z 9.5) far beyond.
Lawn strips: a generator at the end of `engine/townData.ts` pushes flat rounded-rectangle lawns beside houses inside the walls into `GRASS_PATCHES` wherever the spot is free (terracotta kerb like the park); visual only.

## Story gates (2026-10-22)
Four outskirts corners are blocked until the main story reaches a step (table `TOWN_GATES` in `engine/townGates.ts`; the state is derived from `story.step`, nothing saved). Coordinates are world x / z.
| Gate | Blocker | Where | Opens (step id / index) | Hides |
| --- | --- | --- | --- | --- |
| beach | flooded-road barricade + sandbags, puddles, duck, sign | across the beach dirt road x -37, z 49.6..55.2 (+ invisible plugs at z 39.4..41.4, 46.4..48.6, 58.4..61.6) | `wolves` (3) | Fishmonger, fishing spots, pier, Ned, Marlo, Capt. Rhea |
| cave | cave-in rubble, broken props, pickaxe, crystals, sign | in front of the mine mouth (70.2..74.6, z 9.5): a door gate, the camp stays open | `report2` (6) | the Enter Crystal Cave pill (Look pill instead) |
| tower | fallen tree (root ball, crown, mushrooms, axe sign) | against the Endless Tower's door (1.2..8.8, z 150.2): a door gate | `wren` (7) | the tower door pill (the HUD corner icons still open Daily / Waves / Tower) |
| hermit | thorny brambles (thorns, blossoms, vines, sign) | NE back trail (46.8..52.6, z -27) | `lysa2` (11) | Old Wend |
Rules: a road gate must seal the walk at the hero's real size (collider r + 0.5; the A* grid is stricter, so verify with the flood fill, see HANDOFF "Story gates"); a gate's Look zone (3 m from its span) never overlaps a shop (7 m from its position), NPC (3.8 m), door or fishing prompt zone; the
main story needs only the portal, shops, castle and Garrick / Wren / Lysa / Dorn / Roan, all inside the walls, so nothing before the Tower step (30) needs a gated place. The minimap draws closed gates as an orange bar with an "x" badge.

## Open town (owner 2026-10-23: "make the kingdom open field"; the street-edge plant boxes / hedges / house-front collider chains of 2026-10-22 are gone)
Nothing lines the streets: you can walk freely between streets, houses and lawn strips (each house is one collider circle; the pocket lawns are gone too, `engine/townBarriers.ts` was deleted). Only the chicken pen (PEN fence) is a closed little pen.
Kept from the 2026-10-22 tidy: barrel / crate clusters (`cluster()` in townFill) hug the hill / tier retaining walls, house sides and the east wall; shop lamps flank the shop paths (local x +-1.95); north-street lamps on z -8.25, south-street west lamps on z 7.75; the two branch paths (x -38 to the graveyard stairs, x 28 into the tavern square) stay as paving.
Plaza polish (`addPlaza`, render/TownScenery): a thin warm inlay ring in the paving (r 8.4) and flush flower beds (round, walkable, no collider) round the two guardian plinths. Walk checks: path test baseline 208 pass / 5 fail (Old Wend's outskirts home + the 4 pen chickens, both by design).
