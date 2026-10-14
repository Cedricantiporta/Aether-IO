import React from 'react';
import { useDrop, type DragSrc } from '../lib/dnd';

/** One grid cell that accepts dropped items (used for reordering inside the bag / warehouse). */
export const DropCell: React.FC<{ accept: (s: DragSrc) => boolean; onDrop: (s: DragSrc) => void; children: React.ReactNode }> = ({ accept, onDrop, children }) => {
  const { hot, props } = useDrop(accept, onDrop);
  return <div className={`drop-cell ${hot ? 'drop-hot' : ''}`} {...props}>{children}</div>;
};
