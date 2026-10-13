// ============================================================================
// Procedural WebAudio: SFX + generative ambient music. No asset files.
//   voices -> sfxGain \
//                      > master -> compressor -> destination
//   music  -> musicGain /
// Everything is guarded: if AudioContext is unavailable the module is a no-op.
// A global voice limiter + per-sound time gates keep CPU bounded under spam.
// ============================================================================
import { events } from './events';
import type { GameEvents } from './events';
import { world } from './world';
import { useGameStore } from '../store';
import type { Vector3 } from 'three';
import type { ProjectileKind } from './types';
import { GameStatus } from '../types';

// ------------------------------------------------------------ state ---------
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let activeVoices = 0;
let manualIntensity = 0;
let intensity = 0.1;

const MAX_VOICES = 26;
const MAX_VOICES_PRIORITY = 42;

// time gates (seconds) per sound id
const enum G {
  SHOOT, HIT, DEATH, PLAYER_HIT, EXPLOSION, XP, GOLD, ITEM, DASH, LIGHTNING, SHIELD,
  BUZZ, TELEGRAPH, CRATE, HEAL, SHOCK, SKILL, RAIN, COUNT,
}
const GATE: number[] = [];
GATE[G.SHOOT] = 0.11; GATE[G.HIT] = 0.03; GATE[G.DEATH] = 0.045; GATE[G.PLAYER_HIT] = 0.1;
GATE[G.EXPLOSION] = 0.08; GATE[G.XP] = 0.035; GATE[G.GOLD] = 0.06; GATE[G.ITEM] = 0.1;
GATE[G.DASH] = 0.15; GATE[G.LIGHTNING] = 0.06; GATE[G.SHIELD] = 0.15; GATE[G.BUZZ] = 0.25;
GATE[G.TELEGRAPH] = 0.2; GATE[G.CRATE] = 0.08; GATE[G.HEAL] = 0.2; GATE[G.SHOCK] = 0.15; GATE[G.SKILL] = 0.05; GATE[G.RAIN] = 0.07;
const lastPlay = new Float64Array(G.COUNT).fill(-10);

function gate(id: number): boolean {
  if (!ctx) return false;
  const now = ctx.currentTime;
  if (now - lastPlay[id] < GATE[id]) return false;
  lastPlay[id] = now;
  return true;
}

/** Distance attenuation relative to the player (1 = on top of the player). */
function att(pos: Vector3 | undefined): number {
  if (!pos) return 1;
  const p = world.player.pos;
  const dx = pos.x - p.x;
  const dz = pos.z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return Math.max(0.25, 1 - d / 70);
}

// ------------------------------------------------------------ primitives -----
function voiceFree(priority: boolean): boolean {
  return activeVoices < (priority ? MAX_VOICES_PRIORITY : MAX_VOICES);
}

function release(src: AudioScheduledSourceNode): void {
  activeVoices++;
  src.onended = () => { activeVoices--; };
}

interface ToneOpts {
  type?: OscillatorType;
  delay?: number;
  attack?: number;
  priority?: boolean;
  dest?: AudioNode;
  detune?: number;
}

/** Oscillator with exponential pitch glide + percussive envelope. */
function tone(f0: number, f1: number, dur: number, vol: number, o: ToneOpts = {}): void {
  if (!ctx || !sfxGain || vol <= 0.0005 || !voiceFree(!!o.priority)) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(o.dest ?? sfxGain);
  release(osc);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  delay?: number;
  q?: number;
  attack?: number;
  priority?: boolean;
}

/** Filtered noise burst with filter sweep f0 -> f1. */
function noise(dur: number, vol: number, f0: number, f1: number, o: NoiseOpts = {}): void {
  if (!ctx || !sfxGain || !noiseBuf || vol <= 0.0005 || !voiceFree(!!o.priority)) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = o.filter ?? 'lowpass';
  filt.Q.value = o.q ?? 0.8;
  filt.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(sfxGain);
  release(src);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

// pentatonic helpers (A minor): semitone offsets from A
const PENT = [0, 3, 5, 7, 10];
function pentFreq(root: number, idx: number): number {
  const oct = Math.floor(idx / 5);
  return root * Math.pow(2, (PENT[((idx % 5) + 5) % 5] + oct * 12) / 12);
}
function semis(root: number, n: number): number { return root * Math.pow(2, n / 12); }

// ------------------------------------------------------------ SFX voices -----
function sfxShoot(kind: ProjectileKind, pos: Vector3): void {
  if (kind === 'ORBITAL_BLADE' || activeVoices > 16 || !gate(G.SHOOT)) return;
  const v = att(pos);
  switch (kind) {
    case 'AXE':
      noise(0.14, 0.12 * v, 500, 1200, { filter: 'bandpass', q: 1.0, attack: 0.03 });
      break;
    case 'MAGIC': case 'STORM': case 'PET_BOLT': {
      const f = 1100 + Math.random() * 500;
      tone(f * 0.7, f * 1.4, 0.07, 0.06 * v, { type: 'sine' });
      break;
    }
    case 'FIREBALL':
      noise(0.2, 0.12 * v, 800, 200, { attack: 0.03 });
      tone(200, 110, 0.14, 0.05 * v, { type: 'triangle' });
      break;
    default: { // arrows
      const f = 650 + Math.random() * 150;
      tone(f * 0.8, f * 0.35, 0.06, 0.065 * v, { type: 'triangle' });
      noise(0.03, 0.025 * v, 2500, 1500, { filter: 'bandpass' });
    }
  }
}

function sfxEnemyHit(pos: Vector3, dmgKind: GameEvents['enemyHit']['dmgKind']): void {
  if (!gate(G.HIT)) return;
  const v = att(pos);
  const base = dmgKind === 'ICE' ? 5200 : dmgKind === 'FIRE' ? 1800 : dmgKind === 'LIGHTNING' ? 4200 : 2800;
  const f = base * (0.8 + Math.random() * 0.5);
  noise(0.03, 0.09 * v, f * 0.8, f * 0.5, { filter: 'bandpass', q: 1.5 });
}

function sfxEnemyDeath(pos: Vector3, elite: boolean, boss: boolean): void {
  if (!boss && !gate(G.DEATH)) return;
  const v = att(pos);
  if (boss) {
    tone(140, 30, 1.1, 0.4, { type: 'sawtooth', priority: true });
    noise(1.0, 0.4, 1800, 60, { priority: true });
    tone(55, 25, 1.4, 0.4, { priority: true });
    return;
  }
  const f = (elite ? 220 : 340) * (0.85 + Math.random() * 0.3);
  tone(f, f * 0.25, elite ? 0.28 : 0.14, (elite ? 0.22 : 0.14) * v, { type: 'sine' });
  noise(elite ? 0.25 : 0.1, (elite ? 0.18 : 0.1) * v, 1500, 250);
  if (elite) tone(90, 40, 0.35, 0.2 * v);
}

function sfxPlayerHit(): void {
  if (!gate(G.PLAYER_HIT)) return;
  tone(95, 40, 0.22, 0.4, { priority: true });
  noise(0.12, 0.25, 600, 150, { priority: true });
}

function sfxExplosion(pos: Vector3, radius: number): void {
  if (!gate(G.EXPLOSION)) return;
  const v = att(pos) * Math.min(1.3, 0.6 + radius * 0.08);
  noise(0.6, 0.45 * v, 2400, 70, { priority: true });
  tone(75, 28, 0.5, 0.4 * v, { priority: true });
}

let xpCombo = 0;
let xpLast = -10;
function sfxPickup(kind: GameEvents['pickup']['kind'], rarity: string | undefined): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  switch (kind) {
    case 'XP': {
      if (!gate(G.XP)) return;
      xpCombo = now - xpLast < 0.5 ? Math.min(xpCombo + 1, 14) : 0;
      xpLast = now;
      tone(pentFreq(660, xpCombo), pentFreq(660, xpCombo) * 1.01, 0.07, 0.07, { type: 'sine' });
      break;
    }
    case 'GOLD':
      if (!gate(G.GOLD)) return;
      tone(1318, 1318, 0.12, 0.1, { type: 'triangle' });
      tone(1760, 1760, 0.25, 0.1, { type: 'triangle', delay: 0.06 });
      break;
    case 'GEM':
      if (!gate(G.GOLD)) return;
      tone(1568, 1568, 0.2, 0.08);
      tone(2093, 2093, 0.3, 0.08, { delay: 0.05 });
      tone(2637, 2637, 0.4, 0.06, { delay: 0.1 });
      break;
    case 'HEALTH':
      if (!gate(G.HEAL)) return;
      tone(440, 880, 0.25, 0.12);
      tone(660, 1320, 0.25, 0.08, { delay: 0.08 });
      break;
    case 'ITEM': {
      if (!gate(G.ITEM)) return;
      const n = rarity === 'MYTHIC' ? 5 : rarity === 'LEGENDARY' ? 4 : rarity === 'EPIC' ? 3 : rarity === 'RARE' ? 2 : 1;
      const chord = [0, 4, 7, 12, 16];
      for (let i = 0; i < n; i++) {
        tone(semis(659, chord[i]), semis(659, chord[i]), 0.5 + i * 0.1, 0.09, { type: 'triangle', delay: i * 0.07, priority: true });
      }
      break;
    }
  }
}

function sfxLevelUp(): void {
  for (let i = 0; i < 6; i++) {
    tone(pentFreq(440, i + 1), pentFreq(440, i + 1), 0.35, 0.14, { type: 'triangle', delay: i * 0.07, priority: true });
  }
  tone(880, 880, 0.9, 0.08, { delay: 0.4, priority: true });
}

function sfxDash(): void {
  if (!gate(G.DASH)) return;
  noise(0.2, 0.25, 400, 2400, { filter: 'bandpass', q: 0.9, attack: 0.05 });
}

function sfxLightning(): void {
  if (!gate(G.LIGHTNING)) return;
  noise(0.12, 0.3, 6000, 1500, { filter: 'highpass' });
  tone(1800, 200, 0.14, 0.14, { type: 'sawtooth' });
}

function sfxShield(): void {
  if (!gate(G.SHIELD)) return;
  tone(1568, 1568, 0.45, 0.16, { priority: true });
  tone(2349, 2349, 0.4, 0.1, { delay: 0.02, priority: true });
  tone(3136, 3136, 0.3, 0.06, { delay: 0.04, priority: true });
}

function sfxWaveStart(boss: boolean): void {
  const root = boss ? 98 : 130.8;
  tone(root, root * 1.01, 0.9, 0.2, { type: 'sawtooth', attack: 0.15, priority: true });
  tone(root * 1.5, root * 1.5, 0.9, 0.12, { type: 'sawtooth', attack: 0.2, delay: 0.25, priority: true });
  tone(root * 2, root * 2.02, 1.1, 0.14, { type: 'sawtooth', attack: 0.2, delay: 0.5, priority: true });
  noise(0.6, 0.06, 500, 1500, { filter: 'bandpass', priority: true });
}

function sfxWaveClear(): void {
  const notes = [0, 4, 7, 12, 7, 12, 16];
  for (let i = 0; i < notes.length; i++) {
    tone(semis(523, notes[i]), semis(523, notes[i]), i === notes.length - 1 ? 1.0 : 0.22, 0.15, {
      type: 'triangle', delay: i * 0.11, priority: true,
    });
  }
}

function sfxBossSpawn(): void {
  tone(55, 50, 3.2, 0.35, { type: 'sawtooth', attack: 0.6, priority: true });
  tone(58, 52, 3.2, 0.3, { type: 'sawtooth', attack: 0.6, priority: true });
  // gong
  const g = [110, 176, 247, 331];
  for (let i = 0; i < g.length; i++) tone(g[i], g[i] * 0.99, 2.6, 0.2 / (i + 1), { priority: true, delay: 0.3 });
  noise(0.5, 0.3, 800, 100, { delay: 0.3, priority: true });
}

/** 'bell' cue: village alarm bell. Struck `n` times, each strike a bright inharmonic partial stack with a long ring. */
function sfxBell(n: number): void {
  for (let i = 0; i < n; i++) {
    const d = i * 0.42;
    tone(660, 655, 1.4, 0.2, { type: 'sine', delay: d, priority: true });
    tone(660 * 2.76, 660 * 2.74, 0.9, 0.1, { type: 'sine', delay: d, priority: true });
    tone(660 * 5.4, 660 * 5.35, 0.45, 0.05, { type: 'sine', delay: d, priority: true });
    noise(0.08, 0.12, 5000, 1500, { filter: 'bandpass', delay: d, priority: true });
  }
}

function sfxCountdown(seconds: number): void {
  const last = seconds <= 1;
  tone(last ? 1320 : 880, last ? 1320 : 880, last ? 0.35 : 0.1, 0.12, { priority: true });
}

function sfxBuzz(): void {
  if (!gate(G.BUZZ)) return;
  tone(150, 120, 0.12, 0.1, { type: 'square' });
}

function sfxFrostNova(): void {
  if (!gate(G.SHOCK)) return;
  tone(2400, 900, 0.5, 0.15, { priority: true });
  noise(0.4, 0.2, 7000, 2000, { filter: 'highpass', priority: true });
}

function sfxSkill(name: string): void {
  if (!gate(G.SKILL)) return;
  switch (name) {
    case 'GALE_ARROW': noise(0.5, 0.2, 400, 2600, { filter: 'bandpass', q: 0.8, attack: 0.05 }); tone(300, 900, 0.3, 0.1, { type: 'sawtooth' }); break;
    case 'SHADOW_ROLL': noise(0.18, 0.14, 1500, 400, { attack: 0.01 }); tone(500, 200, 0.2, 0.08, { type: 'triangle' }); break;
    case 'FAN_FLAMES': noise(0.45, 0.2, 1800, 300, { attack: 0.02 }); tone(180, 90, 0.35, 0.12, { type: 'sawtooth' }); break;
    case 'FROST_FIELD': tone(1800, 900, 0.3, 0.1, { type: 'sine' }); tone(2400, 1200, 0.4, 0.07, { type: 'sine', delay: 0.15 }); noise(0.3, 0.1, 5000, 2000, { filter: 'bandpass' }); break;
    case 'SINGULARITY': tone(70, 220, 0.9, 0.22, { type: 'sine', attack: 0.3 }); tone(90, 40, 1.1, 0.14, { type: 'sawtooth' }); break;
    case 'BLINK_NOVA': tone(1200, 300, 0.2, 0.12, { type: 'sine' }); noise(0.2, 0.1, 6000, 1500, { filter: 'bandpass' }); break;
    case 'STORM_ORBS': tone(220, 880, 0.5, 0.1, { type: 'square', attack: 0.1 }); noise(0.4, 0.1, 3000, 6000, { filter: 'bandpass' }); break;
    case 'INFERNO_PILLAR': tone(140, 60, 0.7, 0.2, { type: 'sawtooth' }); noise(0.7, 0.22, 2200, 200, { attack: 0.05 }); break;
    case 'BLOODRAGE_LEAP': tone(160, 420, 0.3, 0.14, { type: 'sawtooth' }); noise(0.2, 0.12, 900, 300); break;
    case 'WHIRLWIND': noise(0.9, 0.16, 500, 1500, { filter: 'bandpass', q: 1.2, attack: 0.1 }); tone(200, 320, 0.8, 0.07, { type: 'triangle' }); break;
    case 'EARTHSPLITTER': tone(90, 40, 0.5, 0.25, { priority: true }); noise(0.5, 0.2, 700, 80); break;
    case 'BATTLE_CRY': tone(130, 90, 0.7, 0.24, { type: 'sawtooth', priority: true }); tone(260, 180, 0.6, 0.12, { type: 'square' }); break;
    default: break;
  }
}
function sfxUlt(hero: string): void {
  tone(55, 220, 1.4, 0.28, { type: 'sawtooth', attack: 0.5, priority: true });
  tone(110, 440, 1.2, 0.16, { type: 'sine', attack: 0.6 });
  noise(1.2, 0.22, 200, 3000, { attack: 0.7, priority: true });
  void hero;
}
function sfxUltImpact(name: string): void {
  tone(70, 22, 1.0, 0.5, { priority: true });
  noise(1.0, 0.5, 3000, 60, { priority: true });
  if (name === 'METEOR') tone(45, 20, 1.5, 0.45, { priority: true });
}
function sfxRainHit(): void {
  if (!gate(G.RAIN)) return;
  tone(900 + Math.random() * 500, 300, 0.05, 0.035, { type: 'triangle' });
}
function sfxShockwave(): void {
  if (!gate(G.SHOCK)) return;
  tone(110, 35, 0.4, 0.3, { priority: true });
  noise(0.25, 0.15, 500, 100);
}

function sfxTelegraph(): void {
  if (!gate(G.TELEGRAPH)) return;
  tone(220, 330, 0.25, 0.07, { type: 'triangle', attack: 0.12 });
}

function sfxCrate(): void {
  if (!gate(G.CRATE)) return;
  noise(0.14, 0.25, 900, 400, { filter: 'bandpass', q: 0.7 });
  tone(160, 70, 0.1, 0.15);
}

function sfxPlayerDeath(): void {
  tone(440, 45, 1.4, 0.3, { type: 'sawtooth', priority: true });
  noise(0.8, 0.2, 1200, 80, { priority: true });
}

function sfxRevive(): void {
  for (let i = 0; i < 5; i++) tone(pentFreq(330, i + 2), pentFreq(330, i + 2), 0.5, 0.14, { delay: i * 0.08, type: 'triangle', priority: true });
}

function sfxHeal(): void {
  if (!gate(G.HEAL)) return;
  tone(523, 784, 0.3, 0.1);
}

// ------------------------------------------------------------ music ----------
// Three generative themes crossfaded by game state (all routed musicGain -> lowpass -> reverb send):
//   village: warm pad + soft lute pluck, C lydian, slow.
//   siege:   low drums + minor ostinato, intensity follows alive count.
//   boss:    deep drone + choir-ish pad, D phrygian, heavy hits.
type Theme = 0 | 1 | 2; // village, siege, boss
const layerG: (GainNode | null)[] = [null, null, null];
const layerLvl = [1, 0, 0];
let musicEnabled = true;
let musicTimer: number | null = null;
let nextStepTime = 0;
let step = 0;
let bar = 0;
let lute = 0;
const STEPS_PER_BAR = 8;

// village: C lydian chords (semitones above root freq)
const V_ROOTS = [130.81, 146.83, 110.0, 174.61]; // C, D, A, F
const V_CHORDS = [[0, 4, 7, 11], [0, 4, 7, 12], [0, 3, 7, 10], [0, 4, 7, 11]];
const V_SCALE = [0, 2, 4, 6, 7, 9, 11, 12, 14]; // lydian
// siege: A minor
const S_ROOTS = [110.0, 87.31, 130.81, 98.0];
const S_OST = [0, -1, 7, -1, 3, -1, 5, 7]; // semitone offsets, -1 = rest
const S_PENT = [220, 261.63, 293.66, 329.63, 392.0];
// boss: D phrygian
const B_ROOT = 73.42;
const B_PAT = [0, 1, 0, 0, 3, 0, 1, 0];

function themeTargets(): [number, number, number] {
  const st = useGameStore.getState().status;
  if (world.boss.active) return [0, 0, 1];
  if (st === GameStatus.MENU || world.director.phase === 'RESPITE') return [1, 0, 0];
  return [0, 1, 0];
}

function musicTarget(): number {
  const d = world.director;
  let t: number;
  if (world.boss.active) t = 0.9;
  else if (d.phase === 'FIGHT') t = 0.3 + Math.min(0.55, d.aliveCount / 60);
  else if (d.phase === 'CLEANUP') t = 0.3;
  else t = 0.12;
  return Math.max(t, manualIntensity);
}

function voice(dest: GainNode, type: OscillatorType, f: number, t: number, atk: number, hold: number, rel: number, vol: number, lpHz: number, det = 0): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  osc.type = type; osc.frequency.value = f; osc.detune.value = det;
  lp.type = 'lowpass'; lp.frequency.value = lpHz; lp.Q.value = 0.4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  g.gain.setValueAtTime(vol, t + atk + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + atk + hold + rel);
  osc.connect(lp); lp.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + atk + hold + rel + 0.05);
}

function pluckTo(dest: GainNode, t: number, f: number, vol: number): void {
  voice(dest, 'triangle', f, t, 0.008, 0, 0.9, vol, 2200);
  voice(dest, 'sine', f * 2, t, 0.004, 0, 0.35, vol * 0.25, 3000);
}

function kickTo(dest: GainNode, t: number, vol: number, deep = false): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(deep ? 90 : 110, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + (deep ? 0.28 : 0.16));
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (deep ? 0.4 : 0.22));
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.45);
}

function tomTo(dest: GainNode, t: number, f: number, vol: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(f * 1.5, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.4);
}

function villageStep(t: number, sd: number): void {
  const g = layerG[0]!;
  const c = bar % 4, root = V_ROOTS[c] * 2;
  if (step === 0) {
    const dur = sd * STEPS_PER_BAR;
    for (const n of V_CHORDS[c]) voice(g, 'triangle', semis(root, n), t, 1.6, dur - 1.8, 1.8, 0.05, 900, (Math.random() - 0.5) * 12);
    voice(g, 'sine', root / 2, t, 1.2, dur - 1.2, 1.5, 0.07, 400);
  }
  if ((step & 1) === 0 && Math.random() < 0.55) {
    lute = Math.max(0, Math.min(V_SCALE.length - 1, lute + Math.floor(Math.random() * 5) - 2));
    pluckTo(g, t, semis(root * 2, V_SCALE[lute]), 0.05);
  }
}

function siegeStep(t: number, sd: number): void {
  const g = layerG[1]!;
  const c = bar % 4, root = S_ROOTS[c];
  if (step === 0) {
    const dur = sd * STEPS_PER_BAR;
    voice(g, 'triangle', root * 2, t, 1.0, dur - 1.0, 1.0, 0.045, 600 + intensity * 600);
    voice(g, 'triangle', semis(root * 2, c === 1 || c === 2 || c === 3 ? 4 : 3), t, 1.0, dur - 1.0, 1.0, 0.035, 600 + intensity * 600);
    voice(g, 'sine', root, t, 0.6, dur - 0.6, 1.0, 0.08, 300);
  }
  // minor ostinato (soft saw through a low filter)
  const o = S_OST[step];
  if (o >= 0 && intensity > 0.2) voice(g, 'sawtooth', semis(root, o), t, 0.01, 0.05, 0.22, 0.03 + intensity * 0.03, 450 + intensity * 500);
  if (step === 0 || (step === 4 && intensity > 0.25)) kickTo(g, t, 0.16 + intensity * 0.1);
  if (intensity > 0.55 && (step === 2 || step === 6)) tomTo(g, t, 85, 0.09);
  if (intensity > 0.45 && Math.random() < 0.35) pluckTo(g, t, S_PENT[Math.floor(Math.random() * 5)], 0.03);
}

function bossStep(t: number, sd: number): void {
  const g = layerG[2]!;
  if (step === 0) {
    const dur = sd * STEPS_PER_BAR;
    voice(g, 'sawtooth', B_ROOT, t, 1.2, dur - 1.2, 1.2, 0.05, 220);
    // choir-ish: stacked sines, root / flat-2 / fifth / octave, slow swell
    const ch = bar % 2 === 0 ? [0, 7, 12, 15] : [1, 8, 12, 17];
    for (const n of ch) {
      voice(g, 'sine', semis(B_ROOT * 4, n), t, 2.0, dur - 2.2, 1.6, 0.04, 1400, (Math.random() - 0.5) * 18);
      voice(g, 'triangle', semis(B_ROOT * 2, n), t, 2.0, dur - 2.2, 1.6, 0.025, 800, (Math.random() - 0.5) * 18);
    }
  }
  const o = B_PAT[step];
  if (step === 0 || step === 3 || step === 4) kickTo(g, t, 0.22, true);
  if (step === 6) tomTo(g, t, 70, 0.14);
  if (step % 2 === 0) voice(g, 'sawtooth', semis(B_ROOT, o), t, 0.01, 0.05, 0.3, 0.04, 380);
}

function scheduleStep(t: number, sd: number): void {
  if (layerLvl[0] > 0.04) villageStep(t, sd);
  if (layerLvl[1] > 0.04) siegeStep(t, sd);
  if (layerLvl[2] > 0.04) bossStep(t, sd);
}

function musicTick(): void {
  if (!ctx || ctx.state !== 'running' || !musicEnabled) return;
  const tg = themeTargets();
  for (let i = 0; i < 3; i++) {
    layerLvl[i] += (tg[i] - layerLvl[i]) * 0.04;
    if (Math.abs(layerLvl[i] - tg[i]) < 0.005) layerLvl[i] = tg[i];
    layerG[i]?.gain.setTargetAtTime(layerLvl[i], ctx.currentTime, 0.1);
  }
  intensity += (musicTarget() - intensity) * 0.08;
  const sd = layerLvl[2] > 0.5 ? 0.5 : layerLvl[1] > layerLvl[0] ? 0.5 - 0.1 * intensity : 0.68;
  if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
  while (nextStepTime < ctx.currentTime + 0.5) {
    scheduleStep(nextStepTime, sd);
    nextStepTime += sd;
    step++;
    if (step >= STEPS_PER_BAR) { step = 0; bar++; }
  }
}

/** Optional manual intensity floor, 0..1 (final intensity = max(auto, manual)). */
export function setMusicIntensity(x: number): void {
  manualIntensity = Math.max(0, Math.min(1, x));
}

function makeImpulse(c: AudioContext, secs: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  return buf;
}

// ------------------------------------------------------------ setup ----------
function applyVolumes(): void {
  if (!ctx || !master || !sfxGain || !musicGain) return;
  const s = useGameStore.getState().settings;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, s.masterVolume)), t, 0.05);
  sfxGain.gain.setTargetAtTime(Math.max(0, Math.min(1, s.sfxVolume)) * 0.6, t, 0.05);
  // music was 0.55 * volume; now ~35% of that (0.19) and further softened by the music lowpass
  const mv = Math.max(0, Math.min(1, s.musicVolume));
  musicGain.gain.setTargetAtTime(mv * 0.19, t, 0.08);
  musicEnabled = mv > 0.01; // volume 0: stop scheduling entirely (saves CPU)
}

function ensureContext(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return true;
  }
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const c = new Ctor();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const m = c.createGain();
    const sg = c.createGain();
    const mg = c.createGain();
    // soft sfx bus (tames harsh highs), music bus: lowpass + generated-impulse reverb send
    const sl = c.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 8000; sl.Q.value = 0.3;
    sg.connect(sl); sl.connect(m);
    const mlp = c.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 2200; mlp.Q.value = 0.4;
    const conv = c.createConvolver(); conv.buffer = makeImpulse(c, 2.4);
    const wet = c.createGain(); wet.gain.value = 0.45;
    mg.connect(mlp); mlp.connect(m); mlp.connect(conv); conv.connect(wet); wet.connect(m);
    for (let i = 0; i < 3; i++) { const lg = c.createGain(); lg.gain.value = layerLvl[i]; lg.connect(mg); layerG[i] = lg; }
    m.connect(comp); comp.connect(c.destination);

    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    ctx = c; master = m; sfxGain = sg; musicGain = mg; noiseBuf = buf;
    applyVolumes();
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    nextStepTime = 0; step = 0; bar = 0;
    musicTimer = window.setInterval(musicTick, 100);
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

/** Safe wrapper: audio must never throw into the game loop. */
function safe<T>(fn: (p: T) => void): (p: T) => void {
  return (p: T) => {
    if (!ctx || ctx.state !== 'running') return;
    try { fn(p); } catch { /* ignore audio errors */ }
  };
}

export function initAudio(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const unlock = (): void => {
    if (ensureContext() && ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const offs: Array<() => void> = [];
  offs.push(events.on('shoot', safe((p) => sfxShoot(p.kind, p.pos))));
  offs.push(events.on('enemyHit', safe((p) => sfxEnemyHit(p.pos, p.dmgKind))));
  offs.push(events.on('enemyDeath', safe((p) => sfxEnemyDeath(p.pos, p.elite, p.boss))));
  offs.push(events.on('playerHit', safe(() => sfxPlayerHit())));
  offs.push(events.on('playerDeath', safe(() => sfxPlayerDeath())));
  offs.push(events.on('playerRevive', safe(() => sfxRevive())));
  offs.push(events.on('shieldBlock', safe(() => sfxShield())));
  offs.push(events.on('heal', safe(() => sfxHeal())));
  offs.push(events.on('explosion', safe((p) => sfxExplosion(p.pos, p.radius))));
  offs.push(events.on('shockwave', safe(() => sfxShockwave())));
  offs.push(events.on('frostNova', safe(() => sfxFrostNova())));
  offs.push(events.on('ability', safe((p) => sfxSkill(p.name))));
  offs.push(events.on('ultStart', safe((p) => sfxUlt(p.hero))));
  offs.push(events.on('ultImpact', safe((p) => sfxUltImpact(p.name))));
  offs.push(events.on('fxImpact', safe((p) => { if (p.kind === 'RAIN_ARROW') sfxRainHit(); else sfxExplosion(p.pos, 2); })));
  offs.push(events.on('blink', safe(() => sfxSkill('BLINK_NOVA'))));
  offs.push(events.on('shout', safe(() => sfxSkill('BATTLE_CRY'))));
  offs.push(events.on('quake', safe(() => sfxShockwave())));
  offs.push(events.on('ultReady', safe(() => { tone(660, 990, 0.25, 0.12, { type: 'sine' }); tone(990, 1320, 0.3, 0.1, { type: 'sine', delay: 0.12 }); })));
  offs.push(events.on('lightning', safe(() => sfxLightning())));
  offs.push(events.on('telegraph', safe(() => sfxTelegraph())));
  offs.push(events.on('pickup', safe((p) => sfxPickup(p.kind, p.rarity))));
  offs.push(events.on('crateBreak', safe(() => sfxCrate())));
  offs.push(events.on('levelUp', safe(() => sfxLevelUp())));
  offs.push(events.on('dash', safe(() => sfxDash())));
  offs.push(events.on('noMana', safe(() => sfxBuzz())));
  offs.push(events.on('onCooldown', safe(() => sfxBuzz())));
  offs.push(events.on('waveStart', safe((p) => sfxWaveStart(p.boss))));
  offs.push(events.on('waveClear', safe(() => sfxWaveClear())));
  offs.push(events.on('bossSpawn', safe(() => sfxBossSpawn())));
  offs.push(events.on('bossPhase', safe(() => sfxShockwave())));
  offs.push(events.on('siegeStart', safe(() => sfxBell(4))));
  offs.push(events.on('respiteEnd', safe(() => sfxBell(2))));
  offs.push(events.on('respiteStart', safe(() => sfxWaveClear())));
  offs.push(events.on('countdown', safe((p) => sfxCountdown(p.seconds))));
  offs.push(events.on('runStart', () => { step = 0; bar = 0; intensity = 0.1; manualIntensity = 0; }));

  const unsubStore = useGameStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings) applyVolumes();
  });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    for (const off of offs) off();
    unsubStore();
    if (musicTimer !== null) { window.clearInterval(musicTimer); musicTimer = null; }
    if (ctx) { void ctx.close().catch(() => undefined); }
    ctx = null; master = null; sfxGain = null; musicGain = null; noiseBuf = null; layerG[0] = layerG[1] = layerG[2] = null;
    activeVoices = 0;
  };
}
