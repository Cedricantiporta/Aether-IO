import React, { useRef } from 'react';
import { useRaf } from '../hooks/useRaf';
import { tutorialHint } from '../../engine/systems/tutorial';

/** One pulsing tutorial line, lower-middle of the screen (DOM writes via useRaf, no React re-renders). */
export const TutorialHint: React.FC = () => {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useRaf(() => {
    const t = tutorialHint();
    if (t === last.current || !el.current) return;
    last.current = t;
    el.current.textContent = t;
    el.current.style.opacity = t ? '1' : '0';
  });
  return <div ref={el} className="tut-hint" style={{ opacity: 0 }} data-testid="tutorial-hint" />;
};
