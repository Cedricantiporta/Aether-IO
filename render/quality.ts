import { useGameStore } from '../store';
import { device } from '../engine/device';

export type QualityName = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QualityCfg {
  name: QualityName;
  dpr: number;
  shadowMap: number;       // 0 = off
  bloom: boolean;
  smaa: boolean;
  msaa: number;
  grass: number;
  flowers: number;
  pebbles: number;
  forest: number;          // multiplier for rim forest density
  fxScale: number;         // particle emission probability scale
  lights: boolean;         // dynamic point lights
  clouds: number;
  waterDetail: boolean;
}

export const QUALITY: Record<QualityName, QualityCfg> = {
  LOW: { name: 'LOW', dpr: 1, shadowMap: 0, bloom: false, smaa: false, msaa: 0, grass: 1200, flowers: 500, pebbles: 300, forest: 0.45, fxScale: 0.45, lights: false, clouds: 4, waterDetail: false },
  MEDIUM: { name: 'MEDIUM', dpr: Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), shadowMap: 1024, bloom: true, smaa: false, msaa: 2, grass: 2600, flowers: 900, pebbles: 500, forest: 0.75, fxScale: 0.75, lights: false, clouds: 7, waterDetail: true },
  HIGH: { name: 'HIGH', dpr: Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), shadowMap: 2048, bloom: true, smaa: true, msaa: 0, grass: 4200, flowers: 1500, pebbles: 800, forest: 1, fxScale: 1, lights: true, clouds: 10, waterDetail: true },
};

/** Phone / touch variants: lower DPR, no bloom/SMAA, tiny or no shadows, much lighter vegetation + particles. */
const dprCap = (cap: number) => Math.min(cap, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
export const QUALITY_PHONE: Record<QualityName, QualityCfg> = {
  LOW: { ...QUALITY.LOW, dpr: dprCap(1.25), shadowMap: 0, grass: 700, flowers: 250, pebbles: 150, forest: 0.35, fxScale: 0.35, clouds: 3 },
  MEDIUM: { ...QUALITY.MEDIUM, dpr: dprCap(1.25), shadowMap: 512, bloom: false, smaa: false, msaa: 0, grass: 1400, flowers: 500, pebbles: 250, forest: 0.5, fxScale: 0.5, clouds: 4, waterDetail: false },
  HIGH: { ...QUALITY.HIGH, dpr: dprCap(1.5), shadowMap: 1024, bloom: false, smaa: false, msaa: 0, grass: 2400, flowers: 800, pebbles: 400, forest: 0.7, fxScale: 0.75, lights: false, clouds: 6 },
};

/** Runtime adaptive-quality state (written by PerfGovernor, read by Canvas / VFX). Level 0 = full, 3 = lowest. */
export const adaptive = { level: 0, dprMul: 1, fxMul: 1 };
const LEVELS = [{ dpr: 1, fx: 1 }, { dpr: 0.85, fx: 0.75 }, { dpr: 0.7, fx: 0.5 }, { dpr: 0.55, fx: 0.3 }];
export function setAdaptiveLevel(l: number): void {
  adaptive.level = Math.max(0, Math.min(3, l));
  adaptive.dprMul = LEVELS[adaptive.level].dpr; adaptive.fxMul = LEVELS[adaptive.level].fx;
}

export function qualityFor(name: QualityName, batterySaver = false): QualityCfg {
  const n: QualityName = batterySaver ? 'LOW' : name;
  return (device.touch ? QUALITY_PHONE : QUALITY)[n] || QUALITY.HIGH;
}

export function getQuality(): QualityCfg {
  const st = useGameStore.getState().settings;
  return qualityFor((st?.quality || 'HIGH') as QualityName, !!st?.batterySaver);
}

export function useQuality(): QualityCfg {
  const name = useGameStore((s) => s.settings?.quality) || 'HIGH';
  const bs = useGameStore((s) => !!s.settings?.batterySaver);
  return qualityFor(name as QualityName, bs);
}
