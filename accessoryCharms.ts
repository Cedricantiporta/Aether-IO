// ============================================================================
// Accessory charms (owner): every Epic, Legendary and Mythic accessory carries one special effect on top of its stats.
// The charm is derived from the accessory's name + rarity (stable: old items get theirs too, no save change); its power
// grows with the rarity. Applied in store.calculateStats, shown in the item tooltip (orange). Pure data.
// ============================================================================
import type { Item, PlayerStats } from './types';
import type { StatFx } from './statFx';

interface Charm { key: string; name: string; stat: keyof PlayerStats; v: [number, number, number]; text: (v: number) => string }
const pc = (v: number) => `${Math.round(v * 100)}%`;
export const CHARMS: Charm[] = [
  { key: 'bloodrush', name: 'Bloodrush', stat: 'lowHpHaste', v: [0.15, 0.22, 0.3], text: (v) => `+${pc(v)} attack speed below 50% HP` },
  { key: 'vampire', name: 'Vampiric', stat: 'lifeSteal', v: [0.01, 0.015, 0.022], text: (v) => `${(v * 100).toFixed(1)}% of damage dealt heals you` },
  { key: 'thorns', name: 'Thornmail', stat: 'thorns', v: [12, 20, 32], text: (v) => `Attackers take ${v} damage` },
  { key: 'ember', name: 'Ember Heart', stat: 'onHitBurnChance', v: [0.06, 0.09, 0.13], text: (v) => `${pc(v)} chance to burn on hit` },
  { key: 'frost', name: 'Frostbite', stat: 'onHitSlowChance', v: [0.08, 0.12, 0.17], text: (v) => `${pc(v)} chance to slow on hit` },
  { key: 'stone', name: 'Stoneskin', stat: 'dmgReduce', v: [0.04, 0.06, 0.09], text: (v) => `Take ${pc(v)} less damage` },
  { key: 'thrift', name: 'Arcane Thrift', stat: 'manaCostCut', v: [0.08, 0.12, 0.18], text: (v) => `Skills cost ${pc(v)} less mana` },
  { key: 'berserk', name: 'Last Stand', stat: 'berserk', v: [0.12, 0.18, 0.26], text: (v) => `+${pc(v)} damage below 35% HP` },
  { key: 'wind', name: 'Windstep', stat: 'dodge', v: [0.03, 0.045, 0.065], text: (v) => `+${pc(v)} dodge` },
];
const TIER: Partial<Record<Item['rarity'], number>> = { EPIC: 0, LEGENDARY: 1, MYTHIC: 2 };

/** The accessory's charm (null for other gear and below Epic). */
export function charmOf(item: Item | null | undefined): { charm: Charm; value: number } | null {
  if (!item || item.type !== 'ACCESSORY') return null;
  const t = TIER[item.rarity];
  if (t === undefined) return null;
  let h = 7;
  for (let i = 0; i < item.name.length; i++) h = (h * 31 + item.name.charCodeAt(i)) >>> 0;
  const charm = CHARMS[h % CHARMS.length];
  return { charm, value: charm.v[t] };
}
export function charmFx(item: Item | null | undefined): StatFx | undefined {
  const c = charmOf(item);
  return c ? { add: { [c.charm.stat]: c.value } } : undefined;
}
export const charmText = (item: Item): string | null => { const c = charmOf(item); return c ? `${c.charm.name}: ${c.charm.text(c.value)}` : null; };
