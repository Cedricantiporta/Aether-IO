// (owner) Font dream atmosphere + wake-up fade. Pure TS, per-frame state only (never the store): `haze` eases 0..1 while the
// dream room is on screen (render/biomeLook LookDriver ticks it; ui/screens/DreamOverlay DreamVeil reads it into DOM refs), and
// `wake(then)` runs the slow fade to soft gold -> hold -> `then()` (teleport to town) -> fade back in. Input is blocked while `busy`.
import { world } from './world';

export const WAKE_OUT = 1.8, WAKE_HOLD = 0.5, WAKE_IN = 1.0;
export const dreamFx = {
  /** the dream room is the current look (set by biomeLook.setLook) */
  inDream: false,
  /** 0..1 eased haze amount (overlay, motes, breathing) */
  haze: 0,
  /** 0..1 gold-white wake veil */
  veil: 0,
  phase: 'idle' as 'idle' | 'out' | 'hold' | 'in',
  t: 0,
  then: null as null | (() => void),
  /** fade-out / hold / fade-in seconds of the running fade (wake: the slow dream wake-up; sleep: a short nap fade) */
  dur: [WAKE_OUT, WAKE_HOLD, WAKE_IN] as [number, number, number],
  get busy(): boolean { return this.phase !== 'idle'; },
};

const ease = (x: number) => x * x * (3 - 2 * x);

/** Starts the wake-up: fade out, hold, run `then` (the teleport), fade in. Ignored when already waking. */
export function wake(then: () => void, dur: [number, number, number] = [WAKE_OUT, WAKE_HOLD, WAKE_IN]): void {
  if (dreamFx.phase !== 'idle') return;
  dreamFx.dur = dur; dreamFx.phase = 'out'; dreamFx.t = 0; dreamFx.then = then;
}

/** Per-frame tick (real dt) from LookDriver. */
export function tickDreamFx(dt: number): void {
  const d = dreamFx;
  d.haze += ((d.inDream ? 1 : 0) - d.haze) * (1 - Math.exp(-1.5 * dt));
  if (d.haze < 0.002 && !d.inDream) d.haze = 0;
  if (d.phase === 'idle') return;
  d.t += dt;
  if (d.phase === 'out') { d.veil = ease(Math.min(1, d.t / d.dur[0])); if (d.t >= d.dur[0]) { d.phase = 'hold'; d.t = 0; } }
  else if (d.phase === 'hold') { d.veil = 1; if (d.t >= d.dur[1]) { const f = d.then; d.then = null; d.phase = 'in'; d.t = 0; f?.(); } }
  else { d.veil = 1 - ease(Math.min(1, d.t / d.dur[2])); if (d.t >= d.dur[2]) { d.phase = 'idle'; d.veil = 0; } }
}

/** Drops held keys / clicks / joystick (called each frame while `busy`). */
export function blockInput(): void {
  const i = world.input;
  for (const k in i.keys) i.keys[k] = false;
  for (const k in i.pressed) i.pressed[k] = false;
  i.mouseDown = false; i.joy.x = 0; i.joy.z = 0; i.joy.active = false;
}

/** Sleeping in the hero's bed: a short fade (0.9 s out, 0.3 s hold, 0.9 s in) around `then`. */
export const SLEEP_FADE: [number, number, number] = [0.9, 0.3, 0.9];
