import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ITEMS_POOL, PETS_POOL, SKILLS_INFO } from '../../constants';
import { Modal } from '../components/Modal';
import { ItemSlot } from '../components/ItemSlot';
import { SkillIcon } from '../components/ItemIcon';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { useUiStore } from '../uiStore';
import { LOOT, lootItem, lootSources } from '../../loot';
import { ENEMY_DEFS } from '../../engine/enemyDefs';
import { RARITY_RANK, RARITY_TEXT } from '../lib/game';
import { HERO_COLOR } from '../lib/game';
import type { Item } from '../../types';

const TABS = ['ITEMS', 'PETS', 'SKILLS', 'LOOT'] as const;
const srcName = (k: string) => (k === 'ELITE' ? 'Elites' : ENEMY_DEFS[k as keyof typeof ENEMY_DEFS]?.name ?? k.charAt(0) + k.slice(1).toLowerCase().replace('_', ' '));
const byRank = (a: Item, b: Item) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);

export const CodexDialog: React.FC = () => {
  const open = useUiStore((s) => s.codexOpen);
  const close = useUiStore((s) => s.openCodex);
  const [tab, setTab] = useState<typeof TABS[number]>('ITEMS');
  const items = [...ITEMS_POOL].sort(byRank);
  const pets = [...PETS_POOL].sort(byRank);
  const loot = [...LOOT].sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={() => close(false)} title="Codex" icon={<BookOpen size={20} />} width="40rem" z={250}>
      <div className="flex gap-2 mb-3">
        {TABS.map((t) => <button key={t} className={`rpg-subtab pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        <div className="ml-auto rpg-label self-center">
          {tab === 'ITEMS' ? `${items.length} entries` : tab === 'PETS' ? `${pets.length} companions` : tab === 'LOOT' ? `${loot.length} trade goods` : `${Object.keys(SKILLS_INFO).length} skills`}
        </div>
      </div>
      <div className="rpg-frame p-4 rpg-scroll" style={{ height: '26rem' }}>
        {tab === 'LOOT' ? (
          <div className="grid grid-cols-2 gap-2" data-testid="codex-loot">
            {loot.map((l) => (
              <div key={l.id} className="rpg-frame flex items-center gap-2 p-2">
                <ItemSlot item={lootItem(l)} size="3.4rem" iconSize={36} tooltip="buy" compare={false} />
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-tight" style={{ color: RARITY_TEXT[l.rarity] }}>{l.name}</div>
                  <div className="rpg-label !text-[.5rem]">{l.rarity} · sells {l.price.toLocaleString()} G</div>
                  <div className="text-[.62rem] text-[var(--text-dim)] leading-tight">{lootSources(l.id).map(srcName).join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : tab !== 'SKILLS' ? (
          <div className="flex flex-wrap gap-4 content-start">
            {(tab === 'ITEMS' ? items : pets).map((it) => <div key={it.id} className="flex flex-col items-center gap-1"><ItemSlot item={it} size="4.4rem" iconSize={46} tooltip="buy" compare={false} />{it.summonOnly && <span className="rpg-label !text-[.5rem]" style={{ color: '#c58bff' }}>Summon only</span>}</div>)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(SKILLS_INFO).map(([k, info]: [string, any]) => (
              <div key={k} className="rpg-frame flex items-center gap-3 p-2" {...tip(<SimpleTip title={info.name} sub={`${info.classType ?? 'Universal'} · ${info.type === 'ACTIVE' ? 'Active' : 'Passive'}`} body={info.description} />)}>
                <div className="rpg-slot hoverable" style={{ ['--slot' as any]: '3rem', ['--rc' as any]: info.classType ? HERO_COLOR[info.classType as keyof typeof HERO_COLOR] : '#e9b949' }}><span className="slot-icon"><SkillIcon id={k} size={24} /></span></div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[var(--gold-light)] leading-tight">{info.name}</div>
                  <div className="rpg-label !text-[.55rem]">{info.classType ?? 'Universal'} · {info.type}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
