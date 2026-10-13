import React from 'react';
import { Sparkles } from 'lucide-react';
import { GemGlyph } from '../../components/SkillIcons';
import { useGameStore, SUMMON_WEIGHTS, SUMMON_CAPS, SUMMON_COST_1, SUMMON_COST_10 } from '../../../store';
import { Button } from '../../components/Button';
import { useUiStore } from '../../uiStore';
import { RARITIES, RARITY_COLOR } from '../../lib/game';

const RATES: Record<string, string> = { COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', MYTHIC: 'Mythic' };

export const SummonTab: React.FC = () => {
  const gems = useGameStore((s) => s.gems);
  const summon = useGameStore((s) => s.summon);
  const setResults = useUiStore((s) => s.setSummonResults);
  const go = (n: 1 | 10) => { const r = summon(n); if (r && r.length) setResults(r); };
  return (
    <div className="flex flex-col gap-4 items-center text-center">
      <div className="relative w-full rpg-frame overflow-hidden flex flex-col items-center py-6" style={{ background: 'color-mix(in srgb, var(--r3) 14%, var(--paper-2))' }}>
        <div className="rpg-medallion" style={{ width: '4.5rem', height: '4.5rem', ['--mc' as any]: 'var(--r3)' }}><Sparkles size={36} /></div>
        <div className="rpg-title text-xl mt-3">Aether Altar</div>
        <div className="text-xs text-[var(--fg-2)] mt-1 px-6 leading-snug">Offer gems to the altar and receive gear and companions of any rarity.</div>
        <div className="flex gap-2 mt-3">{RARITIES.map((r) => <span key={r} className="rpg-gem" data-rarity={r} title={`${RATES[r]} · ${SUMMON_WEIGHTS[r]}%${SUMMON_CAPS[r] ? ` · max ${SUMMON_CAPS[r]} per summon` : ''}`} />)}</div>
        <div className="mt-2 text-xs opacity-80 text-center">Epic {SUMMON_WEIGHTS.EPIC}% (max 2) · Legendary {SUMMON_WEIGHTS.LEGENDARY}% (max 1) · Mythic {SUMMON_WEIGHTS.MYTHIC}% (max 1)</div>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full">
        <Button size="lg" variant="blue" disabled={gems < SUMMON_COST_1} onClick={() => go(1)} style={{ flexDirection: 'column', gap: '.1rem', fontSize: '1rem' }}>
          <span>Summon x1</span><span className="flex items-center gap-1 rpg-num !text-[.85rem]"><GemGlyph size={16} />{SUMMON_COST_1}</span>
        </Button>
        <Button size="lg" variant="primary" disabled={gems < SUMMON_COST_10} onClick={() => go(10)} style={{ flexDirection: 'column', gap: '.1rem', fontSize: '1rem' }}>
          <span>Summon x10</span><span className="flex items-center gap-1 rpg-num !text-[.85rem]"><GemGlyph size={16} />{SUMMON_COST_10}</span>
        </Button>
      </div>
      <div className="rpg-label" style={{ color: 'var(--r4-ink)' }}>10x saves {SUMMON_COST_1 * 10 - SUMMON_COST_10} gems</div>
    </div>
  );
};
