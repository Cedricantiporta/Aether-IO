# Kingdom plan (town v5, 2026-10-21; v4 districts + the shop ring + portal plaza)

Owner brief: "restructure the kingdom itself so it makes sense, not much open space with nothing", then "every shop unique, not in one row".
Camera pitch ~50 deg and it rotates, so buildings may face any yaw (front = +z turned by `rot`; the cottages carry small yaws). Coordinates are world x / z. The code wins; this is the map.

## Inside the walls (x +-45, z -41..38)
| District | Where | What |
| --- | --- | --- |
| Castle | terrace x +-11, z -27.5..-19, stairs to z -14.6 | keep, two guards, banners, beds either side of the stairs |
| Plaza | (0, 2), r 5.8 | the **Adventure Portal** (kit v3 x0.7, front south, front spot (0, 4.6)) on a kerbed round lawn, two guardian statues + flower beds, planters, two benches (north rim), Mira / Tobin; the six main shops ring it |
| Market street | the avenue x 0, z 8..38 (5.2 m) | four stalls a side (x +-5.8), lamps; lanes cross at z 23.2 |
| North street | z -6, x -40..40 (3.4 m) | notice board, Trainer yard (-16, -17); Armory / Supplies stand north of it (z -15.4); the old road stub to the quest board is gone |
| Residential lanes | lane z 23.2 each side of the avenue (3 m) | a few lots only: houses at (25.8, 16.2), (36.4, 17.4), (-39, 17) and the south row (25, 28), (34.6, 28); the south-west quarter is open (park, stair foot) |
| Old shop row | z 1.2 | three cottages left: (-40, 1.2), (-26.4, 1.2), (34.6, 1.2) |
| Chapel quarter | Chapel Hill x -43.7..-11.4, z -39.7..-19.5 (h 1.6) | chapel, graveyard (aisle from the gate x -38 to the crypt), sexton's cottage, cloister garden |
| Tavern square | z -16..-7, x 12..44, Tavern Row tier behind (h 0.9) | tavern, tables, benches, crates, trees, two cottages, back row of five houses |
| Park | x -29..-14.5, z 13..21.4 | fountain (WELL_POS), benches, trees, lawn; the Pets shop on its east side |
| Rises | West Rise (h 1.2), East Rise (h 0.8), x +-29..43.7, z 13..36.7 | cottages, the Fortune Teller's corner (W), the Tech House (E); stairs at z 23.2 and z 32.4 |
| Garden strip | z 33..36 along the south wall | walkway from the rises to the avenue; forge yard entrance at x 17..21 |

### The seven shops: a ring round the plaza (engine/townData `SHOP_LOOK`, constants `SHOP_POSITIONS`; all face the plaza centre)
Counter + keeper = town_kit_v2 `shop_stall_house`; dressing = kit v3 pieces in shop-local coordinates (any yaw). Each shop has a short path (`SHOP_SPURS`) from its front point to the plaza rim (Tech: to the south street).
- Armory (-8, -15.4) rot 0.3 and Potions (8, -15.4) rot -0.3: north of the north street. Armory: shield_rack, armor_stand, banner_pole_red. Potions: herb_garden_box, potion_shelf_cart, cauldron.
- Fortune Teller (-12.4, 1.8) rot pi/2 and Blacksmith (12.4, 1.8) rot -pi/2: the flanks. Fortune: fortune_tent behind, hanging lanterns. Smith: forge_furnace, anvil_big, grindstone, weapon_rack, chimney smoke.
- Pets (-12.6, 19.8) rot 2.75 and Warehouse (12.6, 19.8) rot -2.75: south of the south street. Pets: doghouse + pet_pen_fence, bird_cage. Warehouse: crate_stack_big, cart_hay.
- Tech House (22, 2) rot -0.35: east band, tech_tower_small.
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

## Cottage lots + special houses (owner 2026-10-21)
15 houses inside the walls (hero house included), each with a `LOTS` entry: rounded lawn, picket fence, 3.4 m gate at the door, pavers, mailbox, decorations (see HANDOFF Kingdom v5). Houses: sexton (-17, -34.5), (-31.8, -12.4),
(35.5, -11.8), (17.5, -27), (38.8, -26.4), (28.8, -35.2), (25.8, 16.2), (36.4, 17.4), (-39, 17), (25, 28), (34.6, 28), (-40, 1.2), (-26.4, 1.2), (34.6, 1.2) + the hero's (-40.3, 27).
**Hero's house**: the West Rise lot with the blue-and-gold arch, flag, red rug, doghouse, "Your Home" plate; door spot `HOME_DOOR` / `HOME_OUT` (engine/homeData).
**Enterable later** (`ENTERABLE_HOUSES`, yaw 0, door spot = on the path in front of the door, inside the lot gate; walk-tested):
- North Street Cottage: house (-31.8, -12.4), door spot (-32.61, -8.36)
- Market Row House: house (25, 28), door spot see `ENTERABLE_HOUSES` (about (24.1, 32.0))
- West Row House: house (-26.4, 1.2), door spot (-26.4, 5.7)
