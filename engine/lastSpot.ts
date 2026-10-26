// (owner) A browser refresh puts the hero back where they were: town spot or inside the castle / chapel / tavern / home.
// A run (adventure) comes back in front of the adventure portal, the tower modes outside the tower, the mines outside the cave mouth.
import { activeProfileKey } from '../characters';

export type SpotArea = 'TOWN' | 'CASTLE' | 'CHURCH' | 'TAVERN' | 'HOME' | 'CAVE' | 'RUN' | 'TOWER' | 'BOSS';
export interface LastSpot { area: SpotArea; x: number; z: number; f: number }

const key = (): string => activeProfileKey() + ':last-spot';

export function saveSpot(area: SpotArea, x = 0, z = 0, f = 0): void {
  try { localStorage.setItem(key(), JSON.stringify({ area, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, f: Math.round(f * 100) / 100 })); } catch { /* storage blocked */ }
}

export function loadSpot(): LastSpot | null {
  try {
    const s = JSON.parse(localStorage.getItem(key()) || 'null') as LastSpot | null;
    return s && typeof s.area === 'string' && Number.isFinite(s.x) && Number.isFinite(s.z) ? s : null;
  } catch { return null; }
}
