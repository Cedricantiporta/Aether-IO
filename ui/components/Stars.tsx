import React from 'react';
import type { Rarity } from '../../types';
import { RARITY_COLOR, RARITY_STARS } from '../theme';

/** Rarity as a small row of stars (1..5) in the rarity colour. */
export const Stars: React.FC<{ rarity: Rarity; small?: boolean; className?: string }> = ({ rarity, small, className = '' }) => (
  <span className={`stars ${small ? 'sm' : ''} ${className}`} aria-label={rarity.toLowerCase()} style={{ ['--n' as any]: RARITY_STARS[rarity], ['--rc' as any]: RARITY_COLOR[rarity] }} />
);
