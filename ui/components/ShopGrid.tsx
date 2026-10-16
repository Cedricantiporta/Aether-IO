import React from 'react';

export const SHOP_COLS = 6;

/** The bag's grid look for shop stock: 6 identical squares per row, trailing rows padded with faint "+" empty slots. */
export const ShopGrid: React.FC<{ children: React.ReactNode; minRows?: number; className?: string; testId?: string }> = ({ children, minRows = 2, className = '', testId }) => {
  const n = React.Children.toArray(children).length;
  const total = Math.max(minRows * SHOP_COLS, Math.ceil(n / SHOP_COLS) * SHOP_COLS);
  return (
    <div className={`slot-grid priced shop-grid ${className}`} data-testid={testId}>
      {children}
      {Array.from({ length: total - n }).map((_, i) => (
        <div key={`e${i}`} className="rpg-slot fluid is-empty" style={{ ['--slot' as any]: '100%' }}><span className="slot-plus-faint">+</span></div>
      ))}
    </div>
  );
};
