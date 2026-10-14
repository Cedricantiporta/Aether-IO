// Developer / tester cheats (Settings > Debug). Flags persist per device in localStorage.
import type { EnemyKind } from './types';

const KEY = 'aether-survivor-debug-v1';
export interface DebugFlags {
  god: boolean;        // the hero takes no damage
  oneHit: boolean;     // every hit kills (bosses included)
  maxSkills: boolean;  // each run starts with every skill of the hero at max level
  bossOverride: EnemyKind | '';   // boss rooms spawn this boss instead of the biome's own
}
const load = (): DebugFlags => {
  const d: DebugFlags = { god: false, oneHit: false, maxSkills: false, bossOverride: '' };
  try { const r = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (r) Object.assign(d, JSON.parse(r)); } catch { /* ignore */ }
  return d;
};
export const debug: DebugFlags = load();
export function setDebug(patch: Partial<DebugFlags>): void {
  Object.assign(debug, patch);
  try { localStorage.setItem(KEY, JSON.stringify(debug)); } catch { /* ignore */ }
}
