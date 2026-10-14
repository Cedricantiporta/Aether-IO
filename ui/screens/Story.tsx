// The prologue (once, the first time the village appears) and the Story book (chapters unlock with progress).
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Lock } from 'lucide-react';
import { useGameStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../uiStore';
import { Modal } from '../components/Modal';
import { slideMs } from './Ending';
import { CHAPTERS, PROLOGUE, loreHint, loreUnlocked } from '../../lore';

const SEEN_KEY = 'aether-survivor-prologue-v1';
const seen = (): boolean => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };

/** Full-screen prologue as slides: one passage per screen, advancing on its own (click / Space skips ahead); Skip closes it. */
export const Prologue: React.FC<{ force?: boolean; onDone?: () => void }> = ({ force, onDone }) => {
  const titleDone = useUiStore((s) => s.titleDone && !s.charSelect);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => { if (force || (titleDone && !seen())) { setN(0); setOpen(true); } }, [titleDone, force]);
  const close = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } setOpen(false); onDone?.(); };
  const next = () => (n >= PROLOGUE.length - 1 ? close() : setN((x) => x + 1));
  useEffect(() => {   // auto-advance; the last slide closes the prologue
    if (!open) return;
    const t = setTimeout(next, slideMs(PROLOGUE[n]));
    return () => clearTimeout(t);
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); }
      else if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!open) return null;
  return (
    <motion.div className="ending-root pe" style={{ zIndex: 210, background: 'radial-gradient(ellipse at center, rgba(22,16,10,.94), rgba(4,3,2,.99))' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} onClick={next} data-testid="prologue">
      <div className="ending-glow" />
      <div className="ending-story prologue-slide">
        <AnimatePresence mode="wait">
          <motion.p key={n} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.9 }}>{PROLOGUE[n]}</motion.p>
        </AnimatePresence>
      </div>
      <button className="rpg-btn story-skip" onClick={(e) => { e.stopPropagation(); close(); }} data-testid="prologue-skip">Skip ›</button>
    </motion.div>
  );
};

/** The Story book: chapter list + text; locked chapters show what unlocks them. */
export const StoryBook: React.FC = () => {
  const open = useUiStore((s) => s.storyOpen);
  const setOpen = useUiStore((s) => s.openStory);
  const { bossKills, endings, ascensionMax } = useGameStore(useShallow((s) => ({ bossKills: s.npcQuests.bossKills, endings: s.progress.endings, ascensionMax: s.progress.ascensionMax })));
  const [sel, setSel] = useState(CHAPTERS[0].id);
  const [replay, setReplay] = useState(false);
  const prog = { bossKills, endings, ascensionMax };
  const cur = CHAPTERS.find((c) => c.id === sel) ?? CHAPTERS[0];
  const unlocked = loreUnlocked(cur, prog);
  return (<>
    <Modal open={open && !replay} onClose={() => setOpen(false)} title="Story" icon={<BookOpen size={20} />} width="44rem" z={255}>
      <div className="story-wrap" data-testid="story-book">
        <nav className="story-nav rpg-scroll">
          {CHAPTERS.map((c) => {
            const ok = loreUnlocked(c, prog);
            return <button key={c.id} className={`story-ch ${sel === c.id ? 'on' : ''} ${ok ? '' : 'locked'}`} onClick={() => setSel(c.id)}>{ok ? c.title : <><Lock size={11} /> {c.title.split('.')[0]}. ???</>}</button>;
          })}
          <button className="story-ch replay" onClick={() => setReplay(true)}>Replay the prologue</button>
        </nav>
        <article className="story-text rpg-scroll">
          {unlocked ? <>
            <h3>{cur.title}</h3>
            {cur.text.map((t, i) => <p key={i}>{t}</p>)}
          </> : <div className="story-locked"><Lock size={22} /><span>{loreHint(cur)}</span></div>}
        </article>
      </div>
    </Modal>
    {replay && <Prologue force onDone={() => setReplay(false)} />}
  </>);
};
