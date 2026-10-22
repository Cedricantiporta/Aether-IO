# Creature kit v1 (monsters, bosses, pets)

`public/models/creatures/creature_kit_v1.glb` (~1.9 MB, weld + meshopt medium), built by `art/blender/creature_kit_v1.py`
(`--no-render`, `--no-compress`, `--only=monsters,bosses,pets,closeups`, `--closeup=a+b[,yaw,pitch,ortho,y,spacing]`; previews go to `$CREATURE_SHOTS`,
default `art/renders/creatures/`). Wired into the game for regular monsters and pets (see "Wired into the game" below); bosses still use their own models. Style: cute Nintendo / Zelda toy look, flat shared
materials x vertex colour layer `COLOR_0` that MULTIPLIES the material colour (same loader rule as kit_v3), `glow_*` materials are emissive.

## Wired into the game (2026-10-22)

- `render/creatureKit.tsx`: loads the GLB itself (GLTFLoader + meshopt, NOT Suspense: `useCreatureKit()` returns null until it is in, so every kind keeps its old model meanwhile),
  bakes every `_mesh` into joint space (material colour x `COLOR_0` = vertex colour; `*glow*` materials -> separate emissive geometry) and gives each joint its own geometry.
  `jointPose(key, arch, ctx, out)` is the shared procedural animation (limb swing from `e.vel`, arm raise on WINDUP / ATTACK / melee windup + strike, head bob / look, wing flap,
  tail wag, spinning orbit / ring parts, jaw, core pulse). `bodyArgs` does the whole-body bob / lean / squash per archetype.
- Monsters: `getEnemyModels(base, kit)` swaps each mapped kind's `ModelDef` for a kit one (one instanced part per joint, material key `'kit'` = smooth-shaded vertex-colour lit, so the
  existing hit flash / rim / status tint / elite glow / shield / health-bar code in `render/Enemies.tsx` is unchanged). `Poser.partM(i, matrix)` (render/enemyModels.ts) places a part with a
  joint-chain matrix. Instance scale = `e.scale / ENEMY_DEFS[kind].scale` (the kit is authored at def scale), so size and hit radius are unchanged; `headY` / blob shadow come from the piece's bounds.
- Pets: `PET_KIT` gives piece / archetype / scale / hover per pet id; `render/Pet.tsx` builds a small Object3D joint rig (`makeRig`, shared geometry) and animates it with `animateRig`
  inside the existing PetActor / PetModel (hop, hover, trail, halo, growth stages, attack stretch all still come from the old PetDef).
- Table of kinds: `render/creatureMap.ts` `MONSTER_KIT` (arch biped / quad / blob / fly / float / crawl / still, optional `lift` for flyers, archers on their tower and the sunk lake hydra, `caster` = arms up on windup).
  Old models stay for: all `BOSS_*` kinds and boss adds (BOSS_SAPLING, BOSS_WYRMLING, BOSS_HYDRA_HEAD, BOSS_IMP, BOSS_CRYSTAL), `HUMAN_BOSS`, `DARK_HERO`, and any kind removed from the table.
- Headless QA gotcha: vite adds `?t=` stamps to edited modules, so the harness' `import('/store.ts')` becomes a second store instance after any source edit: restart vite (and let it finish dependency optimisation with one warm-up page load) before screenshots.

## Joint convention

- 63 root Empties named `<piece>`. Each holds joint Empties `<piece>_<joint>`; every joint Empty has exactly ONE child mesh `<piece>_<joint>_mesh`.
- The joint Empty sits at the pivot (neck, shoulder, hip, wing root, tail root, lid hinge...). Animate by rotating/scaling the Empty (meshopt never moves Empties).
- Rest pose: front +Z, +Y up, origin = ground centre, 1 unit = 1 m, authored at in-game size (`ENEMY_DEFS.scale` already applied, so use scale 1 on the instance).
- Joint names: `body` (bob/squash), `head`, `armL/armR`, `legL/legR` (biped), `legFL/FR/BL/BR` (quadruped), `wingL/wingR`, `tail`, `jaw`, `lid`.
- Nested joints (child Empty is under its parent Empty, position relative to it): hydra necks `neck1 > neck2 > head > jaw` (`boss_hydra_head`, `lake_hydra`),
  `boss_warmach` `legN > shinN`, `boss_wyrm` and `lake_hydra` `head > jaw`.
- Animation hints: legs/arms swing on X (opposite phase L/R, quadrupeds diagonal pairs); wings flap on Z (mirror L/R); tail sways on Y; head bobs on X;
  blob/slime `body` squash-stretch on Y with `face` following; orbiting parts (`orbit`, `ring`, `ringA/B`, `halo`, `sparkles`, `shards`, `crystal`, `orb`, `tentacles`) spin on Y or bob;
  `core`/`crown`/`plates` pulse or sway lightly; `lid` hinge opens on X (mimic), `turret` (warmach) yaws.

## Monsters (ENEMY_DEFS)

| game id | piece | tris | size x/y/z m | joints (a>b = b is a child of a) |
|---|---|---|---|---|
| BANDIT (CAPTAIN) | `bandit` | 1332 | 1.24 / 2.15 / 1.72 | armL, armR, body, head, legL, legR |
| BAT | `bat` | 800 | 2.50 / 1.28 / 0.93 | body, head, wingL, wingR |
| BOAR (TUSK) | `boar` | 1266 | 1.53 / 1.95 / 3.23 | body, head, legBL, legBR, legFL, legFR |
| BOMBER | `bomber` | 1238 | 2.17 / 1.71 / 2.55 | body, head, legL, legR |
| BONE_GOLEM | `bone_golem` | 1746 | 3.70 / 3.95 / 1.85 | armL, armR, body, head, legL, legR |
| BRUTE (+mini-boss TUSK/PHALANX no) | `brute` | 1782 | 3.49 / 2.95 / 2.47 | armL, armR, body, head, legL, legR |
| CINDER_SHAMAN | `cinder_shaman` | 1172 | 1.40 / 2.50 / 1.28 | armL, armR, body, head |
| CRYSTAL_GOLEMITE (BEHEMOTH) | `crystal_golemite` | 1410 | 2.33 / 2.62 / 1.85 | armL, armR, body, head, legL, legR |
| CULTIST | `cultist` | 914 | 1.50 / 2.13 / 1.43 | armL, armR, body, head |
| DIREWOLF | `direwolf` | 1270 | 0.77 / 1.31 / 2.68 | body, head, legBL, legBR, legFL, legFR, tail |
| FROST_WISP | `frost_wisp` | 804 | 1.76 / 2.21 / 1.78 | body, orbit |
| GARGOYLE | `gargoyle` | 1358 | 3.81 / 2.60 / 2.12 | armL, armR, body, head, legL, legR, wingL, wingR |
| GOBLIN | `goblin` | 1300 | 1.91 / 1.60 / 1.23 | armL, armR, body, head, legL, legR |
| GOBLIN_ARCHER | `goblin_archer` | 1428 | 1.91 / 1.95 / 1.24 | armL, armR, body, head, legL, legR |
| HAUNTED_ARMOR | `haunted_armor` | 1190 | 2.07 / 3.22 / 2.36 | armL, armR, body, head, legL, legR |
| HELLHOUND | `hellhound` | 1400 | 0.77 / 1.35 / 2.45 | body, head, legBL, legBR, legFL, legFR, tail |
| LAKE_HYDRA | `lake_hydra` | 1204 | 1.38 / 3.13 / 1.91 | body, neck1>neck2>head>jaw |
| MUMMY | `mummy` | 1600 | 1.35 / 2.37 / 1.45 | armL, armR, body, head, legL, legR |
| ROCK_CRAB (SHELLBACK) | `rock_crab` | 1356 | 2.97 / 1.59 / 2.84 | armL, armR, body, legL, legR |
| SCARAB | `scarab` | 806 | 1.07 / 0.72 / 1.25 | body, head, legL, legR |
| SCORPION | `scorpion` | 1464 | 2.08 / 1.87 / 3.02 | armL, armR, body, head, legL, legR, tail |
| SHIELDBEARER (PHALANX) | `shieldbearer` | 1470 | 2.29 / 2.71 / 2.20 | armL, armR, body, head, legL, legR |
| SKELETON_ARCHER | `skeleton_archer` | 1296 | 0.89 / 1.88 / 1.00 | armL, armR, body, head, legL, legR |
| SKELETON_MAGE | `skeleton_mage` | 1364 | 1.15 / 2.25 / 0.99 | armL, armR, body, head, legL, legR |
| SKELETON_WARRIOR | `skeleton_warrior` | 1344 | 1.42 / 2.11 / 1.59 | armL, armR, body, head, legL, legR |
| SLIME | `slime` | 554 | 1.38 / 1.22 / 1.40 | body, face |
| SPLITTER | `splitter` | 1080 | 2.12 / 2.35 / 2.18 | body, core |
| SPORECAP | `sporecap` | 938 | 2.00 / 2.43 / 2.01 | armL, armR, body, cap |
| VOID_EYE | `void_eye` | 1124 | 2.11 / 2.35 / 2.11 | body, ring, tentacles |
| VOID_STALKER | `void_stalker` | 1276 | 1.31 / 2.66 / 1.90 | armL, armR, body, head, legL, legR |
| WRAITH | `wraith` | 772 | 1.59 / 2.13 / 1.10 | armL, armR, body |
| YETI | `yeti` | 1976 | 4.02 / 3.96 / 2.10 | armL, armR, body, head, legL, legR |
| ZOMBIE (WARDEN) | `zombie` | 1184 | 1.30 / 2.59 / 1.52 | armL, armR, body, head, legL, legR |

## Bosses (BOSS_* kinds)

| game id | piece | tris | size x/y/z m | joints (a>b = b is a child of a) |
|---|---|---|---|---|
| BOSS_GOLEM | `boss_golem` | 3092 | 14.54 / 10.89 / 7.83 | armL, armR, body, core, head, legL, legR |
| BOSS_HYDRA | `boss_hydra` | 2248 | 7.31 / 4.02 / 12.61 | body, legBL, legBR, legFL, legFR, tail |
| BOSS_LICH | `boss_lich` | 3516 | 3.99 / 5.87 / 3.09 | armL, armR, body, head, orb |
| BOSS_TREANT | `boss_treant` | 3568 | 9.31 / 11.99 / 8.42 | armL, armR, body, crown, plates |
| BOSS_VOID | `boss_void` | 3100 | 7.94 / 9.04 / 8.45 | armL, armR, body, halo, head, shards |
| BOSS_WARLORD | `boss_warlord` | 3746 | 8.34 / 9.49 / 4.75 | armL, armR, body, head, legL, legR |
| BOSS_WARMACH | `boss_warmach` | 5218 | 11.01 / 4.93 / 6.12 | body, leg0>shin0, leg1>shin1, leg2>shin2, leg3>shin3, leg4>shin4, leg5>shin5, turret |
| BOSS_WYRM | `boss_wyrm` | 3088 | 15.12 / 6.10 / 16.79 | body, head>jaw, legL, legR, tail, wingL, wingR |

Note: `boss_hydra` is the body only (body, 4 legs, tail); its heads are separate `boss_hydra_head` instances placed on the body (game: BOSS_HYDRA_HEAD, scale 2.1 already applied).

## Boss adds (summons / body parts)

| game id | piece | tris | size x/y/z m | joints (a>b = b is a child of a) |
|---|---|---|---|---|
| BOSS_CRYSTAL | `boss_crystal` | 410 | 2.45 / 3.30 / 2.49 | body, crystal, shards |
| BOSS_HYDRA_HEAD | `boss_hydra_head` | 1332 | 3.82 / 8.71 / 5.30 | body, neck1>neck2>head>jaw |
| BOSS_IMP | `boss_imp` | 1474 | 2.10 / 1.88 / 1.77 | armL, armR, body, head, legL, legR, wingL, wingR |
| BOSS_SAPLING | `boss_sapling` | 1186 | 1.96 / 2.19 / 1.37 | armL, armR, body, legL, legR |
| BOSS_WYRMLING | `boss_wyrmling` | 1050 | 2.81 / 1.65 / 2.89 | body, head, legL, legR, tail, wingL, wingR |

## Pets (PETS_POOL ids)

| game id | piece | tris | size x/y/z m | joints (a>b = b is a child of a) |
|---|---|---|---|---|
| pet_bat | `pet_bat` | 698 | 2.12 / 1.12 / 0.67 | body, head, wingL, wingR |
| pet_blob | `pet_blob` | 506 | 0.89 / 0.87 / 0.87 | body, face |
| pet_crystal | `pet_crystal` | 1104 | 1.09 / 1.62 / 0.70 | armL, armR, body, head, legL, legR |
| pet_demigod | `pet_demigod` | 1086 | 1.23 / 0.90 / 1.17 | body, ringA, ringB, sparkles |
| pet_dragon | `pet_dragon` | 954 | 2.19 / 1.29 / 2.26 | body, head, legL, legR, tail, wingL, wingR |
| pet_fairy | `pet_fairy` | 912 | 1.00 / 0.92 / 0.64 | armL, armR, body, head, wingL, wingR |
| pet_fox | `pet_fox` | 1098 | 0.65 / 1.22 / 1.92 | body, head, legBL, legBR, legFL, legFR, tail |
| pet_golem | `pet_golem` | 918 | 1.26 / 1.66 / 0.60 | armL, armR, body, head, legL, legR |
| pet_leviathan | `pet_leviathan` | 1156 | 1.24 / 1.40 / 2.70 | body, finL, finR, head, tail |
| pet_mimic | `pet_mimic` | 1036 | 0.82 / 1.13 / 1.22 | body, legL, legR, lid, tongue |
| pet_owl | `pet_owl` | 676 | 1.80 / 1.28 / 1.11 | body, head, tail, wingL, wingR |
| pet_phoenix | `pet_phoenix` | 854 | 2.24 / 1.28 / 1.48 | body, head, tail, wingL, wingR |
| pet_rock | `pet_rock` | 528 | 0.80 / 0.91 / 0.76 | body |
| pet_shadowcat | `pet_shadowcat` | 1034 | 0.92 / 1.21 / 1.59 | body, head, legBL, legBR, legFL, legFR, tail |
| pet_sprite | `pet_sprite` | 802 | 1.07 / 0.90 / 1.04 | body, ring |
| pet_turtle | `pet_turtle` | 840 | 0.83 / 0.67 / 1.41 | body, head, legBL, legBR, legFL, legFR |
| pet_wolf | `pet_wolf` | 1240 | 0.49 / 0.82 / 1.67 | body, head, legBL, legBR, legFL, legFR, tail |

## Not in the kit (skipped)

- `HUMAN_BOSS`, `DARK_HERO` (humanoid bosses, render/HumanBosses.tsx): use the KayKit hero rigs.
- Mini-boss rooms (`MINI_BOSSES`) reuse their kind's piece scaled up (Grave Warden = zombie, Bandit Captain = bandit, ...).
- `pet_runner` (appears only in code strings, not a pet def).

## Tri budgets

Monsters 554-1976 (a few chunky ones - yeti 1976, brute 1782, bone_golem 1746, mummy 1600 - sit above the 1500 target), bosses 3.1-5.2k, adds 0.4-1.5k, pets 506-1240.
Preview sheets are rendered by the script (Cycles).
