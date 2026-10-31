// Pet Collection window (its own window, opened from the Collection button on the HUD / pause menu / Pet House; owner 2026-10-31: no longer a
// Codex tab). WIDE LANDSCAPE, two columns (like the Tower hub): left = progress banner, next reward, species grid (owned = colour with a Register
// button, others = silhouettes); right = every milestone as a compact card with stat chips, all visible at once. Only REGISTERED species count
// (store.petReg, free + permanent); milestones are AUTO-CLAIMED the moment the count reaches them (store.autoClaimPets, petClaimed), the last is
// the 100% prize. Red dot = an owned species is not registered yet. Narrow portrait screens stack the columns and scroll.
import React from 'react';
import { PETS_POOL } from '../../constants';
import { Modal } from '../components/Modal';
import { ItemSlot } from '../components/ItemSlot';
import { CutePaw } from '../components/CuteIcons';
import { Crown } from '../components/GoldIcons';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { PET_MILESTONES, PET_TOTAL } from '../../petCollection';
import { RARITY_RANK, RARITY_TEXT } from '../lib/game';
import './collection.css';

const SIL: React.CSSProperties = { filter: 'brightness(0) opacity(.6)' };
const byRank = (a: { rarity: keyof typeof RARITY_RANK; name: string }, b: { rarity: keyof typeof RARITY_RANK; name: string }) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);

const chips = (label: string) => label.split(', ').map((c) => c.replace(' max HP', ' HP').replace(' damage', ' dmg').replace(' defense', ' def').replace(' crit chance', ' crit').replace(' crit damage', ' crit dmg').replace(' move speed', ' move').replace(' gold find', ' gold'));

export const PetCollectionDialog: React.FC = () => {
  const open = useUiStore((s) => s.collectionOpen);
  const close = useUiStore((s) => s.openCollection);
  const seen = useGameStore((s) => s.petSeen);
  const reg = useGameStore((s) => s.petReg);
  const claimed = useGameStore((s) => s.petClaimed);
  const register = useGameStore((s) => s.registerPet);
  const have = new Set(seen), regd = new Set(reg);
  const pets = [...PETS_POOL].sort(byRank);
  const n = pets.filter((p) => regd.has(p.id)).length;
  const unreg = pets.filter((p) => have.has(p.id) && !regd.has(p.id)).length;
  const next = PET_MILESTONES.find((m) => n < m.n);
  return (
    <Modal open={open} onClose={() => close(false)} title="Pet Collection" icon={<CutePaw size={20} />} width="min(60rem, calc(100vw - 1.5rem))" z={250}>
      <div className="pc" data-testid="pet-collection">
        <div className="pc-left">
          <div className="pc-banner">
            <div className="pc-banner-ic"><CutePaw size={22} /></div>
            <div className="pc-banner-tx">
              <b>Gotta befriend them all!</b>
              <small>Register each species you own. Rewards unlock by themselves.</small>
              <div className="pc-bar"><i style={{ width: `${PET_TOTAL ? (n / PET_TOTAL) * 100 : 0}%` }} /></div>
            </div>
            <div className="pc-count"><b data-testid="pet-collection-count">{n} / {PET_TOTAL}</b><small>registered</small></div>
          </div>

          <div className="pc-next" data-testid="pet-next">
            <Crown size={20} />
            {next
              ? <div><b>Next reward: {next.n} registered ({next.n - n} to go)</b><span className="pc-chips">{chips(next.label).map((c) => <i key={c}>{c}</i>)}</span></div>
              : <div data-testid="pet-title"><b>Beast Whisperer</b><span>You befriended every species. The pets bow to you!</span></div>}
          </div>

          <div className="pc-sec">Species <small>colour = owned, shadow = to find</small>
            {unreg > 1 && <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-register-all" onClick={() => register()}>Register all ({unreg})</button>}
          </div>
          <div className="pc-grid" data-testid="pet-tiles">
            {pets.map((p) => {
              const ok = have.has(p.id), isReg = regd.has(p.id);
              return (
                <div key={p.id} data-owned={ok} data-registered={isReg} className={`pc-tile ${ok ? (isReg ? 'reg' : '') : 'off'}`}>
                  {ok && !isReg && <i className="pc-dot" />}
                  {ok ? <ItemSlot item={p} size="2.7rem" iconSize={32} tooltip="buy" compare={false} /> : <div style={SIL}><ItemSlot item={p} size="2.7rem" iconSize={32} tooltip="none" compare={false} /></div>}
                  <span style={{ color: ok ? RARITY_TEXT[p.rarity] : 'var(--text-dim)' }}>{ok ? p.name : '???'}</span>
                  {ok ? (isReg ? <em className="pc-ok">Registered</em> : <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-register" onClick={() => register(p.id)}>Register</button>)
                    : <em style={{ color: RARITY_TEXT[p.rarity] }}>{p.rarity.toLowerCase()}</em>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="pc-right">
          <div className="pc-sec">Rewards <small>{claimed.length} / {PET_MILESTONES.length} unlocked</small></div>
          <div className="pc-list" data-testid="pet-milestones">
            {PET_MILESTONES.map((m) => {
              const got = claimed.includes(m.n);
              return (
                <div key={m.n} data-reached={n >= m.n} data-claimed={got} className={`pc-row ${m.final ? 'final' : ''} ${got ? 'done' : 'lockedrow'}`}>
                  <span className="pc-n">{m.final ? <Crown size={18} /> : m.n}</span>
                  <span className="pc-tx">
                    <span className="pc-chips">
                      {chips(m.label).map((c) => <i key={c}>{c}</i>)}
                      {m.final && <i className="gem">{m.gems?.toLocaleString()} gems</i>}
                      {m.final && <i className="gem">Title: {m.title}</i>}
                    </span>
                  </span>
                  <span className="pc-st">{got ? 'Unlocked' : `${m.n - n} to go`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};
