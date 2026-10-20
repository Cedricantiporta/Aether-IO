import React, { useEffect, useRef } from 'react';
import { X } from '../components/GoldIcons';
import { useDialogue, advanceDialogue, closeDialogue, acceptOffer, replyAt } from '../../engine/systems/dialogue';
import { device } from '../../engine/device';
import { useGameEvent } from '../hooks/useEvent';
import { useUiStore } from '../uiStore';
import { useGameStore, SHIP_TICKET_GEMS } from '../../store';
import { activeChar } from '../../characters';
import { questBanner } from './QuestBanner';
import { STORY } from '../../story';
import { NPC_QUEST_BY_ID } from '../../npcQuests';

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
  const { open, name, role, accent, lines, idx, offer, acceptLabel, hint } = useDialogue();
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
    <div className={`dlg-root ${device.touch ? 'touch' : ''}`} data-testid="dialogue-root">
      <div className="dlg pe" data-testid="dialogue" role="dialog" aria-label={`${name} says`}
        onPointerDown={(e) => { stop(e); if (finishTyping && finishTyping()) return; advanceDialogue(); }}>
        <div className="dlg-head">
          <span className="dlg-badge" style={{ background: accent }} />
          <span className={`dlg-name${sp?.hero ? ' is-hero' : ''}`}>{sp ? sp.who : name}</span>
          <span className="dlg-role">{sp ? (sp.hero && sp.who !== 'You' ? 'You' : '') : role}</span>
        </div>
        <button className="dlg-x" aria-label="Close" data-testid="dialogue-close" onPointerDown={(e) => { stop(e); closeDialogue(); }}><X size={16} /></button>
        <Typed key={`${name}:${idx}`} text={text} testId="dialogue-text" />
        {last && hint && <p className="dlg-hint" data-testid="dialogue-hint">{hint}</p>}
        {last && offer
          ? (
            <span className="dlg-choices">
              <button className="dlg-btn" data-testid="dialogue-later" onPointerDown={(e) => { stop(e); closeDialogue(); }}>Later{!device.touch && <kbd>E</kbd>}</button>
              <button className="dlg-btn accept" data-testid="dialogue-accept" onPointerDown={(e) => { stop(e); acceptOffer(); if (offer.startsWith('story:')) { const st = STORY[Number(offer.slice(6))]; if (st) questBanner('main', st.title, 'accepted'); } }}>{acceptLabel}{!device.touch && <kbd>F</kbd>}</button>
            </span>
          )
          : reply && <span className="dlg-choices"><span className="dlg-btn reply" data-testid="dialogue-next">{`\u201c${reply}\u201d`}{!device.touch && <kbd>E</kbd>}</span></span>}
        {!(last && offer) && <span className="dlg-arrow" data-testid={reply ? undefined : 'dialogue-next'} aria-label={last ? 'Close' : 'Next'}>{'\u25bc'}</span>}
      </div>
    </div>
  );
};
