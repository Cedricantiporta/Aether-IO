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

  // ------------------------------------------------------------ GUEST side (STEP 2) ---
  /** GUEST: claim a hit / status on a mirrored monster (combat.guestHit / applyStatus). */
  sendHit: null as null | ((e: Enemy, amount: number, o: DamageOpts, knockRoll: boolean, fromX: number, fromZ: number) => void),
  sendStatus: null as null | ((e: Enemy, effect: StatusEffect) => void),
  /** GUEST: per-frame mirror update (replaces updateEnemies / updateEnemyProjectiles in engine/game.ts). */
  mirror: null as null | ((dt: number) => void),
};
