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

// ------------------------------------------------------------ state ---------
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let activeVoices = 0;
let manualIntensity = 0;
let intensity = 0.1;

const MAX_VOICES = 36;
const MAX_VOICES_PRIORITY = 56;

// time gates (seconds) per sound id
const enum G {
  SHOOT, HIT, DEATH, PLAYER_HIT, EXPLOSION, XP, GOLD, ITEM, DASH, LIGHTNING, SHIELD,
  BUZZ, TELEGRAPH, CRATE, HEAL, SHOCK, COUNT,
}
const GATE: number[] = [];
GATE[G.SHOOT] = 0.085; GATE[G.HIT] = 0.03; GATE[G.DEATH] = 0.045; GATE[G.PLAYER_HIT] = 0.1;
GATE[G.EXPLOSION] = 0.08; GATE[G.XP] = 0.035; GATE[G.GOLD] = 0.06; GATE[G.ITEM] = 0.1;
GATE[G.DASH] = 0.15; GATE[G.LIGHTNING] = 0.06; GATE[G.SHIELD] = 0.15; GATE[G.BUZZ] = 0.25;
GATE[G.TELEGRAPH] = 0.2; GATE[G.CRATE] = 0.08; GATE[G.HEAL] = 0.2; GATE[G.SHOCK] = 0.15;
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
  if (kind === 'ORBITAL_BLADE' || !gate(G.SHOOT)) return;
  const v = att(pos);
  switch (kind) {
    case 'AXE':
      noise(0.2, 0.22 * v, 500, 1400, { filter: 'bandpass', q: 1.2, attack: 0.04 });
      break;
    case 'MAGIC': case 'STORM': case 'PET_BOLT': {
      const f = 1100 + Math.random() * 500;
      tone(f, f * 2, 0.11, 0.11 * v, { type: 'sine' });
      tone(f * 1.5, f * 3, 0.08, 0.05 * v, { type: 'triangle', delay: 0.02 });
      break;
    }
    case 'FIREBALL':
      noise(0.28, 0.2 * v, 900, 200, { attack: 0.03 });
      tone(220, 110, 0.2, 0.1 * v, { type: 'sawtooth' });
      break;
    default: { // arrows
      const f = 650 + Math.random() * 150;
      tone(f, f * 0.4, 0.09, 0.13 * v, { type: 'triangle' });
      noise(0.05, 0.07 * v, 3000, 1500, { filter: 'highpass' });
    }
  }
}

function sfxEnemyHit(pos: Vector3, dmgKind: GameEvents['enemyHit']['dmgKind']): void {
  if (!gate(G.HIT)) return;
  const v = att(pos);
  const base = dmgKind === 'ICE' ? 5200 : dmgKind === 'FIRE' ? 1800 : dmgKind === 'LIGHTNING' ? 4200 : 2800;
  const f = base * (0.8 + Math.random() * 0.5);
  noise(0.035, 0.16 * v, f, f * 0.6, { filter: 'bandpass', q: 1.5 });
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
// A minor, i - VI - III - VII. Roots in Hz (octave 2) with triad offsets.
const PROGRESSION: { root: number; third: number; fifth: number }[] = [
  { root: 110.0, third: 3, fifth: 7 },   // Am
  { root: 87.31, third: 4, fifth: 7 },   // F
  { root: 130.81, third: 4, fifth: 7 },  // C
  { root: 98.0, third: 4, fifth: 7 },    // G
];
const STEPS_PER_BAR = 8;
const A_MINOR_PENT_HZ = [220, 261.63, 293.66, 329.63, 392.0];

let musicTimer: number | null = null;
let nextStepTime = 0;
let step = 0;
let bar = 0;

function musicTarget(): number {
  const d = world.director;
  let t: number;
  if (world.boss.active) t = 1;
  else if (d.phase === 'FIGHT') t = 0.35 + Math.min(0.45, d.aliveCount / 60);
  else if (d.phase === 'CLEANUP') t = 0.3;
  else t = 0.12;
  return Math.max(t, manualIntensity);
}

function padNote(t: number, freq: number, dur: number, vol: number): void {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  osc.detune.value = (Math.random() - 0.5) * 10;
  lp.type = 'lowpass';
  lp.frequency.value = 700 + intensity * 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 1.2);
  g.gain.linearRampToValueAtTime(vol * 0.8, t + dur - 1.0);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
  osc.connect(lp); lp.connect(g); g.connect(musicGain);
  osc.start(t);
  osc.stop(t + dur + 0.7);
}

function pluck(t: number, freq: number, vol: number): void {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2800, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  osc.connect(lp); lp.connect(g); g.connect(musicGain);
  osc.start(t);
  osc.stop(t + 0.6);
}

function bassNote(t: number, freq: number, vol: number): void {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  osc.connect(g); g.connect(musicGain);
  osc.start(t);
  osc.stop(t + 0.65);
}

function drum(t: number, kick: boolean, vol: number): void {
  if (!ctx || !musicGain || !noiseBuf) return;
  if (kick) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g); g.connect(musicGain);
    osc.start(t); osc.stop(t + 0.25);
  } else {
    const src = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noiseBuf;
    hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(musicGain);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }
}

function scheduleStep(t: number, stepDur: number): void {
  const chord = PROGRESSION[bar % PROGRESSION.length];
  if (step === 0) {
    const dur = stepDur * STEPS_PER_BAR;
    const vol = 0.05 + intensity * 0.03;
    padNote(t, chord.root * 2, dur, vol);
    padNote(t, semis(chord.root * 2, chord.third), dur, vol * 0.8);
    padNote(t, semis(chord.root * 2, chord.fifth), dur, vol * 0.8);
  }
  // bass pulses grow with intensity
  if (intensity > 0.3 && (step === 0 || step === 4 || (intensity > 0.7 && (step === 2 || step === 6)))) {
    bassNote(t, chord.root, 0.12 + intensity * 0.06);
  }
  // plucked arpeggio, denser when intense
  if (Math.random() < 0.3 + intensity * 0.55) {
    const idx = Math.floor(Math.random() * 7);
    const f = A_MINOR_PENT_HZ[idx % 5] * (idx >= 5 ? 2 : 1);
    pluck(t, f, 0.035 + intensity * 0.02);
  }
  if (intensity > 0.6) {
    if (step % 4 === 0 && intensity > 0.7) drum(t, true, 0.18);
    if (step % 2 === 1) drum(t, false, 0.04);
  }
}

function musicTick(): void {
  if (!ctx || ctx.state !== 'running') return;
  intensity += (musicTarget() - intensity) * 0.08;
  const stepDur = 0.52 - 0.12 * intensity;
  if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
  while (nextStepTime < ctx.currentTime + 0.5) {
    scheduleStep(nextStepTime, stepDur);
    nextStepTime += stepDur;
    step++;
    if (step >= STEPS_PER_BAR) { step = 0; bar++; }
  }
}

/** Optional manual intensity floor, 0..1 (final intensity = max(auto, manual)). */
export function setMusicIntensity(x: number): void {
  manualIntensity = Math.max(0, Math.min(1, x));
}

// ------------------------------------------------------------ setup ----------
function applyVolumes(): void {
  if (!ctx || !master || !sfxGain || !musicGain) return;
  const s = useGameStore.getState().settings;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(Math.max(0, Math.min(1, s.masterVolume)), t, 0.05);
  sfxGain.gain.setTargetAtTime(Math.max(0, Math.min(1, s.sfxVolume)) * 0.8, t, 0.05);
  musicGain.gain.setTargetAtTime(Math.max(0, Math.min(1, s.musicVolume)) * 0.55, t, 0.05);
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
    sg.connect(m); mg.connect(m); m.connect(comp); comp.connect(c.destination);

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
    ctx = null; master = null; sfxGain = null; musicGain = null; noiseBuf = null;
    activeVoices = 0;
  };
}
