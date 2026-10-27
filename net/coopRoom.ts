// Tiny, dependency-free bridge between the co-op session (net/*.ts) and the engine (director, combat, enemies, zones, game loop), so the
// engine needs only a few one-line hooks and no import cycle appears. TYPE imports only (erased at build time).
import type { RoomPlan, Enemy, PlayerRuntime } from '../engine/types';
import type { DamageOpts, StatusEffect, PlayerDebuff } from '../engine/systems/combat';

export interface ForcedRoom { b: number; idx: number; plan: RoomPlan; seed: number }

export const coopRoom = {
  /** true while this player is the GUEST of a co-op run: the director builds the host's rooms, spawns nothing and never clears / rewards.
   *  The guest still simulates ITS OWN hero (movement, attacks, skills) locally; the monsters are a mirror of the host's (net/coopGuest.ts). */
  guest: false,
  /** the host's room waiting to be entered (set by the net layer, consumed by director.enterRoom) */
  forced: null as ForcedRoom | null,
  /** director -> net: a room was entered (host sends it to the guest). */
  onEnter: null as ((b: number, idx: number, plan: RoomPlan, seed: number) => void) | null,
  /** director -> net: the host started walking out through a portal. */
  onLeaving: null as (() => void) | null,
  /** net -> director: enter a room now (registered by the director). */
  enter: null as ((b: number, idx: number, plan: RoomPlan) => void) | null,

  // ------------------------------------------------------------- HOST side (STEP 2) ---
  /** HOST: the partner's stand-in hero (a PlayerRuntime whose position follows the guest). Non-null only while the guest is in this room.
   *  Enemy AI swaps `world.player` to it for monsters nearer to the partner, so every attack aimed at "the player" can land on either hero;
   *  combat.damagePlayer & co. see `world.player === ally` and forward the blow to the guest instead of applying it. */
  ally: null as PlayerRuntime | null,
  /** HOST: a partner fights beside us in this run (enemies get +75% HP). */
  two: false,
  /** HOST: a blow on the stand-in -> the guest applies it with HIS defence (combat.damagePlayer). */
  fwdHit: null as null | ((amount: number, o?: { pct?: number; pos?: { x: number; z: number }; kind?: string; slow?: number; dot?: boolean; src?: Enemy; kb?: number; down?: number; tr?: number; env?: boolean; noDotMul?: boolean; proj?: boolean; srcId?: number; crit?: boolean }) => void),
  fwdDebuff: null as null | ((type: PlayerDebuff, dur: number, val: number, mode: number) => void),
  fwdKnock: null as null | ((fx: number, fz: number, force: number, down: number, cancel: boolean) => void),
  /** HOST: an enemy was killed (pays the partner the same XP / gold). */
  onKill: null as null | ((e: Enemy, xp: number, gold: number) => void),

  // ------------------------------------------------------------------ STEP 3 (both sides) ---
  /** A partner is fighting beside us right now (host: `two`; guest: linked to a host). The simulation then keeps running during a card pick and
   *  a hero at 0 HP goes DOWN instead of dying (assigned by net/coop.ts). */
  live: (() => false) as () => boolean,
  /** 0 = the partner is gone (left / no position for a while), 1 = on his feet, 2 = downed (assigned by net/coop.ts from his position stream). */
  partner: (() => 0) as () => 0 | 1 | 2,
  /** A hero at 0 HP: true when the partner is up (we go DOWN and wait for a revive); false = die as usual. */
  canBeDowned: (() => false) as () => boolean,
  /** while > 0 the pickups spawned by the engine are NOT forwarded (a crate / harvest node breaks on each screen on its own: each player gets that loot himself) */
  noFwd: 0,
  /** HOST: the world dropped a pickup (engine/systems/pickups.spawnPickup): the guest rolls his own copy. */
  fwdDrop: null as null | ((kind: string, x: number, z: number, value: number, item: import('../types').Item | undefined) => void),
  /** HOST: a reward that must open on the guest's own client (a card choice, the fountain's boon). */
  fwdReward: null as null | ((what: number, bonus: boolean) => void),
  /** host's choice of door as the guest sees it (index into world.room.portals, -1 = none); written by net/coopGuest from RST */
  hl: -1,
  /** HOST: the exit the host stands next to right now (0..3, index into world.room.portals; -1 none): shown to the guest as "your friend heads for ..." */
  hlHost: -1,
  /** how far (0..1) I have got reviving my downed partner (the HUD / ring read it) and the partner's position when he went down */
  reviveOut: 0,

  // ------------------------------------------------------------ GUEST side (STEP 2) ---
  /** GUEST: claim a hit / status on a mirrored monster (combat.guestHit / applyStatus). */
  sendHit: null as null | ((e: Enemy, amount: number, o: DamageOpts, knockRoll: boolean, fromX: number, fromZ: number) => void),
  sendStatus: null as null | ((e: Enemy, effect: StatusEffect) => void),
  /** HOST (STEP 4): the trial boss is down -> the guest claims his own loot and is sent home. */
  trialWin: null as null | (() => void),
  /** HOST: a pull / push on the stand-in hero (voidFx gravity wells, black holes, wind ...) is forwarded to the guest, who moves his own hero. */
  fwdPull: null as null | ((dx: number, dz: number) => void),
  /** GUEST (STEP 4): pressed E at a world interaction (chest, fountain, shrine, merchant ...): the host does the world side. */
  sendUse: null as null | ((what: number, a: number) => boolean),
  /** GUEST (STEP 4): forget the mirrored traps / hazards / boss props (room change; net/coopHaz.ts). */
  clearMirror: null as null | (() => void),
  /** GUEST (STEP 4): a hit on a mirrored stationary (index into the host's trap list) is claimed on the host. */
  sendTrapHit: null as null | ((index: number, dmg: number) => void),
  /** GUEST: per-frame mirror update (replaces updateEnemies / updateEnemyProjectiles in engine/game.ts). */
  mirror: null as null | ((dt: number) => void),
};
