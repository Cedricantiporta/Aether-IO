// The Void Herald's finale (engine/systems/director.ts `finale`): while he speaks his last words his essence lingers as a column
// of violet soulfire where he fell; then it gutters, shrinks and bursts (the bursts are director events).
import { useFrame } from '@react-three/fiber';
import { finale } from '../engine/systems/director';
import { useGameStore } from '../store';
import { GameStatus } from '../types';
import { CELL, FX, gate, pushHalo } from './fx';

export function Finale(): null {
  useFrame((_, dtRaw) => {
    if (finale.step !== 1 && finale.step !== 2) return;
    const dt = useGameStore.getState().status === GameStatus.PAUSED ? 0 : Math.min(dtRaw, 0.05);
    const t = performance.now() * 0.001;
    // 1: steady (pulsing); 2: flickers and shrinks to nothing by the last burst (2.6 s)
    const k = finale.step === 1 ? 1 : Math.max(0, 1 - finale.t / 2.6);
    const flick = finale.step === 2 ? 0.7 + 0.3 * Math.sin(t * 40) : 1;
    const x = finale.x, z = finale.z;
    if (k <= 0) return;
    pushHalo(x, 2.2, z, (6 + Math.sin(t * 2.5) * 0.6) * k, 0.6, 0.25, 1.2, 0.55 * flick, CELL.GLOW);
    pushHalo(x, 3.0, z, 2.6 * k, 1.6, 1.2, 2.4, 0.85 * flick, CELL.GLOW);
    if (dt > 0) for (let i = 0; i < 4; i++) if (gate()) {
      const a = Math.random() * 6.283, r = Math.random() * 1.6 * k;
      FX.add.emit(x + Math.cos(a) * r, 0.3 + Math.random(), z + Math.sin(a) * r, 0, 3 + Math.random() * 3, 0, 0.9, 0.9 * k, 0.1, 0.8, 0.35, 1.6, 0.8 * flick, CELL.FLAME, 0, 1);
    }
  });
  return null;
}
