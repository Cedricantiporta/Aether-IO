import { useEffect, useRef } from 'react';
import { events, type GameEvents } from '../../engine/events';

/** Subscribe to an engine event for the lifetime of the component. */
export function useGameEvent<K extends keyof GameEvents>(type: K, fn: (payload: GameEvents[K]) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => events.on(type, (p) => ref.current(p)), [type]);
}
