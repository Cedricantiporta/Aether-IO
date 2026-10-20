// The ONE close button for every window / panel (v12): soft round translucent button with a white rounded X. Styled by `.win-x`
// in index.css (36 px, top-right inside the panel padding). Dialogues have no close button.
import React from 'react';

export const CloseX: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className }) => (
  <button type="button" className={`win-x${className ? ' ' + className : ''}`} aria-label="Close" onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
  </button>
);
