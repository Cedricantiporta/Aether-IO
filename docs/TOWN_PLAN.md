# Kingdom plan (town v4, 2026-10-20)

Owner brief: "restructure the kingdom itself so it makes sense, not much open space with nothing", then "every shop unique, not in one row".
North-up camera at ~50 deg pitch, building fronts face south (+z). Coordinates are world x / z. The code wins; this is the map.

## Inside the walls (x +-45, z -41..38)
| District | Where | What |
| --- | --- | --- |
| Castle | terrace x +-11, z -27.5..-19, stairs to z -14.6 | keep, two guards, banners, beds either side of the stairs |
| Plaza | (0, 2), r 5.8 | founder's statue, planters, two benches, Mira / Tobin |
| Market street | the avenue x 0, z 8..38 (5.2 m) | four stalls a side (x +-5.8), lamps; lanes cross at z 23.2 |
| North street | z -6, x -40..40 (3.4 m) | Armory (-8.2, -10.6), stalls on its north kerb, quest board (7.5, -13), Trainer yard (-16, -17) |
| Residential lanes | lane z 23.2 each side of the avenue (3 m) | rows of houses at z 16.2 (backs on the south street) and z 29.6 (hedged back gardens on the lane); yards = lawn + 2 planters per house (derived from HOUSES) |
| Old shop row | z 1.2..1.4 | now cottages of every kind (the seven shops moved out, see below) |
| Chapel quarter | Chapel Hill x -43.7..-11.4, z -39.7..-19.5 (h 1.6) | chapel, graveyard (aisle from the gate x -38 to the crypt), sexton's cottage, cloister garden |
| Tavern square | z -16..-7, x 12..44, Tavern Row tier behind (h 0.9) | tavern, tables, benches, crates, trees, two cottages, back row of five houses |
| Park | x -29..-14.5, z 13..21.4 | fountain (WELL_POS), benches, trees, lawn; the Pets shop on its east side |
| Rises | West Rise (h 1.2), East Rise (h 0.8), x +-29..43.7, z 13..36.7 | cottages, the Fortune Teller's corner (W), the Tech House (E); stairs at z 23.2 and z 32.4 |
| Garden strip | z 33..36 along the south wall | walkway from the rises to the avenue; forge yard entrance at x 17..21 |

### The seven shops (engine/townData `SHOP_LOOK`, constants `SHOP_POSITIONS`)
Counter + keeper = town_kit_v2 `shop_stall_house` (yaw within +-17 deg of south); each shop adds its own pieces:
- Pets (-12.4, 15.6) beside the park: hutch, flower boxes, a dog + cat in the front yard.
- Fortune Teller (-39, 17), rot 0.3: West Rise corner, a small mystic tower, lanterns.
- Potions (-31.8, -12.4): by the chapel / graveyard path, planters and an herb garden.
- Armory (-8.2, -10.6): on the castle path, banners, weapon rack, crates.
- Warehouse (13.8, 15.8): market street, annex, cart, crates and barrels.
- Blacksmith (13.2, 29), rot -0.12: forge yard by the gate, barrels, hay, chimney smoke.
- Tech House (36.4, 17.4), rot -0.25: East Rise, tall tower beside it, lamps.
Outskirts: Brewer (-10.2, 106.2), Fishmonger (-52.5, 24), Mining Supplies (61.5, 3) unchanged.

## Outside the walls
Gate meadow (z 38..60: groves, stable + paddock, east park, beach path) | the portal road through a forest (x -20..30, z 128..168) | farm district (fields, barn, windmill,
farmhouse, coop, animals, sheep + pig pasture) | river z 61..75 with the great bridge and the mine footbridge (banks lined with bushes, rocks, tufts) | lake + beach + pier + ship |
mining camp + cave (x 55..72) | tower clearing (x -86..-40, z 103..121) | hermit trail round the north-east corner and along the north wall. Roads connect all of it; the rest is forest,
hedges, rocks and props (townFill.ts groves). Walks from the spawn: castle 3 s, gate 6 s, portal 22 s, tower 23 s, farm 21 s, pier 20 s, mines 21 s, hermit 37 s.

## Data tables (kit v3 swap = rename pieces)
- `engine/townData.ts`: HOUSES (kit piece + scale; HOUSE_KIT rows give footprint / door), STALLS, PLANTERS, LAMPS, FENCES, ROADS, TOWN_SEATS, GRASS_PATCHES, TIERS, SHOP_LOOK, YARD_* (derived).
- `engine/townFill.ts`: `PIECES` (role -> piece names: oak, pine, bush, hedge, rock, ...), the hedge / grove / carpet tables, `CLUTTER_SPOTS`, `FILL` (piece -> rows) and `FILL_COLLIDERS`.
- `render/townKit.tsx` places v2 pieces (houses, shop extras, props, clutter); `render/natureLayout.ts` places nature pieces (FILL + trees, fences, farm, pier ...).
- Checks (node, no browser): esbuild-bundle a script importing `engine/systems/townPath` + `engine/mapgen` + the data files, add TOWN_COLLIDERS + FILL_COLLIDERS with `addTempCollider`, and run `findPath` from
  `PLAZA.z - 4.4` to every shop front, door, NPC home / patrol point, fishing spot, nest, bench, harvest node and animal.
