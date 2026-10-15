// ============================================================================
// ENGINE CONTRACT — typed, synchronous, allocation-light event bus.
// Engine systems emit; render VFX, audio and UI subscribe.
// Never emit per-entity-per-frame events (e.g. "moved"); only discrete moments.
// ============================================================================
import type { Vector3 } from 'three';
import type { EnemyKind, ProjectileKind, PickupKind, CrateKind, RoomType } from './types';
import type { Rarity } from '../types';

export type DamageKind = 'PHYSICAL' | 'FIRE' | 'ICE' | 'POISON' | 'MAGIC' | 'LIGHTNING' | 'TRUE';

export interface GameEvents {
  // combat
  combo: { stacks: number; finisher: boolean };
  ultWindup: { hero: string; pos: Vector3; duration: number };
  ultRelease: { hero: string; pos: Vector3 };
  floatText: { pos: Vector3; text: string; color: number; scale?: number; dy?: number };
  trick: { pos: Vector3; kind: string; radius: number };            // monster signature trick landed / cast (VFX + audio cue)
  playerDebuff: { type: 'STUN' | 'ROOT' | 'SILENCE' | 'DEFDOWN' | 'BLIND' | 'BURN' | 'POISON' | 'BLEED' | 'SLOW'; duration: number };
  slam: { pos: Vector3; damage: number };
  armorBreak: { pos: Vector3 };
  stagger: { pos: Vector3; boss: boolean };
  damage: { pos: Vector3; amount: number; crit: boolean; kind: DamageKind; toPlayer: boolean; dot?: boolean };
  enemyHit: { pos: Vector3; kind: EnemyKind; dmgKind: DamageKind; dir?: Vector3 };
  enemyDeath: { pos: Vector3; kind: EnemyKind; elite: boolean; boss: boolean; scale: number; poof?: boolean; mini?: boolean };
  playerHit: { pos: Vector3; amount: number };
  playerDeath: { pos: Vector3 };
  playerRevive: { pos: Vector3; source: 'PHOENIX' | 'ANKH' };
  shieldBlock: { pos: Vector3; radius: number; gold?: boolean };   // gold: the knight's Shield Wall
  heal: { pos: Vector3; amount: number };

  // player actions
  shoot: { pos: Vector3; dir: Vector3; kind: ProjectileKind };
  ability: { pos: Vector3; dir: Vector3; name: string }; // 'ARROW_RAIN','FIREBALL','AXE_SPIN','PIERCING_SHOT','GRAVITY_SPELL','RAGE','SPRINT','EARTHWALL','VITALITY'
  dash: { from: Vector3; dir: Vector3 };
  levelUp: { pos: Vector3; level: number };
  noMana: {};
  onCooldown: { slot: string };

  // ability fx (new kit)
  fxImpact: { pos: Vector3; kind: string; radius: number };   // lightweight per-impact burst: RAIN_ARROW METEOR SPIKE ROCK
  blink: { from: Vector3; to: Vector3 };
  leap: { from: Vector3; to: Vector3; dur: number };
  crater: { pos: Vector3; radius: number; color: number };
  shout: { pos: Vector3; radius: number };
  fissure: { from: Vector3; dir: Vector3; length: number };
  quake: { pos: Vector3; radius: number };
  ultStart: { hero: string; pos: Vector3 };
  ultImpact: { pos: Vector3; name: string; radius: number };
  ultReady: {};
  orbZap: { from: Vector3; to: Vector3 };

  // fx moments
  explosion: { pos: Vector3; radius: number; color: number };
  shockwave: { pos: Vector3; radius: number; color: number };
  lightning: { from: Vector3; to: Vector3 };
  frostNova: { pos: Vector3; radius: number };
  projectileImpact: { pos: Vector3; kind: ProjectileKind | 'ENEMY'; tint?: number };
  petStrike: { pos: Vector3; el: number; dx: number; dz: number; big?: boolean };   // a pet's melee hit (el = PET_EL)
  telegraph: { pos: Vector3; radius: number; duration: number }; // audio cue only; visual via Zone
  pickup: { pos: Vector3; kind: PickupKind; value: number; rarity?: Rarity; name?: string };
  crateBreak: { pos: Vector3; kind: CrateKind };
  spawn: { pos: Vector3; kind: EnemyKind; elite: boolean };
  shake: { amount: number }; // adds camera trauma 0..1

  // flow
  waveStart: { wave: number; boss: boolean; elite: boolean };   // a room was entered (wave = depth)
  waveClear: { wave: number; fast?: boolean };                  // the room's enemies are all dead
  roomEnter: { biome: number; index: number; type: RoomType; boss: boolean; name: string };
  portalsOpen: {};
  biomeClear: { biome: number };
  gameEnding: Record<string, never>;            // Malakar (final boss) defeated: ending + credits
  openSetOut: { mode: 'ADVENTURE' | 'TOWER' };  // town gate: Adventure (+ Ascension) / the Endless Tower building
  towerFloor: { floor: number; best: boolean }; // endless tower floor cleared
  bossSpawn: { name: string; title: string };
  bossPhase: { phase: number };
  hub: { kind: 'summon' | 'upgrade' | 'buy' | 'craft' | 'quest' | 'buy_potion' | 'store' | 'learn' | 'buy_pet' | 'equip' | 'equip_pet' | 'accept' | 'craft_fail'; n: number };   // discrete town actions (goals / achievements)
  runStart: {};
  runEnd: {};
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) { set = new Set(); this.map.set(type, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    set.forEach((fn) => fn(payload));
  }
}

export const events = new EventBus();
