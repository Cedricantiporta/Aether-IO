import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { X } from 'lucide-react';

export const Corners: React.FC = () => (
  <>
    <span className="rpg-corner tl" /><span className="rpg-corner tr" /><span className="rpg-corner bl" /><span className="rpg-corner br" />
  </>
);

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  stone?: boolean; slim?: boolean; corners?: boolean;
}
export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(({ stone, slim, corners = true, className = '', children, ...rest }, ref) => (
  <div ref={ref} className={`rpg-panel ${stone ? 'stone' : ''} ${slim ? 'slim' : ''} ${className}`} {...rest}>
    {corners && <Corners />}
    {children}
  </div>
));
Panel.displayName = 'Panel';

export const MotionPanel = React.forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { stone?: boolean; slim?: boolean; corners?: boolean }>(
  ({ stone, slim, corners = true, className = '', children, ...rest }, ref) => (
    <motion.div ref={ref} className={`rpg-panel ${stone ? 'stone' : ''} ${slim ? 'slim' : ''} ${className}`} {...rest}>
      {corners && <Corners />}
      {children as React.ReactNode}
    </motion.div>
  ),
);
MotionPanel.displayName = 'MotionPanel';

export const Ribbon: React.FC<{ tone?: 'red' | 'gold' | 'blue' | 'green' | 'dark' | 'purple'; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ tone = 'red', className = '', style, children }) => (
  <div className={`rpg-ribbon ${className}`} data-tone={tone} style={style}>{children}</div>
);

export const PanelHead: React.FC<{ icon?: React.ReactNode; title: string; sub?: string; onClose?: () => void; right?: React.ReactNode }> = ({ icon, title, sub, onClose, right }) => (
  <div className="panel-head">
    <div className="flex items-center gap-2 min-w-0">
      {icon && <div className="text-[var(--gold-light)]">{icon}</div>}
      <div className="min-w-0">
        <div className="rpg-title text-lg leading-none">{title}</div>
        {sub && <div className="rpg-label mt-1">{sub}</div>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {right}
      {onClose && (
        <button className="rpg-btn rpg-btn-danger rpg-btn-sm" style={{ width: '1.9rem', padding: 0 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
      )}
    </div>
  </div>
);

export const StatLine: React.FC<{ label: string; value: React.ReactNode; tone?: 'pos' | 'neg' }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-3 py-[.28rem] border-b border-black/30 last:border-0">
    <span className="rpg-label !text-[.66rem]">{label}</span>
    <span className={`rpg-num text-sm ${tone === 'pos' ? 'text-[var(--good)]' : tone === 'neg' ? 'text-[var(--bad)]' : ''}`}>{value}</span>
  </div>
);
