// Mining Pickaxe upgrades (Mining Supplies stall): pays gold / Aether Crystals / gems for the next tier (toolTiers.ts PICKAXES) and
// re-skins every pickaxe the hero owns (equipped, bag, warehouse). The tier lives in the profile (progress.pickTier).
import { useGameStore } from '../../store';
import { PICKAXES, PICK_MAX, pickTierOf, skinPickaxe, toolCostText } from '../../toolTiers';
import { PICKAXE_ID } from '../../itemClass';
import { events } from '../events';
import type { Item } from '../../types';

export const pickTier = (): number => pickTierOf(useGameStore.getState().progress.pickTier);

/** Buys the next pickaxe tier. Returns true on success. */
export function buyPickaxeTier(): boolean {
  const st = useGameStore.getState(), tier = pickTierOf(st.progress.pickTier);
  if (tier >= PICK_MAX) return false;
  const next = PICKAXES[tier + 1], c = next.cost;
  if (st.gold < (c.gold ?? 0) || st.gems < (c.gems ?? 0) || (st.crystals ?? 0) < (c.crystals ?? 0)) {
    st.addNotification(`Not enough for the ${next.name} (${toolCostText(c)}).`, '#ff8a7a', 'WARNING');
    return false;
  }
  const re = (i: Item): Item => (i && i.id === PICKAXE_ID ? skinPickaxe(i, tier + 1) : i);
  useGameStore.setState((s) => ({
    gold: s.gold - (c.gold ?? 0), gems: s.gems - (c.gems ?? 0), crystals: (s.crystals ?? 0) - (c.crystals ?? 0),
    progress: { ...s.progress, pickTier: tier + 1 },
    inventory: s.inventory.map(re), warehouse: s.warehouse.map(re),
    equipment: s.equipment.weapon?.id === PICKAXE_ID ? { ...s.equipment, weapon: re(s.equipment.weapon) } : s.equipment,
  }));
  events.emit('purchase', {});
  st.addNotification(`Upgraded to the ${next.name}!`, '#ffd36a', 'SYSTEM');
  return true;
}
