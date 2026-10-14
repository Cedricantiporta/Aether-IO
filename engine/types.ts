// ============================================================================
// ENGINE CONTRACT — runtime (per-frame) data types.
// Shared by: engine systems (write), render layer (read), UI HUD (read).
// Rule: nothing in here lives in React/Zustand state. It is mutated in place
// every frame by the simulation and read by renderers via refs / rAF.
// ============================================================================
import { Vector3 } from 'three';
import type { Item, StatusEffectType } from '../types';

// ---------------------------------------------------------------- enemies --
export type EnemyKind =
  | 'SLIME'      // basic hopping chaser (wave 1+)
  | 'GOBLIN'     // basic chaser, slightly faster (wave 1+)
  | 'BAT'        // fast swarmer, 50% hp, 2x speed, erratic flight (wave 2+)
  | 'SKELETON_ARCHER' // ranged: keeps distance, telegraphed aimed arrow (wave 3+)
  | 'CULTIST'    // ranged caster: slow, 3-orb spread, slow projectiles (wave 4+)
  | 'BOMBER'     // beetle that runs in, fuses (telegraph ring) then explodes (wave 5+)
  | 'BRUTE'      // ogre tank: slow, telegraphed charge dash (wave 6+)
  | 'SPLITTER'   // big slime: on death splits into 3 SLIME (wave 7+)
  | 'ZOMBIE'     // graveyard: slow tank, grabs (slows player) (wave 3+)
  | 'WRAITH'     // graveyard/ruins: phases out, drifts through obstacles, lunges (wave 5+)
  | 'CRYSTAL_GOLEMITE' // crystal grove: shatters into a shard ring on death (wave 4+)
  | 'BANDIT'     // camp: fast, telegraphed dash-slash (wave 4+)
  | 'BOAR'       // farm/grove: straight-line charge with knockback (wave 3+)
  | 'ROCK_CRAB'  // quarry/pond: armoured front, sidesteps (wave 6+)
  | 'BOSS_GOLEM' // boss: ground slams w/ telegraphs, rock rings, charge
  | 'BOSS_LICH'  // boss: bullet-hell spirals, teleport, summons minions
  | 'BOSS_TREANT' // wave 30: Elderroot the Ancient Treant (roots, sapling brood, thorn ring, bark armor)
  | 'BOSS_HYDRA'  // wave 40: Mire Hydra (3 targetable heads, acid spit, tail sweep, submerge)
  | 'BOSS_WYRM'   // wave 50: Glacius the Frost Wyrm (frost breath, ice spikes, dive-bomb, blizzard)
  | 'BOSS_WARLORD'// wave 60: Ignar the Infernal Warlord (flame wheel, fire pillars, imps, enrage)
  | 'BOSS_VOID'   // wave 70: The Void Herald (portals, gravity flip, echoes, arena shrink)
  | 'BOSS_SAPLING'    // boss add: Elderroot mini-treant (walks, fuses, bursts into thorns)
  | 'BOSS_HYDRA_HEAD' // boss part: separately targetable hydra head (positioned by the hydra AI)
  | 'BOSS_IMP';       // boss add: Ignar fire imp (goblin model, tinted)

export type EnemyState =
  | 'SPAWN'    // rising out of ground, invulnerable-ish, no contact damage
  | 'CHASE'
  | 'KITE'     // ranged units keeping distance
  | 'WINDUP'   // telegraph before an attack (visual cue must show)
  | 'ATTACK'
  | 'RECOVER'
  | 'DYING';   // death animation; inactive for collisions

export type EliteAffix = 'NONE' | 'HASTED' | 'VAMPIRIC' | 'FROZEN' | 'VOLATILE' | 'SHIELDED';

export interface Enemy {
  id: number;            // index in pool (stable)
  active: boolean;       // slot in use (includes DYING)
  kind: EnemyKind;
  elite: boolean;
  affix: EliteAffix;
  boss: boolean;

  pos: Vector3;          // y = 0 ground plane
  vel: Vector3;          // AI desired velocity (units/s)
  knock: Vector3;        // knockback impulse, decays each frame
  facing: number;        // yaw radians, render uses it
  dir: Vector3;          // scratch: charge / attack direction

  hp: number;
  maxHp: number;
  shield: number;        // SHIELDED affix absorb pool
  speed: number;
  radius: number;        // collision radius
  scale: number;         // visual scale
  contactDamage: number;
  projectileDamage: number;
  xp: number;
  gold: number;

  state: EnemyState;
  stateT: number;        // time spent in current state
  attackCd: number;      // seconds until next attack allowed
  animT: number;         // free-running animation clock (randomised offset)
  hitFlash: number;      // 0..1, render flashes white
  deathT: number;        // time since death (DYING), render fades/sinks

  // status effects (seconds remaining)
  burnT: number; burnDps: number;
  poisonT: number; poisonDps: number;
  freezeT: number;       // fully frozen (blue, no move/attack)
  stunT: number;         // stunned (spinning stars, no move/attack)
  fearT: number;         // terrified: flees from the player
  slowT: number; slowFactor: number; // speed *= (1 - slowFactor)
  // combat-depth systems
  armor: number;         // damage taken x 100/(100+armor)
  armorBreakT: number;   // ARMOR BREAK: armor -25% while > 0
  burnStacks: number; burnStackCd: number; // burn stacks up to 3 (dps x stacks)
  mini: boolean;         // mini-boss (stagger bar, no full stun, reduced knockback)
  stagger: number; staggerMax: number; staggerT: number; staggerCd: number; // boss/mini-boss stagger bar; staggerT>0 = staggered (+25% dmg)
  trickCd: number; trickT: number; trickKind: number; // monster signature trick (telegraphed, own cooldown)
  spKind: number; spT: number; spStep: number; spCd: number; // boss / mini-boss signature attack (see bossSpecials.ts)
  decoy: boolean; hideT: number; shellT: number; // Lich clone, ambush vanish, Shellback shell
  frostT: number;        // chilled by Frost Field / Chain Frost (Archer synergy: Gale Arrow SHATTER +30%)
  chillStacks: number; chillT: number; // Chain Frost chill (15% slow per stack, 4 = freeze)
  slamDmg: number; slamT: number; // wall-slam bonus damage while launched (slamT>0)

  // boss bookkeeping
  phase: number;         // 0,1,2 (enrage at 66% / 33% hp)
  pattern: number;
  patternT: number;
  angle: number;
  pullCount: number;     // gravity well bookkeeping (reset each frame)
}

// ------------------------------------------------------- player projectiles --
export type ProjectileKind =
  | 'ARROW' | 'MAGIC' | 'AXE' | 'SLASH' | 'HOLY_WAVE'
  | 'FIREBALL' | 'PIERCING_ARROW' | 'BURNING_ARROW' | 'FREEZING_ARROW'
  | 'STORM' | 'GIANT_AXE' | 'ORBITAL_BLADE' | 'PET_BOLT' | 'RAIN_ARROW' | 'GALE_ARROW' | 'X_SLASH';

export interface Projectile {
  id: number;
  active: boolean;
  kind: ProjectileKind;
  pos: Vector3;          // y ~ 1.2 (chest height) for visuals; collisions use xz
  vel: Vector3;
  life: number;          // seconds remaining
  maxLife: number;
  damage: number;        // pre-crit damage per hit (absolute)
  radius: number;        // hit radius added to enemy radius
  aoeRadius: number;     // 0 = no splash
  pierce: number;        // remaining enemy hits before despawn (Infinity ok)
  bounces: number;       // STORM chain bounces left
  knockback: number;
  effect?: { type: StatusEffectType; duration: number; value?: number; chance?: number };
  hitIds: number[];      // enemies already hit (cleared on AXE return)
  state: number;         // generic sub-state (AXE: 0 out, 1 returning)
  spin: number;          // render rotation accumulator
  homing: number;        // 0 = none, else turn rate rad/s toward nearest enemy
  emp: boolean;          // fired during Hawk's Focus (render glow)
  tint: number;          // basic arrow glow: 0 none, 1 blue (Piercing Shot), 2 white (Inspire)
  procLv: number;        // >0: on-hit proc payload (wizard thunder chain), value = skill level
  trailT: number;        // emitter accumulator (FIREBALL fire trail, particles)
}

// -------------------------------------------------------- enemy projectiles --
export type EnemyProjectileKind = 'ARROW' | 'ORB' | 'SLOW_ORB' | 'BOSS_ORB' | 'ROCK' | 'FLAME';

export interface EnemyProjectile {
  id: number;
  active: boolean;
  kind: EnemyProjectileKind;
  pos: Vector3;
  vel: Vector3;
  life: number;
  damage: number;
  radius: number;
  homing: number;        // rad/s
  slow?: number;         // applies slow to player on hit (0..1)
  debuff: number;        // 0 none, 1 ROOT (pinning arrow), 2 BURN (flame wheel)
}

// --------------------------------------------------------------- ground zones --
// Persistent area effects: player fire trail, black hole, telegraphs, etc.
export type ZoneKind =
  | 'FIRE'              // player: burns enemies inside
  | 'BLACKHOLE'         // player: pulls up to maxPull enemies, explodes at end
  | 'FROST_NOVA'        // player blizzard visual + slow field
  | 'TELEGRAPH_CIRCLE'  // hostile: fills up, damages player at end (boss slam, bomber)
  | 'TELEGRAPH_LINE'    // hostile: charge lane warning (dir + length + width)
  | 'TELEGRAPH_CONE'    // hostile: cone warning (dir, radius = range, aux = half-angle in rad); always resolves via zone.trick
  | 'POISON_POOL'       // hostile: dps while standing in it
  | 'TORNADO'           // player: short-lived pull + damage vortex (Gale Arrow trail)
  | 'FROST_FIELD'       // player: slowing ice field with damage ticks
  | 'METEOR_SHADOW'     // visual-only telegraph (fills up), no effect on expiry
  | 'SHOCKWAVE'         // visual-only expanding ring (stomp, barrier)
  // ---- environmental hazards: affect BOTH player and enemies (ignore `hostile`)
  | 'PUDDLE'            // shallow water: slows anything inside (player 35%, enemies 35%); fire zones touching it are extinguished
  | 'GAS'               // poison gas cloud: dps + POISON to player & enemies. Vents pulse: active while (world.time % period) < activeFor
  | 'WILDFIRE'          // burning ground: dps + BURN to player & enemies; spreads from explosive barrels, burns out after life
  // ---- hostile trick zones (affect the PLAYER only)
  | 'GOO'               // slime goo: slows player
  | 'CALTROPS'          // bandit caltrops: slows + chip bleed
  | 'FIREPATCH'         // goblin firebomb / bomber blast: burning ground (player only)
  | 'ACID'              // splitter acid puddle: poison dps
  | 'PLAGUE'            // zombie plague cloud: poison dps
  | 'SMOKE';            // bandit smoke bomb: obscures (short blind pulses)

export interface Zone {
  id: number;
  active: boolean;
  kind: ZoneKind;
  hostile: boolean;
  pos: Vector3;
  dir: Vector3;          // TELEGRAPH_LINE direction (normalised)
  radius: number;        // circle radius / line width
  length: number;        // TELEGRAPH_LINE length
  life: number;
  maxLife: number;
  damage: number;        // dps for FIRE/POISON, burst for TELEGRAPH/BLACKHOLE end
  tickT: number;
  maxPull: number;       // BLACKHOLE
  color: number;         // hex for render tint
  permanent: boolean;    // map hazard placed by mapgen: never expires (life ignored)
  period: number;        // GAS vents: pulse cycle length (s); 0 = always on
  activeFor: number;     // GAS vents: seconds active per cycle
  trick: number;         // TELEGRAPH_*: signature-trick id resolved on expiry (0 none)
  aux: number;           // free: FIRE zones: 1 = real stacking burn
}

// ------------------------------------------------------------- ground fx --
// Timed ground effects driven by abilities: falling arrows/meteors, spikes, traps, pillars, rings.
export type GroundFxKind = 'RAIN_ARROW' | 'METEOR' | 'SPIKE' | 'ARROW_STICK' | 'CRYSTAL' | 'TRAP' | 'ROCK' | 'BIG_METEOR' | 'RING';
export interface GroundFx {
  id: number;
  active: boolean;
  kind: GroundFxKind;
  x: number; z: number;
  sx: number; sz: number;     // start point (TRAP throw origin)
  t: number;                  // age
  delay: number;              // time of impact / eruption
  life: number;               // total lifetime
  radius: number;
  dmg: number;
  aux: number;                // kind-specific (stun time, ring max radius, ...)
  seed: number;
  done: boolean;              // impact already resolved
  launch: boolean;            // SPIKE: launches enemies (Earthsplitter)
  color: number;
}

// ---------------------------------------------------------------- pickups --
export type PickupKind = 'XP' | 'GOLD' | 'GEM' | 'HEALTH' | 'ITEM' | 'SHARD'; // SHARD: value = rarity index (0 COMMON..4 MYTHIC)

export interface Pickup {
  id: number;
  active: boolean;
  kind: PickupKind;
  pos: Vector3;
  vel: Vector3;          // pop-out velocity on spawn (with y), then magnet
  value: number;         // xp amount / gold / gems / heal
  item: Item | null;     // ITEM only
  t: number;             // age
  magnet: boolean;       // locked on to player
}

// ----------------------------------------------------------- world objects --
export type ObstacleKind = 'TREE' | 'PINE' | 'ROCK' | 'HOUSE' | 'FENCE' | 'RUIN' | 'SHOP'
  | 'STUMP' | 'BOULDER' | 'WELL' | 'STATUE' | 'TENT' | 'LOG' | 'CRYSTAL_SPIRE' | 'WINDMILL';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  pos: Vector3;
  radius: number;        // collision circle
  scale: number;
  rot: number;
  blocksProjectiles: boolean;
}

// Destructible props. Variety pass: each kind has its own look, hp and loot table.
export type CrateKind =
  | 'CRATE'            // wooden crate: xp + chance gold/item
  | 'BARREL'           // wooden barrel: xp + gold
  | 'CHEST'            // treasure chest (rare): guaranteed item + gold burst
  | 'POT'              // clay pot (1 hit, clusters of 3-5): small gold / xp / heart
  | 'HAY'              // hay bale (farm area): xp, bursts straw
  | 'CRYSTAL'          // aether crystal cluster (glowing): gems + crafting shards + big xp
  | 'ORE'              // ore vein rock (quarry / village): crafting shards
  | 'GOLD_VEIN'        // rock seamed with gold nuggets: a gold burst
  | 'HERB'             // healing herb bush: heals + a little mana
  | 'EXPLOSIVE_BARREL' // red powder keg: explodes (r 6) damaging ENEMIES when broken
  | 'GRAVE'            // cracked tombstone (graveyard): xp, may release a bat swarm
  | 'CART';            // broken merchant cart (high hp): gold shower + item chance

export interface Crate {
  id: number;
  active: boolean;
  kind: CrateKind;
  pos: Vector3;
  hp: number;
  maxHp: number;
  rot: number;
  hitFlash: number;
  respawnT: number;
}

// ---------------------------------------------------------------- player --
export interface PlayerAnim {
  moveBlend: number;     // 0 idle .. 1 running (smoothed)
  stepPhase: number;     // walk cycle phase (radians)
  attackT: number;       // 1 -> 0 after each basic attack (swing/draw/cast)
  castT: number;         // 1 -> 0 after ability cast
  hurtT: number;         // 1 -> 0 after taking damage (flash)
  dashing: boolean;
}

export interface PlayerRuntime {
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  facing: number;        // yaw radians (towards aim)
  aim: Vector3;          // world-space aim point on ground (written by CameraRig)

  hp: number;
  mana: number;

  dashT: number;         // remaining dash time
  dashDir: Vector3;
  dashIframes: boolean;  // class dash grants i-frames (false for the Barbarian shoulder charge)
  dashCharges: number;
  maxDashCharges: number;
  dashCd: number;        // recharge timer for next charge
  dashCdMax: number;

  // debuffs applied by monster signature tricks (seconds remaining)
  stunT: number; rootT: number; silenceT: number; defDownT: number; blindT: number;
  burnT: number; burnDps: number; poisonT: number; poisonDps: number; bleedT: number; bleedDps: number; dotAcc: number;
  cd: { q: number; e: number; s3: number; s4: number };
  cdMax: { q: number; e: number; s3: number; s4: number };
  ult: number;           // ultimate charge 0..100
  ultT: number;          // seconds the ultimate effect is still running (0 = idle)
  cryT: number;          // barbarian Battle Cry: +30% damage
  buffT: number; buffDmg: number; buffDef: number; buffHaste: number;   // Warcry / Inspire passive buff
  guardT: number; guardRed: number;   // knight Shield Wall: damage taken x (1 - guardRed)
  avatarT: number;                    // knight Divine Avatar (ultimate)
  titanT: number;        // barbarian ultimate: giant form
  whirlT: number;        // barbarian Whirlwind
  air: number;           // height above ground (leap arc), render only

  shieldCharges: number;
  maxShieldCharges: number;
  shieldCd: number;
  shieldCdMax: number;

  invulnT: number;
  hawkT: number;         // archer R: Hawk's Focus (+60% attack speed, +40% damage)
  rageT: number;         // barbarian Q: attack speed x2
  sprintT: number;       // archer E: speed x2 + invuln
  vitalityT: number;     // barbarian E: heal over time
  earthwall: { active: boolean; pos: Vector3; t: number; radius: number }; // wizard E
  slowT: number;         // player slowed by enemy projectile
  hpPotCd: number;
  mpPotCd: number;
  petReviveCd: number;

  fireT: number;         // basic attack accumulator
  levelUpFx: number;     // 1 -> 0
  reviveFx: number;      // 1 -> 0
  anim: PlayerAnim;
}

// -------------------------------------------------------------- director --
/** Room flow: FIGHT (enemies / nothing to do) -> CLEARED (portals open) -> LEAVING (fade) -> next room; BIOME_DONE after a boss. */
export type RoomPhase = 'FIGHT' | 'CLEARED' | 'LEAVING' | 'BIOME_DONE';

export interface DirectorState {
  /** Depth wave = biome * 10 + room + 1 (boss room of biome b = 10 * (b + 1)). Feeds every wave-scaling formula. */
  wave: number;
  phase: RoomPhase;
  phaseT: number;        // time in phase
  maxAlive: number;
  aliveCount: number;
  bossId: number;        // enemy id or -1
}

// ------------------------------------------------------------------- rooms --
export type RoomType = 'COMBAT' | 'ELITE' | 'MINIBOSS' | 'FOUNTAIN' | 'MERCHANT' | 'TREASURE' | 'SHRINE' | 'CRYSTAL' | 'BOSS' | 'CAMP';   // CAMP: the quiet first room of every later biome (storage + training)   // CRYSTAL: harvest-only cavern (no enemies)
export type RewardKind = 'CARD' | 'GOLD' | 'SHARDS' | 'ITEM' | 'HEAL' | 'GEMS' | 'NONE';
/** Room objective (rolled onto some combat rooms, roomEvents.ts) and room twist (a modifier for the whole room). */
export type RoomObjective = 'DEFEND' | 'RESCUE' | 'GOBLIN' | 'HUNT';
export type RoomTwist = 'DARK' | 'CURSED' | 'TRAPS' | 'GOLDEN';
export interface RoomPlan { type: RoomType; reward: RewardKind; preboss?: boolean; obj?: RoomObjective; twist?: RoomTwist }
export type StationKind = 'NONE' | 'FOUNTAIN' | 'MERCHANT' | 'CHEST' | 'ALTAR';

export interface RoomPortal {
  active: boolean; x: number; z: number; t: number;   // t = seconds since it opened (render grows it)
  plan: RoomPlan;
  big?: boolean;         // the single large portal to the next biome after a boss
}
/** Telegraphed spawn point: a ring fills for `dur` seconds, then the enemy rises. */
export interface SpawnMarker {
  active: boolean; x: number; z: number; t: number; dur: number;
  kind: EnemyKind; elite: boolean; tag: number;       // tag: 0 plain, 1 mini-boss, 2 boss
}
export interface RoomStation { kind: StationKind; x: number; z: number; used: boolean; ready: boolean }

export interface RoomState {
  active: boolean;
  version: number;       // bumped whenever the room is rebuilt (render rebuilds scenery)
  seed: number;
  biome: number;         // biome index, grows past 5 when the cycle loops
  index: number;         // 0..ROOMS_PER_BIOME-1, ROOMS_PER_BIOME = boss room
  plan: RoomPlan;
  radius: number;        // walkable radius (room is a disc centred on 0,0)
  fade: number;          // 0 clear .. 1 black (DOM overlay)
  fadeTarget: number;
  enemiesLeft: number;   // alive + telegraphed + still to come (HUD counter)
  portals: RoomPortal[];
  markers: SpawnMarker[];
  station: RoomStation;
  shrineOn: boolean;     // shrine challenge accepted
  hint: string;          // short objective text under the room plaque
}

export interface BossHud {
  active: boolean;
  stagger: number;       // 0..1 fill of the stagger bar
  staggered: boolean;
  ability: string;       // name of the signature attack being cast (shown on the boss bar)
  abilityT: number;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  phase: number;
  sx: number; sy: number; onScreen: boolean;   // screen position (px) above the boss's head, written by CameraRig
}

export interface RunStats {
  kills: number;
  eliteKills: number;
  bossKills: number;
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  xpEarned: number;
  time: number;          // seconds survived
  highestHit: number;
  towerFloor?: number;   // endless tower: highest floor cleared this run
}

export interface CameraState {
  trauma: number;        // 0..1 screen shake, render squares it
  zoom: number;          // 1 = default; bosses push out a bit
  yaw: number;           // free-camera orbit around the hero (rad, 0 = looking north / -z)
  pitch: number;         // elevation angle (rad)
  dist: number;          // player zoom (wheel / pinch), multiplies the distance
}

export interface InputState {
  keys: Record<string, boolean>;   // KeyboardEvent.code -> down
  pressed: Record<string, boolean>; // edge-triggered this frame (cleared after update)
  pointerNdc: { x: number; y: number };
  mouseDown: boolean;
  /** Virtual joystick (touch): x/z in -1..1 world axes (screen-right = +x, screen-up = -z). */
  joy: { x: number; z: number; active: boolean };
  /** Right aim stick (touch, auto-aim off): direction in world xz, -1..1. */
  aimStick: { x: number; z: number; active: boolean };
  /** Press / drag state of a touch skill button (see engine/systems/aim.ts). dx/dz = world-axis drag vector, mag 0..1. */
  touchAim: { active: boolean; id: string; dx: number; dz: number; mag: number; cancel: boolean };
  /** Set by right-click / Esc: cancels a held aim indicator. */
  cancelAim: boolean;
}
