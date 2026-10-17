// "To do in town" popup: opens once when the hero spawns in town after a defeat (GameOver sets uiStore.todoPending).
// Same list as the "Ways to grow stronger" notice (upgradesOf, max 5); rows open the matching panel. Esc: closeTopOverlay.
import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../../store';
import { useUiStore } from '../uiStore';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { upgradesOf } from '../hud/UpgradeNotice';

const TODO_MAX = 5;

export const TodoInTown: React.FC = () => {
  const pending = useUiStore((s) => s.todoPending);
  const open = useUiStore((s) => s.todoTownOpen);
  useEffect(() => {
    if (!pending) return;
    const ui = useUiStore.getState();
    ui.setTodoPending(false);   // once per return
    if (upgradesOf(useGameStore.getState()).length > 0) ui.setTodoTownOpen(true);
  }, [pending]);
  useGameStore(useShallow((s) => upgradesOf(s).slice(0, TODO_MAX).map((u) => u.key + u.sub)));   // re-render when the list changes
  if (!open) return null;
  const list = upgradesOf(useGameStore.getState()).slice(0, TODO_MAX);
  const close = () => useUiStore.getState().setTodoTownOpen(false);
  return (
    <Modal open onClose={close} title="To do in town" width="min(26rem, 94vw)" z={240} portal onConfirm={close}>
      <div className="upn-list" data-testid="todo-in-town">
        {list.map((u) => (
          <button key={u.key} className="upn-row w-full text-left cursor-pointer" style={{ color: 'inherit' }} onClick={() => { close(); u.go(useGameStore.getState()); }}>
            <div className="min-w-0"><b>{u.title}</b><em>{u.sub}</em></div>
          </button>
        ))}
      </div>
      <Button className="w-full mt-3" variant="primary" onClick={close}>Got it</Button>
    </Modal>
  );
};
