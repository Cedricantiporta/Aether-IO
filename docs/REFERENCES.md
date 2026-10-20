# Visual references (owner-supplied) — what the game should look like

Saved images live in `art/reference/`. Images the owner sends WHILE Claude is busy are not saved to disk (only images
sent as their own message are), so several references below exist only as descriptions: ask the owner to re-send them
(one per message, while Claude is idle) or to upload them to `art/reference/` through GitHub.

## Saved
| File | What it shows / why it matters |
|---|---|
| `town_concept_1..3.webp` | The target town: white/cream stone, royal-blue roofs with gold trim, round towers with blue cone roofs, walls, a gate with blue banners, angel fountain, planters, lamps, market stalls, a well. |
| `blender_kit_houses.png` | Current Blender kit houses (Higgsfield 3D Jutsu project "Aether Town Kit"), front view. |
| `bug_gold_roof_V.png` | Owner screenshot of the gold "V" trims on the pointed-roof houses (fixed: the rake boards were removed in kit revision 8). |
| `../raw/A10_keyart.webp` | Key art (loading screen); also a good colour/mood reference for the town. |

## Not saved (re-send needed) — described
* **House reference sheet (AI)**: chunky stone blocks, royal-blue scale tiles, gold finials, dark timber gable frames,
  square 4-pane glowing windows with white flower boxes, arched door with a blue awning, stone steps, dormers, open-top
  chimneys. The Blender kit houses follow it.
* **Wall style ("just this simple design")**: the gate towers' light cream big blocks with thin joints. NOT the dark,
  detailed bevelled full bricks (owner: "not like this"). Kit revision 9 recoloured walls/towers light; a full rebuild
  with bigger, flatter blocks (fewer polys) is still open.
* **Camera (Zelda: Link's Awakening remake / Echoes of Wisdom)**: fixed north-up camera, steep "diorama" angle with a
  long lens, tilt-shift blur at top and bottom of the screen, toy-like lighting.
* **Interiors (Link's Awakening / Echoes)**: (1) a small house room: plain light floor, wooden beds/table, shelves, pots,
  barrels, dark walls framing the room, warm light pool; (2) throne room: pale stone floor tiles with a diagonal
  diamond pattern, red carpet with gold stripes, a raised dais with 3 wide steps and carved trim, red banners, tall
  bright windows, pillars; (3) castle hall: same tiles, red carpet up a grand staircase between two brazier pedestals,
  low balustrade walls with round knobs on the sides. Use these for the castle / chapel / tavern / home interiors.
* **Exteriors (Link's Awakening)**: (1) a flagstone path of big irregular pale stones with loose stepping stones at the
  edges through bright grass, braziers on stone pedestals at a bridge; (2) raised grass blocks with dark blue stone
  cliff sides, hedge borders with yellow flowers, water with lily pads, a dirt path between hedges. => terraces with
  stone sides, hedges on top, stepping-stone paths.
* **Art sheets sent mid-turn (need re-send, then slice with `scripts/slice_sheet.py --cutout`)**: weapons B1/B2,
  armor B3, necro armor + rings/amulets B4, cards A5; plus newer sheets: gear (bow, hoods, helmets, crowns, capes,
  orb, fang necklace), monster drops (slime gel, heart, goblin ear, fang necklace, totem, bat wing, bones, skulls,
  scroll, scales, tusk), loot/ores (knuckles, war banner, skull plaque, medal, coin bag, goblet, rune stone, wax seal,
  pendant, boot, tin can, ores and crystals), boss drops (heart of stone, ice crown, void shards, acorn, scales,
  claws, cores...), fish (16 kinds incl. geode + crystal), enemy portraits (2 sheets: common enemies and biome
  enemies), boss portraits, status-effect icons (stun, root, silence, armor break, blind, burn, poison, bleed, slow,
  freeze, fear, shatter, war cry, rage, haste, shield; square framed, NOT cut-out: slice in grid mode).
* **Summon art (last message)**: a tarot card back (navy + gold sun/moon compass) and two banners "Gem Altar —
  Summon" (gold) and "Crystal Altar — Summon" (blue). Two variants were sent; use the second (cleaner card frame).
  Banners include their own title text, so don't overlay a title in the UI.
