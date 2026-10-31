// Pet Collection window (its own window, opened from the Collection button on the HUD / pause menu / Pet House; owner 2026-10-31: no longer a
// Codex tab). Species grid (owned = colour with a Register button, others = silhouettes, with rarity), a progress banner with the next reward,
// and the reward track. Only REGISTERED species count (store.petReg, free + permanent); every milestone is CLAIMED by hand (store.petClaimed);
// claimed ones give their stats (petCollection.ts), the last is the 100% prize. Red dots: registerable species / claimable rewards.
import React from 'react';
import { PETS_POOL } from '../../constants';
import { Modal } from '../components/Modal';
import { ItemSlot } from '../components/ItemSlot';
import { CutePaw } from '../components/CuteIcons';
import { Crown } from '../components/GoldIcons';
import { useUiStore } from '../uiStore';
import { useGameStore } from '../../store';
import { PET_MILESTONES, PET_TOTAL, petClaimable } from '../../petCollection';
import { RARITY_RANK, RARITY_TEXT } from '../lib/game';
import './collection.css';

const SIL: React.CSSProperties = { filter: 'brightness(0) opacity(.6)' };
const byRank = (a: { rarity: keyof typeof RARITY_RANK; name: string }, b: { rarity: keyof typeof RARITY_RANK; name: string }) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);

export const PetCollectionDialog: React.FC = () => {
  const open = useUiStore((s) => s.collectionOpen);
  const close = useUiStore((s) => s.openCollection);
  const seen = useGameStore((s) => s.petSeen);
  const reg = useGameStore((s) => s.petReg);
  const claimed = useGameStore((s) => s.petClaimed);
  const claim = useGameStore((s) => s.claimPetMilestone);
  const register = useGameStore((s) => s.registerPet);
  const have = new Set(seen), regd = new Set(reg);
  const pets = [...PETS_POOL].sort(byRank);
  const n = pets.filter((p) => regd.has(p.id)).length;
  const unreg = pets.filter((p) => have.has(p.id) && !regd.has(p.id)).length;
  const ready = petClaimable(n, claimed);
  const next = PET_MILESTONES.find((m) => n < m.n);
  return (
    <Modal open={open} onClose={() => close(false)} title="Pet Collection" icon={<CutePaw size={20} />} width="38rem" z={250} full>
      <div className="pc" data-testid="pet-collection">
        <div className="pc-banner">
          <div className="pc-banner-ic"><CutePaw size={26} /></div>
          <div className="pc-banner-tx">
            <b>Gotta befriend them all!</b>
            <small>Register each species you own (it stays with you). Only registered pets count.</small>
            <div className="pc-bar"><i style={{ width: `${PET_TOTAL ? (n / PET_TOTAL) * 100 : 0}%` }} /></div>
          </div>
          <div className="pc-count"><b data-testid="pet-collection-count">{n} / {PET_TOTAL}</b><small>registered</small></div>
        </div>

        {next && (
          <div className="pc-next" data-testid="pet-next">
            <Crown size={22} />
            <div><b>Next reward at {next.n} registered ({next.n - n} to go)</b><span>{next.label}</span></div>
          </div>
        )}

        <div className="pc-sec">Rewards <small>{claimed.length} / {PET_MILESTONES.length} claimed</small>
          {ready.length > 1 && <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-claim-all" onClick={() => claim()}>Claim all ({ready.length})</button>}
        </div>
        <div className="pc-list" data-testid="pet-milestones">
          {PET_MILESTONES.map((m) => {
            const reached = n >= m.n, got = claimed.includes(m.n);
            return (
              <div key={m.n} data-reached={reached} data-claimed={got} className={`pc-row ${m.final ? 'final' : ''} ${got ? 'done' : reached ? 'ready' : 'lockedrow'}`}>
                <span className="pc-n">{m.final ? <Crown size={20} /> : m.n}</span>
                <span className="pc-tx">
                  {m.final ? 'All species! ' : `${m.n} species: `}{m.label}
                  {m.final && <em>Title "{m.title}" + {m.gems?.toLocaleString()} gems</em>}
                </span>
                <span className="pc-st">
                  {got ? 'Claimed' : reached
                    ? <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-claim" onClick={() => claim(m.n)}>Claim</button>
                    : `${m.n - n} to go`}
                </span>
              </div>
            );
          })}
        </div>

        {claimed.includes(PET_TOTAL) && <div className="pc-next" data-testid="pet-title"><Crown size={22} /><div><b>Beast Whisperer</b><span>You have befriended every species. The pets bow to you!</span></div></div>}

        <div className="pc-sec">Species <small>colour = owned, shadow = still to find</small>
          {unreg > 1 && <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-register-all" onClick={() => register()}>Register all ({unreg})</button>}
        </div>
        <div className="pc-grid" data-testid="pet-tiles">
          {pets.map((p) => {
            const ok = have.has(p.id), isReg = regd.has(p.id);
            return (
              <div key={p.id} data-owned={ok} data-registered={isReg} className={`pc-tile ${ok ? (isReg ? 'reg' : '') : 'off'}`}>
                {ok && !isReg && <i className="pc-dot" />}
                {ok ? <ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="buy" compare={false} /> : <div style={SIL}><ItemSlot item={p} size="3.6rem" iconSize={40} tooltip="none" compare={false} /></div>}
                <span style={{ color: ok ? RARITY_TEXT[p.rarity] : 'var(--text-dim)' }}>{ok ? p.name : '???'}</span>
                <small style={{ color: RARITY_TEXT[p.rarity] }}>{p.rarity.toLowerCase()}</small>
                {ok && (isReg ? <span className="pc-ok">Registered</span> : <button className="rpg-btn rpg-btn-sm rpg-btn-primary pe" data-testid="pet-register" onClick={() => register(p.id)}>Register</button>)}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
