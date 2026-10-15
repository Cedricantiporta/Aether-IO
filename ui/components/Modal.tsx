import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Panel, PanelHead, Ribbon } from './Frame';
import { Button } from './Button';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean; onClose?: () => void; title?: string; ribbon?: boolean; tone?: 'red' | 'gold' | 'blue' | 'green' | 'dark' | 'purple';
  width?: string; children: React.ReactNode; z?: number; onConfirm?: () => void; icon?: React.ReactNode; dim?: number;
  /** phones: fill the screen (big lists: codex, goals, quests, settings) */
  full?: boolean;
}

/** Generic framed dialog with dim backdrop and spring-in animation. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, ribbon, tone = 'gold', width = '26rem', children, z = 200, onConfirm, icon, dim = .6, full }) => {
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
        <motion.div className="absolute inset-0 grid place-items-center pe" style={{ zIndex: z, background: `rgba(8,4,2,${dim})` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <motion.div initial={{ scale: .85, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .9, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }} style={{ width, maxWidth: '94vw', maxHeight: '92vh' }} className={`relative modal-card${full ? ' modal-full' : ''}`}>
            {onClose && <button className="modal-x" aria-label="Close" onClick={onClose}><X size={22} strokeWidth={3.4} /></button>}
            {ribbon && title && <div className="absolute left-1/2 -top-5 -translate-x-1/2 z-10 modal-ribbon"><Ribbon tone={tone}>{title}</Ribbon></div>}
            <Panel className="flex flex-col" style={{ maxHeight: '92vh' }}>
              {!ribbon && title && <PanelHead icon={icon} title={title} onClose={onClose} />}
              <div className={`flex-1 p-4 ${ribbon ? 'pt-8' : ''} rpg-scroll`} style={{ minHeight: 0 }}>{children}</div>
            </Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ConfirmDialog: React.FC<{ open: boolean; title: string; body: string; confirmLabel?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void }> = ({
  open, title, body, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} ribbon tone={tone === 'danger' ? 'red' : 'gold'} width="24rem" z={300} onConfirm={onConfirm}>
    <p className="text-center text-sm leading-relaxed mb-5 mt-2" style={{ color: 'var(--text)' }}>{body}</p>
    <div className="flex gap-3">
      <Button className="flex-1" onClick={onCancel}>Cancel</Button>
      <Button className="flex-1" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>
);

export const QtyStepper: React.FC<{ value: number; min?: number; max: number; onChange: (n: number) => void }> = ({ value, min = 1, max, onChange }) => (
  <div className="flex items-center justify-center gap-2">
    <Button size="sm" onClick={() => onChange(Math.max(min, value - 10))}>-10</Button>
    <Button size="sm" onClick={() => onChange(Math.max(min, value - 1))}>-</Button>
    <div className="rpg-frame gold rpg-num text-2xl text-center text-[var(--gold-light)] px-3 py-1" style={{ minWidth: '4rem' }}>{value}</div>
    <Button size="sm" onClick={() => onChange(Math.min(max, value + 1))}>+</Button>
    <Button size="sm" onClick={() => onChange(Math.min(max, value + 10))}>+10</Button>
    <Button size="sm" variant="primary" onClick={() => onChange(max)}>Max</Button>
  </div>
);
