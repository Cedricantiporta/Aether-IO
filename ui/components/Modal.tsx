import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelHead } from './Frame';
import { Button } from './Button';

interface ModalProps {
  open: boolean; onClose?: () => void; title?: string;
  width?: string; children: React.ReactNode; z?: number; onConfirm?: () => void; icon?: React.ReactNode;
  /** full-screen sheet on small screens (big menus). Small dialogs stay centred cards. */
  sheet?: boolean;
  /** rendered under the header, outside the scroll area (sticky tabs) */
  tabs?: React.ReactNode;
  /** footer outside the scroll area */
  footer?: React.ReactNode;
}

/** Generic dialog: dim scrim, rounded cream card, big close button. `sheet` makes it a full-screen sheet on phones. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, width = '26rem', children, z = 200, onConfirm, icon, sheet, tabs, footer }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && onConfirm) { e.preventDefault(); e.stopPropagation(); onConfirm(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, onConfirm]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-scrim pe" style={{ zIndex: z }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <motion.div initial={{ scale: .94, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .96, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }} style={{ ['--mw' as any]: width }} className={`modal-card paper ${sheet ? 'is-sheet' : ''}`}>
            {title ? <PanelHead icon={icon} title={title} onClose={onClose} /> : null}
            {tabs}
            <div className={`modal-body rpg-scroll ${tabs ? '' : ''}`}>{children}</div>
            {footer}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ConfirmDialog: React.FC<{ open: boolean; title: string; body: string; confirmLabel?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void }> = ({
  open, title, body, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} width="24rem" z={300} onConfirm={onConfirm}>
    <p className="text-sm leading-relaxed mb-4">{body}</p>
    <div className="flex gap-3">
      <Button className="flex-1" onClick={onCancel}>Cancel</Button>
      <Button className="flex-1" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>
);

export const QtyStepper: React.FC<{ value: number; min?: number; max: number; onChange: (n: number) => void }> = ({ value, min = 1, max, onChange }) => (
  <div className="flex flex-wrap items-center justify-center gap-1.5">
    <Button size="sm" onClick={() => onChange(Math.max(min, value - 10))}>-10</Button>
    <Button size="sm" onClick={() => onChange(Math.max(min, value - 1))}>-</Button>
    <div className="rpg-frame rpg-num text-xl text-center px-3 py-1.5" style={{ minWidth: '3.5rem' }}>{value}</div>
    <Button size="sm" onClick={() => onChange(Math.min(max, value + 1))}>+</Button>
    <Button size="sm" onClick={() => onChange(Math.min(max, value + 10))}>+10</Button>
    <Button size="sm" variant="primary" onClick={() => onChange(max)}>Max</Button>
  </div>
);
