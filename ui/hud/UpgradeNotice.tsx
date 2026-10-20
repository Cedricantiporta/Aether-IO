// (owner) "Upgrade available": a thin pill in the bottom-left notification area (town) whenever something you can do
// right now raises your combat power, and a centred popup listing every such thing with a Go button: better gear in the
// bag, skills / talents to learn, attribute points, gear the Blacksmith can upgrade, recipes you can forge, a pet ready
// to evolve. Read with selectors only (no per-frame work).
import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { Modal } from '../components/Modal';
import { hasBetterGear, canTrainSkill, canBuyTalent, canCraftAny } from '../lib/alerts';
import { attrPointsTotal, attrSpent } from '../../attributes';
import { upgradeCoreTierFor, coreTierOf, upgradeCoresAt, upgradeGoldFor } from '../../crafting';
import { canAffordEvolve, lootFoodXp } from '../../petActions';
import { petLv, petStage, petLvCap, petEats, petCanEvolve } from '../../petGrowth';
import { FUSE_COUNT, FUSE_CHANCE } from '../../petFusion';
import { useUiStore } from '../uiStore';
import type { Rarity } from '../../types';
import type { Item } from '../../types';
import { GameStatus } from '../../types';
import { world } from '../../engine/world';
import { offerTeleport } from './QuestTracker';
import { NPC_QUESTS, npcQuestStatus, npcQuestReady, npcQuestTurnIn, npcQuestLevelLocked } from '../../npcQuests';

type St = ReturnType<typeof useGameStore.getState>;
export interface Up { key: string; title: string; sub: string; go: (s: St) => void; town?: boolean; /** a side quest (ready to hand in / available to accept), not a power upgrade */ quest?: boolean }

const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'accessory'] as const;
/** An equipped piece the Blacksmith can raise right now (gold + the right tier of cores). */
function upgradable(s: St): Item | null {
  for (const k of SLOTS) {
    const it = s.equipment[k] as Item | null;
    if (!it || it.level >= 10) continue;
    const tier = upgradeCoreTierFor(it.rarity), need = upgradeCoresAt(it.level);
    const cores = s.inventory.filter((i) => coreTierOf(i) === tier).reduce((n, i) => n + (i.quantity || 1), 0);
    if (cores >= need && s.gold >= upgradeGoldFor(it.price, it.level)) return it;
  }
  return null;
}

/** Food in the bag / shards the equipped pet eats (its own food tier). */
function petHasFood(s: St, pet: Item): boolean {
  for (const i of s.inventory) if (lootFoodXp(i) > 0 && petEats(pet, i.rarity)) return true;
  return (Object.keys(s.materials) as Rarity[]).some((r) => (s.materials[r] ?? 0) > 0 && petEats(pet, r));
}
/** FUSE_COUNT bag pets of one fusable tier (the equipped pet is never used). */
function petsFusable(s: St): boolean {
  const n: Partial<Record<Rarity, number>> = {};
  for (const i of s.inventory) if (i.type === 'PET' && (FUSE_CHANCE[i.rarity] ?? 0) > 0) { n[i.rarity] = (n[i.rarity] ?? 0) + 1; if (n[i.rarity]! >= FUSE_COUNT) return true; }
  return false;
}

export function upgradesOf(s: St): Up[] {
  const out: Up[] = [];
  if (hasBetterGear(s.inventory, s.equipment, s.hero, s.heroRank)) out.push({ key: 'gear', title: 'Better gear in your bag', sub: 'Equip it (or use Auto equip in the bag).', go: (g) => { if (!g.isInventoryOpen) g.toggleInventory(); } });
  if (canTrainSkill(s)) out.push({ key: 'skill', title: 'Skills to learn or upgrade', sub: `${s.skillPoints} skill point${s.skillPoints === 1 ? '' : 's'} ready at the Skill Trainer.`, go: (g) => g.openSpecificShop('SKILLS'), town: true });
  if (canBuyTalent(s)) out.push({ key: 'talent', title: 'Talent points to spend', sub: 'Open the talent tree at the Skill Trainer.', go: (g) => g.openSpecificShop('SKILLS'), town: true });
  const attrs = attrPointsTotal(s.classProg[s.hero]?.lv ?? 1) - attrSpent(s.attrs[s.hero]);
  if (attrs > 0) out.push({ key: 'attr', title: 'Attribute points to allocate', sub: `${attrs} point${attrs === 1 ? '' : 's'} on the Hero page (C).`, go: (g) => { if (!g.isCharacterSheetOpen) g.toggleCharacterSheet(); } });
  const up = upgradable(s);
  if (up) out.push({ key: 'forge', title: 'Gear you can upgrade', sub: `${up.name} +${up.level - 1} → +${up.level}: you have the gold and cores.`, go: (g) => g.openSpecificShop('BLACKSMITH'), town: true });
  if (canCraftAny(s)) out.push({ key: 'craft', title: 'Gear you can craft', sub: 'You have the materials for a Workshop recipe.', go: (g) => g.openSpecificShop('BLACKSMITH'), town: true });
  const pet = s.equipment.pet;
  const openPets = (tab: 'CARE' | 'FUSE') => (g: St) => { useUiStore.getState().setPetsTab(tab); g.openSpecificShop('PETS'); };
  if (pet && canAffordEvolve(pet, s.gold, s.materials)) out.push({ key: 'pet', title: 'Your pet can evolve', sub: 'Evolving raises all its stats.', go: openPets('CARE'), town: true });
  else if (pet && !petCanEvolve(pet) && petLv(pet) < petLvCap(petStage(pet)) && petHasFood(s, pet)) out.push({ key: 'petlv', title: 'Your pet can level up', sub: 'You have food for it: feed it at Pet Care.', go: openPets('CARE'), town: true });
  if (petsFusable(s)) out.push({ key: 'petfuse', title: 'Pets you can fuse', sub: `You have ${FUSE_COUNT} pets of one tier: fuse them at the Pet House.`, go: openPets('FUSE'), town: true });
  // side quests: ready to hand in first, then ones available to accept (a few at most); Go shows a hint (no auto-pathing)
  const nq = s.npcQuests;
  let offered = 0;
  for (const d of NPC_QUESTS) {
    const st = npcQuestStatus(d, nq, s.heroRank);
    if (st === 'ACTIVE' && npcQuestReady(d, nq, s.inventory)) out.push({ key: 'q:' + d.id, quest: true, town: true, title: `Hand in: ${d.title}`, sub: `Ready: talk to ${npcQuestTurnIn(d)} for the reward.`, go: () => { const g = useGameStore.getState(); g.addNotification(`Talk to ${npcQuestTurnIn(d)} to hand it in.`, '#f1e2b8', 'SYSTEM'); useUiStore.getState().setTrackedQuest('side:' + d.id); } });
  }
  // (owner) new offers are one row: Go opens the quest log on its Side tab
  for (const d of NPC_QUESTS) if (npcQuestStatus(d, nq, s.heroRank) === 'AVAILABLE' && !npcQuestLevelLocked(d, nq, s.heroRank)) offered++;
  if (offered > 0) out.push({ key: 'q:new', quest: true, town: false, title: offered === 1 ? 'New side quest' : `New side quests (${offered})`, sub: 'See them in Quests → Side.', go: () => { const u = useUiStore.getState(); u.setQuestLogTab('SIDE'); u.openQuestLog(true); } });
  return out;
}

/** (owner) skills / talents can be trained right here at a biome camp (its Training Post): no teleport needed. */
export const reachable = (key: string): boolean => (key === 'skill' || key === 'talent') && world.room.active && world.room.plan.type === 'CAMP';

/** (owner) fewer than 3 health / mana potions in the bag: '' when stocked. */
const POT_LOW = 3;
function lowPotions(s: St): string {
  let hp = 0, mp = 0;
  for (const i of s.inventory) if (i.type === 'POTION') { if (i.name.includes('Health')) hp += i.quantity || 1; else if (i.name.includes('Mana')) mp += i.quantity || 1; }
  return hp < POT_LOW && mp < POT_LOW ? 'HP and MP potions' : hp < POT_LOW ? 'HP potions' : mp < POT_LOW ? 'MP potions' : '';
}
/** Potions button: opens the Potion Shop panel directly (in a run: offer the trip home first). No auto-pathing. */
function goPotions(): void {
  const g = useGameStore.getState(), open = () => useGameStore.getState().openSpecificShop('SUPPLIES');
  if (g.status === GameStatus.MENU) open(); else offerTeleport(open);
}

export const UpgradeNotice: React.FC = () => {
  const count = useGameStore((s) => upgradesOf(s).length);
  const [open, setOpen] = useState(false);
  const low = useGameStore((s) => lowPotions(s));
  return (<>
    <div className="upn-stack">
      <div className="upn-row-pills">
        <button className="upn-pill pe" data-testid="upgrade-notice" onClick={() => setOpen(true)}>
          <span data-testid="upgrade-view">Upgrades</span>{count > 0 && <b>{count}</b>}
        </button>
        <button className={`upn-pill pe ${low ? 'low' : ''}`} data-testid="potion-notice" onClick={goPotions}>
          <span>Potions</span>{low && <b>!</b>}
        </button>
      </div>
      {low && <div className="upn-hint pe">Low on {low}</div>}
    </div>
    {open && <UpgradePopup onClose={() => setOpen(false)} />}
  </>);
};

const UpgradePopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useGameStore(useShallow((s) => upgradesOf(s).map((u) => u.key + u.sub)));   // re-render when the list changes
  const list = upgradesOf(useGameStore.getState());
  const inRun = useGameStore((s) => s.status !== GameStatus.MENU);
  return (
    <Modal open onClose={onClose} title="Ways to grow stronger" width="min(30rem, 94vw)" z={240} portal>
      <div className="upn-list" data-testid="upgrade-popup">
        {list.length === 0 && <div className="upn-none">Nothing to upgrade right now. Go adventure!</div>}
        {list.map((u) => (
          <div key={u.key} className="upn-row">
            <div className="min-w-0"><b>{u.title}</b><em>{u.sub}</em></div>
            <button className="rpg-btn rpg-btn-sm rpg-btn-primary" onClick={() => { onClose(); const g = useGameStore.getState(); if (u.town && g.status !== GameStatus.MENU && !reachable(u.key)) offerTeleport(() => u.go(useGameStore.getState())); else u.go(g); }}>{u.town && inRun && !reachable(u.key) ? 'Town' : 'Go'}</button>
          </div>
        ))}
      </div>
    </Modal>
  );
};
