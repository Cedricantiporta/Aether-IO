// Hidden town treasure chests (engine/townChests.ts): per-frame lid timers + the one-time opening (rewards, save, feed).
// Which chests are open is saved with the hero (store.chestsOpened); `world.village.chestT` mirrors it for the renderer.
import { world } from '../world';
import { useGameStore, makeItemById } from '../../store';
import { feedReward } from '../../rewardFeed';
import { TOWN_CHESTS } from '../townChests';
import type { Item } from '../../types';

const OPENED = 99;   // chestT of a chest opened in an earlier visit / session (lid already up, no animation)
let seen: string[] | null = null;

export const chestIsOpen = (i: number): boolean => world.village.chestT[i] >= 0;

/** Called every town frame: re-sync the lids when the saved list changed (load / reset), advance the opening timers. */
export function tickChests(dt: number): void {
  const t = world.village.chestT, st = useGameStore.getState();
  if (st.chestsOpened !== seen) {
    seen = st.chestsOpened;
    for (let i = 0; i < TOWN_CHESTS.length; i++) {
      const open = seen.includes(TOWN_CHESTS[i].id);
      if (open && t[i] < 0) t[i] = OPENED; else if (!open && t[i] >= 0) t[i] = -1;
    }
  }
  for (let i = 0; i < TOWN_CHESTS.length; i++) if (t[i] >= 0 && t[i] < 3) t[i] += dt;
}

/** E on a chest: lid opens, the reward is paid once and the chest is remembered as opened. */
export function openChest(i: number): void {
  const c = TOWN_CHESTS[i]; if (!c || world.village.chestT[i] >= 0) return;
  const st = useGameStore.getState(), p = world.player;
  if (st.chestsOpened.includes(c.id)) { world.village.chestT[i] = OPENED; return; }
  const r = c.reward, items: Item[] = [];
  if (r.item) {
    for (const it of makeItemById(r.item.id, r.item.qty)) {
      if (!st.addItemToInventory(it)) { st.addNotification('Bag is full! Make room, then come back to the chest.', '#ff9a7a', 'WARNING'); return; }
      items.push(it);
    }
  }
  world.village.chestT[i] = 0;
  p.facing = Math.atan2(c.x - p.pos.x, c.z - p.pos.z); p.anim.castT = Math.max(p.anim.castT, 0.8);
  useGameStore.setState({ chestsOpened: [...st.chestsOpened, c.id] });
  if (r.gold) st.addGold(r.gold);
  if (r.gems) st.addGems(r.gems);
  if (r.shards) st.addMaterial(r.shards[0], r.shards[1]);
  if (r.crystals) st.addCrystals(r.crystals);   // (its own loot feed line)
  st.addNotification('You found a hidden treasure chest!', '#ffd27a', 'SYSTEM');
  feedReward({ gold: r.gold, gems: r.gems, items, shards: r.shards?.[1], shardRarity: r.shards?.[0] }, true);   // loot feed + "Received" lines + fanfare
}

// ---- (owner 2026-10-25) the royal treasury: on some days Guard Odo is off duty, and then the closed treasury chest can be
// opened once for TREASURY_GOLD. Days are picked from the local date (about 1 in 4), so re-entering the castle never rerolls.
export const TREASURY_GOLD = 50000;
let dayCache = 0, dayAt = -1;
/** Local calendar day number (re-read once a minute: npcs.ts asks every frame). */
const dayNo = (): number => {
  const now = Date.now();
  if (now - dayAt > 60000) { dayAt = now; const d = new Date(); dayCache = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  return dayCache;
};
/** True on the days the treasury guard is away. */
export function treasuryUnguarded(): boolean { const n = dayNo(); return ((n * 2654435761) >>> 0) % 4 === 1; }
const treasuryKey = (): string => `treasury:${dayNo()}`;
/** The unguarded treasury chest can still be opened today. */
export const treasuryOpenable = (): boolean => treasuryUnguarded() && !useGameStore.getState().chestsOpened.includes(treasuryKey());
export function openTreasury(): void {
  if (!treasuryOpenable()) return;
  const st = useGameStore.getState(), p = world.player;
  p.anim.castT = Math.max(p.anim.castT, 0.8);
  useGameStore.setState({ chestsOpened: [...st.chestsOpened.filter((id) => !id.startsWith('treasury:')), treasuryKey()] });
  st.addGold(TREASURY_GOLD);
  st.addNotification('The guard is away... you help yourself to the royal treasury!', '#ffd27a', 'SYSTEM');
  feedReward({ gold: TREASURY_GOLD }, true);
}
