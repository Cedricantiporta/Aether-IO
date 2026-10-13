import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { world } from '../engine/world';

/** Re-render when a numeric world counter changes (obstaclesVersion, itemPickupsVersion). Polled in useFrame. */
export function useWorldCounter(read: () => number): number {
  const [v, setV] = useState(read);
  useFrame(() => { const n = read(); if (n !== v) setV(n); });
  return v;
}
export const useObstaclesVersion = () => useWorldCounter(() => world.obstaclesVersion);
export const useItemPickupsVersion = () => useWorldCounter(() => world.itemPickupsVersion);
