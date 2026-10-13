import { useEffect, useState } from 'react';

/** Reactive matchMedia. Only re-renders when the query result flips (never per frame). */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Small screens: menus are full-screen sheets (matches the CSS media query in index.css). */
export const SMALL_QUERY = '(max-width: 899px), (max-height: 500px)';
export const useSmall = () => useMedia(SMALL_QUERY);
