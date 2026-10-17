import React, { useEffect } from 'react';
import { X } from '../components/GoldIcons';
import { useDialogue, advanceDialogue, closeDialogue, acceptOffer, replyAt } from '../../engine/systems/dialogue';
import { device } from '../../engine/device';
import { useGameEvent } from '../hooks/useEvent';
import { useUiStore } from '../uiStore';
import { useGameStore, SHIP_TICKET_GEMS } from '../../store';
import { activeChar } from '../../characters';

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
  if (!open) return null;
  const reply = replyAt(lines, idx + 1);   // (owner) the hero's reply sits on the Next / Close button
  const last = idx >= lines.length - 1 || (!!reply && idx + 1 >= lines.length - 1 && !offer);
  const sp = splitSpeaker(lines[idx] ?? '');
  const stop = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div className={`dlg-root ${device.touch ? 'touch' : ''}`} data-testid="dialogue-root">
      <div className="dlg pe" data-testid="dialogue" role="dialog" aria-label={`${name} says`} onPointerDown={(e) => { stop(e); advanceDialogue(); }}>
        <div className="dlg-head">
          <span className="dlg-badge" style={{ background: accent }} />
          <span className={`dlg-name${sp?.hero ? ' is-hero' : ''}`}>{sp ? sp.who : name}</span>
          <span className="dlg-role">{sp ? (sp.hero && sp.who !== 'You' ? 'You' : '') : role}</span>
          <button className="dlg-x" aria-label="Close" data-testid="dialogue-close" onPointerDown={(e) => { stop(e); closeDialogue(); }}><X size={18} /></button>
        </div>
        <p className="dlg-text" key={`${name}:${idx}`} data-testid="dialogue-text">{sp ? sp.text : lines[idx]}</p>
        {last && hint && <p className="dlg-hint" data-testid="dialogue-hint">{hint}</p>}
        <div className="dlg-foot">
          <span className="dlg-dots">{lines.map((_, i) => <i key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''} />)}</span>
          {last && offer
            ? (
              <span className="dlg-choices">
                <button className="dlg-btn" data-testid="dialogue-later" onPointerDown={(e) => { stop(e); closeDialogue(); }}>Later{!device.touch && <kbd>E</kbd>}</button>
                <button className="dlg-btn accept" data-testid="dialogue-accept" onPointerDown={(e) => { stop(e); acceptOffer(); }}>{acceptLabel}{!device.touch && <kbd>F</kbd>}</button>
              </span>
            )
            : <span className={`dlg-next${reply ? ' reply' : ''}`} data-testid="dialogue-next">{reply ? `“${reply}”` : last ? 'Okay' : '...'}{!device.touch && <kbd>E</kbd>}</span>}
        </div>
      </div>
    </div>
  );
};
