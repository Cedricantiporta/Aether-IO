// Device / capability detection (pure, no React). Evaluated once at load.
const nav: any = typeof navigator !== 'undefined' ? navigator : {};
const win: any = typeof window !== 'undefined' ? window : {};
const mm = (q: string): boolean => { try { return !!win.matchMedia?.(q).matches; } catch { return false; } };

const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini/i.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
const coarse = mm('(pointer: coarse)') || (nav.maxTouchPoints || 0) > 0 && mm('(hover: none)');
const shortSide = typeof screen !== 'undefined' ? Math.min(screen.width || 9999, screen.height || 9999) : 9999;

export const device = {
  /** primary input is touch */
  touch: coarse || mobileUA,
  /** phone-sized touch device (tablets keep the desktop-ish HUD but get touch controls) */
  phone: (mobileUA || coarse) && shortSide < 820,
  mobileUA,
  /** weak CPU/RAM hint */
  lowEnd: (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4,
  /** set by the canvas once the GL renderer string is known */
  gpuLow: false,
  gpuName: '',
  fullscreenOk: typeof document !== 'undefined' && !!(document.documentElement as any)?.requestFullscreen,
};

/** Classify a WebGL renderer string. Weak mobile GPUs -> low tier. */
export function classifyGpu(name: string): boolean {
  device.gpuName = name;
  const low = /Mali-(4|T[0-7]|G[1-5]\d?\b)|Adreno \(TM\) ?[1-5]\d\d|Adreno [1-5]\d\d|PowerVR|VideoCore|Apple GPU.*A(9|10|11)\b|llvmpipe|SwiftShader/i.test(name);
  device.gpuLow = low;
  return low;
}

/** Defaults applied to a fresh profile. */
export function deviceDefaults(): { quality: 'LOW' | 'MEDIUM' | 'HIGH'; fpsLimit: 30 | 60 | 0; autoAim: boolean; uiScale: 'SMALL' | 'NORMAL' | 'LARGE' } {
  if (device.phone) return { quality: 'LOW', fpsLimit: 60, autoAim: true, uiScale: 'NORMAL' };
  if (device.touch) return { quality: device.lowEnd ? 'LOW' : 'MEDIUM', fpsLimit: 60, autoAim: true, uiScale: 'NORMAL' };
  return { quality: device.lowEnd ? 'MEDIUM' : 'HIGH', fpsLimit: 0, autoAim: true, uiScale: 'NORMAL' };
}
