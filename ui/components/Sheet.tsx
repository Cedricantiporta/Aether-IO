import React from 'react';
import { motion } from 'framer-motion';
import { useSmall } from '../hooks/useMedia';

/** Side panel on desktop, full-screen sheet on small screens (css decides the geometry, we only pick the slide direction). */
export const Sheet: React.FC<{ side: 'l' | 'r'; shift?: boolean; width?: string; z?: number; children: React.ReactNode; testId?: string }> = ({ side, shift, width, z, children, testId }) => {
  const small = useSmall();
  const from = small ? { y: '100%' } : { x: side === 'l' ? '-105%' : '105%' };
  const to = small ? { y: 0 } : { x: 0 };
  return (
    <motion.div initial={from} animate={to} exit={from} transition={{ type: 'spring', stiffness: 340, damping: 34 }} data-testid={testId}
      className={`sheet paper pe ${side} ${shift ? 'shift' : ''}`} style={{ ['--sheet-w' as any]: width, ...(z ? { zIndex: z } : null) }}>
      {children}
    </motion.div>
  );
};
