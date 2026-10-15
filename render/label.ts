// Canvas-text sprites. Town labels use a classic serif (Cinzel from the page, Georgia / serif fallback) inside a dark
// MMORPG style: thin dark outline, no rounded cartoon lettering.
import { CanvasTexture, LinearFilter, SRGBColorSpace, SpriteMaterial } from 'three';

interface Lab { mat: SpriteMaterial; aspect: number }
const cache = new Map<string, Lab>();

const SERIF = '"Cinzel", Georgia, "Times New Roman", serif';
const GOLD = '#d9b56a', CREAM = '#f1e2b8';

type PlateKind = 'plate' | 'mini';
interface Opts { size?: number; stroke?: string; bg?: string; /** border colour drawn around the bg box */ border?: string; /** town name plate ('mini' = smaller, subtler NPC variant) */ plate?: PlateKind; /** red alert dot after the text (something to do there) */ dot?: boolean }

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
  const key = text + '|' + color + '|' + (opts.bg || '') + '|' + (opts.border || '') + '|' + (opts.plate || '') + '|' + (opts.size || '') + (opts.dot ? '|dot' : '');
  let l = cache.get(key);
  if (l) return l;
  const size = opts.size ?? 56;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  let w: number, h: number;
  if (opts.plate && false) {   // (plates retired: every label is clean outlined text now)
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
    // classic serif (Cinzel) with a thin dark outline: no chunky rounded 'cartoon' lettering
    const fs = opts.plate ? Math.round(size * (opts.plate === 'mini' ? 0.8 : 0.92)) : size;
    const font = `700 ${fs}px ${SERIF}`;
    ctx.font = font;
    const dotW = opts.dot ? Math.round(fs * 0.62) : 0;
    w = Math.ceil(ctx.measureText(text).width * (fontsReady ? 1 : 1.15)) + 40 + dotW; h = fs + 30;
    cv.width = w; cv.height = h;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      const tw = ctx.measureText(text).width, k = tw > w - 24 - dotW ? (w - 24 - dotW) / tw : 1;
      if (dotW) {   // the red alert dot, right of the name
        const r = fs * 0.2, cx = w - 14 - r, cy = h / 2 - fs * 0.18;
        ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(12,9,6,0.9)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#ff3b30'; ctx.fill();
      }
      ctx.save(); ctx.translate((w - dotW) / 2, h / 2 + 2); ctx.scale(k, 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
      if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(-w / 2 / k + 2, -h / 2 + 1, (w - 4) / k, h - 4); }
      if (opts.bg && opts.border) { ctx.lineWidth = 3; ctx.strokeStyle = opts.border; ctx.strokeRect(-w / 2 / k + 3.5, -h / 2 + 2.5, (w - 7) / k, h - 7); }
      ctx.lineWidth = Math.max(4, fs * 0.11); ctx.strokeStyle = opts.stroke || 'rgba(12,9,6,0.9)'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = color; ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    draw();
    const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter; t.generateMipmaps = false;
    l = { mat: new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), aspect: w / h };
    if (!fontsReady) fontWaiters.push(() => { draw(); t.needsUpdate = true; });
  }
  cache.set(key, l);
  return l;
}
