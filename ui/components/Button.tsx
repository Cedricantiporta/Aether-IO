import React from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'green' | 'blue';
interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: 'sm' | 'md' | 'lg'; active?: boolean; pulse?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, Props>(({ variant = 'default', size = 'md', active, pulse, className = '', ...rest }, ref) => {
  const v = variant === 'default' ? '' : `rpg-btn-${variant}`;
  const s = size === 'sm' ? 'rpg-btn-sm' : size === 'lg' ? 'rpg-btn-lg' : '';
  return <button ref={ref} className={`rpg-btn ${v} ${s} ${active ? 'is-active' : ''} ${pulse ? 'rpg-btn-pulse' : ''} ${className}`} {...rest} />;
});
Button.displayName = 'Button';

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <button role="switch" aria-checked={checked} aria-label={label} className="rpg-toggle" onClick={() => onChange(!checked)} />
);

export const Slider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <input type="range" min={0} max={100} value={Math.round(value * 100)} className="rpg-range"
    style={{ ['--p' as any]: `${Math.round(value * 100)}%` }} onChange={(e) => onChange(Number(e.target.value) / 100)} />
);
