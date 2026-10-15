// Feature unlock levels (class level of the current hero). Features below their level show a lock ("Unlocks at Lv N")
// instead of being playable; the tutorial quests for fishing / mining are offered when their level is reached.
export const UNLOCK_LV = {
  FISHING: 3,      // beach fishing + Fishmonger (tutorial side quest)
  CAVE: 5,         // Crystal Cave below Floor 1 (Floor 1 + Grit's tutorial from this level)
  DAILY: 8,        // Daily Trial (Set Out window)
  WAVES: 12,       // Endless Waves (Set Out window)
} as const;
export type UnlockId = keyof typeof UNLOCK_LV;
export const isUnlocked = (id: UnlockId, level: number): boolean => level >= UNLOCK_LV[id];
