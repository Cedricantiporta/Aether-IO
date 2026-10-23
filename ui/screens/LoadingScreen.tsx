import React, { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

const BASE = ((import.meta as any).env?.BASE_URL as string) || '/';
/** (owner) Preload every painted image + the cutscene videos (public/preload.json, scripts/gen_preload.mjs) while the boot screen shows.
 *  Counts toward the bar; never blocks longer than PRELOAD_WAIT ms (the rest keeps loading in the background). */
const PRELOAD_WAIT = 9000;
const pre = { done: 0, total: 0, started: false };
const keep: unknown[] = [];   // (hold references so the browser keeps the decoded images)
function startPreload(): void {
  if (pre.started) return; pre.started = true;
  fetch(`${BASE}preload.json`).then((r) => r.json()).then((list: string[]) => {
    pre.total = list.length;
    for (const f of list) {
      const url = BASE + f, fin = () => { pre.done++; };
      if (f.endsWith('.mp4')) { const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = url; v.oncanplaythrough = fin; v.onerror = fin; v.load(); keep.push(v); }
      else { const im = new Image(); im.decoding = 'async'; im.onload = fin; im.onerror = fin; im.src = url; keep.push(im); }
    }
  }).catch(() => { pre.total = 0; });
}

/** Boot screen driven by three's DefaultLoadingManager (drei useProgress) + the image / video preload. Fades out when assets are in (or after a safety timeout). */
export const LoadingScreen: React.FC = () => {
  const { progress, active, total } = useProgress();
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [minTime, setMinTime] = useState(false);
  const [imgP, setImgP] = useState(0), [imgDone, setImgDone] = useState(false);
  useEffect(() => {
    startPreload();
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = pre.total ? pre.done / pre.total : 0;
      setImgP(p);
      if ((pre.total && pre.done >= pre.total) || performance.now() - t0 > PRELOAD_WAIT) { setImgDone(true); clearInterval(id); }
    }, 150);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { const a = setTimeout(() => setMinTime(true), 700), b = setTimeout(() => setDone(true), 15000); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  useEffect(() => { if (minTime && imgDone && !active && (progress >= 100 || total === 0)) { const t = setTimeout(() => setDone(true), 250); return () => clearTimeout(t); } }, [minTime, imgDone, active, progress, total]);
  useEffect(() => { if (done) { const t = setTimeout(() => setGone(true), 600); return () => clearTimeout(t); } }, [done]);
  if (gone) return null;
  const p = Math.max(0, Math.min(100, done ? 100 : progress * 0.6 + (imgDone ? 1 : imgP) * 40));
  return (
    <div className={`loading-screen pe ${done ? 'done' : ''}`} data-testid="loading-screen"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(8,10,16,.15) 0%, rgba(8,10,16,.25) 55%, rgba(8,10,16,.85) 100%), url(${((import.meta as any).env?.BASE_URL || '/') + 'art/keyart.webp'})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="loading-bar">
        <div className="text-center" style={{ fontFamily: 'var(--font-title)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.12em', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.5)' }}>Loading…</div>
        <div className="xp-bar" style={{ ['--fill' as any]: p / 100, height: '1rem', marginTop: '.5rem' }}><div className="fill" /></div>
      </div>
    </div>
  );
};
