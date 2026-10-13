// Canvas-text sprites (robust: no font download needed).
import { CanvasTexture, LinearFilter, SRGBColorSpace, SpriteMaterial } from 'three';

interface Lab { mat: SpriteMaterial; aspect: number }
const cache = new Map<string, Lab>();

export function labelMaterial(text: string, color = '#ffffff', opts: { size?: number; stroke?: string; bg?: string } = {}): Lab {
  const key = text + '|' + color + '|' + (opts.bg || '');
  let l = cache.get(key);
  if (l) return l;
  const size = opts.size ?? 56;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  ctx.font = `800 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40, h = size + 30;
  cv.width = w; cv.height = h;
  ctx.font = `800 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (opts.bg) { ctx.fillStyle = opts.bg; const r = h / 2; ctx.beginPath(); ctx.moveTo(r, 2); ctx.arcTo(w - 2, 2, w - 2, h - 2, r); ctx.arcTo(w - 2, h - 2, 2, h - 2, r); ctx.arcTo(2, h - 2, 2, 2, r); ctx.arcTo(2, 2, w - 2, 2, r); ctx.fill(); }
  ctx.lineWidth = 9; ctx.strokeStyle = opts.stroke || 'rgba(15,10,20,0.92)'; ctx.strokeText(text, w / 2, h / 2 + 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.minFilter = LinearFilter; t.generateMipmaps = false;
  l = { mat: new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), aspect: w / h };
  cache.set(key, l);
  return l;
}
