# Boss Design Reference (borrowed patterns for Aether Survivor)

Purpose: stop inventing boss mechanics from scratch. This is a catalog of proven attack and mechanic patterns from Hades,
Hollow Knight, Dead Cells, Gungeon, Risk of Rain 2, Souls-likes, Zelda, Cuphead / Furi and MMO raids, mapped to our engine
primitives and then to every boss. Design only: no code was changed. Companion docs: `HANDOFF.md` (boss sections),
`_vault/20_knowledge/recipes/add-boss-attack.md`.

Sourcing note: the web searches (standard mode) returned solid detail on Hades (Theseus / Asterius / Bone Hydra / Chronos),
FFXIV mechanic vocabulary, Risk of Rain 2 Mithrix and general Souls telegraph commentary, and almost nothing on Meg,
Gungeon, Hollow Knight, Cuphead / Furi or Zelda. Rows marked (K) rely on well-known game knowledge, not a fetched page.
Treat timings as starting values to tune in headless QA, not measurements.

Sources: [Hades Theseus wiki](https://hades.fandom.com/wiki/Theseus?oldid=9683) ·
[Prima: Theseus and Asterius](https://primagames.com/tips/hades-boss-guide-how-beat-theseus-and-asterius) ·
[Prima: Bone Hydra](https://primagames.com/tips/hades-boss-guide-how-beat-bone-hydra) ·
[Chronos guide (Dot Esports)](https://dotesports.com/hades/guides/hades-2-chronos-boss-guide-how-to-beat-and-all-rewards) ·
[Chronos (Gamepressure)](https://www.gamepressure.com/hades-2/chronos/zd11425) ·
[FFXIV common mechanics](https://ffxiv.consolegameswiki.com/wiki/Common_mechanics_and_markers) ·
[FFXIV tethers](https://ffxiv.consolegameswiki.com/wiki/Tether_(mechanic)) ·
[FFXIV gallery of mechanics](https://www.thonky.com/final-fantasy-xiv/gallery-of-mechanics) ·
[RoR2 Mithrix wiki](https://riskofrain2.wiki.gg/wiki/Mithrix) ·
[Fakeout combat design (wayline)](https://www.wayline.io/blog/the-art-of-the-fakeout-combat-design) ·
[Legendary boss design (wayline)](https://www.wayline.io/blog/crafting-legendary-boss-battles).

---

## 1. Design rules distilled from the sources

1. **Learnable, not random.** Every attack: clear windup animation, consistent speed, a dodge window (Hollow Knight Grimm is the
   usual model). Difficulty comes from execution and from COMBINING known patterns, never from hidden info.
2. **Delayed attacks are a spice, not the base.** Elden Ring / Sekiro hold-then-release swings catch players who dash on
   reflex. Use at most one per boss, with a visible "charging" tell (glow, ring filling) so it reads as fair.
3. **Phases re-use old patterns in new combinations** (Sekiro Isshin, Chronos single strikes -> 3-hit chains at 50%).
   Do not give phase 2 a totally new vocabulary; add one new rule and chain what the player already learned.
4. **Aim lock.** FFXIV and Hades bosses commit to a direction at windup start. The player's job is to move AFTER the
   commit. Pinpoint tracking is the opposite and is what the owner dislikes.
5. **Punish windows are the reward.** After a big attack the boss is visibly stuck (Hades Hydra heads resting, Souls recovery).
   This is what stops the boss being an HP bag: damage is "earned" by reading an attack.
6. **A mechanic you must THINK about beats a bigger hit.** Safe spots, "do X to open the boss", adds that must be killed,
   lines to bait. Put one such mechanic per phase, announce it by text banner, then pressure it with a normal pattern.
7. **Overlap two readable things, never two unreadable ones.** Slow ring + moving beam is fine; three telegraph colours
   overlapping is not (fixed diagonal camera, phone screens).
8. **Enrage / soft timers** (MMO): an arena hazard that grows (our Ignar lava) replaces a hard enrage and fits Hades-style
   "the room fights back".

---

## 2. Pattern catalog (38 patterns)

Legend. **Prim** = our primitive that builds it. **[NEW]** = needs a small new engine piece. Timings are wind-up (W) / active (A)
/ recovery (R) in seconds. Knobs = what to turn for Easy..Hard.

### A. Dash-check attacks (the player must i-frame or leave)

| # | Pattern | Source | How it plays / what to think about | Telegraph | Timings | Knobs | Prim |
|---|---|---|---|---|---|---|---|
| 1 | **Expanding i-frame ring** | Hades (Elysium rings), Cuphead, FFXIV (expanding shockwave) (K) | Ring spawns at boss and travels outward; walk-away is impossible, so DASH THROUGH it as it arrives. Think: when to dash, keep a charge. | Thin red ring growing + faint ground fill at start | W 0.8, ring speed 14-18 u/s, ring width 1.2 | speed, width, ring count (1-3, spaced 0.9 s), gap hole in ring (see 3) | `WAVE_*` ring waves in bossFx (Glacial Ring, Tidal Surge) |
| 2 | **Delayed slam (hold then drop)** | Elden Ring, Sekiro, Theseus spear slam | Boss raises weapon, HOLDS, then drops. Players who dash on the raise get hit. Think: wait for the drop. | Circle fills slowly from edge to centre; weapon glows when about to fall | W 1.4 (fill) + hold 0.5, A 0.2 | hold length (0 on Easy), circle radius | `spawnTelegraphCircle` with long life; damage at expiry |
| 3 | **Ring with a gap** | FFXIV (donut / safe wedge), Cuphead (K) | Full ring except one wedge (30-50 deg) toward the hero's side. Think: find the gap, not dash blindly. | Ring drawn with a visible hole | W 0.9, ring speed 12-16 | gap width (60 deg Easy, 30 Hard), gap aimed at hero vs random | `WAVE_*` + angular mask [NEW: tiny: skip hits inside an arc] |
| 4 | **Charge through the room** | Asterius / Theseus charge, Souls (K) | Boss locks a line then rushes; wall impact stuns it = punish window. Think: sidestep late, bait it into a wall or pillar. | Long red line, locked at windup start | W 1.0 line, A 0.7 rush at 30 u/s, R 1.6 stun if wall | lock time, speed, stun length, pillars in the way | `spawnTelegraphLine` + boss dash move; stun uses existing winded window |
| 5 | **Three-hit combo, late-hit delay** | Hades Chronos phase 2 (3-strike chains), Sekiro | Hit 1 and 2 fast, hit 3 delayed. Think: count the rhythm. | Three flashes of a cone; final cone appears late | 0.5 / 0.5 / 0.9 | delay of last hit, chain length (single below 50%) | chained `spawnTelegraphCircle/Line` |
| 6 | **Ground mark follows then locks** | Hades Hydra / Meg (K), Chronos circle | Circle slides toward hero for 1.0 s, then freezes and detonates 0.7 s later. Think: keep moving, then break line right after the lock. | Circle with a "lock" flash | track 1.0, locked 0.7 | track time, speed, lock delay | telegraph circle re-aimed until `lockT` (aim lock rule) |

### B. Rotating / sweeping patterns

| # | Pattern | Source | Play / think | Telegraph | Timings | Knobs | Prim |
|---|---|---|---|---|---|---|---|
| 7 | **Rotating beam(s)** | Furi, Cuphead, FFXIV (rotating cleaves) (K) | One to four beams sweep the arena. Move with or against rotation, or dash through. Think: direction and the safe pie slice. | Dim lines first (0.8 s) then bright beam | W 0.8, sweep 90-360 deg at 0.6-1.1 rad/s | beam count (1 -> 4), speed, reverse once mid-sweep | rotating `spawnTelegraphLine` re-spawned each tick; Colossus ray sweep is the base |
| 8 | **Windmill (alternating wedges)** | FFXIV (K) | Arena split into 6-8 wedges; alternate wedges light up, then swap. Think: run to the safe wedge before the swap. | Wedges tint red then flash | W 1.5, swap after 1.2 | wedge count, swap time, number of swaps | `trick` zones as wedge polygons [NEW: wedge telegraph shape; or 3 long thick lines] |
| 9 | **Sweeping cone / cleave arc** | Hades Theseus spear, Souls | Wide arc swing in front; sidestep behind or dash through. | Fan-shaped cone, locked | W 0.9, A 0.25 | arc width, range, repeats | cone telegraph (Hydra Sweeping Heads) |
| 10 | **Spinning attack with moving boss** | Theseus spin, Dead Cells (K) | Boss spins and drifts toward hero at slow speed; punish at the end. Think: kite in a circle. | Persistent red disc around boss that follows | A 2.0, move 4 u/s, R 1.5 | duration, drift speed | circle telegraph following boss (Ignar Hellcleave style) |
| 11 | **Pendulum / sweeper bar** | Dead Cells, Zelda dungeons (K) | A bar orbiting a pillar or the boss; jump (dash) the bar, stay in the safe gaps. | Bar glows red | continuous 6 s, 1 rotation / 3 s | bar count, speed | rotating line [see 7] |

### C. Bullet-pattern shapes (not circles)

| # | Pattern | Source | Play / think | Telegraph | Timings | Knobs | Prim |
|---|---|---|---|---|---|---|---|
| 12 | **Spiral stream** | Gungeon, Cuphead, Furi (K) | Bullets leave in a rotating spiral arm(s). Think: orbit the boss with the arm, or cut through a gap and dash a bullet. | Boss glows and rotates a turret / eye; arm direction visible | W 0.7, A 3-4 s, 6-10 bullets/s | arm count (1-4), spin speed, bullet speed 8-11 | projectile volley with angle += k*t |
| 13 | **Aimed fan (3-5 shots, gap)** | Gungeon, Hades (K) | Fan aimed at the hero's position AT windup start; step out of the fan. | Faint lines or a cone | W 0.8, A 0.2 | shot count, spread, bullet speed | volley with locked aim |
| 14 | **Wall of bullets with a gap** | Cuphead, Gungeon (K) | A line of bullets sweeps across; one gap. Dash through or find the hole. | Row of small markers on the floor | W 1.0, bullet speed 9 | gap width, direction (side / diagonal), number of walls | volley in a row; gap position randomised, never on the hero |
| 15 | **Machine-gun stream with strafing** | Dune Colossus today, Gungeon, Furi | Boss paces while firing a continuous stream; walk out of the stream's arc. Think: keep moving perpendicular. | Cone telegraph + muzzle glow | W 1.0, A 1.5-2.5, 18-22 shots/s | pace speed, fire rate, trail patches | existing Colossus Molten Ray |
| 16 | **Crossing lanes ("tic-tac-toe")** | Hades (K), Elden Ring (K), FFXIV | 3-5 parallel line telegraphs, then the perpendicular set; the 2D grid leaves safe cells. | Thick lines, first set 0.8 s, second set 0.8 s later | 2 x W 0.8 | lane count, lane width, stagger | `spawnTelegraphLine` x N (Elderroot root lanes, Branch Sweep, Glacius ice lanes) |
| 17 | **Homing orb (slow, shootable)** | Hades Eurydice / Gungeon (K) | Slow big orb that homes for 4 s; lead it around a pillar so it explodes harmlessly, or kill it. | Orb glow with a trail ring | speed 4.5, lifetime 5 | speed, hp (1-3 hits), count | slow projectile with hp [NEW if projectiles cannot be hit; else dash through = pops] |

### D. Area denial (growing hazards, safe spots)

| # | Pattern | Source | Play / think | Telegraph | Timings | Knobs | Prim |
|---|---|---|---|---|---|---|---|
| 18 | **Growing floor hazard** | Ignar creeping lava (ours), Hades Hydra lava, RoR2 Mithrix floor flames | Floor slowly becomes unusable. The arena shrinks, so the fight has a soft clock. Think: do not stand next to the edge of a patch; route around. | Orange circle 2.4 s then permanent | new patch / 10-13 s, cap 45-65% | cadence, cap, patch size | `ignarLava.ts` (reuse for ice / thorns / sand / poison pools) |
| 19 | **Safe-circles ("find the island")** | Our Avalanche phase, Hades Chronos clock, Furi (K) | Whole arena is deadly except 2-3 lit circles that shrink. Think: pick the nearer circle, share it with the partner. | Bright safe rings, danger tint elsewhere | W 2.0 warn, A 4-6 | circle count (3 -> 1), radius, number of waves | `bp` safe circles (exists) |
| 20 | **Donut / inverse AoE (stand close)** | FFXIV (K) | Big circle with a safe hole at the boss. Think: run IN, not away. Rewards melee heroes, punishes kiting. | Circle with a hole | W 1.2, hole radius 4 | hole radius, outer radius | two nested circles with different colours [NEW: tiny: hole-circle test] |
| 21 | **Trail / line left behind** | Ignar flame crescent, Hollow Knight (K) | Attacks leave burning ground behind. Think: where will I need to stand in 3 seconds? | Fire patches, cap | patch life 4-6 s | patch spacing, life, cap | `bossFx.firePatch`, `laneTrail` (exists) |
| 22 | **Floor tiles that erupt (checkerboard)** | Hades (Elysium), FFXIV, Zelda (K) | Tiles flash then erupt in a pattern; one pattern per beat. Think: memorise the pattern, step to the quiet tiles. | Tile flash in a grid | flash 1.0, erupt 0.3 | grid size, % tiles, number of beats | `bp` lava tiles (exists) |
| 23 | **Poison / spore plants on a timer** | Ours (Elderroot plants), Hades Hydra (K) | Fixed hazards pulse on a known beat; the boss fight is played around them. | Swell + ring 1.4 s | every 6.5 s staggered | pulse period, radius | `biomeHazards` boss plants (exists) |

### E. Positional puzzles (bait, line-up, hide, tethers)

| # | Pattern | Source | Play / think | Telegraph | Timings | Knobs | Prim |
|---|---|---|---|---|---|---|---|
| 24 | **Hide behind a pillar** | Souls, FFXIV (line-of-sight), Zelda (K) | A beam / volley is blocked by pillars; the pillar is destroyed by the hit. Think: use cover, expect it to break, move to the next. | Boss glows, beam telegraph through pillars | W 1.2, A 1.5 | pillar count (3-5), pillar HP (1 hit) | `bp` pillars (exists) + LOS test [NEW if beam does not stop at pillars] |
| 25 | **Bait the boss into the arena edge / wall** | Asterius charge, FFXIV baits | Stand opposite the safe spot so the charge or zone lands where you were. Think: position first, move second. | Line locked at W start | as 4 | N/A | lock-aim rule |
| 26 | **Bait ground puddles away from the middle** | FFXIV (baited AoEs), Hades Hydra (K) | Boss drops circles on you repeatedly; do not stand where you will need to be later. Think: lead puddles to one edge. | Circle on hero, locked after 0.6 s | 1 puddle / 0.7 s, 5-6 puddles | count, size, linger time | spawnTelegraphCircle with leave-behind zone |
| 27 | **Tether: break the line** | FFXIV tethers | A cord links hero and an add / boss; if you stay in range the add heals or empowers. Move away / behind a pillar to snap it. | Visible beam between the two | until broken 6 s | break distance | [NEW: tether line draw + distance check] |
| 28 | **Stack / soak the tower** | FFXIV stacks and towers | Two coloured towers; stand in one to absorb it; ignoring it = party damage. In co-op: one per player; solo: one tower, soak it or take the global hit. | Glowing pillar column with number | W 4.0 | tower count, soak damage | circle zone with "must be inside" [NEW: inverse zone: damage if nobody inside] |
| 29 | **Spread markers (your own ring)** | FFXIV | Marked player gets a ring that detonates after 3 s; run so it lands away from the adds / pods. | Ring attached to hero | 3.0 s | ring radius | telegraph circle on hero (exists in several spells) |
| 30 | **Kite the kamikaze** | Dead Cells, Gungeon, Hades (K) | Exploding adds run at the hero; lead them into the boss or pillars / destroy them before contact. | Red ring growing on the add | fuse 1.5 | speed, blast radius | existing bomb barrel / imp kinds |

### F. Add / summon phases

| # | Pattern | Source | Play / think | Prim |
|---|---|---|---|---|
| 31 | **Boss goes invulnerable until adds die** | Bone Hydra (66% immune + 3 heads), Theseus + Asterius | At a threshold the boss shields and summons 3-4 adds; kill them (or the "pillars") to resume. Think: target priority (healer add first). Knobs: add count, add HP, spawn ring, re-spawn once. Prim: `bp` phase + `fixed` summons, existing Brood and Dark Knights. |
| 32 | **Priority add (healer / buffer)** | MMOs | One add is marked with a halo and buffs the others; kill it first. Prim: summon with a flag + buff aura [NEW: small]. |
| 33 | **Add wave + boss attack at once** | RoR2 Mithrix | Adds spawn while the boss keeps pressuring; ranged hero pauses to clear. Knobs: add cap, spawn period. Prim: existing summons + spacing rules. |

### G. Vulnerability gimmicks

| # | Pattern | Source | Play / think | Prim |
|---|---|---|---|---|
| 34 | **Stagger / interrupt meter** | Sekiro posture, FFXIV interrupts | Hits during a special fill the meter; full = cast cancelled + stunned. Think: hit the boss during the cast, not between. Exists as `interrupt.ts`. Knob: fill rate, stun length. |
| 35 | **Weak point rotates** | Zelda (Echoes / TotK), Hollow Knight (K) | Boss takes x2 only from one part (head, back, glowing core) that is exposed after an attack; shield elsewhere. Prim: `hooks.damageMul` with angle test [NEW: facing-based multiplier] (Hydra uses severed-head count the same way). |
| 36 | **Do-X-to-open** | Zelda bosses, Hades Chronos clocks (K) | Boss immune until you do X (light all braziers, trigger the boss's own attack at a pillar, redirect its beam onto a crystal). Think: bait the attack at the right object. Prim: `bp` phase with props; condition is "boss hits object". |

### H. Status / CC hits, arena transformation

| # | Pattern | Source | Play / think | Prim |
|---|---|---|---|---|
| 37 | **Stacking status (burn / chill / poison)** | Ours (Ignar burn, Glacius chill->freeze), RoR2, Hades (K) | Light hits build a stack; at N, the heavy effect lands (freeze 1.2 s, burn dps up). Think: avoid chip hits. Exists: `bossFx.addChill`, `burnHit`. Knob: stacks to freeze, decay. |
| 38 | **Arena transformation at phase change** | Hades Chronos clock arena, RoR2 Mithrix moon, Hollow Knight (K) | At 50% the arena changes: pillars rise, outer ring turns to lava, floor shrinks, camera zooms out. Prim: `bossForms`, `ignarLava`, `bp` kinds, `bossCamZoom`; every new "arena kit" gets one sign banner. |

---

## 3. Global rules for our engine

| Topic | Rule |
|---|---|
| Aim / facing | Aim locks at windup start (`lockT`). Turn rate while idle <= 1.5 rad/s, while winding up 0. Rooted bosses (Elderroot / Hydra / Glacius) pick a target direction before the telegraph, not during. |
| Damage feel | Normal hits ~10-14% max HP of the hero (after armour), big dodge-or-lose hits 25-35%, ticking effects keep `HERO_DOT_MUL`. One big hit per 8-10 s maximum. |
| CC | Freeze 1.2 s, stun 0.35-0.8 s, knockdown only on the big hit of a pattern; obey the anti-chain rules (`KNOCK_IMMUNE`, `resCC`). Never freeze AND knock in the same hit. |
| Readability | One telegraph colour per damage family: red = physical, orange = fire, cyan = frost, green = poison, violet = void. Max 3 simultaneous different overlapping telegraphs. |
| Touch | Telegraph lead >= 0.8 s for dash-checks, safe circles >= 4 m radius, no pixel-precise gaps (min gap width 5 m). |
| Co-op | Aim the big checks at the NEARER hero, keep tether / tower mechanics solvable solo; towers count players, not heroes. |
| Punish window | Every signature phase ends with a 3-4 s "free hits" state (existing winded window). |

---

## 4. Boss kits (borrowed patterns, mapped to our engine)

For each boss: 5-8 skills, pattern # from section 2, how it looks in our engine, plus the signature phase mechanic.
"Exists" = already in the game, keep it; "tune" = change numbers; "NEW" = needs new code.

### Gorath (Golem, Marble Halls)
Aim: fixed; turns slowly (1 rad/s) between attacks, locked during windup. Arena already has 4 ballistas.
Status 2026-10-31: IMPLEMENTED in `engine/systems/bossKitGorath.ts` (+ shared `bossKit.ts`, `render/BossKitFx.tsx`); the numbers below are the measured share of max HP for the test hero (def 330 / 7419 HP).

| Skill | Pattern | In our engine | Feel | Status |
|---|---|---|---|---|
| Rock Ring (exists) | 1 + 3 | slam ring, gap toward the hero's side (arc mask, green safe wedge shown) | 12% | DONE: 18-26 rocks, gap 48 / 40 / 34 deg locked at windup start, 0.9 s, 1 ring (2 from phase 1), ~7% per rock + 3 s knockdown |
| Boulder Roll | 4 | line telegraph, locked, rolls across; hitting a pillar stuns it 2 s | 25% | DONE: 8.8 m wide red lane, 1.05 s windup, 1.3 s roll at 15-19 u/s, 25% + knockdown; ramming a statue = crash (2.4 s stagger) |
| Pillar-hide Beam | 24 | eye beam, pillars absorb it, pillars break | 30% | DONE as Stone Gaze: 3.6 m lane, 1.3 s, 28-32%, the first statue on the lane stops it and shatters (LOS test) |
| Delayed Fist Drop | 2 | circle fills 1.4 s, hold, drop | 28% | DONE: red circle r 6.2 on the hero's spot, first fill 1.15 s (fake-out, no damage), then a second 0.55 s fill, 26 / 28 / 30% + knockdown |
| Debris Grid | 16 | two sets of crossing lanes | 12% | DONE: 5 lanes (4.4 m, 10 m apart, one on the hero) then 5 crossing lanes 1.0 / 0.95 s, 12% each |
| Boulder Throw (new) | 26 | ground-marked boulders | 12% | DONE: 3 (4 from phase 1) marks 0.65 s apart, each on the hero's spot when placed, 1.0 s warning, 12% each |
| Ballista bait (exists) | 25 | boss telegraphs the lane, hero positions so the bolts hit the boss's own shield | tune | not done (ballistas unchanged) |
| Summon crumble-imps | 31 | adds | - | not done (flagged: no cheap add yet) |
| Ground Slam DASH ring, Fissure Cross (dodgeMechs) | 1 / 16 | kept as they were | 30% / 13% | kept (one dodge attack every 6.5-9 s) |

**Signature:** *Living Statue Phase* at 50%: Gorath is invulnerable; four marble statues come alive and fire lines at the boss's shield node; hero must bait the golem's beam into the statues (pattern 36). 3 statues broken = boss stunned 4 s.
Status: IMPLEMENTED as a RECURRING TRIAL instead of an invulnerable phase (the 70 / 35% Boulder Pinball phase already owns the `bp` single owner and is kept): every ~24 s (first at ~10 s, only where no phase is about to start) 3 statues rise on the hero's side (colliders; Gorath takes 15% less while they stand), then up to 3-4 Stone Gazes + a final Boulder Roll are locked on the hero; the hero must stand behind a statue at windup start. 3 broken = STUNNED 5.5 s (stagger +25% and kit x1.6). Leftover statues crumble. Statues are `trick` events (`KIT_STATUE`) so a co-op guest builds the same colliders / props. Four statues became three (the arena has no room for more hide spots).

### Elderroot (Treant, Greenwood; rooted)
Aim: picks a root target at windup start. Rooted so no charges.
Status 2026-10-31: IMPLEMENTED in `engine/systems/bossKitTreant.ts` (the AI moved out of bosses2.ts `treant()`; extra Elderroots of Endless Waves keep the old one).

| Skill | Pattern | Engine | Feel | Status |
|---|---|---|---|---|
| Root Lanes (exists) | 16 | existing lanes, add a second perpendicular set at <60% | 12% | DONE: 3-4 lanes locked on the hero, from phase 1 a crossing set at +-90 deg 0.85 s later; 11.8% |
| Branch Sweep (exists) | 9 / 7 | 5 lanes in sequence; at <60% reverse once | 14% | DONE: from phase 1 four lashes sweep back; 13.9% per lash |
| Crushing Roots (exists) | 1 | slam ring + thorn ring; thorn ring gets a gap (3) | 25% | DONE: slam 25%, then thorn arrows (8% each) with a gap toward the hero's side (green wedge) |
| Seed Pods | 30 | pods grow 2 s then burst into poison puddle; hit the pod first to defuse | 10% | PARTLY: Seed Bombs (marks around / on the hero, burst into a poison pool), 10% direct; the "defuse the pod" part is not built |
| Spore Bloom | 23 | the six boss plants stay; at <50% their pulse offsets | tune | not done (plants unchanged, `biomeHazards`) |
| Vine Snare Tether | 27 | NEW: vine tether pulls the hero 4 m toward the trunk if not broken by dashing | 0 + pull | not done as a tether: Grasping Vines (cone drag + root, 9.5%) kept |
| Brood (exists) | 31 | saplings | - | kept |
| Thorn Burst DASH ring, Poison Snake, Spore Rush (dodgeMechs) | 1 / 21 / 30 | kept as they were | 30% / - / 15% | kept |

**Signature:** *Bark Armour*: Ironbark (exists) is dropped only when the hero lures root lanes through the trunk's glowing knots (hit knot = armour crack); three cracks = 4 s stagger. Weak-point style (pattern 35/36).
Status: IMPLEMENTED (recurring, every ~22 s where no phase is about to start): Ironbark puts the bark up (net x0.5 damage, plates on the model) and three amber knots + floor lines show where to stand; every armoured skill is a Root Lance (a 3.4 m lane locked on the hero at windup start, 22%); a lance whose bearing is within 0.3 rad of a knot cracks it; 3 cracks = STUNNED 5.5 s (the bark shatters). 20 s at most; the old route (filling the stagger bar) still breaks the bark. Knots are `trick` events (`KIT_KNOT`).

### Tide Hydra (Coral; rooted body, 5 heads)
Direct Hades Lernaean Bone Hydra homage.

| Skill | Pattern | Engine | Feel | Status (2026-10-31) |
|---|---|---|---|---|
| Acid Barrage / Fan (exists) | 26 | blobs lead, locked puddles | 12% | DONE: glob 11.8%, rim-head blob 9.3% |
| Head Slam (exists) | 6 | head to marked circle then rests = free hits | 22% | DONE: 18.3% + knockdown; also slot-9 spare head |
| Sweeping Heads (exists) | 9 | staggered cones | 12% | DONE: 12.3% + knockdown |
| Tidal Surge (exists) | 1 | ring wave, add gap (3) | 28% | DONE as dodgeMechs Tidal Pulse (30%, dash); gap NOT built |
| Whirlpool | 18 | a growing whirlpool disc in the arena (reuse `ignarLava` shape: slows, small dot) | tick | NOT built (flag: needs a render + floor-zone piece) |
| Head Rotation Beams | 7 | two heads sweep a water beam at opposite directions | 14% | REPLACED by the spare heads' water jet (2-3 red lanes from a head, 11.7%); no rotating beam |
| Spit-drop Pearls | 30 | slow floating pearls that explode when near | 10% | NOT built |

**Signature:** *Heads of the Hydra* at 66 / 33%: body immune (exists for Tidal Wave) and 3 extra heads surface at the rim, each with a different attack (acid / beam / slam); each head killed = a 5 s window where the body takes damage (pattern 31, directly lifted from Bone Hydra).

**Status: DONE** (`bossKitHydra.ts`, bp kind HEADS at 70 / 35%, three spare heads acid / water jet / slam, EXPOSED 5 s x1.5 per head killed, phase cap 28 s, replaces the old TIDAL wave; QA: archer 139 s, both phases landed, 6/6 heads). See HANDOFF 'Boss kits'.

### Dune Colossus (war machine, Sunscorch)
Aim: turret-style; rotates slowly; flames only on a locked arc.

| Skill | Pattern | Engine | Feel | Status (2026-10-31) |
|---|---|---|---|---|
| Molten Ray flamethrower (exists) | 15 | keep | 14% | the OLD Molten Ray is retired; the dodgeMechs Flamethrower (10% / hit + burn) is the flame stream and the heat source |
| Seismic Stomp (exists) | 1 | ring, with gap at <50% | 25% | DONE as close-range Stomp (11%) + dodgeMechs Seismic Ring (30%, dash); gap NOT built |
| Sandstorm Beams | 7 | 3 rotating beams out from its core | 14% | DONE as dodgeMechs Lasers (3-5 counter-rotating, 10-12%) |
| Missile Salvo | 26 | circles locked on the hero's trail | 10% each | DONE: 3 volleys of 3-4 circles, 9.6% each, +2 heat |
| Wall of Shrapnel | 14 | a bullet row across the square with a 6 m gap | 12% | DONE: 7 m gap >= 6 m from the hero, 12% per round |
| Dune Tiles | 22 | checkerboard of sand tiles erupt | 14% | NOT built (the vent's spark circles take the 'keep moving' role) |
| Sand-worm Kamikaze | 30 | scarabs rush, explode | 8% | NOT built |

**Signature:** *Overheat Core*: after 3 Molten Ray bursts it vents, exposing the back core for 5 s (weak point x2 from behind); the hero is baited to circle it while safe tiles pulse (pattern 35, NEW facing multiplier).

**Status: DONE** (`bossKitColossus.ts`: heat from flame bursts / salvos / rampage, vent turns its back to the hero, 5 s back core x1.3 on top of the x1.5 back attack ~ x2, spark circles instead of safe tiles; `hooks.damageMul` got the attacker position; QA: archer 96 s / 1 vent, knight 131 s / 2 vents, 4.7 of 5 s from behind). Machine Gun and the Artillery rain stay as they were. See HANDOFF 'Boss kits'.

### Glacius (Frost Wyrm, Frostpeak; rooted head)
Ice floor already forbids dashing: that makes ring checks into "avoid", not "dash": favour lanes and safe circles.

| Skill | Pattern | Engine | Feel |
|---|---|---|---|
| Ice Spike lanes (exists) | 16 | keep 6.4 m wide lanes, add crossing set | 14% + frost |
| Frost Breath (exists) | 9 | locked cone | 14% + chill |
| Hailstorm (exists) | 26 | locked hail circles | 10% |
| Glacial Ring (exists) | 3 | ring (no dash on ice): gap wedge must be found | 22% |
| Avalanche safe circles (exists) | 19 | keep; make circles 3 -> 2 -> 1 | big |
| Frost Beam Sweep | 7 | head swings a laser line across the ice | 16% + freeze |
| Brood of Ice (exists) | 31 | wyrmlings | - |

**Signature:** *Frozen Over*: the lake thaws gradually (growing hazard 18 reversed: patches of open water appear = deadly cold) so the sliding platforms shrink while the head breathes down pillars of ice cover (24).

### Ignar (fire war machine, Ember)
Already the owner's favourite; keep and add small borrowed pieces.

| Skill | Pattern | Engine | Feel |
|---|---|---|---|
| Flame Crescent (exists) | 21 | trail | 14% + burn |
| Radiant Burst (exists) | 1 + 3 | big ring, add a gap at <50% | 28% |
| Hellcleave (exists) | 10 | spinning drift | 14% |
| Blazing Guard (exists) | 36 | shield; hits pop it | - |
| Fire Wall | 14 | a row of fireballs with a gap | 14% |
| Eruption Tiles (exists) | 22 | Floor is Lava | 14% |
| Dark Knights (exists) | 31 | adds | - |

**Signature:** *Creeping Lava + Burning Form* (exists). Borrow: Mithrix-style "pillars of flame thrown around the arena" in form 2 (spawn 2-3 slow fire pillars that drift toward the hero: 17).

### Void Herald (final, 2 forms)
Aim: very slow; heavy use of "think" mechanics; the final exam of everything learned.

| Skill | Pattern | Engine | Feel |
|---|---|---|---|
| Void Spiral | 12 | arm of black orbs | 10% |
| Void Beams | 7 | 4 rotating beams, reverse once | 14% |
| Black-hole Pull | 18 | existing shrinking void / portals | tick |
| Mirror Illusions (exists) | 36 | find the real one (existing decoys) | - |
| Dark Rings | 1 + 3 | rings with a gap | 25% |
| Tether Echoes | 27 | NEW: echoes tethered to the hero; break line | 14% |
| Windmill Wedges | 8 | NEW wedge telegraph | 25% |

**Signature:** *Two forms, one idea per form*: form 1 = decoys and a real one; form 2 = arena transformation (38): outer ring becomes void, floor shrinks to a platform, safe circles return (19) and the boss lets itself be hit only while the hero stands in a lit circle.

### Varn (shield knight, human)
Mostly melee, readable, punish-based. Souls style.

| Skill | Pattern | Feel |
|---|---|---|
| Shield Bash then Slash combo | 5 (last hit delayed) | 12% |
| Charge | 4 (wall stun) | 20% |
| Ground Slam (exists, proximity) | 2 | 25% |
| Block stance | 36: front shield blocks, hit from behind or after he swings | - |
| Banner call | 32: a banner add buffs; kill it | - |

**Signature:** *Shield up*: frontal damage is blocked while the shield is raised; attack him right after a swing, or bait a charge into a pillar to break the shield.

### Sable (shadow assassin)
| Skill | Pattern | Feel |
|---|---|---|
| Blink-strike (exists) | 6: marker locks, she appears 0.7 s later | 12% |
| Shadow clones | 31 (clones fire fans, 13) | 8% each |
| Burst (exists) | 1 | 22% |
| Smoke trail | 21 | tick |
| Dagger fan | 13 | 10% |

**Signature:** *Real Sable*: three silhouettes, only one casts a shadow; the real one takes damage (36). Fair tell: the real one has the boss bar glow.

### Rook (trap / roll)
| Skill | Pattern | Feel |
|---|---|---|
| Snare Traps (exists) | 26: visible traps armed after 1 s | 8% + root |
| Roll Charge | 4 | 18% |
| Trap Retreat (exists) | 25 | - |
| Bear-trap line | 16 | 12% |
| Net throw | 6 | 10% + slow |

**Signature:** *Trap board*: the arena fills with traps; the hero must lead Rook into his own traps (36: his trap = stun 3 s).

### The Undying Lich (mini-boss)
| Skill | Pattern | Feel |
|---|---|---|
| Hug-blink (exists) | 20 | 14% |
| Bone Spiral | 12 | 10% |
| Skull Homing | 17 | 12% |
| Raise skeletons | 31 | - |
| Soul Tether | 27 | tick |

**Signature:** *Phylactery*: Lich is immune while a tethered soul jar stands; break the tether (27) or destroy the jar (36).

### Slime King (Greenwood depth 10)
| Skill | Pattern | Feel |
|---|---|---|
| Belly Flop | 2 (delayed drop) | 20% |
| Split into minis | 31, then kamikaze 30 | - |
| Slime Trail | 21 | tick + slow |
| Bounce chain | 5 (3 hops, last bigger) | 12% |
| Absorb | 35: eats minis to regain HP; kill them first | - |

**Signature:** *Split and merge*: kill the small slimes before they merge back (priority adds, 32).

### Dark heroes (duels, up to 6)
Class-based, borrowing the human boss kit: Knight (4 + 2), Barbarian (leap 6), Archer (13 + 14), Wizard (12 + 19), Necro (17 + 31). Rule: at most 2 of the squad use a dash-check at once; never the same colour overlapping.
**Signature:** *Role call*: each dark hero is visibly tagged (healer / striker); kill the buffer first (32).

### Mini-bosses (generic template)
Pick 3 skills from this catalog: one dash-check (2 or 4), one positional (26), one bullet shape (13 or 14). Phase at 50%: chain two known skills (3). No invulnerable phases.

---

## 5. Priorities

Top 10 borrowed mechanics: 1) i-frame ring with gap (1+3), 2) delayed slam (2), 3) rotating beams (7), 4) bullet wall with gap (14), 5) spiral stream (12), 6) safe circles (19), 7) invulnerable-until-adds (31, Bone Hydra), 8) weak point / overheat (35), 9) pillars as cover (24), 10) growing hazard (18, Ignar lava).

New code (smallest first): ring/arc gap mask (3); donut hole test (20); facing-based damage multiplier (35); wedge telegraph (8); tether line + break (27); inverse tower zone (28); LOS pillar block (24).

Open to-do for QA: measure each new skill's frequency with the `proxStats` pattern and the headless god-mode script; do not add any more than 2 new skills per boss per pass.
