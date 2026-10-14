import { create } from 'zustand';
import type { Item, Rarity } from '../types';

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
  charSelect: boolean;                  // full-screen class selection (after the title, or from the town)
  recordsOpen: boolean;                 // village HUD records panel
  codexOpen: boolean;
  goalsOpen: boolean;                   // Goals panel (daily / weekly / achievements)
  settingsOpen: boolean;
  sellItem: Item | null;
  buyItem: Item | null;
  selectedItem: Item | null;            // blacksmith selection
  blacksmithTab: 'UPGRADE' | 'RECYCLE' | 'CRAFT';
  confirm: ConfirmRequest | null;
  bagView: boolean;                     // small screens: show the bag instead of the shop (shop tabs that use the bag)
  summonResults: Item[] | null;
  setTitleDone: (v: boolean) => void;
  setCharSelect: (v: boolean) => void;
  setRecordsOpen: (v: boolean) => void;
  openCodex: (v: boolean) => void;
  openGoals: (v: boolean) => void;
  openSettings: (v: boolean) => void;
  storyOpen: boolean;
  openStory: (v: boolean) => void;
  setSellItem: (i: Item | null) => void;
  setBuyItem: (i: Item | null) => void;
  setSelectedItem: (i: Item | null) => void;
  setBlacksmithTab: (t: UiState['blacksmithTab']) => void;
  askConfirm: (c: ConfirmRequest | null) => void;
  setSummonResults: (r: Item[] | null) => void;
  setBagView: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  titleDone: false,
  charSelect: false,
  recordsOpen: false,
  codexOpen: false,
  goalsOpen: false,
  settingsOpen: false,
  sellItem: null,
  buyItem: null,
  selectedItem: null,
  blacksmithTab: 'UPGRADE',
  confirm: null,
  bagView: false,
  summonResults: null,
  setTitleDone: (v) => set({ titleDone: v }),
  setCharSelect: (v) => set(v ? { charSelect: true, titleDone: false } : { charSelect: false, titleDone: true }),
  setRecordsOpen: (v) => set({ recordsOpen: v }),
  openCodex: (v) => set({ codexOpen: v }),
  openGoals: (v) => set({ goalsOpen: v }),
  openSettings: (v) => set({ settingsOpen: v }),
  storyOpen: false,
  openStory: (v) => set({ storyOpen: v }),
  setSellItem: (i) => set({ sellItem: i }),
  setBuyItem: (i) => set({ buyItem: i }),
  setSelectedItem: (i) => set({ selectedItem: i }),
  setBlacksmithTab: (t) => set({ blacksmithTab: t, selectedItem: null }),
  askConfirm: (c) => set({ confirm: c }),
  setSummonResults: (r) => set({ summonResults: r }),
  setBagView: (v) => set({ bagView: v }),
}));

export type { Rarity };

/** True while any modal overlay (settings / codex / dialogs) is open. Esc closes these before toggling pause. */
export function uiOverlayOpen(): boolean {
  const s = useUiStore.getState();
  return s.settingsOpen || s.codexOpen || s.goalsOpen || !!s.confirm || !!s.sellItem || !!s.buyItem || !!s.summonResults;
}

/** Closes the top-most overlay. Returns true if something was closed. */
export function closeTopOverlay(): boolean {
  const s = useUiStore.getState();
  if (s.confirm) { s.askConfirm(null); return true; }
  if (s.summonResults) { s.setSummonResults(null); return true; }
  if (s.sellItem) { s.setSellItem(null); return true; }
  if (s.buyItem) { s.setBuyItem(null); return true; }
  if (s.storyOpen) { s.openStory(false); return true; }
  if (s.settingsOpen) { s.openSettings(false); return true; }
  if (s.codexOpen) { s.openCodex(false); return true; }
  if (s.goalsOpen) { s.openGoals(false); return true; }
  return false;
}
