import { create } from 'zustand';
import type { Item, Rarity } from '../types';

export interface BuyOpts { price?: number; max?: number; onBuy?: (n: number) => void; gems?: boolean }

// Purely local UI state (modals, selections). Game state stays in the main store.
export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

interface UiState {
  titleDone: boolean;                   // false until the player leaves the title screen (cinematic orbit camera)
  prologueOpen: boolean;                // the first-launch prologue slides are showing (the showcase fight / daily popup wait)
  setPrologueOpen: (v: boolean) => void;
  charSelect: boolean;                  // full-screen class selection (after the title, or from the town)
  recordsOpen: boolean;                 // village HUD records panel
  codexOpen: boolean;
  goalsOpen: boolean;                   // Goals panel (daily / weekly / achievements)
  questLogOpen: boolean;                // Quest log (main / side quests + rewards)
  openQuestLog: (v: boolean) => void;
  /** the quest the indicators (minimap target, guide arrow hint) follow: '' = automatic, 'main', 'side:<id>' (no auto-pathing) */
  trackedQuest: string;
  setTrackedQuest: (k: string) => void;
  /** a quest the log selects when it opens ('main' | 'side:<id>'); read once by ui/screens/QuestLog */
  questLogFocus: string;
  /** open the quest log on one quest (the tracker rows) */
  openQuestLogOn: (k: string) => void;
  /** tab the quest log opens on next ('' = keep its default) */
  questLogTab: '' | 'MAIN' | 'SIDE';
  setQuestLogTab: (t: '' | 'MAIN' | 'SIDE') => void;
  settingsOpen: boolean;
  todoPending: boolean;                 // set on Return to town after a defeat: the town popup opens once
  setTodoPending: (v: boolean) => void;
  todoTownOpen: boolean;                // "To do in town" popup
  setTodoTownOpen: (v: boolean) => void;
  runUpgradesOpen: boolean;             // in-run Run Upgrades panel (Tab)
  openRunUpgrades: (v: boolean) => void;
  sellItem: Item | null;
  buyItem: Item | null;
  /** buy dialog overrides (merchant / pets): unit price, how many are left, and the purchase itself */
  buyOpts: BuyOpts | null;
  selectedItem: Item | null;            // blacksmith selection
  blacksmithTab: 'UPGRADE' | 'RECYCLE' | 'CRAFT' | 'FUSE' | 'SHARDS' | 'REFORGE';
  petsTab: 'SHOP' | 'CARE' | 'FUSE';    // Pet House tab (the upgrade hints open Care / Fuse directly)
  setPetsTab: (t: UiState['petsTab']) => void;
  confirm: ConfirmRequest | null;
  bagView: boolean;                     // small screens: show the bag instead of the shop (shop tabs that use the bag)
  summonResults: Item[] | null;
  summonAltar: 'GEM' | 'SHARD';   // altar of the last draw (the results screen re-draws from it)
  setTitleDone: (v: boolean) => void;
  setCharSelect: (v: boolean) => void;
  setRecordsOpen: (v: boolean) => void;
  openCodex: (v: boolean) => void;
  openGoals: (v: boolean, tab?: string) => void;
  goalsTab: string;                     // tab the Goals panel opens on (DAILY / WEEKLY / ACHIEVEMENTS)
  openSettings: (v: boolean) => void;
  storyOpen: boolean;
  openStory: (v: boolean) => void;
  setSellItem: (i: Item | null) => void;
  setBuyItem: (i: Item | null, o?: BuyOpts) => void;
  setSelectedItem: (i: Item | null) => void;
  setBlacksmithTab: (t: UiState['blacksmithTab']) => void;
  askConfirm: (c: ConfirmRequest | null) => void;
  setSummonResults: (r: Item[] | null, altar?: 'GEM' | 'SHARD') => void;
  setBagView: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  titleDone: false,
  prologueOpen: false,
  setPrologueOpen: (v) => set({ prologueOpen: v }),
  charSelect: false,
  recordsOpen: false,
  codexOpen: false,
  goalsOpen: false,
  goalsTab: 'DAILY',
  questLogOpen: false,
  openQuestLog: (v) => set({ questLogOpen: v }),
  trackedQuest: '',
  setTrackedQuest: (k) => set({ trackedQuest: k }),
  questLogFocus: '',
  openQuestLogOn: (k) => set({ questLogFocus: k, questLogTab: k.startsWith('side:') ? 'SIDE' : 'MAIN', questLogOpen: true }),
  questLogTab: '',
  setQuestLogTab: (t) => set({ questLogTab: t }),
  settingsOpen: false,
  todoPending: false,
  setTodoPending: (v) => set({ todoPending: v }),
  todoTownOpen: false,
  setTodoTownOpen: (v) => set({ todoTownOpen: v }),
  runUpgradesOpen: false,
  openRunUpgrades: (v) => set({ runUpgradesOpen: v }),
  sellItem: null,
  buyItem: null, buyOpts: null,
  selectedItem: null,
  blacksmithTab: 'UPGRADE',
  petsTab: 'SHOP',
  setPetsTab: (t) => set({ petsTab: t }),
  confirm: null,
  bagView: false,
  summonResults: null,
  summonAltar: 'GEM',
  setTitleDone: (v) => set({ titleDone: v }),
  setCharSelect: (v) => set(v ? { charSelect: true, titleDone: false } : { charSelect: false, titleDone: true }),
  setRecordsOpen: (v) => set({ recordsOpen: v }),
  openCodex: (v) => set({ codexOpen: v }),
  openGoals: (v, tab) => set(tab ? { goalsOpen: v, goalsTab: tab } : { goalsOpen: v }),
  openSettings: (v) => set({ settingsOpen: v }),
  storyOpen: false,
  openStory: (v) => set({ storyOpen: v }),
  setSellItem: (i) => set({ sellItem: i }),
  setBuyItem: (i, o) => set({ buyItem: i, buyOpts: o ?? null }),
  setSelectedItem: (i) => set({ selectedItem: i }),
  setBlacksmithTab: (t) => set({ blacksmithTab: t, selectedItem: null }),
  askConfirm: (c) => set({ confirm: c }),
  setSummonResults: (r, altar) => set(altar ? { summonResults: r, summonAltar: altar } : { summonResults: r }),
  setBagView: (v) => set({ bagView: v }),
}));

export type { Rarity };

/** True while any modal overlay (settings / codex / dialogs) is open. Esc closes these before toggling pause. */
export function uiOverlayOpen(): boolean {
  const s = useUiStore.getState();
  return s.settingsOpen || s.runUpgradesOpen || s.codexOpen || s.goalsOpen || s.questLogOpen || s.todoTownOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults;
}

/** Closes the top-most overlay. Returns true if something was closed. */
export function closeTopOverlay(): boolean {
  const s = useUiStore.getState();
  if (s.confirm) { s.askConfirm(null); return true; }
  if (s.summonResults) return true;   // summon results close only via Leave (or a new draw)
  if (s.sellItem) { s.setSellItem(null); return true; }
  if (s.buyItem) { s.setBuyItem(null); return true; }
  if (s.storyOpen) { s.openStory(false); return true; }
  if (s.runUpgradesOpen) { s.openRunUpgrades(false); return true; }
  if (s.settingsOpen) { s.openSettings(false); return true; }
  if (s.codexOpen) { s.openCodex(false); return true; }
  if (s.goalsOpen) { s.openGoals(false); return true; }
  if (s.questLogOpen) { s.openQuestLog(false); return true; }
  if (s.todoTownOpen) { s.setTodoTownOpen(false); return true; }
  return false;
}
