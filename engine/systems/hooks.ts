// Tiny leaf module for cross-system callbacks (avoids circular-import init problems).
import type { Enemy } from '../types';
export const hooks = { onCleanse: () => {}, onStagger: (_e: Enemy) => {} };
