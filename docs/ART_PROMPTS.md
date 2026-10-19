# Aether Survivor — painted art plan (ChatGPT image prompts)

Every icon / card / portrait in the game is currently drawn in code (SVG/CSS). This file lists everything that can be
replaced by painted art, grouped into **sheets**: one generated image holds a grid of many icons, which Claude then
cuts apart and wires into the UI. Fewer generations, consistent style.

## How to use (owner)
1. Open ChatGPT image generation. For each sheet: paste **the STYLE block** + **the GRID rule** + **that sheet's list**.
2. Ask for the size given (1024×1024 for 4×4 icon sheets; others say so). If an icon comes out wrong, ask ChatGPT to
   "redo only cell N, keep everything else identical", or regenerate the sheet.
3. Save each result as PNG named exactly as the sheet code, e.g. `A1_skills_1.png`, and put them in the repo folder
   `art/raw/` (GitHub → Add file → Upload files) or attach them in chat. Claude slices them into `public/art/...`,
   trims the gutters, makes small sizes, and connects each tile to the ids listed here (the order matters).
4. Start with **Tier A** (biggest visible change, 10 images). Tier B / C later.

---

## STYLE block (paste first, every time)
```
Style: hand-painted fantasy MMORPG game icons, professional and polished but slightly casual and friendly
(stylized-realistic, like a modern mobile MMORPG item/skill icon set). Painterly brush texture, clean readable
silhouette that still reads at 48 px, strong value contrast, soft light from the top-left, subtle rim light,
a thin dark outline around the main subject. Colours natural and grounded: earthy browns, steel greys, forest
greens, warm leather, muted gold accents; each icon uses the colour of its element (fire = warm orange/red,
ice = pale cyan/white, holy = warm gold/ivory, poison = olive/green, shadow/death = desaturated teal-grey and bone).
Purple/violet ONLY where the subject is arcane/void, and kept muted. NOT glossy, NOT plastic, NOT neon, no heavy
glow or bloom, no lens flares, no sparkle spam, no airbrushed "AI" smoothness, no 3D-render look.
No text, no letters, no numbers, no watermarks, no UI frames or borders around the icons.
```

## GRID rule (paste second, for icon sheets)
```
Layout: one 1024x1024 image containing a 4x4 grid of 16 separate square icons (each about 248x248 px), separated
by straight, even 8 px pure black (#000000) gutters, with an 8 px black border around the whole sheet. Every icon
fills its own cell, centered, with a softly vignetted dark muted background inside the cell (each cell's background
tinted slightly to match the icon's element colour). Icons do not overlap cells. Same lighting, outline thickness,
level of detail and painting style across all 16 cells. Order: left to right, top to bottom, exactly as listed.
```
For portrait/card sheets the sheet text below overrides the grid size.

---

# TIER A — do these first (10 images)

### A1_skills_1 — Archer, Wizard, Barbarian abilities (4×4)
```
1  GALE_ARROW: a green-white arrow flying inside a swirling gust of wind
2  LIGHT_ARROW: a long golden arrow of light piercing straight through, bright shaft
3  FROST_FIELD: an ice crystal patch spreading on the ground with frost spikes
4  SHADOW_ROLL: a hooded archer silhouette rolling, motion blur of smoke behind
5  STORM_ARROWS: dozens of arrows raining down from dark clouds (archer ultimate, epic scale)
6  FIREBALLS: three fireballs flying in an arc, orange flame trails
7  STORM_ORBS: two crackling blue lightning orbs orbiting a point
8  SINGULARITY: a dark gravity well pulling rocks and dust inward (muted violet core)
9  BLINK_NOVA: a mage teleport flash, blue rune circle burst
10 METEOR_CATA: a huge flaming meteor falling from the sky onto the ground (wizard ultimate)
11 CROSS_SLASH: two crossing red-orange slash marks forming an X
12 WHIRLWIND: a spinning axe tornado of steel and dust
13 EARTHSPLITTER: a heavy axe slamming the ground, crack splitting forward with rocks
14 BLOODRAGE_LEAP: a barbarian leaping high with axe raised, red rage aura
15 TITAN_WRATH: a giant stone fist / colossal barbarian silhouette smashing (barbarian ultimate)
16 DASH: a generic dash icon, a boot with speed lines and dust
```

### A2_skills_2 — Knight, Necromancer, basic attacks (4×4)
```
1  HOLY_WAVE: a crescent wave of warm golden holy light sweeping forward
2  SHIELD_WALL: a large kite shield planted firmly, golden light edge
3  JUDGMENT: a radiant sword of light descending from above
4  HOLY_CHARGE: a knight charging with shield forward, golden streak
5  DIVINE_AVATAR: a winged armoured guardian of light (knight ultimate)
6  RAISE_DEAD: skeletal hands rising from cracked earth, teal-green ghost light
7  BONE_WARD: a ring of floating bones forming a protective barrier
8  CURSE_FIELD: a sickly green plague mist pool on the ground with skulls
9  SOUL_STEP: a pale ghostly afterimage of a hooded figure stepping forward
10 ARMY_DEAD: a hulking bone golem made of skulls and ribs (necromancer ultimate)
11 PIERCING_SHOT: a single arrow nocked on a drawn bow (archer basic attack)
12 FIREBALL: a single fireball in an open palm (wizard basic attack)
13 AXE_SPIN: a thrown spinning hand axe (barbarian basic attack)
14 BONE_SPEAR: a sharp bone spear projectile with green wisps (necromancer basic attack)
15 HP: a round glass flask with red health potion, cork stopper
16 MP: a round glass flask with blue mana potion, cork stopper
```

### A3_passives — passive skills (4×4)
```
1  regen: a green leaf with a healing droplet (regeneration)
2  barrier: a translucent golden energy shield bubble
3  weapon: a glowing clenched fist / power crest (ultimate mastery)
4  burning: an arrow wrapped in fire (burning arrow)
5  freezing: an arrow encased in ice (freezing arrow)
6  inspire: a hunting horn with golden notes (inspire allies)
7  thunder: a lightning bolt striking from a small cloud (thundercaller)
8  freezeSpell: a blizzard of snowflakes swirling (blizzard)
9  storm: an arcane rune shield with crackling edges (arcane shield)
10 orbital: three small blades orbiting in a circle (orbital blades)
11 warcry: a roaring barbarian face / war horn shout
12 stamp: several axes spinning outward (axe storm)
13 consecrate: a glowing holy circle on stone ground (consecration)
14 smite: a hammer of light striking down (smite)
15 radiant: a burst of golden light rays from a sun emblem (radiant burst)
16 soulHarvest: a scythe gathering small ghostly souls (soul harvest)
```
(Grave Call and Bone Armor go on A9.)

### A4_cards_1 — tarot reward card illustrations (4×4)
Use the STYLE block, then:
```
Layout: one 1024x1024 image, 4x4 grid of 16 separate square illustrations with 8 px black gutters and border.
Each cell is a small symbolic TAROT-CARD style vignette (no card border, no text): one central emblem object in a
simple scene with a muted sky/background, like the centre art of a classic tarot card, painted. Calm, symbolic,
elegant, not busy.
1  Sharpness (damage): a gleaming sword over a whetstone
2  Vitality Rune (max health): a carved red heart rune stone
3  Iron Skin (defense): an iron breastplate on a stand
4  Haste (attack speed): an hourglass with sand flying fast
5  Wind Step (move speed): a winged boot on a breeze
6  Precision (crit rate): a target with an arrow in the bullseye
7  Lethality (crit damage): a dagger dripping a single red drop
8  Clockwork (cooldown): brass gears and a clock face
9  Impact (knockback): a war hammer hitting with a shockwave
10 Bloodthirst (lifesteal): a goblet of red wine with a fang motif
11 Bulwark (damage reduction): a tower shield in front of a castle wall
12 Mana Crystal (max mana): a blue crystal cluster
13 Spring of Mana (mana regen): a small spring of glowing blue water
14 Shadow Step (dash cooldown): a cloaked figure fading into shadow
15 Quickdraw Flask (potion cooldown): a potion flask on a belt hook
16 Second Breath (restore): a fresh breath of wind over a sunrise
```

### A5_cards_2 — legendary/special cards + backdrops (4×4, same layout text as A4)
```
1  Surge of Fury (ultimate charge): a roaring flame in a clenched fist
2  Aegis (legendary shield): a golden round shield with radiant rim
3  Death Defiance: a skull cracking while a heart beats inside
4  Afflictor: a twisted thorny vine with poison and fire
5  Shieldbreaker: a shattered enemy shield, pieces flying
6  Guardian's Spoils: a treasure chest guarded by a lion statue
7  Giant Slayer: a small sword standing before a giant's fallen helmet
8  Alchemist: an alchemy table with bubbling flasks
9  Executioner: an executioner's axe on a block
10 First Strike: a single arrow hitting first, dawn light
11 Second Wind: a falling knight rising again, wind around
12 Gold Rush: a pile of gold coins spilling from a sack
13 Lingering Malice: a dark smoke serpent curling around a dagger
14 BACKDROP legendary: empty sky with golden clouds and light rays (no object)
15 BACKDROP mythic: empty sky with deep red-orange flames (no object)
16 BACKDROP common: empty calm night sky with a few stars (no object)
```

### A6_pets_1 — pets (4×4)
```
Each cell: a cute but well-crafted bust portrait of the pet, facing three-quarters, friendly expression.
1  pet_blob Green Blob: a small green slime
2  pet_rock Pet Rock: a smooth grey rock with tiny eyes and a moss tuft
3  pet_bat Vampire Bat: a small dark bat with red eyes, wings spread
4  pet_fox Ember Fox: an orange fox with flame-tipped tail
5  pet_owl Frost Owl: a white-blue snowy owl
6  pet_fairy Light Fairy: a tiny fairy with warm glowing wings
7  pet_sprite Storm Sprite: a small cloud spirit with lightning sparks
8  pet_turtle Shield Turtle: a turtle with a shield-shaped shell
9  pet_wolf Spirit Wolf: a pale blue ghostly wolf
10 pet_golem Iron Golem: a small iron golem with rivets
11 pet_mimic Mimic Chest: a wooden treasure chest with teeth and tongue
12 pet_dragon Gold Dragon: a small golden dragon
13 pet_shadowcat Shadow Cat: a sleek dark cat with smoky tail
14 pet_crystal Crystal Golemling: a little golem made of blue crystals
15 pet_phoenix Phoenix: a fiery red-gold phoenix bird
16 pet_demigod Celestial Wisp: a soft golden-white spirit wisp with a tiny face
```

### A7_items_consumables (4×4)
```
1  potion_hp: small red health potion flask
2  potion_hp_big: big red health potion bottle with gold cap
3  potion_mana: small blue mana potion flask
4  potion_mana_big: big blue mana potion bottle with gold cap
5  upgrade_core: a faceted violet-grey crystal core in a metal cage
6  upgrade_core_2 Refined Core: a gold crystal core in a metal cage
7  upgrade_core_3: a red crystal core in a metal cage
8  revive_ankh Ankh of Life: a golden ankh with a small red gem
9  reforge_stone: a grey whetstone carved with a rune
10 temper_oil: a small oil jar with amber liquid
11 augment_rune: a flat stone tablet with a glowing blue rune
12 erase_scroll: a rolled parchment scroll with a red wax seal
13 tool_pickaxe: an iron mining pickaxe
14 aether_crystal: a pale cyan aether crystal shard cluster
15 gold coin: a stack of gold coins (currency)
16 gem: a single cut cyan gemstone (premium currency)
```

### A8_items_materials (4×4)
```
1  shard_common: a small grey crystal shard
2  shard_rare: a blue crystal shard
3  shard_epic: a violet crystal shard
4  shard_legendary: a gold crystal shard
5  shard_mythic: a red crystal shard
6  elixir might: a tall elixir vial with orange liquid
7  elixir iron: a tall elixir vial with steel-grey liquid
8  elixir swift: a tall elixir vial with green liquid
9  elixir fortune: a tall elixir vial with golden liquid
10 elixir vigor: a tall elixir vial with crimson liquid
11 skill point: a small golden star medallion
12 gate key: an ornate bronze key
13 lantern: an iron cave lantern with a warm flame
14 treasure chest: a closed wooden treasure chest with iron bands
15 bag: a leather adventurer's backpack
16 anvil: a blacksmith's anvil with a hammer
```

### A9_ui_glyphs — menu, rooms, portals (4×4)
```
Simpler symbolic icons, still painted, centered, a little flatter than item icons.
1  Hero menu: a knight helmet
2  Quests: a scroll with a quill
3  Achievements: a gold trophy cup
4  Codex: a thick leather-bound book
5  Settings: a bronze gear cog
6  Skills: an open spellbook with a glowing page
7  Run upgrades: a fanned stack of three cards
8  Fountain room: a stone fountain with clear water
9  Merchant room: a small market stall with a cloth roof
10 Treasure room: an open chest with gold
11 Shrine room: a stone altar with a small flame
12 Boss room: a horned skull
13 Crystal cavern: a cluster of large crystals in rock
14 Camp: a campfire with a small tent
15 grave call: a tombstone with a ghostly hand rising (necromancer passive)
16 bone armor: a ribcage-shaped bone chestplate (necromancer passive)
```

### A10_keyart — title / loading background (single image)
```
1536x1024. Wide painted key art for the fantasy game "Aether Survivor": a cozy medieval stone town with warm-lit
windows at dusk on a hill, a great glowing fountain of aether light in the plaza (soft cyan-gold, not neon),
a road leading out of the town gate toward a distant forest, misty mountains and a far ruined castle. Five small
hero silhouettes on the road (archer, wizard, barbarian, knight, necromancer). Keep the centre-top area calm and
emptier for a logo. Painterly, grounded colours, no text.
```

---

# TIER B — gear, loot, monsters (13 images)

Gear note: rarity is shown by the UI frame colour, so paint each gear icon once in natural materials (the
Mythic/Legendary named weapons may look more ornate).

### B1_weapons_1 (4×4) — Archer bows, Wizard staves, Barbarian axes (low → high rarity)
```
1 Hunter's Bow (plain wood)  2 Greenwood Bow (leafy)  3 Hornet Recurve (black-yellow)  4 Stormpiercer (silver, wind)
5 Skyreaver (white-gold, feathers)  6 Starfall Arc (night-blue with star inlays)
7 Twig Wand  8 Mossy Staff  9 Sage's Staff (crystal top)  10 Tidecaller (sea-blue, shell)  11 Moonlit Scepter (silver moon)
12 Astral Scepter (gold with star orb)  13 Woodcutter Axe  14 Iron Hatchet  15 Battle Axe  16 Bearded Greataxe
```

### B2_weapons_2 (4×4)
```
1 Juggernaut Axe (huge dark steel)  2 Colossus Cleaver (gold-trimmed giant cleaver)
3 Militia Sword  4 Footman's Blade  5 Knight's Longsword  6 Oathkeeper (white-gold)  7 Lionheart (lion pommel)
8 Excalibur (radiant holy longsword)  9 Bone Wand  10 Mourner's Staff (black, ribbons)  11 Ossuary Staff (skulls)
12 Soulreaper (scythe-staff, teal souls)  13 Lichbane Scepter  14 Crown of Bones (bone scepter with crown top)
15 Shortbow (starter)  16 Squire Sword (starter)
```

### B3_armor_1 (4×4) — one look per class + slot
```
1 Ranger Hood  2 Leather Jerkin  3 Ranger Bracers  4 Ranger Boots
5 Arcane Hat (pointed wizard hat)  6 Silk Robe  7 Silk Gloves  8 Silk Slippers
9 Horned Helm  10 Wolfhide Vest  11 Fur Wraps  12 Hide Boots
13 Plate Helm  14 Steel Cuirass  15 Gauntlets  16 Sabatons
```

### B4_armor_2 (4×4)
```
1 Bone Crown  2 Grave Shroud  3 Grave Grips  4 Bone Treads
5 Copper Band (ring)  6 Jade Ring  7 Silver Signet  8 Sapphire Loop  9 Sunfire Ring  10 Ring of Eternity
11 Bone Charm  12 Clover Amulet  13 Moonstone Pendant  14 Wardstone Amulet  15 Phoenix Locket  16 Heart of Aether (amulet)
```

### B5_sets (4×4) — set armour, one "hero piece" per set + helmets
```
1 Gale Longbow  2 Gale Hood  3 Archmage's Scepter  4 Archmage's Circlet  5 Warlord's Greataxe  6 Warlord's Helm
7 Oathbound Blade  8 Paladin Greathelm  9 Shadowstep Cowl  10 Shadowstep Leathers  11 Dragonbone Visage
12 Dragonbone Hauberk  13 Sovereign's Diadem  14 Sovereign's Mantle  15 Sovereign's Orb  16 Dragonbone Fang (pendant)
```

### B6_loot_1 (4×4) — trade goods
```
1 Slime Gel  2 Pulsing Jelly Heart  3 Shimmering Core  4 Goblin Ear  5 Goblin Fang Necklace  6 Goblin Chief's Totem
7 Bat Wing  8 Echo Crystal  9 Old Bone  10 Cursed Skull  11 Bone Crown (loot)  12 Cultist Rune
13 Dark Tome Page  14 Beetle Shell  15 Volatile Gland  16 Ogre Tusk
```

### B7_loot_2 (4×4)
```
1 Iron Knuckle  2 Ogre War Banner  3 Elite Trophy  4 Champion's Medal  5 Old Coin Pouch  6 Silver Goblet
7 Ancient Relic  8 Royal Seal  9 Grave Locket  10 Soggy Boot  11 Rusty Tin Can  12 Raw Gemstone
13 Ore Nugget  14 Mithril Ore  15 Adamant Ore  16 Abyssal Diamond
```

### B8_loot_bosses (4×4) — boss trophies
```
1 Golem Heartstone  2 Crown of the Mountain  3 Lich Phylactery Shard  4 Lich's Eye  5 Ancient Acorn
6 Elderroot Heartwood  7 Marsh Scale  8 Hydra Fang  9 Wyrm Frostscale  10 Heart of Glacius  11 Cinder Core
12 Ignar's Brand  13 Echo of Ruin  14 Herald Void Shard  15 Heart of the Void  16 Malakar's Soul Ember
```

### B9_fish (4×4)
```
1 Silver Minnow  2 Lake Perch  3 Reed Gudgeon  4 Rainbow Trout  5 Silver Pike  6 Moonlit Bream  7 Crimson Salmon
8 Golden Carp  9 Ghost Catfish  10 Lanternfish  11 Lake Serpent Eel  12 Crystal Sturgeon  13 Aetherfin Koi
14 Moon Dragon Carp  15 Deep Geode  16 Starfire Crystal
```

### B10_monsters_1 (4×4) — Codex monster busts (same portrait framing for all)
```
Each cell: head-and-shoulders bust of the monster, three-quarter view, readable, slightly cute-but-dangerous.
1 Slime  2 Goblin  3 Cave Bat  4 Skeleton Archer  5 Cultist  6 Bomber Beetle  7 Brute (ogre)  8 Splitter (big slime)
9 Zombie  10 Wraith  11 Crystal Golemite  12 Bandit  13 Wild Boar  14 Rock Crab  15 Goblin Archer  16 Lurking Hydra
```

### B11_monsters_2 (4×4)
```
1 Sand Scarab  2 Shieldbearer  3 Sporecap (mushroom)  4 Dire Wolf  5 Haunted Armor  6 Gargoyle  7 Giant Scorpion
8 Mummy  9 Yeti  10 Frost Wisp  11 Hellhound  12 Cinder Shaman  13 Void Stalker  14 Void Eye  15 Skeleton Warrior
16 Skeleton Mage
```

### B12_bosses (4×4) — boss & mini-boss portraits (more dramatic lighting)
```
1 Gorath the Mountain (ancient stone golem)  2 Malakar the Undying (lich king)  3 Elderroot the Ancient (treant)
4 The Tide Hydra (three-headed sea serpent)  5 Glacius the Frost Wyrm (white dragon)
6 Ignar the Infernal Warlord (armoured fire lord)  7 The Dune Colossus (sand-stone war machine)
8 The Void Herald (cloaked void being, muted violet)  9 Grave Warden (zombie lord)  10 Bandit Captain
11 Crystal Behemoth  12 Old Tusk (giant boar)  13 Shellback (quarry turtle titan)  14 Phalanx Captain (bronze shield warrior)
15 Bone Golem  16 Dark Champion (dark armoured hero)
```

### B13_status (4×4) — tiny status icons (simple, bold, flat-ish painted symbols, readable at 16 px)
```
1 Stunned (spinning stars)  2 Rooted (vines around a foot)  3 Silenced (crossed-out mouth)  4 Defense down (cracked shield)
5 Blinded (closed eye)  6 Burning (flame)  7 Poisoned (green droplet skull)  8 Bleeding (red drop)  9 Slowed (snail / down arrows)
10 Frozen (ice cube)  11 Terrified (ghost face)  12 Armor broken (broken chestplate)  13 Battle Cry (horn)  14 Rage (red fist)
15 Haste (wing)  16 Shielded (bubble shield)
```

---

# TIER C — portraits, achievements, story (optional)

### C1–C3_npc_portraits (3 images, 4×4 each) — dialogue portraits
```
Each cell: head-and-shoulders portrait, friendly painted MMORPG NPC style, plain muted background, consistent lighting.
C1: Mira (young female mage guide, gold accents), Elder Tobin (old village elder, beard), Pip (village kid), Brenna (farmer woman),
Garrick (gate guard), Sir Aldo (castle guard), Sir Bram (castle guard), Lysa (herbalist woman), Dorn (miner), Sera (merchant woman),
Fenn (bard with lute), Wren (scholar with glasses), Hodge (bounty clerk), Maeve (gossip, shawl), Queen Aelia, King Aldric
C2: Captain Roan, Guard Tamsin, Steward Maren, Lady Isolde, Sister Elowen (priestess), Mortimer (gravekeeper), Marta Goldtap (barkeep),
Rodric the Tipsy (retired adventurer), Captain Rhea Saltwind (ship captain), Ned (fisherman), Master Varek (skill trainer),
Tilda (travelling merchant), Hilda (stablemaster), Old Wend (hermit), Nell (wanderer), Grit (old miner)
C3: Tomas, Greta, Bram, Lina, Oskar, Elsa, Tam, Wenna, Old Garth (villagers), Hollis, Dalla (farmers), Corin (carter),
Cabbage Man, Erin (boulder glarer), Steve (blocky lost miner), Marlo (angler)
```

### C4–C5_achievements (2 images, 4×4) — medal-style emblems (round bronze/silver/gold medallion with a symbol)
```
C4: First Blood (sword), Mountain Breaker (cracked mountain), Treant Feller (axe in tree), Hydra Hunter (serpent head), Wyrm Slayer (dragon),
Warlord's Bane (fire helm), Void Walker (rift), Realm Conqueror (crown), Seasoned Guard (shield), Elite Guard (laurel shield),
Slime Slayer (slime), Monster Bane (claw), Champion Hunter (helm), Delver (stairs down), Altar Devotee (altar), Mythic Bearer (red gem)
C5: Untouchable (feather), Ghost Step (footprints), Prospector (pickaxe), Hoarder (chest), Dutiful Guard (scroll), Master Smith (anvil),
Watch Your Step (spike trap), Trap Master (bear trap), Kaboom! (barrel), Demolitionist (bombs), Wall Bouncer (wall crack), Pinball Wizard
(bouncing ball), Nature's Wrath (thorn vine), Big Spender (coin pile), spare: skull medal, spare: laurel wreath medal
```

### C6_biome_emblems (4×4) — round crests
```
1 Greenwood (oak tree)  2 Marble Halls (marble pillar)  3 Sunscorch Desert (sun over dunes)  4 Coral Isles (coral & wave)
5 Frostpeak (snowy peak)  6 Ember Wastes (volcano)  7 The Void (rift eye, muted violet)  8 Ascension (rising star)
9 Strength (fist)  10 Dexterity (feathered arrow)  11 Intelligence (book & eye)  12 Vitality (heart)  13 Luck (four-leaf clover)
14 Tower mode (tall tower)  15 Daily Trial (calendar sun)  16 Endless Waves (crashing waves)
```

### C7_class_portraits (1536x1024, 5 tall panels side by side with black gutters)
```
Five full-body hero portraits in one row: Archer (green ranger with bow), Wizard (blue-robed mage with staff), Barbarian
(fur-clad axe warrior), Knight (silver-gold plate with sword and shield), Necromancer (dark-teal robed with bone staff).
Same pose style, standing heroically, plain dark muted background per panel, no text.
```

### C8_card_back_and_banners (1536x1024, 3 panels)
```
Panel 1 (tall): tarot card back design — dark navy with a muted gold sun-and-moon emblem, symmetric, elegant.
Panel 2 (wide): Gem Altar summon banner — golden altar with floating gems. Panel 3 (wide): Crystal Altar banner — pale cyan aether crystals.
```

### C9+ story art (one image each, 1536x1024, optional)
6 prologue slides, 11 story chapters (I The Oath of the Font … XI Echoes), 7 biome title cards, ending, defeat screen —
write these later from `Story.tsx` / `story.ts` / `dreams.ts` text if wanted.

---

## Slicing notes (for Claude)
- Detect the black gutters (row/column mean luminance minima), crop each cell, inset 4 px, export webp at 256 and 128
  (and 64 for status) to `public/art/<sheet>/<id>.webp`; keep `art/raw/` originals out of the build.
- Mapping = the ids in each list (order = left→right, top→bottom). Hook points: `PaintedIcon` (`ui/components/SkillIcons.tsx`),
  `UpgradeArt`/`ArcanaScene` (cards), `ItemArt.tsx` (items/pets/loot), GoldIcons/MenuGlyphs (menus/status), Codex `MonsterArt`,
  `ui/hud/Dialogue.tsx` (NPC portraits), `BossBar.tsx`. Prefer an `<img>` with the SVG as fallback when the file is missing.
- Gear: one painting per base; rarity stays the UI frame colour (optionally CSS `filter: hue-rotate` for set palettes).
