// Endless Tower milestone rewards: every 10th floor reached (per class) unlocks a reward claimed in the tower popup
// (ui/screens/SetOut.tsx). Below floor 100 they rotate gear / supplies / pets; from 100 every 10th floor pays shards,
// and every 100th floor adds a pet.
import type { HeroClass, Item, Rarity } from './types';
import { summonPool } from './summonPool';
import { shardItem } from './shards';

export const TOWER_STEP = 10;
type Kind = 'GEAR' | 'PET' | 'SUPPLY' | 'SHARDS';
interface Plan { kind: Kind; rarity: Rarity; extra?: 'ANKH' | 'PET' }

function plan(floor: number): Plan {
  if (floor >= 100) {
    const r: Rarity = floor >= 300 ? 'MYTHIC' : floor >= 150 ? 'LEGENDARY' : 'EPIC';
    return { kind: 'SHARDS', rarity: r, extra: floor % 100 === 0 ? 'PET' : undefined };
  }
  switch (floor) {
    case 10: return { kind: 'GEAR', rarity: 'EPIC' };
    case 30: return { kind: 'PET', rarity: 'EPIC' };
    case 50: return { kind: 'GEAR', rarity: 'LEGENDARY', extra: 'ANKH' };
    case 70: return { kind: 'PET', rarity: 'LEGENDARY' };
    case 90: return { kind: 'GEAR', rarity: 'LEGENDARY' };
    default: return { kind: 'SUPPLY', rarity: 'RARE' };   // 20, 40, 60, 80
  }
}
const shardQty = (floor: number, r: Rarity) => (r === 'MYTHIC' ? 1 : 2 + Math.floor((floor - 100) / 50));
const cap = (r: Rarity) => r.charAt(0) + r.slice(1).toLowerCase();

/** What a milestone gives, for the popup. */
export function milestoneLabel(floor: number): string {
  const p = plan(floor);
  const extra = p.extra === 'ANKH' ? ' + Ankh of Life' : p.extra === 'PET' ? ` + ${floor >= 200 ? 'Mythic' : 'Legendary'} pet` : '';
  switch (p.kind) {
    case 'GEAR': return `${cap(p.rarity)} gear${extra}`;
    case 'PET': return `${cap(p.rarity)} pet`;
    case 'SUPPLY': return `${2 + floor / 20} Upgrade Cores, 1 Big Health Potion, ${20 + floor} gems`;
    case 'SHARDS': return `${shardQty(floor, p.rarity)} ${cap(p.rarity)} shard${shardQty(floor, p.rarity) > 1 ? 's' : ''}${floor % 50 === 0 && p.rarity !== 'MYTHIC' ? ` + 1 ${p.rarity === 'EPIC' ? 'Legendary' : 'Mythic'}` : ''}${extra}`;
  }
}

/** Rolls a milestone's reward. `make(id, qty)` builds catalog items (store.makeItemById); `inst` rolls a gear template. */
export function rollMilestone(floor: number, hero: HeroClass, make: (id: string, q: number) => Item[], inst: (t: Item) => Item): { items: Item[]; gems: number } {
  const p = plan(floor), items: Item[] = [];
  let gems = 0;
  const pick = (type: 'GEAR' | 'PET', r: Rarity) => {
    const all = summonPool('GEM', hero).filter((i) => (type === 'PET' ? i.type === 'PET' : i.type !== 'PET'));
    const pool = all.filter((i) => i.rarity === r);
    const src = pool.length ? pool : all;
    if (src.length) items.push(inst(src[Math.floor(Math.random() * src.length)]));
  };
  if (p.kind === 'GEAR') pick('GEAR', p.rarity);
  else if (p.kind === 'PET') pick('PET', p.rarity);
  else if (p.kind === 'SUPPLY') { items.push(...make('upgrade_core', 2 + floor / 20), ...make('potion_hp_big', 1)); gems = 20 + floor; }
  else {
    items.push(shardItem(p.rarity, shardQty(floor, p.rarity)));
    if (floor % 50 === 0 && p.rarity !== 'MYTHIC') items.push(shardItem(p.rarity === 'EPIC' ? 'LEGENDARY' : 'MYTHIC', 1));
  }
  if (p.extra === 'ANKH') items.push(...make('revive_ankh', 1));
  if (p.extra === 'PET') pick('PET', floor >= 200 ? 'MYTHIC' : 'LEGENDARY');
  return { items, gems };
}
