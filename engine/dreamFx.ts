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
  get busy(): boolean { return this.phase !== 'idle'; },
};

const ease = (x: number) => x * x * (3 - 2 * x);

/** Starts the wake-up: fade out, hold, run `then` (the teleport), fade in. Ignored when already waking. */
export function wake(then: () => void): void {
  if (dreamFx.phase !== 'idle') return;
  dreamFx.phase = 'out'; dreamFx.t = 0; dreamFx.then = then;
}

/** Per-frame tick (real dt) from LookDriver. */
export function tickDreamFx(dt: number): void {
  const d = dreamFx;
  d.haze += ((d.inDream ? 1 : 0) - d.haze) * (1 - Math.exp(-1.5 * dt));
  if (d.haze < 0.002 && !d.inDream) d.haze = 0;
  if (d.phase === 'idle') return;
  d.t += dt;
  if (d.phase === 'out') { d.veil = ease(Math.min(1, d.t / WAKE_OUT)); if (d.t >= WAKE_OUT) { d.phase = 'hold'; d.t = 0; } }
  else if (d.phase === 'hold') { d.veil = 1; if (d.t >= WAKE_HOLD) { const f = d.then; d.then = null; d.phase = 'in'; d.t = 0; f?.(); } }
  else { d.veil = 1 - ease(Math.min(1, d.t / WAKE_IN)); if (d.t >= WAKE_IN) { d.phase = 'idle'; d.veil = 0; } }
}

/** Drops held keys / clicks / joystick (called each frame while `busy`). */
export function blockInput(): void {
  const i = world.input;
  for (const k in i.keys) i.keys[k] = false;
  for (const k in i.pressed) i.pressed[k] = false;
  i.mouseDown = false; i.joy.x = 0; i.joy.z = 0; i.joy.active = false;
}
