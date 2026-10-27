// Online co-op lobby, shown inside the Adventure "Set Out" window: Host (room code + waiting) / Join (type the code) / connected card.
// Connection logic lives in net/coop.ts; this is only the view over the net/coopStore slice.
import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCoop } from '../../net/coopStore';
import { hostCoop, joinCoop, leaveCoop } from '../../net/coop';
import { CODE_LEN, normaliseCode } from '../../net/protocol';

/** While the code box has focus, Enter in the (Enter = confirm) Set Out window submits the code instead of setting out. */
export const lobbyInput = { submit: null as null | (() => void) };
/** Copies text to the clipboard (modern API first, a hidden textarea as the fallback for http / old WebViews). */
async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* fall through */ }
  try {
    const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
    const ok = document.execCommand('copy'); document.body.removeChild(a); return ok;
  } catch { return false; }
}
const cap = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

export const CoopLobby: React.FC = () => {
  const { state, role, code, ready, error, ping, partner } = useCoop(useShallow((s) => ({ state: s.state, role: s.role, code: s.code, ready: s.ready, error: s.error, ping: s.ping, partner: s.partner })));
  const [joining, setJoining] = useState(false);
  const [text, setText] = useState('');
  const valid = normaliseCode(text) !== '';
  const go = () => { if (valid) { joinCoop(text); setJoining(false); } };
  const goRef = useRef(go); goRef.current = go;
  const [copied, setCopied] = useState(false);
  const copy = async () => { const ok = await copyText(code); setCopied(ok); if (ok) setTimeout(() => setCopied(false), 1800); };
  useEffect(() => () => { lobbyInput.submit = null; }, []);

  if (state === 'connected' && partner) {
    return (
      <div className="coop-box" data-testid="coop-connected">
        <div className="coop-title">Co-op with {partner.n}</div>
        <div className="coop-line">Lv {partner.l} {cap(partner.c)} · {ping ? `${ping} ms` : 'checking the line...'}</div>
        <div className="coop-note">{role === 'host' ? 'Set out when you are both ready: your friend follows you into the run.' : 'Waiting for the host to set out. You will be pulled into the run.'}</div>
        <button className="coop-btn ghost pe" onClick={leaveCoop} data-testid="coop-leave-lobby">{role === 'host' ? 'Close room' : 'Leave'}</button>
      </div>
    );
  }
  if (state === 'hosting') {
    return (
      <div className="coop-box" data-testid="coop-hosting">
        <div className="coop-title">{ready ? 'Your room code' : 'Opening your room...'}</div>
        <div className="coop-code" data-testid="coop-code">{ready ? code.split('').map((c, i) => <b key={i}>{c}</b>) : <b className="dim">....</b>}</div>
        <div className="coop-note">{ready ? 'Tell your friend this code: they press Join at the portal and type it in. Waiting for your friend...' : 'Contacting the matchmaking service...'}</div>
        {error && <div className="coop-err">{error}</div>}
        <div className="coop-row">
          {ready && <button className="coop-btn pe" onClick={copy} data-testid="coop-copy">{copied ? 'Copied!' : 'Copy code'}</button>}
          <button className="coop-btn ghost pe" onClick={leaveCoop} data-testid="coop-cancel">Cancel</button>
        </div>
      </div>
    );
  }
  if (state === 'joining') {
    return (
      <div className="coop-box" data-testid="coop-joining">
        <div className="coop-title">Joining room {code}...</div>
        <div className="coop-note">Looking for your friend.</div>
        <button className="coop-btn ghost pe" onClick={leaveCoop} data-testid="coop-cancel">Cancel</button>
      </div>
    );
  }
  return (
    <div className="coop-box" data-testid="coop-idle">
      <div className="coop-title">Play with a friend</div>
      {!joining ? (
        <div className="coop-row">
          <button className="coop-btn pe" onClick={hostCoop} data-testid="coop-host">Host co-op</button>
          <button className="coop-btn pe" onClick={() => setJoining(true)} data-testid="coop-join">Join</button>
        </div>
      ) : (
        <div className="coop-row">
          <input className="coop-input" value={text} maxLength={CODE_LEN + 2} autoFocus placeholder="CODE" data-testid="coop-code-input" spellCheck={false} autoComplete="off"
            onFocus={() => { lobbyInput.submit = () => goRef.current(); }} onBlur={() => { lobbyInput.submit = null; }}
            onChange={(e) => setText(e.target.value.toUpperCase())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setJoining(false); }} />
          <button className="coop-btn pe" disabled={!valid} onClick={go} data-testid="coop-connect">Connect</button>
          <button className="coop-btn ghost pe" onClick={() => setJoining(false)}>Back</button>
        </div>
      )}
      {error && <div className="coop-err" data-testid="coop-error">{error}</div>}
    </div>
  );
};
