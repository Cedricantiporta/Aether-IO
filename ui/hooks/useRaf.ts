import { useEffect, useRef } from 'react';

// One shared requestAnimationFrame loop for the whole UI. Components subscribe
// a callback that writes to the DOM through refs — React never re-renders.
type Tick = (dt: number, now: number) => void;
const subs = new Set<Tick>();
let rafId = 0;
let last = 0;

function loop(ms: number) {
  const now = ms / 1000;
  const dt = Math.min(0.1, last ? now - last : 0.016);
  last = now;
  subs.forEach((fn) => fn(dt, now));
  rafId = requestAnimationFrame(loop);
}

function start() {
  if (!rafId) { last = 0; rafId = requestAnimationFrame(loop); }
}

export function subscribeRaf(fn: Tick): () => void {
  subs.add(fn);
  start();
  return () => {
    subs.delete(fn);
    if (subs.size === 0 && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  };
}

/** Runs `cb` every animation frame. Latest closure is always used. */
export function useRaf(cb: Tick): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => subscribeRaf((dt, now) => ref.current(dt, now)), []);
}
