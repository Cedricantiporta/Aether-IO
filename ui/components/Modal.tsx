import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Panel, PanelHead } from './Frame';
import { Button } from './Button';
import { CloseX } from './CloseX';

interface ModalProps {
  open: boolean; onClose?: () => void; title?: string; ribbon?: boolean; tone?: 'red' | 'gold' | 'blue' | 'green' | 'dark' | 'purple';
  width?: string; children: React.ReactNode; z?: number; onConfirm?: () => void; icon?: React.ReactNode; dim?: number;
  /** phones: fill the screen (big lists: codex, goals, quests, settings) */
  full?: boolean;
  /** render at the HUD root (centred on screen) instead of inside the parent panel */
  portal?: boolean;
}

/** Generic framed dialog with dim backdrop and spring-in animation. */
export const Modal: React.FC<ModalProps> = (props) => {
  if (props.portal) return createPortal(<ModalBody {...props} />, (document.querySelector('.hud-root') as HTMLElement) ?? document.body);
  return <ModalBody {...props} />;
};
const modalStack: object[] = [];   // open modals, newest last: Esc closes only the top one (engine/input.ts then never sees that Esc)
const ModalBody: React.FC<ModalProps> = ({ open, onClose, title, ribbon, tone = 'gold', width = '26rem', children, z = 200, onConfirm, icon, dim = .6, full }) => {
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = {}; modalStack.push(me);
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && onConfirm) { e.preventDefault(); e.stopPropagation(); onConfirm(); }
      if (e.code === 'Escape' && !e.repeat && modalStack[modalStack.length - 1] === me && closeRef.current && !(e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) { e.preventDefault(); e.stopImmediatePropagation(); closeRef.current(); }
    };
    window.addEventListener('keydown', h, true);
    return () => { window.removeEventListener('keydown', h, true); const i = modalStack.indexOf(me); if (i >= 0) modalStack.splice(i, 1); };
  }, [open, onConfirm]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 grid place-items-center pe" style={{ zIndex: z, background: `rgba(8,4,2,${dim})` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <motion.div initial={{ scale: .85, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .9, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }} style={{ width, maxWidth: '94vw', maxHeight: '92vh' }} className={`relative modal-card${full ? ' modal-full' : ''}`}>
            <Panel className="flex flex-col" style={{ maxHeight: '92vh' }}>
              {title
                ? <PanelHead icon={icon} title={title} onClose={onClose} />
                : onClose && <div className="modal-bar"><CloseX onClick={onClose} /></div>}
              <div className="flex-1 p-4 rpg-scroll" style={{ minHeight: 0 }}>{children}</div>
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
