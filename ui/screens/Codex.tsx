import React, { useState } from 'react';
import { BookOpen } from '../components/GoldIcons';
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
import { PET_MILESTONES, PET_TOTAL } from '../../petCollection';

const TABS = ['ITEMS', 'PETS', 'SKILLS', 'LOOT', 'MONSTERS', 'COLLECTION'] as const;
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
const srcName = (k: string) => (k === 'ELITE' ? 'Elites' : k === 'MALAKAR' ? 'Malakar (final fall, very rare)' : ENEMY_DEFS[k as keyof typeof ENEMY_DEFS]?.name ?? k.charAt(0) + k.slice(1).toLowerCase().replace('_', ' '));
const byRank = (a: Item, b: Item) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);

/** Pet Collection: every pet species ever owned (store petSeen) in colour, the rest as silhouettes, plus the milestone bonuses. */
const PetCollection: React.FC = () => {
  const seen = useGameStore((st) => st.petSeen);
  const have = new Set(seen);
  const pets = [...PETS_POOL].sort(byRank);
  const n = pets.filter((p) => have.has(p.id)).length;
  return (
    <div data-testid="pet-collection">
      <div className="flex items-center gap-2 mb-2">
        <span className="rpg-label" data-testid="pet-collection-count">Pet species collected {n} / {PET_TOTAL}</span>
        <span className="rpg-label ml-auto opacity-70">Every species you ever owned counts</span>
      </div>
      <div className="rpg-bar thin mb-3"><div className="fill" style={{ ['--fill' as any]: PET_TOTAL ? n / PET_TOTAL : 0 }} /></div>
      <div className="flex flex-col gap-2 mb-4" data-testid="pet-milestones">
        {PET_MILESTONES.map((m) => {
          const ok = n >= m.n;
          return (
            <div key={m.n} data-reached={ok} className="flex items-center gap-3 px-3 py-2" style={{ borderRadius: 999, background: ok ? 'rgba(110,231,160,.18)' : 'rgba(255,255,255,.06)', opacity: ok ? 1 : 0.7 }}>
              <span className="font-bold text-sm" style={{ minWidth: '3.4rem', color: ok ? '#6ee7a0' : 'var(--text-dim)' }}>{m.n} pets</span>
              <span className="text-sm flex-1" style={{ color: ok ? '#fff' : 'var(--text-dim)' }}>{m.label}</span>
              <span className="rpg-label !text-[.55rem]" style={{ color: ok ? '#6ee7a0' : undefined }}>{ok ? 'Reached' : `${m.n - n} to go`}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-2" data-testid="pet-tiles">
        {pets.map((p) => {
          const ok = have.has(p.id);
          return (
            <div key={p.id} data-owned={ok} className="flex flex-col items-center gap-1 p-2" style={{ borderRadius: 18, background: ok ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.18)' }}>
              {ok ? <ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="buy" compare={false} /> : <Mystery><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="none" compare={false} /></Mystery>}
              <span className="text-[.62rem] font-bold text-center leading-tight" style={{ color: ok ? RARITY_TEXT[p.rarity] : 'var(--text-dim)' }}>{ok ? p.name : '???'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CodexDialog: React.FC = () => {
  const open = useUiStore((s) => s.codexOpen);
  const close = useUiStore((s) => s.openCodex);
  const [tab, setTab] = useState<typeof TABS[number]>('ITEMS');
  const items = ITEMS_POOL.filter((i) => !i.retired).sort(byRank);
  const pets = [...PETS_POOL].sort(byRank);
  const disc = useGameStore((st) => st.discovered);
  const claimed = useGameStore((st) => st.codexClaimed);
  const claim = useGameStore((st) => st.claimCodexReward);
  const D = (t: CodexTab) => new Set(disc[t]);
  const dItems = D('items'), dPets = D('pets'), dSkills = D('skills'), dLoot = D('loot'), dMon = D('monsters');
  const tk = (tab === 'COLLECTION' ? 'pets' : tab.toLowerCase()) as CodexTab;
  const total = CODEX_KEYS[tk].length;
  const found = CODEX_KEYS[tk].filter((k) => D(tk).has(k)).length;
  const done = found >= total;
  const loot = [...LOOT].sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={() => close(false)} title="Codex" icon={<BookOpen size={20} />} width="40rem" z={250} full>
      <div className="flex gap-2 mb-3">
        {TABS.map((t) => <button key={t} className={`rpg-subtab pe ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        <button className="rpg-subtab pe ml-auto" onClick={() => useUiStore.getState().openStory(true)} data-testid="open-story">STORY</button>
      </div>
      {tab !== 'COLLECTION' && <div className="mb-3" data-testid="codex-progress">
        <div className="flex items-center gap-2 mb-1">
          <span className="rpg-label">{tab.charAt(0) + tab.slice(1).toLowerCase()} {found} / {total} discovered</span>
          {done && !claimed.includes(tk) && <button className="rpg-btn pe ml-auto" data-testid="codex-claim" onClick={() => claim(tk)}>Claim {CODEX_REWARD_GEMS} gems</button>}
          {done && claimed.includes(tk) && <span className="rpg-label ml-auto" style={{ color: '#6ee7a0' }}>Complete - reward claimed</span>}
          {!done && <span className="rpg-label ml-auto opacity-70">100% reward: {CODEX_REWARD_GEMS} gems</span>}
        </div>
        <div className="rpg-bar thin"><div className="fill" style={{ ['--fill' as any]: total ? found / total : 0 }} /></div>
      </div>}
      <div className="rpg-frame p-4 rpg-scroll codex-frame" style={{ height: '26rem' }}>
        {tab === 'COLLECTION' ? <PetCollection /> : tab === 'LOOT' ? (
          <div className="grid grid-cols-2 gap-2" data-testid="codex-loot">
            {loot.map((l) => {
              const ok = dLoot.has(l.name);
              return (
                <div key={l.id} className="rpg-frame flex items-center gap-2 p-2" data-discovered={ok}>
                  {ok ? <ItemSlot item={lootItem(l)} size="3.4rem" iconSize={36} tooltip="buy" compare={false} /> : <Mystery><ItemSlot item={lootItem(l)} size="3.4rem" iconSize={36} tooltip="none" compare={false} /></Mystery>}
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight" style={{ color: RARITY_TEXT[l.rarity] }}>{l.name}</div>
                      <div className="rpg-label !text-[.5rem]">{l.rarity} · sells {l.price.toLocaleString()} G</div>
                      <div className="text-[.62rem] text-[var(--text-dim)] leading-tight">{lootSources(l.id).map(srcName).join(', ')}</div>
                      {lootCraftUse(l.id) && <div className="text-[.6rem] leading-tight" style={{ color: '#e9b949' }}>{lootCraftUse(l.id)}</div>}
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--text-dim)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : tab === 'PETS' ? (
          <div className="grid grid-cols-2 gap-2" data-testid="codex-pets">
            {pets.map((p) => {
              const ok = dPets.has(p.name);
              return (
                <div key={p.id} className="rpg-frame flex items-center gap-2 p-2" data-discovered={ok}>
                  {ok ? <div style={p.summonOnly ? { filter: 'drop-shadow(0 0 6px rgba(197,139,255,.5))' } : undefined}><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="buy" compare={false} /></div>
                    : <Mystery><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="none" compare={false} /></Mystery>}
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight" style={{ color: RARITY_TEXT[p.rarity] }}>{p.name}</div>
                      <div className="rpg-label !text-[.5rem]">{p.rarity}{p.summonOnly ? ' · Summon only' : ` · ${p.price.toLocaleString()} G`}</div>
                      <div className="text-[.62rem] text-[var(--text-dim)] leading-tight">{p.description}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--text-dim)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : tab === 'ITEMS' ? (
          <div className="flex flex-wrap gap-4 content-start" data-testid="codex-items">
            {items.map((it) => dItems.has(it.name)
              ? <div key={it.id} data-discovered="true" className="flex flex-col items-center gap-1"><ItemSlot item={it} size="4.4rem" iconSize={46} tooltip="buy" compare={false} />{it.summonOnly && <span className="rpg-label !text-[.5rem]" style={{ color: '#c58bff' }}>Summon only</span>}</div>
              : <div key={it.id} data-discovered="false" className="flex flex-col items-center gap-1"><Mystery><ItemSlot item={it} size="4.4rem" iconSize={46} tooltip="none" compare={false} /></Mystery><span className="rpg-label !text-[.5rem]">???</span></div>)}
          </div>
        ) : tab === 'MONSTERS' ? (
          <div className="grid grid-cols-2 gap-2" data-testid="codex-monsters">
            {CODEX_MONSTERS.map((m) => {
              const ok = dMon.has(m.key);
              return (
                <div key={m.key} className="rpg-frame flex items-center gap-2 p-2" data-discovered={ok}>
                  <div className="rpg-slot" style={{ ['--slot' as any]: '3.6rem', ['--rc' as any]: m.tier === 'BOSS' ? '#ef4444' : m.tier === 'MINI-BOSS' ? '#c58bff' : m.tier === 'ELITE' ? '#fbbf24' : '#7a6a4a' }}>
                    <span className="slot-icon">{ok ? <MonsterArt m={m} /> : <Mystery><MonsterArt m={m} /></Mystery>}</span>
                  </div>
                  {ok ? (
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight text-[var(--gold-light)]">{m.name}</div>
                      <div className="rpg-label !text-[.5rem]">{m.tier}{m.title ? ` · ${m.title}` : ''}</div>
                      <div className="text-[.6rem] leading-tight" style={{ color: '#e9b949' }}>{m.region}</div>
                      <div className="text-[.62rem] text-[var(--text-dim)] leading-tight">{m.trick}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--text-dim)]">???</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3" data-testid="codex-skills">
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
                      <div className="font-bold text-sm text-[var(--gold-light)] leading-tight">{info.name}</div>
                      <div className="rpg-label !text-[.55rem]">{info.classType ?? 'Universal'} · {info.type}</div>
                    </div>
                  ) : <div className="font-bold text-sm text-[var(--text-dim)]">???</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
