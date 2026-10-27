// Tiny Zustand slice with the co-op connection state for the UI (lobby, HUD, pause menu). Written only at discrete moments
// (state changes, a ping update every ~2 s), never per frame.
import { create } from 'zustand';
import type { HeroSnap } from './protocol';

export type CoopState = 'idle' | 'hosting' | 'joining' | 'connected' | 'error';
export interface CoopUi {
  state: CoopState;
  role: 'host' | 'guest' | null;
  code: string;
  /** hosting: the broker accepted the code (the friend can join now) */
  ready: boolean;
  error: string;
  /** round-trip time in ms (0 until the first pong) */
  ping: number;
  partner: HeroSnap | null;
  transport: string;
}
export const useCoop = create<CoopUi>(() => ({ state: 'idle', role: null, code: '', ready: false, error: '', ping: 0, partner: null, transport: '' }));
export const coopSet = (p: Partial<CoopUi>): void => useCoop.setState(p);
