import React from 'react';
import { X } from 'lucide-react';
import { CoinGlyph } from './SkillIcons';

/** Cream card. */
export const Panel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = '', ...rest }, ref) => (
  <div ref={ref} className={`rpg-panel paper ${className}`} {...rest} />
));
Panel.displayName = 'Panel';

export const CurrencyPill: React.FC<{ icon?: React.ReactNode; label?: string; value: React.ReactNode }> = ({ icon = <CoinGlyph size={20} />, label, value }) => (
  <span className="rpg-pill">{icon}{label && <span className="pill-label">{label}</span>}<span className="rpg-num">{value}</span></span>
);

export const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button className="close-x" onClick={onClick} aria-label="Close"><X size={22} strokeWidth={2.6} /></button>
);

/** Sheet / dialog header: icon + title (+ sub) on the left, extras and a big close button on the right. */
export const PanelHead: React.FC<{ icon?: React.ReactNode; title: string; sub?: string; onClose?: () => void; right?: React.ReactNode }> = ({ icon, title, sub, onClose, right }) => (
  <div className="sheet-head">
    <div className="flex items-center gap-2.5 min-w-0">
      {icon && <div className="head-icon">{icon}</div>}
      <div className="min-w-0">
        <div className="head-title truncate">{title}</div>
        {sub && <div className="head-sub">{sub}</div>}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {right}
      {onClose && <CloseButton onClick={onClose} />}
    </div>
  </div>
);

export const StatLine: React.FC<{ label: string; value: React.ReactNode; tone?: 'pos' | 'neg' }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--line)] last:border-0 min-h-[40px]">
    <span className="rpg-label !text-[13px]">{label}</span>
    <span className={`rpg-num text-sm ${tone === 'pos' ? 'text-[var(--good)]' : tone === 'neg' ? 'text-[var(--bad)]' : ''}`}>{value}</span>
  </div>
);
