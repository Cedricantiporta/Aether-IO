# Run structure v3 — Town hub + Hades-style rooms

Replaces the "village siege / endless waves" loop. The town is the safe hub; a run is a chain of
small procedurally generated rooms grouped into biomes, each biome ending in a boss.

## Town (hub, no combat)
* Bigger, alive village: more houses (instanced/chunked, cheap), market stalls, well, fences, lamps.
* NPCs walk simple loops/idle at points (KayKit character models, tinted / different weapons), a few
  animals. Near an NPC: Genshin-style interact pill "[F] Talk — Name" → short dialogue box
  (2–4 lines, portrait-less, tap to advance; some NPCs offer a quest or a freebie). NPCs also pop a
  random speech bubble ("Lovely day!", "Beware the swamp…") every 15–40 s when the player is near.
* Shops / smith / quest board / summon shrine are always open (no siege closing). Interaction is via
  the interact pill only — skill buttons are never replaced.
* Town gate = run start ("[F] Set out"). A death or "return home" brings you back; loot is kept.

## Run = biomes of rooms
* Biome order: Meadow → Old Grove → Mire → Frostpeak → Ember Wastes → The Void (then loops
  harder). Each biome changes ground colour/texture, props, fog/light tint and enemy roster.
* Each biome: ~7 rooms then a boss room. Bosses: Meadow → Gorath (Golem), Grove → Elderroot
  (Treant), Mire → Mire Hydra, Frost → Glacius, Ember → Ignar, Void → Void Herald. Malakar (Lich)
  is a mini-boss / crypt room option.
* Difficulty depth → reuse existing scaling: `depthWave = biomeIndex * 10 + roomIndex + 1`
  feeds waveHpMult / waveDmgMult / budget, so the boss room of biome b is "wave" 10*(b+1).

## Room types
| Type | Content | Clear condition |
|---|---|---|
| Combat | 2–3 spawn bursts with telegraphed spawn points | ALL enemies dead (counter shows remaining, no timer) |
| Elite | fewer, elite-affix enemies | all dead |
| Mini-boss | one mini-boss + adds | all dead |
| Fountain | heal 40% hp/mana, no enemies | immediate |
| Merchant | travelling merchant (potions, 3 random items, at a markup, 1 on sale) | immediate |
| Treasure | chest (rarity by depth) guarded by a small pack | all dead |
| Shrine (challenge, optional) | pick: harder room for a better reward | all dead |
| Boss | biome boss arena (bigger, round) | boss dead |

* When cleared, 1–3 exit portals appear, each showing its next room's reward icon (Hades doors):
  upgrade card, gold, shards, item, heal, gems (rare), or the room type icon for fountain/merchant/
  boss. Walking into a portal (or interact pill) → short fade → next room.
* Run map pips at top: rooms done / rooms in biome, boss icon at the end.
* After a boss: big reward (boss trophy + chest), then a choice: "Return to town" (bank, safe) or
  "Descend" to the next biome (harder, better loot).

## Performance rules for rooms
* A room is small (~36–56 units across, boss ~60). Only the current room exists: on room change,
  clear enemies/projectiles/pickups/zones and rebuild scenery from the room seed (instanced props,
  ≤ ~150 instances), one ground plane with the biome material. No streaming, no chunk grid needed.
* Max alive enemies per room ≈ 25–40 (bursts), well under the old 50+.
* Preload biome assets during the fade; reuse geometries/materials across rooms.

## Removed / changed
* Siege cutscene, respite timer, shops closing, 45 s wave timer, "X/Y" quota, calling waves early.
* Wave reward cards → become room rewards (portal choice) instead of every wave.
