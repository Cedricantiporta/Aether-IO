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
  codexOpen: boolean;
  settingsOpen: boolean;
  sellItem: Item | null;
  buyItem: Item | null;
  selectedItem: Item | null;            // blacksmith selection
  blacksmithTab: 'UPGRADE' | 'RECYCLE' | 'CRAFT';
  confirm: ConfirmRequest | null;
  summonResults: Item[] | null;
  openCodex: (v: boolean) => void;
  openSettings: (v: boolean) => void;
  setSellItem: (i: Item | null) => void;
  setBuyItem: (i: Item | null) => void;
  setSelectedItem: (i: Item | null) => void;
  setBlacksmithTab: (t: UiState['blacksmithTab']) => void;
  askConfirm: (c: ConfirmRequest | null) => void;
  setSummonResults: (r: Item[] | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  codexOpen: false,
  settingsOpen: false,
  sellItem: null,
  buyItem: null,
  selectedItem: null,
  blacksmithTab: 'UPGRADE',
  confirm: null,
  summonResults: null,
  openCodex: (v) => set({ codexOpen: v }),
  openSettings: (v) => set({ settingsOpen: v }),
  setSellItem: (i) => set({ sellItem: i }),
  setBuyItem: (i) => set({ buyItem: i }),
  setSelectedItem: (i) => set({ selectedItem: i }),
  setBlacksmithTab: (t) => set({ blacksmithTab: t, selectedItem: null }),
  askConfirm: (c) => set({ confirm: c }),
  setSummonResults: (r) => set({ summonResults: r }),
}));

export type { Rarity };
