import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useDialogue, advanceDialogue, closeDialogue } from '../../engine/systems/dialogue';
import { device } from '../../engine/device';

/**
 * NPC dialogue: a cream card at the bottom of the screen. Tap / click the card or press E / Space to advance,
 * X closes. The engine freezes the hero while it is open (engine/systems/village.ts) and handles E there.
 */
export const Dialogue: React.FC = () => {
  const { open, name, role, accent, lines, idx } = useDialogue();
  useEffect(() => () => closeDialogue(), []);
  if (!open) return null;
  const last = idx >= lines.length - 1;
  const stop = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <div className={`dlg-root ${device.touch ? 'touch' : ''}`} data-testid="dialogue-root">
      <div className="dlg pe" data-testid="dialogue" role="dialog" aria-label={`${name} says`} onPointerDown={(e) => { stop(e); advanceDialogue(); }}>
        <div className="dlg-head">
          <span className="dlg-badge" style={{ background: accent }} />
          <span className="dlg-name">{name}</span>
          <span className="dlg-role">{role}</span>
          <button className="dlg-x" aria-label="Close" data-testid="dialogue-close" onPointerDown={(e) => { stop(e); closeDialogue(); }}><X size={18} /></button>
        </div>
        <p className="dlg-text" key={`${name}:${idx}`} data-testid="dialogue-text">{lines[idx]}</p>
        <div className="dlg-foot">
          <span className="dlg-dots">{lines.map((_, i) => <i key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''} />)}</span>
          <span className="dlg-next">{last ? 'Close' : 'Next'}{!device.touch && <kbd>E</kbd>}</span>
        </div>
      </div>
    </div>
  );
};
