// Canvas-text sprites. Town labels use a classic serif (Cinzel from the page, Georgia / serif fallback) inside a dark
// MMORPG name plate; the legacy rounded style stays for item pickups etc.
import { CanvasTexture, LinearFilter, SRGBColorSpace, SpriteMaterial } from 'three';

interface Lab { mat: SpriteMaterial; aspect: number }
const cache = new Map<string, Lab>();

const SERIF = '"Cinzel", Georgia, "Times New Roman", serif';
const GOLD = '#d9b56a', CREAM = '#f1e2b8';

type PlateKind = 'plate' | 'mini';
interface Opts { size?: number; stroke?: string; bg?: string; /** town name plate ('mini' = smaller, subtler NPC variant) */ plate?: PlateKind }

// Kick the web font off as early as possible (the town mounts while it may still be loading).
let fontsReady = false;
const fontWaiters: (() => void)[] = [];
if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.load) {
  const fs = (document as any).fonts as FontFaceSet;
  Promise.all([fs.load('700 48px "Cinzel"'), fs.load('600 48px "Cinzel"')]).catch(() => undefined).then(() => { fontsReady = true; fontWaiters.splice(0).forEach((f) => f()); });
} else fontsReady = true;

function drawPlate(cv: HTMLCanvasElement, text: string, size: number, kind: PlateKind, w: number, h: number) {
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const mini = kind === 'mini';
  const pad = Math.round(size * (mini ? 0.5 : 0.62));
  const m = 3;                                   // transparent margin so the hairline is not clipped
  ctx.fillStyle = mini ? 'rgba(10,11,14,.55)' : 'rgba(10,11,14,.78)';
  ctx.fillRect(m, m, w - 2 * m, h - 2 * m);       // sharp corners
  ctx.lineWidth = mini ? 1.5 : 2;
  ctx.strokeStyle = mini ? 'rgba(217,181,106,.55)' : GOLD;
  ctx.strokeRect(m + 0.5, m + 0.5, w - 2 * m - 1, h - 2 * m - 1);
  // small gold diamonds at both ends
  const d = size * (mini ? 0.13 : 0.17), cy = h / 2, dx = Math.round(pad * 0.5);
  ctx.fillStyle = mini ? 'rgba(217,181,106,.75)' : GOLD;
  for (const cx of [m + dx, w - m - dx]) { ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath(); ctx.fill(); }
  // text (shrunk to fit if the real font is wider than the fallback used for sizing)
  const weight = mini ? 600 : 700;
  ctx.font = `${weight} ${size}px ${SERIF}`;
  const avail = w - 2 * pad - 2 * d;
  const tw = ctx.measureText(text).width;
  const k = tw > avail ? avail / tw : 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(w / 2, cy + size * 0.04); ctx.scale(k, 1);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(text, 0, 1.5);
  ctx.fillStyle = CREAM; ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function labelMaterial(text: string, color = '#ffffff', opts: Opts = {}): Lab {
  const key = text + '|' + color + '|' + (opts.bg || '') + '|' + (opts.plate || '') + '|' + (opts.size || '');
  let l = cache.get(key);
  if (l) return l;
  const size = opts.size ?? 56;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  let w: number, h: number;
  if (opts.plate) {
    const mini = opts.plate === 'mini';
    const fs = size * (mini ? 0.78 : 0.9);          // plates read bigger than the old outlined text: keep the sprite scale
    ctx.font = `${mini ? 600 : 700} ${fs}px ${SERIF}`;
    const pad = Math.round(fs * (mini ? 0.5 : 0.62)), d = fs * (mini ? 0.13 : 0.17);
    w = Math.ceil(ctx.measureText(text).width * (fontsReady ? 1 : 1.12) + 2 * pad + 2 * d + 6); h = Math.round(fs * (mini ? 1.45 : 1.7));
    cv.width = w; cv.height = h;
    drawPlate(cv, text, fs, opts.plate, w, h);
    const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter; t.generateMipmaps = false; t.anisotropy = 4;
    l = { mat: new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), aspect: w / h };
    if (!fontsReady) fontWaiters.push(() => { drawPlate(cv, text, fs, opts.plate!, w, h); t.needsUpdate = true; });
  } else {
    ctx.font = `800 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
    w = Math.ceil(ctx.measureText(text).width) + 40; h = size + 30;
    cv.width = w; cv.height = h;
    ctx.font = `800 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (opts.bg) { ctx.fillStyle = opts.bg; const r = h / 2; ctx.beginPath(); ctx.moveTo(r, 2); ctx.arcTo(w - 2, 2, w - 2, h - 2, r); ctx.arcTo(w - 2, h - 2, 2, h - 2, r); ctx.arcTo(2, h - 2, 2, 2, r); ctx.arcTo(2, 2, w - 2, 2, r); ctx.fill(); }
    ctx.lineWidth = 9; ctx.strokeStyle = opts.stroke || 'rgba(15,10,20,0.92)'; ctx.strokeText(text, w / 2, h / 2 + 2);
    ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2 + 2);
    const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter; t.generateMipmaps = false;
    l = { mat: new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), aspect: w / h };
  }
  cache.set(key, l);
  return l;
}
