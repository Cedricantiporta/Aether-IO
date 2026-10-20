import React, { useEffect, useRef } from 'react';
import { CoinGlyph, GemGlyph } from '../components/SkillIcons';
import { CuteStar } from '../components/CuteIcons';
import { ItemArtByKey, PaintImg } from '../components/ItemArt';
import { useDialogue, advanceDialogue, closeDialogue, acceptOffer, replyAt } from '../../engine/systems/dialogue';
import { device } from '../../engine/device';
import { useGameEvent } from '../hooks/useEvent';
import { useUiStore } from '../uiStore';
import { useGameStore, SHIP_TICKET_GEMS } from '../../store';
import { activeChar } from '../../characters';
import { questBanner } from './QuestBanner';
import { STORY } from '../../story';
import { NPC_QUEST_BY_ID } from '../../npcQuests';
import { questXp } from '../../classLevels';
import { GOLD_SCALE, PETS_POOL, ITEMS_POOL } from '../../constants';

/** What the quest-offer card shows: a short objective line + reward chips (icon + amount). */
interface OfferChip { key: string; icon: React.ReactNode; label: string }
interface OfferInfo { title: string; goal: string; chips: OfferChip[] }
const itemChip = (id: string, qty: number | undefined, i: number): OfferChip => {
  const n = PETS_POOL.find((x) => x.id === id)?.name ?? ITEMS_POOL.find((x) => x.id === id)?.name ?? id;
  return { key: `it${i}`, icon: <ItemArtByKey k={id} size={26} />, label: (qty ?? 1) > 1 ? `x${qty}` : n };
};
function offerInfo(offer: string, level: number): OfferInfo | null {
  const chips: OfferChip[] = [];
  const pushCommon = (gold?: number, gems?: number) => {
    if (gold) chips.push({ key: 'gold', icon: <CoinGlyph size={24} />, label: (gold * GOLD_SCALE).toLocaleString() });
    if (gems) chips.push({ key: 'gems', icon: <GemGlyph size={24} />, label: String(gems) });
  };
  if (offer.startsWith('story:')) {
    const n = Number(offer.slice(6)), st = STORY[n]; if (!st) return null;
    chips.push({ key: 'exp', icon: <CuteStar size={22} />, label: `${questXp('STORY', level).toLocaleString()} EXP` });
    pushCommon(st.reward.gold, st.reward.gems);
    (st.reward.items ?? []).forEach((it, i) => chips.push(itemChip(it.id, it.qty, i)));
    return { title: 'New Quest', goal: (STORY[n + 1]?.line ?? st.line), chips };
  }
  const d = NPC_QUEST_BY_ID[offer]; if (!d) return null;
  const r = d.reward;
  chips.push({ key: 'exp', icon: <CuteStar size={22} />, label: `${questXp('SIDE', level).toLocaleString()} EXP` });
  pushCommon(r.gold, r.gems);
  if (r.shards) chips.push({ key: 'shards', icon: <PaintImg file={`shard_${r.shards[0]}`} size={26} />, label: `x${r.shards[1]}` });
  if (r.flasks) chips.push({ key: 'flasks', icon: <ItemArtByKey k="potion_hp_big" size={26} />, label: `x${r.flasks}` });
  (r.items ?? []).forEach((it, i) => chips.push(itemChip(it.id, it.qty, i)));
  return { title: 'Side Quest', goal: d.summary, chips };
}
const OfferCard: React.FC<{ offer: string }> = ({ offer }) => {
  const level = useGameStore((s) => s.level);
  const info = offerInfo(offer, level);
  if (!info) return null;
  return (
    <div className="dlg-offer" data-testid="dialogue-offer">
      <span className="dlg-offer-title">{info.title}</span>
      <span className="dlg-offer-goal">{info.goal}</span>
      <span className="dlg-offer-rewards">
        {info.chips.map((c) => <span key={c.key} className="dlg-chip">{c.icon}{c.label && <b>{c.label}</b>}</span>)}
      </span>
    </div>
  );
};

/** Typewriter: writes the line into the DOM node character by character (no React state, no per-frame renders).
 *  A tap while it types completes the line first; the next tap advances. */
let finishTyping: (() => boolean) | null = null;
const Typed: React.FC<{ text: string; testId: string }> = ({ text, testId }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let i = 0;
    el.textContent = '';
    const done = () => { clearInterval(t); if (el) el.textContent = text; finishTyping = null; };
    const t = setInterval(() => { i += 1; if (i >= text.length) done(); else el.textContent = text.slice(0, i); }, 24);
    finishTyping = () => { if (i >= text.length) return false; done(); return true; };
    return () => { clearInterval(t); finishTyping = null; };
  }, [text]);
  return <p className="dlg-text" ref={ref} data-testid={testId} aria-label={text} />;
};

/**
 * NPC dialogue: a cream card at the bottom of the screen. Tap / click the card or press E / Space to advance,
 * X closes. The engine freezes the hero while it is open (engine/systems/village.ts) and handles E there.
 */
/** The captain's ticket (engine/systems/dialogue emits hub 'ship' at the end of the talk). */
const useShipOffer = () => useGameEvent('hub', (e) => {
  if (e.kind !== 'ship') return;
  const gems = useGameStore.getState().gems;
  useUiStore.getState().askConfirm({
    title: 'Sail to the Coral Isles?', confirmLabel: gems >= SHIP_TICKET_GEMS ? `Buy ticket · ${SHIP_TICKET_GEMS} gems` : 'Not enough gems',
    body: `A run that starts straight in the Coral Isles (depth 1), skipping the first three realms. You have ${gems} gems.`,
    onConfirm: () => { useGameStore.getState().sailToIsles(); },
  });
});

/** A line may name its own speaker: "You:: Why me?" (the hero) or "Marta Goldtap:: OUT!" (anyone else in the scene). */
function splitSpeaker(line: string): { who: string; text: string; hero: boolean } | null {
  const i = line.indexOf(':: ');
  if (i <= 0 || i > 28) return null;
  const who = line.slice(0, i), hero = who === 'You';
  return { who: hero ? (activeChar()?.name || 'You') : who, text: line.slice(i + 3), hero };
}

export const Dialogue: React.FC = () => {
  useShipOffer();
  const { open, name, role, accent, lines, idx, offer, acceptLabel } = useDialogue();
  useEffect(() => () => closeDialogue(), []);
  const reply = open ? replyAt(lines, idx + 1) : null;   // (owner) the hero's reply sits on the Next / Close button
  const last = idx >= lines.length - 1 || (!!reply && idx + 1 >= lines.length - 1 && !offer);
  useEffect(() => {   // a quest is offered on the last line: show the quest banner
    if (!open || !last || !offer) return;
    if (offer.startsWith('story:')) { const st = STORY[Number(offer.slice(6))]; if (st) questBanner('main', st.title, 'offered'); }
    else { const d = NPC_QUEST_BY_ID[offer]; if (d) questBanner('side', d.title, 'offered'); }
  }, [open, last, offer, name]);
  if (!open) return null;
  const sp = splitSpeaker(lines[idx] ?? '');
  const stop = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); };
  const text = sp ? sp.text : lines[idx] ?? '';
  return (
    <>
    {last && offer && <OfferCard offer={offer} />}
    <div className={`dlg-root ${device.touch ? 'touch' : ''}`} data-testid="dialogue-root">
      <div className="dlg pe" data-testid="dialogue" role="dialog" aria-label={`${name} says`}
        onPointerDown={(e) => { stop(e); if (finishTyping && finishTyping()) return; advanceDialogue(); }}>
        <div className="dlg-head">
          <span className="dlg-badge" style={{ background: accent }} />
          <span className={`dlg-name${sp?.hero ? ' is-hero' : ''}`}>{sp ? sp.who : name}</span>
          <span className="dlg-role">{sp ? (sp.hero && sp.who !== 'You' ? 'You' : '') : role}</span>
        </div>
        <Typed key={`${name}:${idx}`} text={text} testId="dialogue-text" />
        {last && offer
          ? (
            <span className="dlg-choices">
              <button className="dlg-btn" data-testid="dialogue-later" onPointerDown={(e) => { stop(e); closeDialogue(); }}>Later{!device.touch && <kbd>E</kbd>}</button>
              <button className="dlg-btn accept" data-testid="dialogue-accept" onPointerDown={(e) => { stop(e); acceptOffer(); if (offer.startsWith('story:')) { const st = STORY[Number(offer.slice(6))]; if (st) questBanner('main', st.title, 'accepted'); } }}>{acceptLabel}{!device.touch && <kbd>F</kbd>}</button>
            </span>
          )
          : <span className="dlg-choices"><span className={`dlg-btn${reply ? ' reply' : ''}`} data-testid="dialogue-next" aria-label={last ? 'Close' : 'Next'}>{reply ? `\u201c${reply}\u201d` : last ? 'Close' : 'Next'}{!device.touch && <kbd>E</kbd>}</span></span>}
      </div>
    </div>
    </>
  );
};
