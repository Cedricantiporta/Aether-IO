import React from 'react';
import { Sparkles } from 'lucide-react';
import { GemGlyph } from '../../components/SkillIcons';
import { useGameStore, SUMMON_WEIGHTS, SUMMON_CAPS } from '../../../store';
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
      <div className="relative w-full rpg-frame gold overflow-hidden flex flex-col items-center py-6" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(168,85,247,.45), rgba(0,0,0,.6) 70%)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(233,185,73,.18), transparent 30%, transparent 50%, rgba(168,85,247,.2), transparent 80%)', animation: 'spin-slow 10s linear infinite' }} />
        <div className="rpg-medallion" style={{ width: '5.5rem', height: '5.5rem', ['--mc' as any]: '#7a3fc2' }}><Sparkles size={44} /></div>
        <div className="rpg-title text-xl mt-3">Aether Altar</div>
        <div className="text-xs text-[var(--text-dim)] mt-1 px-6 leading-snug">Offer gems to the altar and receive gear and companions of any rarity.</div>
        <div className="flex gap-2 mt-3">{RARITIES.map((r) => <span key={r} className="rpg-gem" data-rarity={r} title={`${RATES[r]} · ${SUMMON_WEIGHTS[r]}%${SUMMON_CAPS[r] ? ` · max ${SUMMON_CAPS[r]} per summon` : ''}`} />)}</div>
        <div className="mt-2 text-[11px] opacity-80 text-center">Epic {SUMMON_WEIGHTS.EPIC}% (max 2) · Legendary {SUMMON_WEIGHTS.LEGENDARY}% (max 1) · Mythic {SUMMON_WEIGHTS.MYTHIC}% (max 1)</div>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full">
        <Button size="lg" variant="blue" disabled={gems < 100} onClick={() => go(1)} style={{ flexDirection: 'column', gap: '.1rem', fontSize: '1rem' }}>
          <span>Summon x1</span><span className="flex items-center gap-1 rpg-num !text-[.85rem]"><GemGlyph size={16} />100</span>
        </Button>
        <Button size="lg" variant="primary" disabled={gems < 900} onClick={() => go(10)} style={{ flexDirection: 'column', gap: '.1rem', fontSize: '1rem' }}>
          <span>Summon x10</span><span className="flex items-center gap-1 rpg-num !text-[.85rem]"><GemGlyph size={16} />900</span>
        </Button>
      </div>
      <div className="rpg-label !text-[.6rem]" style={{ color: RARITY_COLOR.LEGENDARY }}>10x saves 100 gems</div>
    </div>
  );
};
