import React, { useState } from 'react';
import { X } from 'lucide-react';

/** Shown (via CSS .portrait) on touch devices held upright: a small dismissible hint, play still works in portrait. */
export const RotateHint: React.FC = () => {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className="rotate-hint pe" data-testid="rotate-hint">
      <span className="rh-phone" />
      <span>Rotate</span>
      <button className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Dismiss" onClick={() => setGone(true)}><X size={16} /></button>
    </div>
  );
};
