import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ITEMS_POOL, PETS_POOL, SKILLS_INFO } from '../../constants';
import { Modal } from '../components/Modal';
import { ItemSlot } from '../components/ItemSlot';
import { SkillIcon } from '../components/ItemIcon';
import { tip } from '../components/Tooltip';
import { SimpleTip } from '../components/ItemTip';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { CODEX_KEYS, CODEX_MONSTERS, CODEX_REWARD_GEMS, type CodexTab, type MonsterEntry } from '../../codexData';
import { LOOT, lootItem, lootSources } from '../../loot';
import { lootCraftUse } from '../../crafting';
import { ENEMY_DEFS } from '../../engine/enemyDefs';
import { RARITY_RANK, RARITY_TEXT } from '../lib/game';
import { HERO_COLOR } from '../lib/game';
import type { Item } from '../../types';

const TABS = ['ITEMS', 'PETS', 'SKILLS', 'LOOT', 'MONSTERS'] as const;
const SIL: React.CSSProperties = { filter: 'brightness(0) opacity(.6)' };
const Mystery: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={SIL}>{children}</div>;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const MonsterArt: React.FC<{ m: MonsterEntry; size?: number }> = ({ m, size = 44 }) => {
  const c = hex(m.color); const big = m.tier === 'BOSS' ? 1 : m.tier === 'MINI-BOSS' ? 0.9 : 0.78;
  return (
    <div style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: size * big, height: size * big, borderRadius: m.tier === 'MONSTER' || m.tier === 'ELITE' ? '48% 48% 40% 40%' : '30%', background: `radial-gradient(circle at 35% 30%, #fff8, ${c} 45%, #000a 130%)`, position: 'relative', boxShadow: m.tier === 'ELITE' ? '0 0 8px #fbbf24' : undefined }}>
        <span style={{ position: 'absolute', left: '26%', top: '38%', width: '16%', height: '16%', borderRadius: '50%', background: '#fff', boxShadow: '0 0 3px #000' }} />
        <span style={{ position: 'absolute', right: '26%', top: '38%', width: '16%', height: '16%', borderRadius: '50%', background: '#fff', boxShadow: '0 0 3px #000' }} />
      </div>
    </div>
  );
};
const srcName = (k: string) => (k === 'ELITE' ? 'Elites' : ENEMY_DEFS[k as keyof typeof ENEMY_DEFS]?.name ?? k.charAt(0) + k.slice(1).toLowerCase().replace('_', ' '));
const byRank = (a: Item, b: Item) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);

export const CodexDialog: React.FC = () => {
  const open = useUiStore((s) => s.codexOpen);
  const close = useUiStore((s) => s.openCodex);
  const [tab, setTab] = useState<typeof TABS[number]>('ITEMS');
  const items = [...ITEMS_POOL].sort(byRank);
  const pets = [...PETS_POOL].sort(byRank);
  const disc = useGameStore((st) => st.discovered);
  const claimed = useGameStore((st) => st.codexClaimed);
  const claim = useGameStore((st) => st.claimCodexReward);
  const D = (t: CodexTab) => new Set(disc[t]);
  const dItems = D('items'), dPets = D('pets'), dSkills = D('skills'), dLoot = D('loot'), dMon = D('monsters');
  const tk = tab.toLowerCase() as CodexTab;
  const total = CODEX_KEYS[tk].length;
  const found = CODEX_KEYS[tk].filter((k) => D(tk).has(k)).length;
  const done = found >= total;
  const loot = [...LOOT].sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={() => close(false)} title="Codex" icon={<BookOpen size={20} />} width="44rem" z={250} sheet
      tabs={(
        <>
          <div className="tabs">
            {TABS.map((t) => <button key={t} className={`rpg-subtab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t.charAt(0) + t.slice(1).toLowerCase()}</button>)}
          </div>
          <div className="px-4 pt-2 pb-2.5" data-testid="codex-progress" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="rpg-label">{found} / {total} discovered</span>
              {done && !claimed.includes(tk) && <button className="rpg-btn rpg-btn-primary rpg-btn-sm pe ml-auto" data-testid="codex-claim" onClick={() => claim(tk)}>Claim {CODEX_REWARD_GEMS} gems</button>}
              {done && claimed.includes(tk) && <span className="rpg-label ml-auto" style={{ color: 'var(--good)' }}>Complete, reward claimed</span>}
              {!done && <span className="rpg-label ml-auto">100% reward: {CODEX_REWARD_GEMS} gems</span>}
            </div>
            <div className="rpg-bar thin"><div className="fill" style={{ ['--fill' as any]: total ? found / total : 0 }} /></div>
          </div>
        </>
      )}>
      <div>
        {tab === 'LOOT' ? (
          <div className="grid gap-2 cdx-grid" data-testid="codex-loot">
            {loot.map((l) => {
              const ok = dLoot.has(l.name);
              return (
                <div key={l.id} className="rpg-frame flex items-center gap-3 p-2.5" data-discovered={ok}>
                  {ok ? <ItemSlot item={lootItem(l)} size="3.4rem" iconSize={36} tooltip="buy" compare={false} /> : <Mystery><ItemSlot item={lootItem(l)} size="3.4rem" iconSize={36} tooltip="none" compare={false} /></Mystery>}
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight" style={{ color: RARITY_TEXT[l.rarity] }}>{l.name}</div>
                      <div className="rpg-label !text-xs">{l.rarity} · sells {l.price.toLocaleString()} G</div>
                      <div className="text-xs text-[var(--fg-2)] leading-tight">{lootSources(l.id).map(srcName).join(', ')}</div>
                      {lootCraftUse(l.id) && <div className="text-xs leading-tight" style={{ color: 'var(--hi)' }}>{lootCraftUse(l.id)}</div>}
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--fg-2)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : tab === 'PETS' ? (
          <div className="grid gap-2 cdx-grid" data-testid="codex-pets">
            {pets.map((p) => {
              const ok = dPets.has(p.name);
              return (
                <div key={p.id} className="rpg-frame flex items-center gap-3 p-2.5" data-discovered={ok}>
                  {ok ? <div style={p.summonOnly ? { filter: 'drop-shadow(0 0 6px rgba(197,139,255,.5))' } : undefined}><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="buy" compare={false} /></div>
                    : <Mystery><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="none" compare={false} /></Mystery>}
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight" style={{ color: RARITY_TEXT[p.rarity] }}>{p.name}</div>
                      <div className="rpg-label !text-xs">{p.rarity}{p.summonOnly ? ' · Summon only' : ` · ${p.price.toLocaleString()} G`}</div>
                      <div className="text-xs text-[var(--fg-2)] leading-tight">{p.description}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--fg-2)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : tab === 'ITEMS' ? (
          <div className="flex flex-wrap gap-4 content-start" data-testid="codex-items">
            {items.map((it) => dItems.has(it.name)
              ? <div key={it.id} data-discovered="true" className="flex flex-col items-center gap-1"><ItemSlot item={it} size="4.4rem" iconSize={46} tooltip="buy" compare={false} />{it.summonOnly && <span className="rpg-label" style={{ color: 'var(--r3-ink)' }}>Summon only</span>}</div>
              : <div key={it.id} data-discovered="false" className="flex flex-col items-center gap-1"><Mystery><ItemSlot item={it} size="4.4rem" iconSize={46} tooltip="none" compare={false} /></Mystery><span className="rpg-label !text-xs">???</span></div>)}
          </div>
        ) : tab === 'MONSTERS' ? (
          <div className="grid gap-2 cdx-grid" data-testid="codex-monsters">
            {CODEX_MONSTERS.map((m) => {
              const ok = dMon.has(m.key);
              return (
                <div key={m.key} className="rpg-frame flex items-center gap-3 p-2.5" data-discovered={ok}>
                  <div className="rpg-slot" style={{ ['--slot' as any]: '3.6rem', ['--rc' as any]: m.tier === 'BOSS' ? '#ef4444' : m.tier === 'MINI-BOSS' ? '#c58bff' : m.tier === 'ELITE' ? '#fbbf24' : '#7a6a4a' }}>
                    <span className="slot-icon">{ok ? <MonsterArt m={m} /> : <Mystery><MonsterArt m={m} /></Mystery>}</span>
                  </div>
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight text-[var(--fg)]">{m.name}</div>
                      <div className="rpg-label !text-xs">{m.tier}{m.title ? ` · ${m.title}` : ''}</div>
                      <div className="text-xs leading-tight" style={{ color: 'var(--hi)' }}>{m.region}</div>
                      <div className="text-xs text-[var(--fg-2)] leading-tight">{m.trick}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--fg-2)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-2 cdx-grid" data-testid="codex-skills">
            {Object.entries(SKILLS_INFO).map(([k, info]: [string, any]) => {
              const ok = dSkills.has(k);
              const slot = (
                <div className="rpg-slot hoverable" style={{ ['--slot' as any]: '3rem', ['--rc' as any]: info.classType ? HERO_COLOR[info.classType as keyof typeof HERO_COLOR] : '#e9b949' }}><span className="slot-icon"><SkillIcon id={k} size={24} /></span></div>
              );
              return (
                <div key={k} data-discovered={ok} className="rpg-frame flex items-center gap-3 p-2" {...(ok ? tip(<SimpleTip title={info.name} sub={`${info.classType ?? 'Universal'} · ${info.type === 'ACTIVE' ? 'Active' : 'Passive'}`} body={info.description} />) : {})}>
                  {ok ? slot : <Mystery>{slot}</Mystery>}
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[var(--fg)] leading-tight">{info.name}</div>
                      <div className="rpg-label !text-xs">{info.classType ?? 'Universal'} · {info.type}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--fg-2)]">???</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
