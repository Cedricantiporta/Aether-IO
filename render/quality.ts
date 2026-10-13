import { useGameStore } from '../store';

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

export function getQuality(): QualityCfg {
  const q = useGameStore.getState().settings?.quality || 'HIGH';
  return QUALITY[q] || QUALITY.HIGH;
}

export function useQuality(): QualityCfg {
  const q = useGameStore((s) => s.settings?.quality) || 'HIGH';
  return QUALITY[q] || QUALITY.HIGH;
}
