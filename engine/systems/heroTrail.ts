// Hero trail: a short ring buffer of where the hero has been, so monsters and summons can follow with a reaction delay
// (owner: "I move, then ~1 s later the monster follows; same for summons"). Sampled once per frame by whoever asks first.
import { world } from '../world';

const STEP = 0.05;            // seconds between samples
const N = 48;                 // 2.4 s of history
const hx = new Float32Array(N), hz = new Float32Array(N);
let head = -1;                // newest sample index (-1 = empty)
let lastT = -1, acc = 0;

function fill(x: number, z: number): void { hx.fill(x); hz.fill(z); head = 0; }

/** Records the hero position (no-op after the first call in a frame). */
export function sampleHeroTrail(): void {
  const t = world.time, p = world.player.pos;
  if (t === lastT) return;
  if (head < 0 || t < lastT) { fill(p.x, p.z); lastT = t; acc = 0; return; }   // first use / clock reset
  acc += t - lastT; lastT = t;
  if (acc < STEP) return;
  acc = acc % STEP;
  const jx = p.x - hx[head], jz = p.z - hz[head];
  if (jx * jx + jz * jz > 36) { fill(p.x, p.z); return; }   // teleport / room change: no trail across it
  head = (head + 1) % N; hx[head] = p.x; hz[head] = p.z;
}

/** Where the hero was `delay` seconds ago (clamped to the buffer); writes out[0], out[1]. */
export function heroTrailAt(delay: number, out: Float32Array | number[]): void {
  sampleHeroTrail();
  const k = Math.min(N - 2, Math.max(0, delay / STEP));
  const i = Math.floor(k), f = k - i;
  const a = (head - i + N) % N, b = (a - 1 + N) % N;
  out[0] = hx[a] + (hx[b] - hx[a]) * f; out[1] = hz[a] + (hz[b] - hz[a]) * f;
}
