// (owner) Controller button badge in the game's style: face buttons as coloured rings (A green, B red, X blue, Y yellow),
// bumpers / triggers as small plates, the D-pad as a cross with the pressed arm lit, sticks as rings. PadHint shows the
// badge for a keyboard code only while a controller is in use (ui/lib/inputMode).
import React from 'react';
import { PAD_LABEL, useInputMode } from '../lib/inputMode';

const DPAD: Record<string, number> = { 'D↑': 0, 'D→': 1, 'D↓': 2, 'D←': 3 };

/** Badge for a controller label ('A', 'RB', 'D↑', 'L3', 'View', ...). */
export const PadBtn: React.FC<{ b: string; className?: string; style?: React.CSSProperties }> = ({ b, className = '', style }) => {
  if (b in DPAD) {
    const d = DPAD[b];
    return (
      <span className={`pbtn pb-dpad ${className}`} style={style} aria-label={`D-pad ${['up', 'right', 'down', 'left'][d]}`}>
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z" fill="#1a140d" stroke="#8d7550" strokeWidth="1.2" strokeLinejoin="round" />
          <path d={['M9.6 2.6h4.8v6.4H9.6Z', 'M15 9.6h6.4v4.8H15Z', 'M9.6 15h4.8v6.4H9.6Z', 'M2.6 9.6H9v4.8H2.6Z'][d]} fill="#ffd77a" />
        </svg>
      </span>
    );
  }
  const kind = b === 'A' || b === 'B' || b === 'X' || b === 'Y' ? 'face' : b === 'L3' || b === 'R3' ? 'stick' : b === 'View' || b === 'Menu' ? 'sys' : 'shoulder';
  return <span className={`pbtn pb-${kind} ${className}`} data-b={b} style={style}>{b === 'View' ? '⧉' : b === 'Menu' ? '≡' : b}</span>;
};

/** The badge for a keyboard code (e.g. 'Digit1'), shown only in controller mode. */
export const PadHint: React.FC<{ code: string; className?: string; style?: React.CSSProperties }> = ({ code, className, style }) => {
  const pad = useInputMode((m) => m.pad);
  const b = PAD_LABEL[code];
  return pad && b ? <PadBtn b={b} className={className} style={style} /> : null;
};
