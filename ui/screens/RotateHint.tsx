import React from 'react';

/** Shown (via CSS .portrait) on touch devices held upright: the game is landscape. */
export const RotateHint: React.FC = () => (
  <div className="rotate-hint pe" data-testid="rotate-hint">
    <div className="rh-phone" />
    <div className="rpg-title" style={{ fontSize: '1.6rem' }}>Rotate your device</div>
    <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: '.9rem' }}>Aether Survivor is played in landscape.</div>
  </div>
);
