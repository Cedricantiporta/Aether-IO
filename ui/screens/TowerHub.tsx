// Pages of the Endless Tower hub window (SetOut.tsx, mode TOWER): the Tower page (best floor hero + milestone reward track) and the
// Ascension page (selector, the 11 level cards, next goal, cumulative effects). Pure presentation: all data comes from the store
// (progress.towerBest / towerClaimed / ascension / ascensionMax / ascClaimed); styles in hub.css. Zelda / casual Nintendo look.
import React from 'react';
import { Castle, Check, ChevronLeft, ChevronRight, Crown, Gem, Lock, PawPrint, Skull, Sparkles, Star, Swords, Package, Shield } from '../components/GoldIcons';
import { PaintImg } from '../components/ItemArt';
import { ASCENSIONS, ASCENSION_MAX, ascReward, ascRewardText, ascensionMods, type AscMods } from '../../ascension';
import { milestoneInfo, milestoneLabel, TOWER_STEP } from '../../towerRewards';
import './hub.css';

// ---------------------------------------------------------------------------------------------- shared bits
/** Tab banner: round icon badge + title + one line + an optional right-hand stat. */
export const HubBanner: React.FC<{ tone: 'tower' | 'daily' | 'waves' | 'asc'; icon: React.ReactNode; title: string; sub: string; stat?: React.ReactNode }> = ({ tone, icon, title, sub, stat }) => (
  <div className={`th-banner ${tone}`}>
    <span className="th-banner-ic">{icon}</span>
    <div className="th-banner-tx"><b>{title}</b><small>{sub}</small></div>
    {stat && <div className="th-banner-stat">{stat}</div>}
  </div>
);

/** Friendly padlock panel ("Beat the Void Herald to unlock"). */
export const HubLock: React.FC<{ title: string; text: string; testid?: string }> = ({ title, text, testid }) => (
  <div className="th-lockbox" data-testid={testid}>
    <span className="th-lockbox-ic"><Lock size={30} /></span>
    <b>{title}</b>
    <span>{text}</span>
  </div>
);

// ---------------------------------------------------------------------------------------------- tower page
interface Ms { floor: number; state: 'claim' | 'locked' | 'done' }
const KIND_ICON = { GEAR: Swords, PET: PawPrint, SUPPLY: Package, SHARDS: Gem } as const;
const KIND_NAME = { GEAR: 'Gear', PET: 'Pet', SUPPLY: 'Supplies', SHARDS: 'Shards' } as const;
const RAR_CLS: Record<string, string> = { RARE: 'r-rare', EPIC: 'r-epic', LEGENDARY: 'r-leg', MYTHIC: 'r-myth' };

export const TowerPage: React.FC<{ locked: boolean; heroTitle: string; best: number; claimed: number[]; onClaim: (floor: number) => void; startFloor: number; onStartFloor: (f: number) => void }> = ({ locked, heroTitle, best, claimed, onClaim, startFloor, onStartFloor }) => {
  const maxF = Math.max(1, best), setF = (f: number) => onStartFloor(Math.max(1, Math.min(maxF, f)));
  const reachedTop = Math.floor(best / TOWER_STEP) * TOWER_STEP;
  const nextMs = reachedTop + TOWER_STEP;
  // the track: the last 2 claimed prizes, every ready one, then the next four ahead
  const ms: Ms[] = [];
  const done: Ms[] = [];
  for (let f = TOWER_STEP; f <= reachedTop; f += TOWER_STEP) {
    if (claimed.includes(f)) done.push({ floor: f, state: 'done' }); else ms.push({ floor: f, state: 'claim' });
  }
  const track: Ms[] = [...done.slice(-2), ...ms];
  for (let k = 1; k <= 4; k++) track.push({ floor: reachedTop + k * TOWER_STEP, state: 'locked' });
  const ready = ms.length;
  const into = best - reachedTop;   // floors cleared towards the next milestone (0..9)
  return (
    <div className="th-tower" data-testid={locked ? undefined : 'so-tower'}>
      {locked ? (
        <HubLock testid="so-tower-locked" title="The Tower is sealed" text="Beat the Void Herald at the end of the Void (finish one full adventure) to unlock the Endless Tower." />
      ) : (<>
        <div className="th-hero">
          <span className="th-hero-castle"><Castle size={46} /></span>
          <div className="th-hero-main">
            <small>Best floor · {heroTitle}</small>
            <div className="th-hero-num" data-testid="tower-best">{best || '-'}</div>
            <div className="th-hero-next">Next record: <b>floor {best + 1}</b></div>
          </div>
          <div className="th-hero-goal">
            <div className="th-goal-top"><Star size={13} /> Next prize at floor {nextMs}</div>
            <div className="th-bar"><i style={{ width: `${(into / TOWER_STEP) * 100}%` }} /></div>
            <small>{TOWER_STEP - into} more {TOWER_STEP - into === 1 ? 'floor' : 'floors'} to go</small>
          </div>
        </div>

        <div className="th-start" data-testid="tower-start">
          <div className="th-start-tx"><b>Start from floor</b><small>{maxF > 1 ? `Skip ahead to any floor you already reached (up to ${maxF}). Only floors you clear in this run count.` : 'Climb once to unlock skipping ahead.'}</small></div>
          <div className="th-start-ctl">
            <button className="th-step pe sm" disabled={startFloor <= 1} onClick={() => setF(startFloor - 1)} aria-label="Lower floor" data-testid="tower-floor-dec"><ChevronLeft size={18} /></button>
            <div className="th-start-num" data-testid="tower-floor-sel">{startFloor}</div>
            <button className="th-step pe sm" disabled={startFloor >= maxF} onClick={() => setF(startFloor + 1)} aria-label="Higher floor" data-testid="tower-floor-inc"><ChevronRight size={18} /></button>
          </div>
          <div className="th-start-quick">
            <button className="th-q pe" disabled={startFloor <= 1} onClick={() => setF(1)}>Floor 1</button>
            <button className="th-q pe" disabled={startFloor <= 1} onClick={() => setF(startFloor - 5)} data-testid="tower-floor-m5">-5</button>
            <button className="th-q pe" disabled={startFloor >= maxF} onClick={() => setF(startFloor + 5)} data-testid="tower-floor-p5">+5</button>
            <button className="th-q pe" disabled={startFloor >= maxF} onClick={() => setF(maxF)}>Best</button>
          </div>
        </div>

        <div className="th-chips">
          <span className="th-chip"><Sparkles size={12} /> Elite every 3rd floor</span>
          <span className="th-chip"><Crown size={12} /> Champion every 5th</span>
          <span className="th-chip"><Skull size={12} /> Boss every 10th</span>
        </div>

        <div className="th-note">
          <PaintImg file="aether_crystal" size="2rem" />
          <div><b>What the tower drops</b><span>Monsters and bosses drop <i>Aether Crystals</i> only: no gear, no potions. The one-time floor prizes below are the bonus.</span></div>
        </div>

        <div className="th-sec">Floor prizes <small>every {TOWER_STEP}th floor, once per class{ready > 0 ? ` · ${ready} ready` : ''}</small></div>
        <div className="th-track" data-testid="tower-milestones">
          {track.map((m) => {
            const info = milestoneInfo(m.floor), Ic = KIND_ICON[info.kind];
            return (
              <div key={m.floor} className={`th-ms ${m.state} ${RAR_CLS[info.rarity] ?? ''}`} title={milestoneLabel(m.floor)}>
                <div className="th-ms-floor">Floor {m.floor}</div>
                <span className="th-ms-ic">{m.state === 'locked' ? <Lock size={18} /> : m.state === 'done' ? <Check size={20} /> : <Ic size={22} />}</span>
                <div className="th-ms-name">{KIND_NAME[info.kind]}</div>
                <div className="th-ms-txt">{milestoneLabel(m.floor)}</div>
                {m.state === 'claim'
                  ? <button className="th-claim pe" onClick={() => onClaim(m.floor)} data-testid={`tower-claim-${m.floor}`}>Claim</button>
                  : m.state === 'done' ? <i className="th-ms-tag ok">Claimed</i> : <i className="th-ms-tag">{m.floor - best} floors away</i>}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------- ascension page
const scratch: AscMods = { hp: 1, dmg: 1, spawn: 1, heal: 1, bossHp: 1, speed: 1, elites: 0, reward: 1 };
const pct = (m: number) => Math.round((m - 1) * 100);
/** Plain-language list of everything Ascension `lv` stacks up to (from ascensionMods). */
export function ascEffects(lv: number): string[] {
  if (lv <= 0) return [];
  const m = ascensionMods(lv, scratch), out: string[] = [];
  if (m.hp > 1) out.push(`Enemies +${pct(m.hp)}% health`);
  if (m.dmg > 1) out.push(`Enemies hit +${pct(m.dmg)}% harder`);
  if (m.spawn > 1) out.push(`+${pct(m.spawn)}% more enemies`);
  if (m.heal < 1) out.push(`Healing ${pct(m.heal)}%`);
  if (m.bossHp > 1) out.push(`Bosses +${pct(m.bossHp)}% health`);
  if (m.speed > 1) out.push(`Enemies +${pct(m.speed)}% faster`);
  if (m.elites > 0) out.push(`+${m.elites} elite in elite rooms`);
  return out;
}

const RewardChips: React.FC<{ lv: number }> = ({ lv }) => {
  const r = ascReward(lv);
  return (
    <span className="th-rw">
      <span className="gem"><Gem size={12} color="#7fe6ff" />{r.gems.toLocaleString()}</span>
      <span className="cry"><PaintImg file="aether_crystal" size="1rem" />{r.crystals}</span>
      {r.gear.length > 0 && <span className={r.gear.includes('MYTHIC') ? 'myth' : 'leg'}><Shield size={12} />{r.gear.length > 1 ? `${r.gear.length} ` : ''}{r.gear.includes('MYTHIC') ? 'Mythic' : 'Legendary'} gear</span>}
      {r.pets.length > 0 && <span className={r.pets.includes('MYTHIC') ? 'myth' : 'leg'}><PawPrint size={12} />{r.pets[0] === 'MYTHIC' ? 'Mythic' : 'Legendary'} pet</span>}
    </span>
  );
};

export const AscensionPage: React.FC<{ asc: number; max: number; claimed: number[]; onSelect: (lv: number) => void }> = ({ asc, max, claimed, onSelect }) => {
  if (max === 0) return (
    <div className="th-ascpage" data-testid="so-asc">
      <HubLock title="Ascension is locked" text="Defeat the Void Herald at the end of the Void to unlock Ascension: harder adventures with bigger rewards." />
    </div>
  );
  const eff = ascEffects(asc), cur = asc > 0 ? ASCENSIONS[asc - 1] : null;
  const goalClaimed = claimed.includes(max);
  const allDone = max >= ASCENSION_MAX && goalClaimed;
  return (
    <div className="th-ascpage" data-testid="so-asc">
      {/* big selector */}
      <div className="th-sel">
        <button className="th-step pe" disabled={asc <= 0} onClick={() => onSelect(asc - 1)} aria-label="Lower"><ChevronLeft size={22} /></button>
        <div className="th-sel-mid">
          <small>Playing on Ascension</small>
          <div className="th-sel-num"><span data-testid="so-asc-lv">{asc}</span><em>/ {max}</em></div>
          <b>{cur ? cur.name : 'Standard'}</b>
        </div>
        <button className="th-step pe" disabled={asc >= max} onClick={() => onSelect(asc + 1)} aria-label="Raise"><ChevronRight size={22} /></button>
      </div>
      <p className="th-how">Beat the adventure on Ascension <b>N</b> to unlock <b>N+1</b>. One step per clear: clears on a lower level do not count.</p>

      {/* next goal */}
      <div className={`th-goal${allDone ? ' done' : ''}`} data-testid="so-asc-goal">
        <span className="th-goal-ic">{allDone ? <Crown size={22} /> : <Star size={22} />}</span>
        <div>
          {allDone ? <b>All ten Ascensions conquered!</b> : <b>Next goal: beat Ascension {max}{max < ASCENSION_MAX ? ` to unlock ${max + 1}` : ''}</b>}
          {!allDone && <span>{goalClaimed ? `Its first-clear prize is already yours. Unlocking ${max + 1} makes Ascension ${max + 1}'s first clear pay: ${ascRewardText(Math.min(ASCENSION_MAX, max + 1))}.` : `First clear of Ascension ${max} pays: ${ascRewardText(max)}.`}</span>}
          {!allDone && asc < max && <span className="warn">You are on Ascension {asc} right now: that will not unlock anything new. Pick {max} to progress.</span>}
        </div>
      </div>

      <div className="th-sec">All levels <small>tap an unlocked card to play it</small></div>
      <div className="th-lvs">
        {[0, ...ASCENSIONS.map((a) => a.lv)].map((lv) => {
          const a = lv > 0 ? ASCENSIONS[lv - 1] : null;
          const locked = lv > max, cleared = claimed.includes(lv), sel = lv === asc, goal = lv === max && !allDone;
          const cls = ['th-lv', locked ? 'locked' : 'open', cleared ? 'cleared' : '', sel ? 'sel' : '', goal ? 'goal' : ''].filter(Boolean).join(' ');
          return (
            <button key={lv} className={`${cls} pe`} disabled={locked} onClick={() => onSelect(lv)} data-testid={`so-asc-card-${lv}`} aria-pressed={sel}>
              <span className="th-lv-badge">{locked ? <Lock size={16} /> : lv}</span>
              <span className="th-lv-body">
                <span className="th-lv-head"><b>{a ? a.name : 'Standard'}</b><em>{lv === 0 ? 'No Ascension' : `Ascension ${lv}`}</em></span>
                <span className="th-lv-hard">{a ? a.hardship : 'The plain adventure: no extra hardship.'}</span>
                {locked
                  ? <span className="th-lv-state lock">Beat Ascension {lv - 1} first</span>
                  : <span className="th-lv-foot">
                    <RewardChips lv={lv} />
                    {sel && <span className="th-lv-state sel">Selected</span>}
                    {cleared ? <span className="th-lv-state ok"><Check size={11} /> Cleared</span> : <span className="th-lv-state play">{goal ? 'Next goal' : 'Play to clear'}</span>}
                  </span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* cumulative effects */}
      <div className="th-total" data-testid="so-asc-total">
        <div className="th-total-h">{asc > 0 ? `Ascension ${asc} in total` : 'Standard adventure'}</div>
        {asc > 0 ? (<>
          <div className="th-chips">{eff.map((e) => <span key={e} className="th-chip bad">{e}</span>)}</div>
          <div className="th-chips"><span className="th-chip good">+{asc * 12}% gold, loot luck and XP</span></div>
        </>) : <span className="th-total-sub">No Ascension: the plain adventure. Pick a higher level for harder fights and bigger rewards.</span>}
        <div className="th-total-first" data-testid="so-asc-first">{claimed.includes(asc) ? `First-clear reward at Ascension ${asc}: claimed.` : `First clear of Ascension ${asc} pays: ${ascRewardText(asc)}.`}</div>
      </div>
    </div>
  );
};
